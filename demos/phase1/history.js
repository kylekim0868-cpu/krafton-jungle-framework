import { assertVNode } from '../../src/vdom/vnode.js';
import { diff } from '../../src/vdom/diff.js';

/** 검증한 VNode의 데이터만 깊게 복사·동결한다. 원본 객체와 DOM은 변경하지 않는다. */
function snapshot(vnode) {
  assertVNode(vnode);
  function copy(node) {
    if (node.kind === 'text') return Object.freeze({ kind: 'text', text: node.text });
    return Object.freeze({ kind: 'element', tag: node.tag, props: Object.freeze({ ...node.props }),
      children: Object.freeze(node.children.map(copy)) });
  }
  return copy(vnode);
}

/** 이미 보호한 스냅샷 배열과 현재 위치를 읽기 전용 이력 값으로 묶는다. */
function state(entries, index) {
  return Object.freeze({ entries: Object.freeze(entries), index });
}

/**
 * 초기 VNode 하나를 복사해 { entries, index: 0 } 이력을 반환한다.
 * 잘못된 VNode는 TypeError다. 저장값 전체를 동결해 외부 수정으로 과거가 바뀌지 않는다.
 * DOM·전역 상태·영구 저장소는 사용하지 않는다. 페이지 재시작 시 새 이력으로 시작한다.
 */
export function createHistory(initialVNode) {
  return state([snapshot(initialVNode)], 0);
}

/**
 * 이 모듈이 만든 history와 다음 VNode로 새 이력 후보를 계산한다. 입력은 변경하지 않는다.
 * 무변경이면 같은 history를 반환하고, 변경이면 현재 위치 뒤의 기록을 잘라 새 스냅샷을 추가한다.
 * 후보를 만들었다고 저장이 확정되지는 않는다. 호출자가 두 영역 반영 성공 후 대입한다.
 * 잘못된 VNode는 TypeError이며 기존 이력은 유지된다.
 */
export function recordHistory(history, nextVNode) {
  const next = snapshot(nextVNode);
  if (!diff(history.entries[history.index], next).length) return history;
  return state([...history.entries.slice(0, history.index + 1), next], history.index + 1);
}

/**
 * 앞뒤 한 칸(-1 또는 1)의 이동 후보를 반환한다. 다른 이동값은 RangeError다.
 * 경계에서는 같은 history를 반환하며, 이동해도 스냅샷을 추가하거나 입력을 수정하지 않는다.
 * 호출자는 대상 스냅샷을 두 영역에 복원한 뒤에만 후보 위치를 확정해야 한다.
 */
export function moveHistory(history, direction) {
  if (direction !== -1 && direction !== 1) throw new RangeError('History direction must be -1 or 1.');
  const index = history.index + direction;
  return index < 0 || index >= history.entries.length ? history : state(history.entries, index);
}
