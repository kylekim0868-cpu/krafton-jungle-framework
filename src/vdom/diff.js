import { assertVNode, getKey } from './vnode.js';

/**
 * 이전 자식 인덱스가 증가하는 가장 긴 부분 수열의 다음 트리 위치를 구한다.
 * 이 항목들은 기존 순서대로 남겨 두고 나머지만 이동한다. 새 노드(-1)는 제외한다.
 * 이진 탐색으로 형제 n개의 이동 계획을 O(n log n)에 만들며 입력은 수정하지 않는다.
 */
function stablePositions(indices) {
  const tails = [];
  const previous = new Array(indices.length).fill(-1);
  for (let index = 0; index < indices.length; index += 1) {
    if (indices[index] < 0) continue;
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (indices[tails[middle]] < indices[index]) low = middle + 1;
      else high = middle;
    }
    previous[index] = low > 0 ? tails[low - 1] : -1;
    tails[low] = index;
  }
  const stable = new Set();
  for (let index = tails.at(-1) ?? -1; index !== -1; index = previous[index]) stable.add(index);
  return stable;
}

/**
 * 두 VNode를 비교하여 INSERT·REMOVE·REPLACE·TEXT·PROPS·MOVE 배열을 반환한다.
 * DOM과 입력 VNode는 변경하지 않는다. 지원 밖 VNode·중복 key는 TypeError다.
 * path는 이전 VNode.children 기준, INSERT·MOVE의 index는 최종 자식 순서 기준이다.
 * data-key가 있으면 같은 부모의 key로 찾고, 없으면 같은 위치의 key 없는 자식과 비교한다.
 * 이동은 형제 순서의 부분 수열을 유지하여 줄인다. 트리 전체의 최소 편집은 보장하지 않는다.
 */
export function diff(previousVNode, nextVNode) {
  assertVNode(previousVNode);
  assertVNode(nextVNode);
  const changes = [];

  function compare(before, after, path) {
    if (before.kind !== after.kind || (before.kind === 'element'
        && (before.tag !== after.tag || getKey(before) !== getKey(after)))) {
      changes.push({ type: 'REPLACE', path, vnode: after });
      return;
    }
    if (before.kind === 'text') {
      if (before.text !== after.text) changes.push({ type: 'TEXT', path, text: after.text });
      return;
    }
    const set = Object.fromEntries(Object.entries(after.props)
      .filter(([name, value]) => !Object.hasOwn(before.props, name) || before.props[name] !== value));
    const remove = Object.keys(before.props).filter((name) => !Object.hasOwn(after.props, name));
    if (Object.keys(set).length || remove.length) changes.push({ type: 'PROPS', path, set, remove });

    const oldKeys = new Map();
    before.children.forEach((child, index) => {
      const key = getKey(child);
      if (key !== null) oldKeys.set(key, index);
    });
    const matched = after.children.map((child, index) => {
      const key = getKey(child);
      if (key !== null) return oldKeys.get(key) ?? -1;
      return before.children[index] && getKey(before.children[index]) === null ? index : -1;
    });
    const used = new Set(matched.filter((index) => index >= 0));
    const stable = stablePositions(matched);
    after.children.forEach((child, index) => {
      const oldIndex = matched[index];
      if (oldIndex < 0) changes.push({ type: 'INSERT', parentPath: path, index, vnode: child });
      else {
        const childPath = [...path, oldIndex];
        compare(before.children[oldIndex], child, childPath);
        if (!stable.has(index)) changes.push({ type: 'MOVE', path: childPath, parentPath: path, index });
      }
    });
    // 삭제 후 밀린 위치를 다시 읽지 않도록 삭제 대상도 이전 인덱스로 기록한다.
    for (let index = before.children.length - 1; index >= 0; index -= 1) {
      if (!used.has(index)) changes.push({ type: 'REMOVE', path: [...path, index] });
    }
  }

  compare(previousVNode, nextVNode, []);
  return changes;
}
