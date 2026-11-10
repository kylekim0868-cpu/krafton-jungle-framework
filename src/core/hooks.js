import { claimHookSlot, assertHookType } from './hookRuntime.js';
import { assertValidDeps, depsChanged } from './deps.js';
import { MAX_EFFECT_UPDATE_DEPTH } from './effects.js';

/*
  Hooks: 함수형 컴포넌트가 렌더링 사이에 값을 기억하는 방법

  component.hooks = [
    { type: 'state',  value: 0,  setState },          ← useState
    { type: 'effect', deps: [0], cleanup },           ← useEffect   (Day 5)
    { type: 'memo',   value: {...}, deps: [todos] },  ← useMemo     (Day 5)
  ]
  렌더링마다 hookIndex 가 0 부터 다시 증가하므로, 같은 순서로 호출된 훅은 같은 칸을 다시 찾아갑니다.
*/

/**
 * useState: 렌더링 사이에 유지되는 상태 값과, 그 값을 바꾸고 화면을 다시 그리게 하는 함수를 반환합니다.
 *
 * setState(nextValue)          → 새 값으로 교체
 * setState(prev => prev + 1)   → 이전 값 기준으로 계산 (한 틱에 여러 번 불러도 누적됨)
 *
 * setState 가 상태 변경 "외에" 하는 일
 *  1) 같은 값이면(Object.is) 아무것도 하지 않음 → 불필요한 렌더링 방지
 *  2) 다시 렌더링 예약 (scheduleUpdate) → 여러 번 호출해도 한 번만 그림 (Batching)
 *  3) 렌더링 도중 호출되면 무한 루프가 되므로 에러, 언마운트 후 호출은 무시
 *  4) setState 함수 자체는 렌더링이 바뀌어도 같은 함수(참조 유지) → 자식에게 props 로 넘기기 안전
 * 
 * 첫 렌더링 때만 if문 안으로 들어가서 hook 객체를 만들고, 두 번째부터는 초기값(initialState)을 시원하게 무시한 채 이미 저장되어 있던 hook.value를 그대로 꺼내 줍니다.
 */
export function useState(initialState) {
  // 1. 런타임에서 내 순번(index)과 소속 컴포넌트를 배정받음! (예: 0번 칸)
  const { component, index } = claimHookSlot('useState');

  // 2. [첫 렌더링일 때 (마운트)] : 칸 만들기
  if (component.hooks[index] === undefined) {
    const hook = {
      type: 'state',
      // 만약 함수를 넘겼다면 실행해서 초기값을 구함 (예: useState(() => 계산()))
      value: typeof initialState === 'function' ? initialState() : initialState,
      setState: null,
    };
    // 이 칸 전용 세터 함수를 만들어서 매달아 둠!
    hook.setState = createSetState(component, hook);
    component.hooks[index] = hook;
  }

  // 3. [두 번째 렌더링부터 (업데이트)] : 같은 칸 재사용
  const hook = component.hooks[index];
  assertHookType(hook, 'state', index); // "혹시 다른 훅과 순서 바뀌었나?" 검사

  return [hook.value, hook.setState]; // [최신 값, 변경 함수] 반환!
}

/** 
 * 특정 컴포넌트의 특정 state 칸을 바꾸는 setState 함수를 만듭니다. 
 * setCount(...)를 부를 때 실제로 실행되는 내부 함수입니다. 수많은 방어 안전장치가 들어가 있습니다.
*/
function createSetState(component, hook) {
  return function setState(action) {
    if (component.isRendering) {
      throw new Error('렌더링 중에는 setState 를 호출할 수 없습니다. (무한 렌더링 방지) 이벤트 핸들러나 useEffect 안에서 호출하세요.');
    }
    if (!component.isMounted) return; // 언마운트된 컴포넌트는 무시

    const nextValue = typeof action === 'function' ? action(hook.value) : action;
    if (Object.is(nextValue, hook.value)) return;

    // Day 5: effect 안에서 setState → 렌더 → effect → setState ... 가 끝없이 반복되는 것을 막음
    //  (deps 를 빼먹은 useEffect 에서 매번 새 값을 set 하는 실수)
    if (component.isRunningEffects) {
      component.effectUpdateDepth += 1;
      if (component.effectUpdateDepth > MAX_EFFECT_UPDATE_DEPTH) {
        component.effectUpdateDepth = 0;
        throw new Error(
          `useEffect 안의 setState 로 렌더링이 ${MAX_EFFECT_UPDATE_DEPTH}번 넘게 연속 발생했습니다. ` +
            'deps 배열을 확인하세요. (무한 렌더링 방지)',
        );
      }
    } else {
      component.effectUpdateDepth = 0; // 사용자 이벤트 등 effect 밖에서 온 업데이트면 카운트 초기화
    }

    hook.value = nextValue;
    component.scheduleUpdate();
  };
}

