import { createTextVNode } from './h.js'; //h.js 에서 createTextVNode 함수를 가져옵니다.

//dom 을 vdom 으로 변환하는 함수 // 인자 node 는 실제 DOM 노드 객체
export function domToVNode(node) {
  //브라우저 실제 DOM에서 태그 사이의 글자는 TEXT_NODE라는 별도의 노드 객체로 존재합니다.
  if (node.nodeType === Node.TEXT_NODE) {  //3

    // 공백만 있는 텍스트 노드는 무시합니다.
    // node.textContent 에는 순수한 글자 내용이 들어가있음
    // 이유는, 브라우저가 HTML을 해석할 때 태그 사이의 공백이나 줄바꿈은 모두 TEXT_NODE로 만들어주기 때문입니다.
    if (node.textContent.trim() === '') return null;   // 공백 무시

    // { type: '#text', text: '글자' } 형태의 가상 돔 객체로 포장해 반환합니다.
    return createTextVNode(node.textContent);
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null; //주석 등 무시 //1
  
  //실제 브라우저 태그가 가진 모든 HTML 속성 목록을 순회하면서 
  // 일반 자바스크립트 객체 { id: 'btn', class: 'active', disabled: '' }로 깔끔하게 복사합니다.

  //node.attributes는 실제 브라우저 태그 요소(node)에 붙어 있는 모든 HTML 속성들을 담고 있는 내장 프로퍼티(특수 컬렉션)입니다.
  //자료형은 일반 JS 배열이 아니라 브라우저 DOM 표준 명세인 NamedNodeMap이라는 유사 배열(Array-like) 객체입니다.

  /*
  <button id="submit-btn" class="primary" disabled></button>

  [ NamedNodeMap 객체 ]
  │
  ├── 0: Attr { name: "id", value: "submit-btn" }
  ├── 1: Attr { name: "class", value: "primary" }
  ├── 2: Attr { name: "disabled", value: "" }
  │
  ├── length: 3
  └── getNamedItem(), setNamedItem()... (C++ 바인딩 메서드들)
  //attributes 로 접근하고자 하는 정보들을 한번에 볼 수 있기 때문에
  */
  const props = {};
  for (const { name, value } of node.attributes) props[name] = value;

  //자식 노드 순회 (DFS 재귀 호출)
  const children = [];
  for (const child of node.childNodes) { 
    const v = domToVNode(child);
    if (v) children.push(v);
  }
  //마지막으로, 태그 이름(브라우저는 'DIV' 처럼 대문자로 줌)을 소문자로 변환한 뒤, 속성 객체, 자식 배열을 가진 VNode 객체를 만들어 반환합니다.
  return { type: node.tagName.toLowerCase(), props, children };
}