import { createElement } from '../vdom/createElement.js';
import { diff } from '../diff/diff.js';
import { applyPatches } from '../diff/patch.js';
import { beginComponentRender, endComponentRender } from './hookRuntime.js';
import { resolveVNode } from './resolveVNode.js';
import { scheduleUpdate } from './scheduler.js';

/*
  FunctionComponent: 함수형 컴포넌트(루트)를 감싸서 "상태 + 렌더링 생명주기"를 관리하는 클래스

  전체 흐름
    mount(container)
      render()  → App(props) 실행 → 컴포넌트가 섞인 VDOM → resolveVNode → 순수 VDOM
      createElement(VDOM) → container 에 처음으로 그림

    setState() → scheduleUpdate() → (마이크로태스크) → update()
      render()  → 새 VDOM
      diff(이전 VDOM, 새 VDOM) → patches          ← Phase 1 재사용
      applyPatches(container, patches)              ← 바뀐 부분만 실제 DOM 에 반영
      이전 VDOM = 새 VDOM
*/
export class FunctionComponent {
  /**
   * @param {Function} renderFn 루트 함수형 컴포넌트 (props => VNode)
   * @param {object} props 루트에 넘길 props
   * @param {object} options
   * @param {(info: { patches, renderCount, isInitial }) => void} [options.onCommit]
   *        실제 DOM 반영이 끝날 때마다 호출 (디버그 패널, 테스트용)
   */
  constructor(renderFn, props = {}, { onCommit } = {}) {
    if (typeof renderFn !== 'function') {
      throw new TypeError('FunctionComponent 에는 함수형 컴포넌트를 넘겨야 합니다.');
    }
    this.renderFn = renderFn;
    this.props = props;
    this.hooks = []; // 상태 저장소: 함수가 다시 실행돼도 여기 값은 유지됨
    this.hookIndex = 0; // 이번 렌더링에서 몇 번째 훅까지 호출했는지
    this.container = null; // 실제 DOM 을 그릴 부모 요소
    this.vnode = null; // 마지막으로 그린 VDOM (다음 diff 의 "이전 VDOM")
    this.isMounted = false;
    this.isRendering = false;
    this.renderCount = 0;
    this.onCommit = onCommit;
  }

  /**
   * 함수형 컴포넌트를 실행해 순수 VDOM 을 만듭니다. (DOM 은 건드리지 않음)
   *  - 실행 전 "현재 컴포넌트"를 등록해서 안쪽의 useState 가 이 인스턴스의 hooks 를 쓰게 함
   *  - 훅 호출 개수가 이전 렌더와 다르면 에러 (조건부 훅 호출 감지)
   */
  render() {
    const previous = beginComponentRender(this);
    const expectedHookCount = this.hooks.length; // 이전 렌더에서 호출된 훅 개수
    this.isRendering = true;
    try {
      const vnode = resolveVNode(this.renderFn(this.props));
      if (this.isMounted && this.hookIndex !== expectedHookCount) {
        this.hooks.length = expectedHookCount; // 이번 렌더에서 잘못 추가된 칸은 버림
        throw new Error(
          `훅 호출 개수가 바뀌었습니다 (이전 ${expectedHookCount}개 → 이번 ${this.hookIndex}개). ` +
            '훅은 조건문/반복문/일찍 return 하기 전이 아니라 항상 같은 순서로 호출해야 합니다.',
        );
      }
      this.renderCount += 1;
      return vnode;
    } finally {
      this.isRendering = false;
      endComponentRender(previous);
    }
  }

  /**
   * 처음 렌더링: container 를 비우고 VDOM 전체를 실제 DOM 으로 만들어 붙입니다.
   * @param {Element} container
   * @returns {FunctionComponent} this (체이닝용)
   */
  mount(container) {
    if (this.isMounted) throw new Error('이미 마운트된 컴포넌트입니다.');
    this.container = container;
    this.vnode = this.render();
    container.replaceChildren(...(this.vnode ? [createElement(this.vnode)] : []));
    this.isMounted = true;
    this.onCommit?.({ patches: [], renderCount: this.renderCount, isInitial: true });
    return this;
  }

  /**
   * 상태 변경 후 다시 렌더링: 새 VDOM 을 만들고 이전 VDOM 과 비교해 바뀐 부분만 반영합니다.
   * @returns {Array} 적용된 patches
   */
  update() {
    if (!this.isMounted) return [];
    const nextVNode = this.render();
    const patches = diff(this.vnode, nextVNode);
    applyPatches(this.container, patches);
    this.vnode = nextVNode;
    this.onCommit?.({ patches, renderCount: this.renderCount, isInitial: false });
    return patches;
  }

  /** 다시 렌더링을 예약합니다. 실제 실행은 scheduler 가 모아서 한 번에 합니다 (Batching). */
  scheduleUpdate() {
    scheduleUpdate(this);
  }

  /**
   * 루트에 넘기는 props 를 바꾸고 다시 그립니다. (외부에서 데이터를 주입할 때)
   */
  setProps(nextProps) {
    this.props = nextProps;
    this.scheduleUpdate();
  }

  /** 화면에서 제거합니다. 이후의 setState 는 무시됩니다. (Day 5: useEffect cleanup 도 여기서 실행) */
  unmount() {
    if (!this.isMounted) return;
    this.container.replaceChildren();
    this.isMounted = false;
    this.vnode = null;
  }
}

/**
 * 편의 함수: 루트 컴포넌트를 만들고 바로 마운트합니다.
 *   const root = mountRoot(App, document.getElementById('app'));
 */
export function mountRoot(renderFn, container, props = {}, options = {}) {
  return new FunctionComponent(renderFn, props, options).mount(container);
}
