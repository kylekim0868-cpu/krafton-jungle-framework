import { TEXT, createTextVNode } from './h.js';

//dom 을 vdom 으로 변환하는 함수
export function domToVNode(node) {
    //브라우저 실제 DOM에서 태그 사이의 글자는 TEXT_NODE라는 별도의 노드 객체로 존재합니다.
  if (node.nodeType === Node.TEXT_NODE) {  //3

    // 공백만 있는 텍스트 노드는 무시합니다.
    // 이유는, 브라우저가 HTML을 해석할 때 태그 사이의 공백이나 줄바꿈은 모두 TEXT_NODE로 만들어주기 때문입니다.
    if (node.textContent.trim() === '') return null;   // 공백 무시

    // 공백 등이 아닌 진짜 글자가 있다면 h.js에서 만든 createTextVNode를 써서 
    // { type: '#text', text: '글자' } 형태의 가상 돔 객체로 포장해 반환합니다.
    return createTextVNode(node.textContent);
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null; // 주석 등 무시 //1
  
  //실제 브라우저 태그가 가진 모든 HTML 속성 목록을 순회하면서 
  // 일반 자바스크립트 객체 { id: 'btn', class: 'active', disabled: '' }로 깔끔하게 복사합니다.
  const props = {};
  for (const { name, value } of node.attributes) props[name] = value;

  //자식 노드 순회 (DFS 재귀 호출)
  const children = [];
  for (const child of node.childNodes) { 
    const v = domToVNode(child);
    if (v) children.push(v);
  }
  //마지막으로, 태그 이름을 대문자로 반환한 뒤, 속성 객체, 자식 배열을 가진 VNode 객체를 만들어 반환합니다.
  return { type: node.tagName.toLowerCase(), props, children };
}