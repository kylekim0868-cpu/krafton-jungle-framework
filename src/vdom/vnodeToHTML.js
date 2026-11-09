/*
    화면 오른쪽 테스트 영역에 사용자가 직접 HTML을 타이핑하고 수정할 수 있는 입력창을 구현하기 위해 vdom -> html 문자열로 변환하는 함수가 필요합니다.
*/

import { TEXT } from './h.js';

// 닫는 태그가 없는 태그들
//배열 대신 new Set(...)을 쓴 이유는, 나중에 BLOCKED_TAGS.has(태그)로 조회할 때 O(1)의 초고속으로 찾기 위함입니다 (해시셋 구조).
const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'col', 'source', 'wbr']);

// 텍스트용 이스케이프: < > & 를 안전한 문자로
const escapeText = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 속성값용 이스케이프: 따옴표까지
const escapeAttr = (s) => escapeText(s).replace(/"/g, '&quot;');

//depth : 현재 트리에서 몇 단계 깊이까지 내려왔는지 (들여쓰기 칸 수 결정)
export function vnodeToHTML(vnode, depth = 0) {
  //repeat()는 문자열을 지정한 횟수만큼 반복해서 복사/이어 붙여주는 자바스크립트 내장 문자열 메서드
  //즉 depth에 맞춰 스페이스 2칸씩 들여쓰기 공백(pad)을 만듭니다.
  const pad = '  '.repeat(depth); 

  // 텍스트 노드일시 공백과 글자만 반환
  if (vnode.type === TEXT) return pad + escapeText(vnode.text);

  // 속성 문자열 만들기 (key, 함수, false 는 제외)
  /*
    key나 자바스크립트 함수(onClick 등), false, null 값은 HTML 태그 속성에 찍히면 안 되므로 걸러냄.
    disabled: true처럼 값이 true인 것은 disabled만 적고, 나머지는 id="box"처럼 따옴표로 감싸서 문자열을 합칩니다.
    시작 태그 <div class="box">와 닫는 태그 </div> 뼈대를 만들어 둡니다.
  */

  const attrs = Object.entries(vnode.props)

    /*
    entries 는 2차원 배열 [name, value] 형식 펼쳐주는 메서드
    const props = {
      id: 'submit-btn',
      class: 'btn-primary',
      disabled: true
    };
    를 
    [
      ['id', 'submit-btn'],
      ['class', 'btn-primary'],
      ['disabled', true]
    ]
    이렇게 바꿔줌.
    */

    //filter 로 잘못된 것 거르기
    .filter(([name, value]) => name !== 'key' && typeof value !== 'function' && value !== false && value != null)

    // 값이 true 이거나 빈 문자열이면 disabled="" 대신 disabled 처럼 이름만 출력 (사람이 읽기 쉽게, 파싱 결과는 동일)
    /*
    [
      ' id="submit-btn"',
      ' class="btn-primary"',
      ' disabled'
    ]
    map 직후 1차원 배열이 됨
    */
    .map(([name, value]) => (value === true || value === '' ? ` ${name}` : ` ${name}="${escapeAttr(value)}"`))

    /*
    ' id="submit-btn" class="btn-primary" disabled'
    join 직후 하나의 문자열이 됨
    */
    .join('');

  //앞 태그 형식 만들기
  const open = `<${vnode.type}${attrs}>`;
  //뒤 태그 형식 만들기
  const close = `</${vnode.type}>`;

  // <br>, <input> 등
  //닫는 태그 없는 태그들 처리
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