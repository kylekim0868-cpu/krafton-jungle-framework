/** 관측 자원 오류는 화면 갱신과 분리한다. 호출자의 DOM 변경 예외는 그대로 전달한다. */
export function measureCommit(container, apply) {
  let observer;
  let observed = false;
  try {
    observer = new MutationObserver(() => {});
    observer.observe(container, { subtree: true, childList: true, attributes: true, characterData: true });
    observed = true;
  } catch {
    // 관측을 지원하지 않거나 등록이 실패해도 실제 갱신은 한 번 실행한다.
  }
  const start = performance.now();
  try {
    const value = apply();
    const durationMs = performance.now() - start;
    let mutations = null;
    if (observed) {
      try {
        const records = observer.takeRecords();
        mutations = Object.freeze({ total: records.length,
          childList: records.filter(({ type }) => type === 'childList').length,
          attributes: records.filter(({ type }) => type === 'attributes').length,
          characterData: records.filter(({ type }) => type === 'characterData').length });
      } catch { /* 기록 조회 실패는 미측정으로 표시한다. */ }
    }
    return { value, durationMs, mutations };
  } finally {
    try { observer?.disconnect(); } catch { /* 관측 종료 오류를 제품 예외로 바꾸지 않는다. */ }
  }
}

/**
 * 성공한 DOM 반영의 진단만 읽기 전용으로 전달한다. VNode·함수·Hook 저장소는 노출하지 않는다.
 * onCommit은 관찰용 콜백이다. 여기서 상태를 재갱신할 수 없으며, 콜백 오류는 경고로 분리한다.
 */
export function reportCommit(onCommit, counts, changes, isInitial, measurement) {
  if (!onCommit) return;
  try {
    const commands = changes.map(({ type, path, parentPath, index }) => Object.freeze({ type,
      ...(path ? { path: Object.freeze([...path]) } : {}),
      ...(parentPath ? { parentPath: Object.freeze([...parentPath]) } : {}),
      ...(index === undefined ? {} : { index }) }));
    onCommit(Object.freeze({ ...counts, isInitial, changes: Object.freeze(commands),
      durationMs: measurement?.durationMs ?? 0, mutations: measurement?.mutations ?? null }));
  } catch (error) {
    console.warn('Commit diagnostics failed:', error);
  }
}