/**
 * useEffect: 화면이 그려진 "뒤에" 실행할 부수 작업(side effect)을 등록합니다.
 *   예) document.title 바꾸기, localStorage 저장, 타이머/구독 시작, 데이터 요청
 *
 * 동작
 *  - 렌더링 중에는 deps 를 비교해서 "실행해야 하면 예약"만 함 (component.pendingEffects)
 *  - 실제 실행은 Patch 가 끝난 뒤 runPendingEffects() 에서 → effect 안에서는 최신 DOM 을 볼 수 있음
 *  - 다시 실행되기 전과 unmount 될 때 이전 cleanup 이 호출됨
 * 
 * 브라우저 타이틀 변경, 타이머 설정, API 호출처럼 화면이 다 그려진 다음에 실행되어야 할 작업을 등록합니다.
 * 지금 당장 실행하는 게 아니라, depsChanged로 의존성 값이 바뀌었는지만 확인하고 장부에 예약(push)만 걸어둡니다.
 * 실제 실행은 DOM 화면 패치가 완전히 끝난 뒤에 실행됩니다 (그래야 document.getElementById 등으로 완성된 최신 태그를 볼 수 있으니까요!).
 */
export function useEffect(effect, deps) {
  const { component, index } = claimHookSlot('useEffect');
  if (typeof effect !== 'function') throw new TypeError('useEffect 의 첫 번째 인자는 함수여야 합니다.');
  assertValidDeps(deps, 'useEffect');

    // 1. 첫 렌더링이면 effect용 빈 칸 생성
  if (component.hooks[index] === undefined) {
    component.hooks[index] = { type: 'effect', deps: undefined, cleanup: undefined };
  }
  const hook = component.hooks[index];
  assertHookType(hook, 'effect', index);

  // deps 가 바뀌었을 때만 실행 예약 (hook.deps 는 실제로 실행된 뒤에 갱신됨)
  if (depsChanged(hook.deps, deps)) {
    // 바로 실행하지 않고 예약 장부(pendingEffects)에 넣어둠!
    // ➔ 실제 브라우저 DOM 패치가 다 끝난 뒤에 안전하게 실행하기 위해!
    component.pendingEffects.push({ hook, effect, deps });
  }
}

/**
 * useMemo: 비싼 계산 결과를 기억해 두었다가, deps 가 바뀔 때만 다시 계산합니다.
 *   예) 목록 필터링/정렬, 통계 계산\
 *
 * useEffect 와 달리 렌더링 "중에" 바로 계산해서 값을 돌려줍니다. (화면을 그리는 데 필요한 값이므로)
 * 
 */
//데이터가 수천 개일 때 필터링/정렬 연산처럼 비용이 큰 계산 결과를 기억해 두는 훅입니다.s
export function useMemo(factory, deps) {
  const { component, index } = claimHookSlot('useMemo');
  if (typeof factory !== 'function') throw new TypeError('useMemo 의 첫 번째 인자는 함수여야 합니다.');
  assertValidDeps(deps, 'useMemo');

  const hook = component.hooks[index];
  if (hook !== undefined) {
    assertHookType(hook, 'memo', index);
    if (!depsChanged(hook.deps, deps)) return hook.value; // 캐시 사용
  }

  // 처음이거나 deps 가 바뀜 → 다시 계산해서 저장
  const value = factory();
  component.hooks[index] = { type: 'memo', value, deps };
  return value;
}

/*
훅 이름	          hooks배열에 저장하는 것	              실행 시점	                               주된 용도

useState	  { type: 'state', value, setState }	  즉시 값 반환	                    화면을 다시 그리게 하는 동적 데이터
useMemo	      { type: 'memo', value, deps }	      렌더링 도중 즉시 계산	                비싼 계산 결과 캐싱 (재사용)
useEffect	  { type: 'effect', deps, cleanup }	  화면 다 그린 뒤             비동기 실행	타이머, API 호출, 이벤트 구독 등 부수 효과
*/