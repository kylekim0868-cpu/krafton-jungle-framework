/*
  이 코드는 컴포넌트의 상태(Hooks)와 가상 돔(VDOM), 그리고 실제 화면(DOM)은 어디서 한꺼번에 총괄 관리되는가
  에 대한 완벽한 정답이 담겨 있는 FunctionComponent 클래스의 전체 구현체입니다
*/


import { createElement } from '../vdom/createElement.js';
import { diff } from '../diff/diff.js';
import { applyPatches } from '../diff/patch.js';
import { beginComponentRender, endComponentRender } from './hookRuntime.js';
import { resolveVNode } from './resolveVNode.js';
import { scheduleUpdate } from './scheduler.js';
import { runPendingEffects, runAllCleanups } from './effects.js';

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
    this.renderFn = renderFn; // 내가 실행할 컴포넌트 함수 (예: App)
    this.props = props; // 컴포넌트에 넘길 데이터
    this.hooks = []; // 상태 저장소: 함수가 다시 실행돼도 여기 값은 유지됨
    this.hookIndex = 0; // 이번 렌더링에서 몇 번째 훅까지 호출했는지
    this.container = null; // 화면에 그려질 실제 부모 태그
    this.vnode = null; // 마지막으로 그린 VDOM (다음 diff 의 "이전 VDOM")
    this.isMounted = false; // 화면에 붙었는지 여부
    this.isRendering = false; // 지금 컴포넌트 함수를 실행(렌더링)하는 중인지 (렌더 중 setState 방지용)
    this.renderCount = 0;
    this.onCommit = onCommit;
    this.pendingEffects = []; // Day 5: 이번 렌더에서 실행 예약된 useEffect 목록 (Patch 후 실행)
    this.isRunningEffects = false; // Day 5: 지금 effect 를 실행하는 중인지
    this.effectUpdateDepth = 0; // Day 5: effect 안 setState 로 연속 렌더된 횟수 (무한 루프 감지)
  }

  /**
   * 함수형 컴포넌트를 실행해 순수 VDOM 을 만듭니다. (DOM 은 건드리지 않음)
   *  - 실행 전 "현재 컴포넌트"를 등록해서 안쪽의 useState 가 이 인스턴스의 hooks 를 쓰게 함
   *  - 훅 호출 개수가 이전 렌더와 다르면 에러 (조건부 훅 호출 감지)
   */
  render() {
    const previous = beginComponentRender(this); // 1. "지금부터 내가 실행된다!"고 전역에 등록
    const expectedHookCount = this.hooks.length; // 이전 렌더에서 호출된 훅 개수
    this.pendingEffects = []; // 렌더가 실패하면 예약된 effect 도 버려지도록 매번 새로 시작
    this.isRendering = true;
    try {
      // 2. 컴포넌트 함수를 실행해서 VNode를 얻고, 컴포넌트 태그를 순수 HTML 태그로 펼침
      const vnode = resolveVNode(this.renderFn(this.props));

      // 3. 조건문/반복문 훅 호출 감지 (Hooks 규칙 검사기)! 
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
      endComponentRender(previous); // 4. "내 실행 끝났다"고 정리
    }
  }

  /**
   * 처음 화면에 띄울 때는 이전 상태가 없으므로 diff를 할 필요가 없습니다.
   * createElement(this.vnode)로 실제 태그를 다 만들어서 container에 꽂아 넣습니다.    
   */
  mount(container) {
    if (this.isMounted) throw new Error('이미 마운트된 컴포넌트입니다.');
    this.container = container;    // 실제 브라우저 부모 태그 기억!
    this.vnode = this.render();    // 첫 가상 돔 생성

    // 처음에는 비교할 게 없으므로 VDOM 전체를 실제 DOM으로 만들어 화면에 찰떡처럼 붙임
    container.replaceChildren(...(this.vnode ? [createElement(this.vnode)] : [])); 
    this.isMounted = true;
    this.onCommit?.({ patches: [], renderCount: this.renderCount, isInitial: true });
    runPendingEffects(this); // Day 5: 화면에 붙은 뒤 useEffect 실행
    return this;
  }

  /**
   * 상태 변경 후 다시 렌더링: 새 VDOM 을 만들고 이전 VDOM 과 비교해 바뀐 부분만 반영합니다.
   */
  update() {
    if (!this.isMounted) return [];
    const nextVNode = this.render();  // 1. 최신 상태가 반영된 새 가상 돔 생성
    const patches = diff(this.vnode, nextVNode);  // 2. 이전 VDOM과 새 VDOM을 비교 (Diff)
    applyPatches(this.container, patches);  // 3. 바뀐 점만 핀포인트로 실제 화면에 수정 (Patch)
    this.vnode = nextVNode; // 4. 새 가상 돔을 다음번 비교를 위해 '이전 VDOM'으로 저장
    this.onCommit?.({ patches, renderCount: this.renderCount, isInitial: false });
    runPendingEffects(this); // 5. Day 5: Patch 가 끝난 뒤 deps 가 바뀐 useEffect 실행 (이전 cleanup → 새 effect)
    return patches;
  }

  /** 
   * 다시 렌더링을 예약합니다. 실제 실행은 scheduler 가 모아서 한 번에 합니다 (Batching). 
   * 연속으로 호출이 들어왔을 경우 임시 저장해놨다가 몰아서 실행
   */
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

  /** 화면에서 제거합니다. 모든 useEffect cleanup 을 실행하고, 이후의 setState 는 무시됩니다. */
  unmount() {
    if (!this.isMounted) return;
    runAllCleanups(this); // Day 5: 타이머/구독 등 정리
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
