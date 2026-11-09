import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupPhase1Page } from '../pages/phase1/phase1Page.js';

// 기능 테스트: 실제 index.html 의 마크업으로 페이지를 띄우고 버튼을 눌러 동작을 확인합니다.
// jsdom 환경에서는 전역 URL 이 브라우저(jsdom) 구현으로 바뀌어 readFileSync 가 받지 못하므로, 문자열 경로로 변환해서 읽습니다.
const testDir = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(testDir, '../pages/phase1/index.html'), 'utf-8');
const bodyHTML = html.match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '');

function openPage() {
  document.body.innerHTML = bodyHTML;
  const page = setupPhase1Page(document);
  const $ = (selector) => document.querySelector(selector);
  const editAndPatch = (transform) => {
    $('#test-area').value = transform($('#test-area').value);
    $('#patch-button').click();
  };
  return { page, $, editAndPatch };
}

describe('Phase 1 페이지', () => {
  it('로드 시 실제 영역이 VDOM 으로 변환되어 테스트 영역에 표시된다', () => {
    const { $ } = openPage();
    expect($('#test-area').value).toContain('<h1 class="title">미니 리액트 실험실</h1>');
    expect($('#history-label').textContent).toBe('1 / 1');
    expect($('#back-button').disabled).toBe(true);
    expect($('#forward-button').disabled).toBe(true);
  });

  it('Patch 하면 바뀐 부분만 실제 영역에 반영되고 History 에 저장된다', () => {
    const { $, editAndPatch } = openPage();
    const titleElement = $('#real-area h1');

    editAndPatch((value) => value.replace('미니 리액트 실험실', '바뀐 제목'));

    expect($('#real-area h1').textContent).toBe('바뀐 제목');
    expect($('#real-area h1')).toBe(titleElement); // 요소를 새로 만들지 않고 텍스트만 변경
    expect($('#history-label').textContent).toBe('2 / 2');
    expect($('#patch-log').textContent).toContain('TEXT');
  });

  it('뒤로가기 / 앞으로가기로 실제 영역과 테스트 영역이 함께 바뀐다', () => {
    const { $, editAndPatch } = openPage();
    editAndPatch((value) => value.replace('<li>Virtual DOM 만들기</li>', '<li>Virtual DOM 만들기</li>\n<li>추가 항목</li>'));
    expect($('#real-area .todo').children).toHaveLength(4);

    $('#back-button').click();
    expect($('#real-area .todo').children).toHaveLength(3);
    expect($('#test-area').value).not.toContain('추가 항목');
    expect($('#forward-button').disabled).toBe(false);

    $('#forward-button').click();
    expect($('#real-area .todo').children).toHaveLength(4);
    expect($('#test-area').value).toContain('추가 항목');
  });

  it('바뀐 게 없으면 History 에 저장하지 않는다', () => {
    const { $ } = openPage();
    $('#patch-button').click();
    expect($('#history-label').textContent).toBe('1 / 1');
    expect($('#patch-log').textContent).toContain('변경 없음');
  });

  it('뒤로 간 뒤 새로 Patch 하면 미래 기록이 사라진다', () => {
    const { $, editAndPatch } = openPage();
    editAndPatch((value) => value.replace('비활성 버튼', 'A'));
    editAndPatch((value) => value.replace('A', 'B'));
    $('#back-button').click();
    $('#back-button').click();
    editAndPatch((value) => value.replace('비활성 버튼', 'C'));
    expect($('#history-label').textContent).toBe('2 / 2');
    expect($('#forward-button').disabled).toBe(true);
    expect($('#real-area button').textContent).toBe('C');
  });

  it('History 목록을 클릭하면 해당 상태로 이동한다', () => {
    const { $, editAndPatch } = openPage();
    editAndPatch((value) => value.replace('비활성 버튼', 'A'));
    editAndPatch((value) => value.replace('A', 'B'));
    $('#history-list button[data-index="0"]').click();
    expect($('#real-area button').textContent).toBe('비활성 버튼');
    expect($('#history-label').textContent).toBe('1 / 3');
  });

  it('<script> 와 onclick 은 실제 영역에 들어가지 않는다', () => {
    const { $, editAndPatch } = openPage();
    editAndPatch((value) => `${value}\n<script>window.hacked = true</script>\n<p onclick="alert(1)">안전</p>`);
    expect($('#real-area script')).toBe(null);
    expect($('#real-area p:last-child').hasAttribute('onclick')).toBe(false);
    expect($('#patch-log').textContent).toContain('보안상 제거됨');
  });

  it('속성 변경은 PROPS 로 반영된다', () => {
    const { $, editAndPatch } = openPage();
    editAndPatch((value) => value.replace('<button type="button" disabled>', '<button type="button">'));
    expect($('#real-area button').disabled).toBe(false);
    expect($('#patch-log').textContent).toContain('PROPS');
  });

  it('태그를 바꾸면 REPLACE, 수정 취소 버튼은 테스트 영역을 되돌린다', () => {
    const { $, editAndPatch } = openPage();
    editAndPatch((value) => value.replace('<h1 class="title">미니 리액트 실험실</h1>', '<h2 class="title">미니 리액트 실험실</h2>'));
    expect($('#real-area h2')).not.toBe(null);
    expect($('#patch-log').textContent).toContain('REPLACE');

    $('#test-area').value = '아무거나';
    $('#test-area').dispatchEvent(new Event('input'));
    expect($('#dirty-badge').hidden).toBe(false);
    $('#reset-button').click();
    expect($('#test-area').value).toContain('<h2 class="title">');
    expect($('#dirty-badge').hidden).toBe(true);
  });
});
