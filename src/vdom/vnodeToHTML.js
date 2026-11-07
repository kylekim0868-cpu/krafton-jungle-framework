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

//depth : 현제 몇번째 자식으로 파고 들어왔는지
export function vnodeToHTML(v, depth = 0) {
  const pad = '  '.repeat(depth); //depth에 맞춰 스페이스 2칸씩 들여쓰기 공백(pad)을 만듭니다.

  // 텍스트 노드일시 공백과 글자만 반환
  if (v.type === TEXT) return pad + escapeText(v.text);

  // 속성 문자열 만들기 (key, 함수, false 는 제외)
  /*
    key나 자바스크립트 함수(onClick 등), false, null 값은 HTML 태그 속성에 찍히면 안 되므로 걸러냄.
    disabled: true처럼 값이 true인 것은 disabled만 적고, 나머지는 id="box"처럼 따옴표로 감싸서 문자열을 합칩니다.
    시작 태그 <div class="box">와 닫는 태그 </div> 뼈대를 만들어 둡니다.
  */
  const attrs = Object.entries(v.props)
    .filter(([k, val]) => k !== 'key' && typeof val !== 'function' && val !== false && val != null)
    .map(([k, val]) => (val === true ? ` ${k}` : ` ${k}="${escapeAttr(val)}"`))
    .join('');
  const open = `<${v.type}${attrs}>`;
  const close = `</${v.type}>`;

  // <br>, <input> 등
  /*
    자식이 글자 하나뿐인데 굳이 줄을 바꿔서 <p>\n  안녕\n</p>처럼 쓰면 가독성이 떨어지므로, 글자만 있을 때는 <p>안녕</p>으로 한 줄 처리합니다.
    자식으로 또 다른 태그들이 들어있을 때만 depth + 1을 넘겨 재귀 호출하며 줄바꿈(\n)과 계단식 들여쓰기를 적용합니다.
  */
  if (VOID.has(v.type)) return pad + open;

  // 자식 없음: <div></div>
  if (v.children.length === 0) return pad + open + close;

  // 자식이 텍스트뿐: <p>안녕</p> 한 줄로
  if (v.children.every((c) => c.type === TEXT)) {
    return pad + open + v.children.map((c) => escapeText(c.text)).join('') + close;
  }

  // 그 외: 줄바꿈 + 들여쓰기
  const inner = v.children.map((c) => vnodeToHTML(c, depth + 1)).join('\n');
  return `${pad}${open}\n${inner}\n${pad}${close}`;
}