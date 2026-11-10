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
 * Diff·Patch가 지원하는 VNode 전체를 읽어 필드·문자열 속성·형제 key를 검증한다.
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
