import { TEXT } from './h.js';
import { domToVNode } from './domToVNode.js';
import { sanitizeVNode } from './sanitizeVNode.js';

// 공백을 그대로 보존해야 하는 태그 (화면에 공백/줄바꿈이 그대로 보임)
const PRESERVE_WHITESPACE_TAGS = new Set(['pre', 'textarea', 'code']);

/*
  HTML 문자열 → VNode 배열 (테스트 영역 textarea 의 내용을 VDOM 으로 바꿀 때 사용)

  textarea 에는 여러 개의 최상위 태그나 텍스트가 올 수 있으므로 "배열"로 반환합니다.
  반환: { children: VNode[], removed: string[] }
    removed: 보안상 제거된 요소 목록 (화면에 경고로 표시)
*/
export function htmlToVNodes(html) {
  // <template> 은 화면에 그려지지 않고, 내부 <script> 도 실행되지 않는 안전한 파서입니다.
  const template = document.createElement('template');
  //html 을 받아 저장하기, 이 과정에서 자동으로 브라우저가 html 을 dom 으로 변환
  template.innerHTML = html;

  const removed = [];
  const children = [];
  //루트 노드의 직속 자식들을 순회하며 children 에 저장, 노드에서 제거
  for (const node of template.content.childNodes) {
    //dom 을 vdom 으로 변환
    const vnode = domToVNode(node);
    //없으면 건너뜀
    if (!vnode) continue;
    //dom 에서 보안상 위험한 요소를 제거함
    const result = sanitizeVNode(vnode, removed);
    if (result.vnode) children.push(result.vnode);
  }

  /*
  // removed 배열의 실제 모습, 보안상 위험한 것들을 모아둔 문자열 리스트
  [
    '<script>',                  // 위험한 태그 이름
    '<iframe>',                  // 위험한 태그 이름
    'onclick',                   // 위험한 인라인 이벤트 속성 이름
    'href="javascript:steal()"'  // 위험한 악성 URL 속성
  ]
  */

  //children 문자열 정규화 하고 반환
  return { children: normalizeChildren(children), removed };
}

/*
  공백 정규화

  문제: 사람이 textarea 에서 들여쓰기를 하면
    <p>
      안녕
    </p>
  의 텍스트는 "\n    안녕\n  " 이 되어, 화면은 똑같은데 VDOM 은 "안녕" 과 달라집니다.
  → Patch 를 누를 때마다 의미 없는 TEXT 변경이 생깁니다.

  해결 (브라우저가 공백을 렌더링하는 규칙과 비슷하게):
   1) 연속된 공백/줄바꿈은 공백 한 칸으로 합칩니다.
   2) 형제 중 첫 번째 텍스트의 앞 공백, 마지막 텍스트의 뒤 공백은 제거합니다.
   3) <pre>, <textarea>, <code> 안은 공백이 의미가 있으므로 건드리지 않습니다.
*/
export function normalizeVNode(vnode) {
  if (vnode.type === TEXT || PRESERVE_WHITESPACE_TAGS.has(vnode.type)) return vnode;
  return { ...vnode, children: normalizeChildren(vnode.children) };
}


function normalizeChildren(children) {
  /*
  ...child 를 쓰는 이유 : 
  
  child = {
  type: '#text',   // 👈 노드 타입 (식별자)
  props: {},       // 👈 속성 객체
  children: [],    // 👈 자식 배열
  text: '  안녕  '  // 👈 실제 글자 내용
  };
  만약 ...child를 안 쓰고 바꾸면
  { text: '안녕' } 딱 하나만 달랑 남고, 다른 내용들 증발
  */
  const result = children.map((child) =>
    //정규 표현식 /\s+/g 을 써서 아무리 공백이 지저분하게 뭉쳐 있어도 스페이스 딱 1칸(' ')으로 강제 압축(치환)합니다.
    child.type === TEXT ? { ...child, text: child.text.replace(/\s+/g, ' ') } : normalizeVNode(child),
  );

  //자식 목록의 맨 첫 번째 노드(result[0])가 글자 노드라면?
  // 태그 바로 뒤에 붙어있던 쓸데없는 앞쪽 빈칸을 지우기 위해 .trimStart()(왼쪽 공백 제거)를 적용합니
  const first = result[0];
  if (first?.type === TEXT) result[0] = { ...first, text: first.text.trimStart() };

  //자식 목록의 맨 마지막 노드(result[lastIndex])가 글자 노드라면?
  //닫는 태그 바로 앞에 붙어있던 쓸데없는 뒤쪽 빈칸을 지우기 위해 .trimEnd()(오른쪽 공백 제거)를 적용합니다.
  const lastIndex = result.length - 1;
  const last = result[lastIndex];
  if (last?.type === TEXT) result[lastIndex] = { ...last, text: last.text.trimEnd() };

  // filter : 조건문이 참이면 포함이고, 거짓이면 제거
  // 앞뒤 공백을 다듬었더니 글자 내용이 아무것도 없는 빈 문자열(text: '')만 남은 유령 텍스트 노드는 빼고 반환
  return result.filter((child) => child.type !== TEXT || child.text !== '');
}
