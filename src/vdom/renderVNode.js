import { applyEvents, applyProperties, assertRuntimeProps, assertPropertyTarget } from './runtimeProps.js';

/**
 * 공통 VNode 트리를 재귀적으로 읽어 새 DOM 노드를 생성한다.
 * domToVNode의 반대 방향이며 HTML 문자열을 다시 파싱하는 방식으로 우회하지 않는다.
 *
 * @param {object} vnode 요소 또는 텍스트 VNode. 주석 제외 결과인 null은 렌더링 입력이 아니다.
 * @returns {Node} 현재 document에서 생성한 DOM 루트. 문서에는 아직 마운트하지 않는다.
 * @throws {TypeError} VNode 종류나 필수 필드의 형태가 맞지 않는 경우 발생한다.
 * DOM API가 거부하는 태그·속성 이름의 예외도 호출자에게 전달된다.
 * 입력 VNode와 기존 DOM은 수정하지 않는다. 마운트 위치는 호출자가 결정한다.
 */
export function renderVNode(vnode) {
  if (!vnode || typeof vnode !== 'object') {
    throw new TypeError('renderVNode requires a VNode.');
  }

  // '<strong>문자</strong>' 같은 값도 마크업이 아닌 글자로 만든다.
  // 텍스트 노드에는 자식이 없으므로 요소 생성·자식 재귀 단계로 내려가지 않는다.
  if (vnode.kind === 'text' && typeof vnode.text === 'string') {
    return document.createTextNode(vnode.text);
  }

  // 이 단계의 요소 계약은 태그 이름, 속성 객체, 자식 배열을 요구한다.
  // 잘못된 입력을 조용히 빈 화면으로 바꾸면 원인을 찾기 어려우므로 명시적으로 거부한다.
  if (vnode.kind !== 'element' || typeof vnode.tag !== 'string'
      || !vnode.props || typeof vnode.props !== 'object'
      || Array.isArray(vnode.props) || !Array.isArray(vnode.children)) {
    throw new TypeError('Invalid element VNode.');
  }

  // props는 DOM에서 읽은 문자열 HTML 속성이다. 현재 값과 함수 이벤트는
  // properties·events 필드로 따로 받아 Phase 1의 속성 계약을 유지한다.
  const element = document.createElement(vnode.tag);
  for (const [name, value] of Object.entries(vnode.props)) {
    element.setAttribute(name, value);
  }
  assertRuntimeProps(vnode.events, vnode.properties);
  assertPropertyTarget(element, vnode.properties ?? {});
  applyEvents(element, {}, vnode.events);

  // <template>은 자식이 content에 들어가야 내부 구조가 유지된다.
  // 각 자식을 새 DOM으로 만든 뒤 차례로 붙여 VNode의 자식 순서를 보존한다.
  const target = element.localName === 'template' ? element.content : element;
  for (const child of vnode.children) {
    target.appendChild(renderVNode(child));
  }
  // select.value는 option 자식 생성이 끝난 뒤 반영한다.
  applyProperties(element, {}, vnode.properties);
  // 호출자가 replaceChildren 등으로 붙일 수 있도록 생성한 루트 참조를 반환한다.
  return element;
}
