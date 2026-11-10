/*
  Hook 런타임: "지금 어떤 컴포넌트가 렌더링 중인가"를 기억하는 전역 상태

  핵심 질문: 함수는 매번 새로 실행되는데, 상태는 어떻게 유지할까?
   → 상태는 함수 "밖"의 컴포넌트 인스턴스(hooks 배열)에 저장합니다.
   → useState() 같은 훅은 인자로 컴포넌트를 받지 않으므로,
     렌더링 직전에 "현재 컴포넌트"를 이 모듈에 등록해 두고 훅이 여기서 꺼내 씁니다.

    FunctionComponent.render()
      ├─ beginComponentRender(this)      ← 현재 컴포넌트 등록, hookIndex = 0
      ├─ App(props) 실행
      │    ├─ useState()  → claimHookSlot() → hooks[0]
      │    └─ useState()  → claimHookSlot() → hooks[1]
      │    └─ <Child/>    → beginChildRender() ... endChildRender()  (자식 안 훅 호출은 에러)
      └─ endComponentRender()             ← 등록 해제
*/

let currentComponent = null; // 지금 렌더링 중인 루트 컴포넌트
let childRenderDepth = 0; // 자식(Stateless) 컴포넌트 렌더링 깊이 (0 이면 루트 함수 본문)

/**
 * 루트 컴포넌트 렌더링 시작: 현재 컴포넌트로 등록하고 훅 순번을 0 으로 되돌립니다.
 * @returns 이전에 등록되어 있던 컴포넌트 (중첩 렌더 대비, end 에서 복원)
 */
export function beginComponentRender(component) {
  const previous = { component: currentComponent, depth: childRenderDepth };
  currentComponent = component;
  childRenderDepth = 0;
  component.hookIndex = 0;
  return previous;
}

/** 루트 컴포넌트 렌더링 종료: begin 에서 받은 이전 상태로 복원합니다. */
export function endComponentRender(previous) {
  currentComponent = previous.component;
  childRenderDepth = previous.depth;
}

/** 자식(Stateless) 컴포넌트 함수를 실행하는 동안 깊이를 올려, 그 안의 훅 호출을 막습니다. */
export function renderChildComponent(childFn, props) {
  childRenderDepth += 1;
  try {
    return childFn(props);
  } finally {
    childRenderDepth -= 1;
  }
}

/**
 * 훅이 사용할 "자기 칸(slot)"을 받아갑니다.
 *  - 호출 순서대로 0, 1, 2 ... 번 칸을 배정 → 같은 순서로 호출되면 매 렌더마다 같은 칸을 가리킴
 *  - 규칙 위반(컴포넌트 밖, 자식 컴포넌트 안)은 이해하기 쉬운 에러로 알려줍니다.
 * @param {string} hookName 에러 메시지용 훅 이름
 * @returns {{ component, index }}
 */
export function claimHookSlot(hookName) {
  if (!currentComponent) {
    throw new Error(`${hookName} 는 컴포넌트를 렌더링하는 중에만 호출할 수 있습니다.`);
  }
  if (childRenderDepth > 0) {
    throw new Error(
      `${hookName} 는 루트 컴포넌트에서만 사용할 수 있습니다. ` +
        '자식 컴포넌트는 상태 없이 props 만 받아야 합니다 (Lifting State Up).',
    );
  }
  const index = currentComponent.hookIndex;
  currentComponent.hookIndex += 1;
  return { component: currentComponent, index };
}

/**
 * 같은 칸에 다른 종류의 훅이 들어오면 순서가 바뀐 것 → 에러
 * (예: 조건문 안에서 useState 를 호출해서 어떤 렌더에서는 건너뛴 경우)
 */
export function assertHookType(hook, expectedType, index) {
  if (hook.type !== expectedType) {
    throw new Error(
      `${index}번째 훅의 종류가 바뀌었습니다 (${hook.type} → ${expectedType}). ` +
        '훅은 조건문이나 반복문 안이 아니라 항상 같은 순서로 호출해야 합니다.',
    );
  }
}
