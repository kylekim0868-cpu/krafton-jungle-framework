// 활성 프레임은 루트 함수가 실행되는 동안만 존재하며 중첩 렌더 뒤에도 복원한다.
let activeFrame = null;
let renderDepth = 0;

/** 루트 렌더의 Hook 슬롯 후보와 호출 수를 반환한다. 확정은 DOM 반영 이후 호출자가 맡는다. */
export function renderWithHooks(render, hooks, scheduleState) {
  const previous = activeFrame;
  const frame = { hooks, index: 0, scheduleState };
  activeFrame = frame;
  renderDepth += 1;
  try {
    return { vnode: render(), hooks, count: frame.index };
  } finally {
    renderDepth -= 1;
    activeFrame = previous;
  }
}

/** 자식 함수·Memo 계산 안에서는 루트의 Hook 슬롯에 접근하지 못하게 한다. */
export function withoutHooks(run) {
  const previous = activeFrame;
  activeFrame = null;
  try { return run(); } finally { activeFrame = previous; }
}

function frameFor(kind) {
  if (!activeFrame) throw new Error('Hooks are only available while rendering the root component.');
  const frame = activeFrame;
  const index = frame.index++;
  if (frame.hooks[index] && frame.hooks[index].kind !== kind) throw new Error('Hook order changed.');
  return { frame, index, previous: frame.hooks[index] };
}

function dependencies(deps) {
  if (deps !== undefined && !Array.isArray(deps)) throw new TypeError('Dependencies must be an array or undefined.');
  return deps === undefined ? undefined : Array.from(deps);
}

function sameDependencies(previous, next) {
  return previous !== undefined && next !== undefined && previous.length === next.length
    && next.every((value, index) => Object.is(value, previous[index]));
}

/**
 * 루트 호출 순서의 슬롯에서 [값, 안정적인 setter]를 반환한다. 함수 초기값은 최초에만 계산한다.
 * setter는 값 또는 이전 값을 받는 순수 함수를 받고, Object.is로 같은 값이면 렌더를 생략한다.
 */
export function useState(initialValue) {
  const { frame, index, previous } = frameFor('state');
  if (!previous) {
    const scheduleState = frame.scheduleState;
    frame.hooks[index] = { kind: 'state',
      value: typeof initialValue === 'function' ? withoutHooks(initialValue) : initialValue,
      set: (action) => {
        if (renderDepth) throw new Error('State setters cannot run during rendering.');
        return scheduleState(index, action);
      } };
  }
  const slot = frame.hooks[index];
  return [slot.value, slot.set];
}

/** 의존성이 같으면 이전 계산값을 반환한다. deps 생략 시 매 렌더에서 다시 계산한다. */
export function useMemo(calculate, deps) {
  if (typeof calculate !== 'function') throw new TypeError('useMemo requires a calculation function.');
  const nextDeps = dependencies(deps);
  const { frame, index, previous } = frameFor('memo');
  if (!previous || !sameDependencies(previous.deps, nextDeps)) {
    frame.hooks[index] = { kind: 'memo', deps: nextDeps, value: withoutHooks(calculate) };
  }
  return frame.hooks[index].value;
}

/**
 * DOM 반영 뒤 실행할 Effect를 예약한다. deps 생략은 매번, []는 최초, 배열은 변경 시 실행한다.
 * callback은 정리 함수 또는 undefined를 반환한다. 정리는 재실행 전과 unmount 시 한 번 호출한다.
 */
export function useEffect(callback, deps) {
  if (typeof callback !== 'function') throw new TypeError('useEffect requires a callback.');
  const nextDeps = dependencies(deps);
  const { frame, index, previous } = frameFor('effect');
  frame.hooks[index] = { kind: 'effect', callback, deps: nextDeps, cleanup: previous?.cleanup,
    changed: !previous || !sameDependencies(previous.deps, nextDeps) };
}

/** 모든 대상 정리를 먼저 실행한다. 한 정리가 실패해도 나머지 자원 정리를 계속한다. */
export function cleanupEffects(hooks, changedOnly = false) {
  const errors = [];
  for (const hook of hooks) {
    if (hook.kind !== 'effect' || (changedOnly && !hook.changed)) continue;
    const cleanup = hook.cleanup;
    hook.cleanup = undefined;
    try { cleanup?.(); } catch (error) { errors.push(error); }
  }
  return errors;
}

/** Effect 오류는 이미 반영된 DOM과 상태를 되돌리지 않고, 다른 Effect 처리 후 전달한다. */
export function flushEffects(hooks) {
  const errors = cleanupEffects(hooks, true);
  for (const hook of hooks) {
    if (hook.kind !== 'effect' || !hook.changed) continue;
    hook.changed = false;
    try {
      const cleanup = hook.callback();
      if (cleanup !== undefined && typeof cleanup !== 'function') {
        throw new TypeError('An effect must return a cleanup function or undefined.');
      }
      hook.cleanup = cleanup;
    } catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, 'Effect setup or cleanup failed after commit.');
}
