import { createTextVNode } from '../vdom/h.js';
import { renderChildComponent } from './hookRuntime.js';

/*
  컴포넌트가 섞인 VDOM → 순수 HTML 태그로만 된 VDOM 으로 "펼치기"

  h(TodoItem, { todo }) 처럼 type 이 함수인 노드는 실제 DOM 태그가 아니므로
  diff/patch 에 넘기기 전에 함수를 실행해서 결과(태그 VNode)로 바꿔야 합니다.

    h('ul', null, h(TodoItem, { text: 'a' }))
      → { type: 'ul', children: [ { type: TodoItem, props: { text: 'a' } } ] }
      → resolveVNode
      → { type: 'ul', children: [ { type: 'li', children: [ '#text a' ] } ] }

  자식 컴포넌트는 상태가 없는 순수 함수(props → VNode)이므로
  인스턴스를 따로 만들지 않고, 렌더링할 때마다 그냥 호출해서 펼칩니다.
*/

/**
 * VNode 트리 안의 함수형 자식 컴포넌트를 모두 실행해 태그 VNode 로 바꿉니다.
 * @param node VNode, 문자열, 숫자, null/boolean(=렌더링 안 함)
 * @returns 펼쳐진 VNode, 또는 렌더링할 것이 없으면 null
 */
export function resolveVNode(node) {
  // 조건부 렌더링: {isOpen && h(...)} 의 false, null, undefined 는 아무것도 그리지 않음
  if (node == null || typeof node === 'boolean') return null;

  // 컴포넌트가 문자열/숫자를 바로 반환한 경우
  if (typeof node === 'string' || typeof node === 'number') return createTextVNode(node);

  if (Array.isArray(node)) {
    throw new Error('컴포넌트는 배열이 아니라 하나의 루트 요소를 반환해야 합니다. (예: h("div", null, ...items))');
  }

  // 함수형 자식 컴포넌트: props(+children)를 넘겨 실행한 뒤, 그 결과를 다시 펼침 (자식 안의 자식도 처리)
  if (typeof node.type === 'function') {
    const { key, ...restProps } = node.props;
    const output = renderChildComponent(node.type, { ...restProps, children: node.children });
    const resolved = resolveVNode(output);
    // <Item key=... /> 처럼 컴포넌트에 준 key 는 결과 태그에 옮겨 diff 가 쓸 수 있게 함
    if (resolved && key != null && resolved.props.key == null) {
      return { ...resolved, props: { ...resolved.props, key } };
    }
    return resolved;
  }

  // 일반 태그: 자식들을 재귀적으로 펼치고, 그리지 않을 자식(null)은 제거
  return {
    ...node,
    children: node.children.map(resolveVNode).filter((child) => child !== null),
  };
}
