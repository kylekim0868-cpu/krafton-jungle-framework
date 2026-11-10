import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupPhase2Page, TODO_STORAGE_KEY } from '../pages/phase2/phase2Page.js';

// 기능 테스트: 실제 index.html 마크업으로 Phase 2 데모를 띄우고 사용자 동작을 흉내 냅니다.
const testDir = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(testDir, '../pages/phase2/index.html'), 'utf-8');
const bodyHTML = html.match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '');
const nextTick = () => Promise.resolve();

function openPage() {
  localStorage.clear(); // 이전 테스트가 저장한 할 일 목록이 다음 테스트에 영향을 주지 않도록
  document.body.innerHTML = bodyHTML;
  const root = setupPhase2Page(document);
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const buttonByText = (text) => $$('#app button').find((button) => button.textContent === text);
  const type = (input, value) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  return { root, $, $$, buttonByText, type };
}

describe('Phase 2 데모 페이지', () => {
  it('카운터 +1 / -1 / 초기화', async () => {
    const { $, buttonByText } = openPage();
    buttonByText('+1').click();
    await nextTick();
    expect($('[data-testid="count"]').textContent).toBe('1');
    buttonByText('-1').click();
    buttonByText('-1').click();
    await nextTick();
    expect($('[data-testid="count"]').textContent).toBe('-1');
    expect($('[data-testid="count"]').className).toBe('count negative');
    buttonByText('초기화').click();
    await nextTick();
    expect(buttonByText('초기화').disabled).toBe(true);
  });

  it('+3 버튼: setState 3번이 렌더링 1번으로 합쳐진다', async () => {
    const { root, $, buttonByText } = openPage();
    const before = root.renderCount;
    buttonByText('+3 (batching)').click();
    await nextTick();
    expect($('[data-testid="count"]').textContent).toBe('3');
    expect(root.renderCount).toBe(before + 1);
    expect($('#render-stats').textContent).toBe(`렌더링 ${before + 1}회`);
  });

  it('입력하면 문장이 바뀌고 input 노드는 유지된다 (포커스 유지)', async () => {
    const { $, type } = openPage();
    const input = $('#app input[placeholder="이름을 입력하세요"]');
    type(input, '예준');
    await nextTick();
    expect($('#app').textContent).toContain('안녕하세요, 예준님! (2자)');
    expect($('#app input[placeholder="이름을 입력하세요"]')).toBe(input);
  });

  it('할 일 추가 / 완료 토글 / 삭제', async () => {
    const { $, $$, type } = openPage();
    const draftInput = $('#app input[placeholder="할 일 추가"]');
    type(draftInput, '  useEffect 구현  ');
    await nextTick();
    $('#app form').dispatchEvent(new Event('submit', { cancelable: true }));
    await nextTick();
    expect($$('.todo-item span').map((span) => span.textContent)).toEqual(['Virtual DOM 복습', 'useState 구현', 'useEffect 구현']);
    expect(draftInput.value).toBe('');

    $$('.todo-item input[type="checkbox"]')[1].click();
    await nextTick();
    expect($$('#app h3').at(-1).textContent).toBe('할 일 (2/3)');

    $$('.todo-item button')[0].click();
    await nextTick();
    expect($$('.todo-item span').map((span) => span.textContent)).toEqual(['useState 구현', 'useEffect 구현']);
  });

  it('빈 할 일은 추가되지 않는다', async () => {
    const { $, $$ } = openPage();
    $('#app form').dispatchEvent(new Event('submit', { cancelable: true }));
    await nextTick();
    expect($$('.todo-item')).toHaveLength(2);
  });

  it('렌더링 로그에 patch 가 기록된다', async () => {
    const { $, buttonByText } = openPage();
    buttonByText('+1').click();
    await nextTick();
    // 숫자 TEXT 1개 + 초기화 버튼 disabled 해제 PROPS 1개
    expect($('#commit-log').textContent).toContain('update · DOM 변경 patch 2개');
    expect($('#commit-log').textContent).toContain('이벤트 핸들러 참조 교체');
    expect($('#commit-log').textContent).toContain('TEXT');
  });

  it('useEffect: 카운트가 바뀌면 문서 제목이 바뀌고 Effect 로그가 남는다', async () => {
    const { $, buttonByText } = openPage();
    buttonByText('+1').click();
    await nextTick();
    expect(document.title).toBe('카운트 1 · mini-react');
    expect($('#commit-log').textContent).toContain('document.title');
  });

  it('useEffect: 할 일이 localStorage 에 저장되고, 다시 열면 복원된다', async () => {
    const { root, $$ } = openPage();
    $$('.todo-item button')[0].click(); // 첫 번째 삭제
    await nextTick();
    expect(JSON.parse(localStorage.getItem(TODO_STORAGE_KEY))).toHaveLength(1);

    root.unmount();
    document.body.innerHTML = bodyHTML; // localStorage 는 지우지 않고 다시 띄움
    setupPhase2Page(document);
    expect($$('.todo-item span').map((span) => span.textContent)).toEqual(['useState 구현']);
  });

  it('useEffect cleanup: 자동 증가를 끄면 타이머가 해제된다', async () => {
    const { $, $$ } = openPage();
    const autoToggle = $('.auto-toggle input');
    autoToggle.click(); // 켜기
    await nextTick();
    expect($('#commit-log').textContent).toContain('setInterval 시작');
    autoToggle.click(); // 끄기
    await nextTick();
    expect($('#commit-log').textContent).toContain('clearInterval');
    expect($$('.auto-toggle input')[0].checked).toBe(false);
  });

  it('useMemo: 이름을 입력해도 할 일 통계는 다시 계산되지 않고, 할 일이 바뀌면 다시 계산된다', async () => {
    const { $, $$, type } = openPage();
    const countOf = () => Number($('[data-testid="todo-stats"]').textContent.match(/통계 계산 (\d+)회/)[1]);
    const before = countOf();

    type($('#app input[placeholder="이름을 입력하세요"]'), '예준');
    await nextTick();
    expect(countOf()).toBe(before); // 캐시 사용

    $$('.todo-item input[type="checkbox"]')[1].click();
    await nextTick();
    expect(countOf()).toBe(before + 1);
    expect($('[data-testid="todo-stats"]').textContent).toContain('완료율 100%');
  });

  it('useMemo: 필터를 바꾸면 해당 할 일만 보인다', async () => {
    const { $$, buttonByText } = openPage();
    buttonByText('진행 중').click();
    await nextTick();
    expect($$('.todo-item span').map((span) => span.textContent)).toEqual(['useState 구현']);
    buttonByText('완료').click();
    await nextTick();
    expect($$('.todo-item span').map((span) => span.textContent)).toEqual(['Virtual DOM 복습']);
  });
});
