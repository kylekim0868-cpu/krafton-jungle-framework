import { domToVNode } from './domToVNode.js';
import { renderVNode } from './renderVNode.js';
import { assertVNode } from './vnode.js';
import { applyEvents, applyProperties, assertRuntimeProps, assertPropertyTarget } from './runtimeProps.js';

/** 주석만 제외하고 template.content를 따라 VNode와 같은 자식 목록을 만든다. */
function containerOf(node) {
  if (node.nodeType !== 1) throw new TypeError('A child path requires an HTML element.');
  return node.localName === 'template' ? node.content : node;
}

/**
 * 경로·변경 필드·겹침·삽입 순서를 검증하고 새 DOM을 미리 생성한다.
 * 기존 DOM은 변경하지 않으며, 반환한 함수를 한 번 호출하면 실제 변경을 적용한다.
 * path는 적용 전 VNode 자식 인덱스, INSERT·MOVE index는 최종 순서다.
 * 잘못된 입력은 적용 전에 예외로 알린다. 실제 적용 중 DOM 예외는 호출자에게 전달한다.
 * 트랜잭션·복구는 제공하지 않으며 Phase 1 호출자가 마지막 확정 상태로 복구한다.
 */
export function preparePatch(root, changes) {
  if (!root || ![1, 3].includes(root.nodeType) || !Array.isArray(changes)) throw new TypeError('Invalid patch input.');
  assertVNode(domToVNode(root));
  const childrenCache = new Map();
  const pathCache = new Map([['', root]]);
  const groups = new Map();
  const claims = new Map();
  const destructive = new Map();
  const addresses = [];
  const writes = [];
  const propertyWrites = [];
  let newRoot = root;

  function pathKey(path) {
    if (!Array.isArray(path) || !path.every((index) => Number.isInteger(index) && index >= 0)) {
      throw new TypeError('A path must contain non-negative integer indices.');
    }
    return path.join('/');
  }

  // 같은 부모의 자식 목록을 캐시하여 형제 경로를 찾을 때마다 다시 순회하지 않는다.
  function childrenOf(node) {
    if (!childrenCache.has(node)) {
      childrenCache.set(node, Array.from(containerOf(node).childNodes).filter((child) => child.nodeType !== 8));
    }
    return childrenCache.get(node);
  }

  function resolve(path) {
    const key = pathKey(path);
    if (pathCache.has(key)) return pathCache.get(key);
    let node = root;
    for (let depth = 0; depth < path.length; depth += 1) {
      const prefix = path.slice(0, depth + 1).join('/');
      if (pathCache.has(prefix)) node = pathCache.get(prefix);
      else {
        node = childrenOf(node)[path[depth]];
        if (!node) throw new RangeError(`Path does not exist: ${key}`);
        pathCache.set(prefix, node);
      }
    }
    return node;
  }

  function groupFor(path) {
    const key = pathKey(path);
    if (!groups.has(key)) {
      const parent = resolve(path);
      groups.set(key, { parent, container: containerOf(parent), old: childrenOf(parent),
        removed: new Set(), replacements: new Map(), moved: new Set(), placements: new Map() });
    }
    return groups.get(key);
  }

  function claim(path, type) {
    const key = pathKey(path);
    const types = claims.get(key) ?? new Set();
    if (types.has(type)) throw new TypeError('Duplicate change for the same path.');
    types.add(type);
    claims.set(key, types);
    addresses.push({ path: [...path], type });
    if (type === 'REMOVE' || type === 'REPLACE') destructive.set(key, type);
  }

  function place(group, index, node) {
    if (!Number.isInteger(index) || index < 0 || group.placements.has(index)) throw new RangeError('Invalid or duplicate final child index.');
    group.placements.set(index, node);
  }

  // 속성 이름의 오류도 적용 전에 찾도록 마운트하지 않은 요소에서 검증한다.
  const probe = root.ownerDocument.createElement('div');
  for (const change of changes) {
    if (!change || typeof change !== 'object') throw new TypeError('Invalid change.');
    const { type } = change;
    if (type === 'INSERT') {
      const group = groupFor(change.parentPath);
      addresses.push({ path: [...change.parentPath], type });
      assertVNode(change.vnode);
      place(group, change.index, renderVNode(change.vnode));
      continue;
    }
    if (!['REMOVE', 'REPLACE', 'TEXT', 'PROPS', 'MOVE', 'EVENTS', 'PROPERTIES'].includes(type)) throw new TypeError('Unknown change type.');
    const node = resolve(change.path);
    claim(change.path, type);
    if (type === 'EVENTS' || type === 'PROPERTIES') {
      if (node.nodeType !== 1) throw new TypeError('Runtime props require an element.');
      // 원본 맵을 나중에 수정해도 준비한 처리의 내용은 바뀌지 않는다.
      if (!change.previous || !change.next) throw new TypeError('Runtime change maps are required.');
      const previous = { ...change.previous };
      const next = { ...change.next };
      if (type === 'EVENTS') {
        assertRuntimeProps(previous);
        assertRuntimeProps(next);
        writes.push(() => applyEvents(node, previous, next));
      } else {
        assertRuntimeProps({}, previous);
        assertRuntimeProps({}, next);
        assertPropertyTarget(node, { ...previous, ...next });
        propertyWrites.push(() => applyProperties(node, previous, next));
      }
    } else if (type === 'TEXT') {
      if (node.nodeType !== 3 || typeof change.text !== 'string') throw new TypeError('Invalid text change.');
      const text = change.text;
      writes.push(() => { node.data = text; });
    } else if (type === 'PROPS') {
      if (node.nodeType !== 1 || !change.set || typeof change.set !== 'object' || Array.isArray(change.set)
          || !Array.isArray(change.remove) || !change.remove.every((name) => typeof name === 'string')
          || new Set(change.remove).size !== change.remove.length) throw new TypeError('Invalid props change.');
      const entries = Object.entries(change.set);
      // key 교체는 Diff의 REPLACE로 표현한다. 임의 PROPS로 식별자만 바꾸는 입력은 거부한다.
      if (Object.hasOwn(change.set, 'data-key') || change.remove.includes('data-key')) throw new TypeError('Change keys using REPLACE.');
      for (const [name, value] of entries) {
        if (typeof value !== 'string' || change.remove.includes(name)) throw new TypeError('Invalid attribute value.');
        probe.setAttribute(name, value);
      }
      for (const name of change.remove) probe.setAttribute(name, '');
      const remove = [...change.remove];
      writes.push(() => {
        for (const name of remove) node.removeAttribute(name);
        for (const [name, value] of entries) node.setAttribute(name, value);
      });
    } else if (type === 'REPLACE') {
      assertVNode(change.vnode);
      const replacement = renderVNode(change.vnode);
      if (change.path.length) groupFor(change.path.slice(0, -1)).replacements.set(node, replacement);
      else newRoot = replacement;
      writes.push(() => { if (node.parentNode) node.parentNode.replaceChild(replacement, node); });
    } else {
      if (!change.path.length) throw new TypeError('The root cannot be removed or moved.');
      const parentPath = change.path.slice(0, -1);
      const group = groupFor(parentPath);
      if (type === 'REMOVE') group.removed.add(node);
      else {
        if (pathKey(parentPath) !== pathKey(change.parentPath)) throw new TypeError('MOVE must stay within the same parent.');
        group.moved.add(node);
        place(group, change.index, node);
      }
    }
  }

  // 파괴적 변경 아래의 다른 변경은 적용 전에 거부한다. MOVE와 같은 노드의
  // TEXT·PROPS·REPLACE는 허용하여 이동하면서 내용이 바뀌는 경우를 지원한다.
  for (const { path, type } of addresses) {
    for (let depth = 0; depth <= path.length; depth += 1) {
      const owner = destructive.get(path.slice(0, depth).join('/'));
      if (owner && (depth < path.length || (type !== owner && !(type === 'MOVE' && owner === 'REPLACE')))) {
        throw new TypeError('Overlapping destructive changes.');
      }
    }
  }

  // 최종 목록을 먼저 조립한다. 배치되지 않은 생존 노드는 기존 상대 순서로 채운다.
  for (const group of groups.values()) {
    const inserted = group.placements.size - group.moved.size;
    const length = group.old.length - group.removed.size + inserted;
    const final = new Array(length);
    const placed = new Set();
    for (const [index, original] of group.placements) {
      if (index >= length) throw new RangeError('Final child index is out of range.');
      const node = group.replacements.get(original) ?? original;
      final[index] = node;
      placed.add(node);
    }
    const remaining = group.old.filter((node) => !group.removed.has(node) && !group.moved.has(node))
      .map((node) => group.replacements.get(node) ?? node);
    let cursor = 0;
    for (let index = 0; index < length; index += 1) if (!final[index]) final[index] = remaining[cursor++];
    if (cursor !== remaining.length || final.some((node) => !node)) throw new TypeError('Inconsistent child changes.');
    const keys = new Set();
    for (const node of final) {
      const key = node.nodeType === 1 ? node.getAttribute('data-key') : null;
      if (key !== null && keys.has(key)) throw new TypeError(`Duplicate final sibling data-key: ${key}`);
      if (key !== null) keys.add(key);
    }
    group.final = final;
    group.placed = placed;
  }

  let applied = false;
  return function apply() {
    if (applied) throw new Error('A prepared patch can only be applied once.');
    applied = true;
    for (const write of writes) write();
    for (const group of groups.values()) {
      for (const node of [...group.old].reverse()) if (group.removed.has(node)) group.container.removeChild(node);
      let anchor = null;
      // 오른쪽부터 위치를 확정하여 이동 후의 인덱스를 다시 해석하지 않는다.
      for (let index = group.final.length - 1; index >= 0; index -= 1) {
        const node = group.final[index];
        if (group.placed.has(node)) {
          let next = node.nextSibling;
          while (next?.nodeType === 8) next = next.nextSibling;
          if (node.parentNode !== group.container || next !== anchor) group.container.insertBefore(node, anchor);
        }
        anchor = node;
      }
    }
    // select의 option 추가·삭제가 끝난 뒤 현재 값을 확정한다.
    for (const write of propertyWrites) write();
    return newRoot;
  };
}

/**
 * 준비와 적용을 한 번에 실행하고 유지되거나 교체된 루트 DOM을 반환한다.
 * 새 루트가 문서에 붙어 있으면 그 위치에서 교체한다. 적용 중 예외의 복구는 호출자 책임이다.
 */
export function patch(root, changes) {
  return preparePatch(root, changes)();
}
