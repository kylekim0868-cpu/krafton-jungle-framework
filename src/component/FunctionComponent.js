import { assertVNode, copyVNode } from '../vdom/vnode.js';
import { domToVNode } from '../vdom/domToVNode.js';
import { renderVNode } from '../vdom/renderVNode.js';
import { diff } from '../vdom/diff.js';
import { preparePatch } from '../vdom/patch.js';
import { renderWithHooks, flushEffects, cleanupEffects } from './hooks.js';
import { measureCommit, reportCommit } from './commitDiagnostics.js';

/**
 * VNode 하나를 반환하는 루트 함수를 감싸고 마지막으로 반영한 트리를 보관한다.
 * 반환 VNode의 props는 Phase 1처럼 문자열 HTML 속성이다. 루트 함수의 입력 props는 앱 데이터다.
 * hooks는 루트의 State·Memo·Effect 슬롯을 호출 순서대로 보관한다.
 * 컨테이너 콘텐츠는 이 인스턴스가 소유하며 mount는 한 번, update는 동기적으로 실행한다.
 */
export class FunctionComponent {
  #render;
  #props;
  #container = null;
  #root = null;
  #vnode = null;
  #busy = false;
  #locked = false;
  #mounted = false;
  #hookCount = null;
  #pendingState = null;
  #flushingEffects = false;
  #onCommit;
  #renderCount = 0;
  #commitCount = 0;
  #memoCount = 0;

  /** render는 VNode 하나를 반환한다. 선택 onCommit은 성공한 반영을 관찰하며 렌더 정책을 바꾸지 않는다. */
  constructor(render, props = {}, { onCommit } = {}) {
    if (typeof render !== 'function') throw new TypeError('A root render function is required.');
    if (onCommit !== undefined && typeof onCommit !== 'function') throw new TypeError('onCommit must be a function.');
    this.#render = render;
    this.#props = props;
    this.hooks = [];
    this.#onCommit = onCommit;
  }

