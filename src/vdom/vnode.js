import { assertRuntimeProps } from './runtimeProps.js';

/**
 * HTML 속성 data-key를 같은 부모 안에서 항목을 식별하는 문자열로 읽는다.
 * 없는 key는 null이며 빈 key는 잘못된 식별자로 거부한다. 입력은 변경하지 않는다.
 */
export function getKey(vnode) {
  if (vnode.kind !== 'element' || !Object.hasOwn(vnode.props, 'data-key')) return null;
  const key = vnode.props['data-key'];
  if (typeof key !== 'string' || key.trim() === '') throw new TypeError('data-key must be a non-empty string.');
  return key;
}

/**
 * VNode 전체의 필드·문자열 속성·형제 key와 선택적인 이벤트·현재 프로퍼티를 검증한다.
 * DOM에는 접근하지 않는다. 순환 참조, 빈 key와 형제 중복 key는 TypeError로 알린다.
 * 같은 객체를 다른 가지에서 사용하는 것은 허용하며 입력을 수정하지 않는다.
 */
export function assertVNode(vnode, ancestors = new Set()) {
  if (!vnode || typeof vnode !== 'object' || ancestors.has(vnode)) throw new TypeError('Invalid or cyclic VNode.');
  if (vnode.kind === 'text' && typeof vnode.text === 'string') return;
  if (vnode.kind !== 'element' || typeof vnode.tag !== 'string' || !vnode.tag
      || !vnode.props || typeof vnode.props !== 'object' || Array.isArray(vnode.props)
      || !Object.values(vnode.props).every((value) => typeof value === 'string')
      || !Array.isArray(vnode.children)) throw new TypeError('Invalid element VNode.');
  getKey(vnode);
  assertRuntimeProps(vnode.events, vnode.properties);
  ancestors.add(vnode);
  const keys = new Set();
  for (const child of vnode.children) {
    assertVNode(child, ancestors);
    const key = getKey(child);
    if (key !== null && keys.has(key)) throw new TypeError(`Duplicate sibling data-key: ${key}`);
    if (key !== null) keys.add(key);
  }
  ancestors.delete(vnode);
}

/**
 * 검증한 VNode를 복사한다. 함수 이벤트는 참조를 유지하고 트리·속성·프로퍼티 맵은 분리한다.
 * includeRuntime=false는 DOM에서 다시 읽을 수 있는 HTML 구조·속성만 복사한다.
 */
export function copyVNode(vnode, includeRuntime = true) {
  if (vnode.kind === 'text') return { kind: 'text', text: vnode.text };
  const copy = { kind: 'element', tag: vnode.tag, props: { ...vnode.props },
    children: vnode.children.map((child) => copyVNode(child, includeRuntime)) };
  if (includeRuntime && vnode.events) copy.events = { ...vnode.events };
  if (includeRuntime && vnode.properties) copy.properties = { ...vnode.properties };
  return copy;
}
