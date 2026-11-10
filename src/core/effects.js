/*
  useEffect 실행기 (Commit 단계)

  왜 렌더링 중에 바로 실행하지 않나?
   - 렌더링(함수 실행)은 "화면이 어떻게 보여야 하는지"만 계산하는 단계입니다.
   - 이때 DOM 을 만지거나 setState 를 하면 아직 반영되지 않은 화면을 다루게 되고, 무한 렌더링이 생길 수 있습니다.
   → 렌더링 중에는 실행할 effect 를 "예약"만 해 두고(pendingEffects),
     Patch 로 실제 DOM 반영이 끝난 뒤 여기서 한 번에 실행합니다.

  실행 순서 (React 와 같음)
    1) 다시 실행될 effect 들의 "이전 cleanup" 을 먼저 모두 실행
    2) 그다음 새 effect 들을 선언 순서대로 실행하고, 반환된 cleanup 을 저장
*/

/** effect 안에서 setState 가 연속으로 몇 번까지 렌더링을 일으킬 수 있는지 (무한 루프 방지) */
export const MAX_EFFECT_UPDATE_DEPTH = 50;

/**
 * 이번 렌더링에서 예약된 effect 들을 실행합니다. (mount / update 의 Patch 직후 호출)
 * @param component FunctionComponent 인스턴스
 */
export function runPendingEffects(component) {
  const effects = component.pendingEffects;
  component.pendingEffects = [];
  if (effects.length === 0) return;

  component.isRunningEffects = true;
  try {
    // 1) 이전 cleanup 먼저
    for (const { hook } of effects) runCleanup(hook);

    // 2) 새 effect 실행
    for (const { hook, effect, deps } of effects) {
      const cleanup = effect();
      if (cleanup !== undefined && typeof cleanup !== 'function') {
        throw new TypeError('useEffect 는 함수(cleanup) 또는 아무것도 반환하지 않아야 합니다. (async 함수를 직접 넘기지 마세요)');
      }
      hook.cleanup = cleanup;
      hook.deps = deps; // 실제로 실행된 deps 를 저장해야 다음 비교가 정확함
    }
  } finally {
    component.isRunningEffects = false;
  }
}

/**
 * 컴포넌트의 모든 effect cleanup 을 실행합니다. (unmount 시 호출)
 *  - 타이머 해제, 이벤트 리스너 제거 등 정리 작업이 빠짐없이 실행되도록
 */
export function runAllCleanups(component) {
  for (const hook of component.hooks) {
    if (hook?.type === 'effect') runCleanup(hook);
  }
  component.pendingEffects = [];
}

/** effect 훅 하나의 cleanup 을 실행하고 비웁니다. (두 번 실행되지 않도록) */
function runCleanup(hook) {
  if (typeof hook.cleanup === 'function') {
    const cleanup = hook.cleanup;
    hook.cleanup = undefined;
    cleanup();
  }
}
