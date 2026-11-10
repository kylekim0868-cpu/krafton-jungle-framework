import { claimHookSlot, assertHookType } from './hookRuntime.js';

/*
  Hooks: 함수형 컴포넌트가 렌더링 사이에 값을 기억하는 방법

  component.hooks = [
    { type: 'state', value: 0,  setState },   ← 첫 번째 useState
    { type: 'state', value: '', setState },   ← 두 번째 useState
  ]
  렌더링마다 hookIndex 가 0 부터 다시 증가하므로, 같은 순서로 호출된 훅은 같은 칸을 다시 찾아갑니다.
*/

/**
 * useState: 렌더링 사이에 유지되는 상태 값과, 그 값을 바꾸고 화면을 다시 그리게 하는 함수를 반환합니다.
 *
 * @param initialState 첫 렌더링에서만 사용하는 초기값. 함수를 넘기면 첫 렌더링 때 한 번만 실행 (비싼 계산용)
 * @returns [state, setState]
 *
 * setState(nextValue)          → 새 값으로 교체
 * setState(prev => prev + 1)   → 이전 값 기준으로 계산 (한 틱에 여러 번 불러도 누적됨)
 *
 * setState 가 상태 변경 "외에" 하는 일
 *  1) 같은 값이면(Object.is) 아무것도 하지 않음 → 불필요한 렌더링 방지
 *  2) 다시 렌더링 예약 (scheduleUpdate) → 여러 번 호출해도 한 번만 그림 (Batching)
 *  3) 렌더링 도중 호출되면 무한 루프가 되므로 에러, 언마운트 후 호출은 무시
 *  4) setState 함수 자체는 렌더링이 바뀌어도 같은 함수(참조 유지) → 자식에게 props 로 넘기기 안전
 */
export function useState(initialState) {
  const { component, index } = claimHookSlot('useState');

  // 첫 렌더링: 칸 만들기
  if (component.hooks[index] === undefined) {
    const hook = {
      type: 'state',
      value: typeof initialState === 'function' ? initialState() : initialState,
      setState: null,
    };
    hook.setState = createSetState(component, hook);
    component.hooks[index] = hook;
  }

  // 이후 렌더링: 같은 칸 재사용 (initialState 는 무시됨)
  const hook = component.hooks[index];
  assertHookType(hook, 'state', index);
  return [hook.value, hook.setState];
}

/** 특정 컴포넌트의 특정 state 칸을 바꾸는 setState 함수를 만듭니다. */
function createSetState(component, hook) {
  return function setState(action) {
    if (component.isRendering) {
      throw new Error('렌더링 중에는 setState 를 호출할 수 없습니다. (무한 렌더링 방지) 이벤트 핸들러나 useEffect 안에서 호출하세요.');
    }
    if (!component.isMounted) return; // 언마운트된 컴포넌트는 무시

    const nextValue = typeof action === 'function' ? action(hook.value) : action;
    if (Object.is(nextValue, hook.value)) return;

    hook.value = nextValue;
    component.scheduleUpdate();
  };
}