  // 렌더 함수가 반환 객체를 다음 호출에서 수정해도 이전 화면의 비교 기준은 유지한다.
  #evaluate(props) {
    const hooks = this.hooks.map((hook) => ({ ...hook }));
    if (this.#pendingState) hooks[this.#pendingState.index].value = this.#pendingState.value;
    const metrics = { memoCount: 0 };
    let rendered;
    this.#renderCount += 1;
    try {
      rendered = renderWithHooks(() => this.#render(props), hooks,
        (index, action) => this.#setHookState(index, action), metrics);
    } finally {
      // 실패한 렌더에서 실행된 계산도 센다. 성공한 commit 횟수와 구분한다.
      this.#memoCount += metrics.memoCount;
    }
    if (this.#hookCount !== null && rendered.count !== this.#hookCount) throw new Error('Hook count changed.');
    assertVNode(rendered.vnode);
    return { ...rendered, vnode: copyVNode(rendered.vnode) };
  }

  // 실패한 렌더의 Hook 후보는 버린다. 배열 참조는 유지해 인스턴스의 저장소 수명을 보존한다.
  #commit(rendered, props, changes, isInitial, measurement) {
    this.hooks.splice(0, this.hooks.length, ...rendered.hooks);
    this.#hookCount = rendered.count;
    this.#vnode = rendered.vnode;
    this.#props = props;
    this.#commitCount += 1;
    this.#flushingEffects = true;
    try { flushEffects(this.hooks); } finally {
      this.#flushingEffects = false;
      reportCommit(this.#onCommit, { renderCount: this.#renderCount, commitCount: this.#commitCount,
        memoCount: this.#memoCount }, changes, isInitial, measurement);
    }
  }

  #setHookState(index, action) {
    if (!this.#mounted || this.#locked) return;
    if (this.#flushingEffects) {
      // Effect 전체의 정리·실행을 마친 뒤 처리한다. 일반 이벤트의 setter는 즉시 갱신한다.
      queueMicrotask(() => this.#setHookState(index, action));
      return;
    }
    this.#assertAvailable();
    const slot = this.hooks[index];
    let value;
    this.#busy = true;
    try { value = typeof action === 'function' ? action(slot.value) : action; }
    finally { this.#busy = false; }
    if (Object.is(slot.value, value)) return;
    this.#pendingState = { index, value };
    try { this.update(); } finally { this.#pendingState = null; }
  }

  #assertAvailable() {
    if (this.#locked) throw new Error('Component recovery failed. Create a new instance.');
    if (this.#busy) throw new Error('A component cannot render recursively.');
  }

  /**
   * HTML 컨테이너의 콘텐츠를 최초 렌더 결과로 교체하고 생성한 루트 DOM을 반환한다.
   * 렌더·검증·DOM 준비 오류는 기존 콘텐츠를 유지한다. 중복 mount와 잘못된 대상은 거부한다.
   * 적용 도중 실패하면 이전 콘텐츠를 복원하고 예외를 전달한다.
   */
  mount(container) {
    this.#assertAvailable();
    if (this.#container) throw new Error('Component is already mounted.');
    if (!container || container.nodeType !== 1 || container.namespaceURI !== 'http://www.w3.org/1999/xhtml'
        || container.localName === 'template') throw new TypeError('An HTML mount container is required.');
    this.#busy = true;
    try {
      const rendered = this.#evaluate(this.#props);
      const root = renderVNode(rendered.vnode);
      const previousContent = Array.from(container.childNodes);
      let measurement;
      try {
        if (this.#onCommit) measurement = measureCommit(container, () => container.replaceChildren(root));
        else container.replaceChildren(root);
      } catch (error) {
        try {
          container.replaceChildren(...previousContent);
        } catch (recoveryError) {
          this.#locked = true;
          throw new AggregateError([error, recoveryError], 'Mount and recovery failed.');
        }
        throw error;
      }
      this.#container = container;
      this.#root = root;
      this.#mounted = true;
      this.#commit(rendered, this.#props, [], true, measurement);
      return root;
    } finally {
      this.#busy = false;
    }
  }

  /**
   * render(nextProps)와 이전 VNode를 diff하고 기존 preparePatch로 실제 DOM만 갱신한다.
   * 인자를 생략하면 마지막 성공 시의 props를 사용한다. 반환값은 유지되거나 교체된 루트 DOM이다.
   * 외부 DOM 변경·준비 실패는 적용 전에 거부한다. 적용 실패는 이전 VNode로 복구하며,
   * 복구도 실패하면 인스턴스를 잠근다. DOM 반영 성공 후 VNode·props·Hooks를 확정한다.
   * 이후 Effect가 실패하면 이미 확정한 화면·상태는 유지하고 AggregateError를 전달한다.
   */
  update(nextProps = this.#props) {
    this.#assertAvailable();
    if (!this.#mounted) throw new Error('Mount the component before updating.');
    this.#busy = true;
    try {
      if (this.#container.childNodes.length !== 1 || this.#container.firstChild !== this.#root
          || diff(copyVNode(this.#vnode, false), domToVNode(this.#root)).length) {
        throw new Error('Mounted DOM differs from the confirmed component tree.');
      }
      const rendered = this.#evaluate(nextProps);
      const changes = diff(this.#vnode, rendered.vnode);
      let measurement;
      // 무변경이어도 props는 다음 렌더링에 쓰므로 성공한 입력으로 확정한다.
      if (changes.length) {
        // 검증·준비 오류는 기존처럼 복구 쓰기 없이 전달한다. 관측 시간은 적용 구간만 잰다.
        const apply = preparePatch(this.#root, changes);
        try {
          if (this.#onCommit) {
            measurement = measureCommit(this.#container, apply);
            this.#root = measurement.value;
          } else this.#root = apply();
        } catch (error) {
          try {
            const restored = renderVNode(this.#vnode);
            this.#container.replaceChildren(restored);
            this.#root = restored;
          } catch (recoveryError) {
            this.#locked = true;
            throw new AggregateError([error, recoveryError], 'Update and recovery failed.');
          }
          throw error;
        }
      }
      // 변경 명령이 없는 명시적 update는 관측 기록 0건인 성공 반영이다.
      if (!changes.length && this.#onCommit) measurement = { durationMs: 0,
        mutations: Object.freeze({ total: 0, childList: 0, attributes: 0, characterData: 0 }) };
      this.#commit(rendered, nextProps, changes, false, measurement);
      return this.#root;
    } finally {
      this.#busy = false;
    }
  }

  /** DOM을 해제하고 Effect를 한 번 정리한다. 해제 후의 오래된 setter는 아무것도 변경하지 않는다. */
  unmount() {
    if (this.#busy) throw new Error('Cannot unmount while rendering or flushing effects.');
    if (!this.#mounted) return;
    this.#container.replaceChildren();
    this.#mounted = false;
    this.#root = null;
    this.#busy = true;
    try {
      const errors = cleanupEffects(this.hooks);
      if (errors.length) throw new AggregateError(errors, 'Effect cleanup failed during unmount.');
    } finally { this.#busy = false; }
  }
}
