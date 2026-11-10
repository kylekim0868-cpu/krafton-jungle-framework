/*
  의존성 배열(deps) 비교 — useEffect 와 useMemo 가 함께 사용

  deps 의 의미
    생략(undefined) → 매 렌더링마다 "바뀐 것"으로 취급
    []              → 처음 한 번만 (이후에는 비교할 값이 없으므로 항상 "같음")
    [a, b]          → a 또는 b 가 이전 렌더와 다를 때만

  비교는 Object.is (=== 와 거의 같음, NaN 끼리는 같다고 봄).
  객체/배열은 "내용"이 아니라 "참조"를 비교하므로, 매 렌더마다 새로 만든 객체를 넣으면 항상 바뀐 것으로 판단됩니다.
*/

/**
 * deps 가 올바른 형태인지 검사합니다. (배열 또는 생략만 허용)
 * @param {*} deps
 * @param {string} hookName 에러 메시지용
 */
export function assertValidDeps(deps, hookName) {
  if (deps !== undefined && !Array.isArray(deps)) {
    throw new TypeError(`${hookName} 의 두 번째 인자(deps)는 배열이어야 합니다. 받은 값: ${typeof deps}`);
  }
}

/**
 * 이전 deps 와 이번 deps 를 비교해 "다시 실행/계산해야 하는지" 판단합니다.
 * @param {Array|undefined} prevDeps 이전 렌더에서 저장한 deps (처음이면 undefined)
 * @param {Array|undefined} nextDeps 이번 렌더의 deps
 * @returns {boolean} true 면 다시 실행
 */
export function depsChanged(prevDeps, nextDeps) {
  if (nextDeps === undefined || prevDeps === undefined) return true;
  if (prevDeps.length !== nextDeps.length) return true; // deps 개수가 바뀌는 것 자체가 잘못된 사용이지만 안전하게 재실행
  return nextDeps.some((dep, i) => !Object.is(dep, prevDeps[i]));
}
