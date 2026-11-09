/*
    화면 오른쪽 테스트 영역에 사용자가 직접 HTML을 타이핑하고 수정할 수 있는 입력창을 구현하기 위해 vdom -> html 문자열로 변환하는 함수가 필요합니다.
*/

import { TEXT } from './h.js';

// 닫는 태그가 없는 태그들
const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'col', 'source', 'wbr']);

// 텍스트용 이스케이프: < > & 를 안전한 문자로
const escapeText = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 속성값용 이스케이프: 따옴표까지
const escapeAttr = (s) => escapeText(s).replace(/"/g, '&quot;');

//depth : 현재 트리에서 몇 단계 깊이까지 내려왔는지 (들여쓰기 칸 수 결정)
export function vnodeToHTML(vnode, depth = 0) {
  const pad = '  '.repeat(depth); //depth에 맞춰 스페이스 2칸씩 들여쓰기 공백(pad)을 만듭니다.

  // 텍스트 노드일시 공백과 글자만 반환
  if (vnode.type === TEXT) return pad + escapeText(vnode.text);

  // 속성 문자열 만들기 (key, 함수, false 는 제외)
  /*
    key나 자바스크립트 함수(onClick 등), false, null 값은 HTML 태그 속성에 찍히면 안 되므로 걸러냄.
    disabled: true처럼 값이 true인 것은 disabled만 적고, 나머지는 id="box"처럼 따옴표로 감싸서 문자열을 합칩니다.
    시작 태그 <div class="box">와 닫는 태그 </div> 뼈대를 만들어 둡니다.
  */
  const attrs = Object.entries(vnode.props)
    .filter(([name, value]) => name !== 'key' && typeof value !== 'function' && value !== false && value != null)
    // 값이 true 이거나 빈 문자열이면 disabled="" 대신 disabled 처럼 이름만 출력 (사람이 읽기 쉽게, 파싱 결과는 동일)
    .map(([name, value]) => (value === true || value === '' ? ` ${name}` : ` ${name}="${escapeAttr(value)}"`))
    .join('');
  const open = `<${vnode.type}${attrs}>`;
  const close = `</${vnode.type}>`;

  // <br>, <input> 등
  /*
    자식이 글자 하나뿐인데 굳이 줄을 바꿔서 <p>\n  안녕\n</p>처럼 쓰면 가독성이 떨어지므로, 글자만 있을 때는 <p>안녕</p>으로 한 줄 처리합니다.
    자식으로 또 다른 태그들이 들어있을 때만 depth + 1을 넘겨 재귀 호출하며 줄바꿈(\n)과 계단식 들여쓰기를 적용합니다.
  */
  if (VOID.has(vnode.type)) return pad + open;

  // 자식 없음: <div></div>
  if (vnode.children.length === 0) return pad + open + close;

  // 자식 중에 텍스트가 하나라도 있으면 한 줄로: <p>안녕</p>, <p>안녕 <b>세상</b></p>
  //  - 텍스트와 태그가 섞인 경우 줄바꿈/들여쓰기를 넣으면 텍스트 앞뒤에 공백이 생겨
  //    다시 파싱했을 때 내용이 달라지므로(왕복 불일치), 섞인 경우에도 한 줄로 출력합니다.
  if (vnode.children.some((child) => child.type === TEXT)) {
    const inline = vnode.children
      .map((child) => (child.type === TEXT ? escapeText(child.text) : vnodeToHTML(child, 0)))
      .join('');
    return pad + open + inline + close;
  }

  // 그 외: 줄바꿈 + 들여쓰기
  const inner = vnode.children.map((child) => vnodeToHTML(child, depth + 1)).join('\n');
  return `${pad}${open}\n${inner}\n${pad}${close}`;
}