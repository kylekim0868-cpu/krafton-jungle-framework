// HTML과 SVG는 같은 Element여도 네임스페이스가 다르다.
// P1-00에서 합의한 HTML 범위를 구분하기 위해 사용한다.
const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

/**
 * DOM 노드 자신과 하위 트리를 재귀적으로 읽어 공통 VNode로 표현한다.
 *
 * 요소: { kind: 'element', tag, props, children }
 * 텍스트: { kind: 'text', text }
 * 예: <p>안녕</p> → tag가 'p'인 요소 VNode와 텍스트 자식 VNode.
 *
 * @param {Node} node 변환할 HTML 요소·텍스트·주석 노드. 부모 컨테이너의 내용만 읽는 함수가 아니다.
 * @returns {object|null} 새 VNode 객체. 주석 노드 자체는 제외 대상이므로 null을 반환한다.
 * @throws {TypeError} 입력이 없거나 HTML 요소·텍스트·주석 이외의 노드인 경우 발생한다.
 * 원본 DOM은 읽기만 하며 속성·내용·노드 참조를 변경하지 않는다.
 * 속성은 문자열로 저장한다. 이벤트 함수와 폼의 현재 프로퍼티 상태는 복원하지 않는다.
 */
export function domToVNode(node) {
  // nodeType으로 분기하므로 다른 문서나 iframe에서 생성한 노드도 같은 규칙으로 읽는다.
  if (!node || typeof node.nodeType !== 'number') {
    throw new TypeError('domToVNode requires a DOM node.');
  }

  // DOM의 nodeType: 8은 주석, 3은 텍스트다.
  // 텍스트를 trim하지 않아 줄바꿈과 공백만 있는 노드도 그대로 보존한다.
  if (node.nodeType === 8) return null;
  if (node.nodeType === 3) return { kind: 'text', text: node.data };

  // 1은 요소 노드다. SVG·MathML이나 Document·DocumentFragment를
  // 빈 결과로 누락시키지 않고 오류로 알려 지원 범위 밖 입력을 드러낸다.
  if (node.nodeType !== 1 || node.namespaceURI !== HTML_NAMESPACE) {
    throw new TypeError('Only HTML elements and text nodes are supported.');
  }

  // 일반 요소의 자식은 childNodes에 있지만 <template> 내부는 별도 content에 있다.
  // children 대신 childNodes를 읽어 요소 사이의 텍스트와 공백까지 순서대로 처리한다.
  const childNodes = node.localName === 'template' ? node.content.childNodes : node.childNodes;
  const children = [];

  // 자식도 같은 함수로 변환한다. 각 재귀 호출의 결과를 현재 요소의 children에 모으므로
  // 중첩 구조와 형제 순서가 유지되며, 주석을 뜻하는 null만 자식 목록에서 제외된다.
  for (const child of childNodes) {
    const vnode = domToVNode(child);
    if (vnode !== null) children.push(vnode);
  }

  // NamedNodeMap인 attributes를 [이름, 문자열 값] 목록으로 바꿔 일반 객체로 저장한다.
  // DOM 객체를 보관하지 않아 VNode와 원본 DOM의 데이터 경계를 분리한다.
  return {
    kind: 'element',
    tag: node.localName,
    props: Object.fromEntries(Array.from(node.attributes, ({ name, value }) => [name, value])),
    children,
  };
}
