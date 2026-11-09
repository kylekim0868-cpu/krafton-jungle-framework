/*
  State History: Patch 할 때마다 VDOM 을 저장하고, 뒤로가기 / 앞으로가기로 이동합니다.

  구조: entries 배열 + 현재 위치 index (웹 브라우저의 방문 기록, 에디터의 undo/redo 와 같은 방식)

    entries: [v0, v1, v2, v3]
                       ↑ index = 2  (뒤로가기를 한 번 누른 상태)

  - 뒤로 간 상태에서 새로 Patch 하면 index 이후의 "미래 기록(v3)"은 버리고 새 VDOM 을 붙입니다.
    (갈라진 미래를 유지하면 앞으로가기의 의미가 모호해지기 때문)
  - 메모리가 무한히 늘지 않도록 최대 개수를 넘으면 가장 오래된 기록부터 버립니다.

  VDOM 이 저장된 뒤 바뀌면 기록이 오염되므로, 저장할 때 깊은 복사 + 동결(freeze)합니다.
  각 기록에는 화면 표시용 부가 정보(meta: 라벨, 시각 등)를 함께 저장할 수 있습니다.
*/
export const MAX_HISTORY_SIZE = 100;

export class StateHistory {
  //함수 생성자
  constructor(initialVNode, initialMeta = {}, maxSize = MAX_HISTORY_SIZE) {
    if (maxSize < 1) throw new Error('maxSize 는 1 이상이어야 합니다.');
    this.maxSize = maxSize;
    this.entries = [createEntry(initialVNode, initialMeta)];
    this.index = 0;
  }

  // 현재 위치의 VDOM
  get current() {
    return this.entries[this.index].vnode;
  }

  // 현재 위치의 부가 정보
  get currentMeta() {
    return this.entries[this.index].meta;
  }

  // 화면에 기록 목록을 그릴 때 사용 (원본 배열을 밖에서 수정하지 못하도록 복사본 반환)
  list() {
    return this.entries.map((entry, index) => ({ index, meta: entry.meta, isCurrent: index === this.index }));
  }

  get size() {
    return this.entries.length;
  }

  canBack() {
    return this.index > 0;
  }

  canForward() {
    return this.index < this.entries.length - 1;
  }

  // 새 VDOM 저장 (미래 기록은 버림)
  push(vnode, meta = {}) {
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push(createEntry(vnode, meta));
    if (this.entries.length > this.maxSize) {
      this.entries.splice(0, this.entries.length - this.maxSize);
    }
    this.index = this.entries.length - 1;
    return this.current;
  }

  // 이동할 수 없으면 null 반환 (호출하는 쪽에서 버튼 비활성화 등 처리)
  back() {
    return this.canBack() ? this.goTo(this.index - 1) : null;
  }

  forward() {
    return this.canForward() ? this.goTo(this.index + 1) : null;
  }

  goTo(targetIndex) {
    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= this.entries.length) {
      throw new RangeError(`history 범위를 벗어났습니다: ${targetIndex}`);
    }
    this.index = targetIndex;
    return this.current;
  }
}

function createEntry(vnode, meta) {
  return Object.freeze({ vnode: freezeVNode(vnode), meta: Object.freeze({ ...meta }) });
}

// VNode 를 깊은 복사한 뒤 동결 (함수 props 는 그대로 참조 유지)
function freezeVNode(vnode) {
  if (vnode == null) return vnode;
  const copy = {
    ...vnode,
    props: Object.freeze({ ...vnode.props }),
    children: Object.freeze((vnode.children ?? []).map(freezeVNode)),
  };
  return Object.freeze(copy);
}