/**
 * YJ의 렌더/패치 로그 동작을 YM 진단 정보로 표시한다. 로그 UI는 컴포넌트 관측 영역 밖에 둔다.
 * 렌더·계산은 호출 횟수, commit은 성공 횟수, DOM 관측은 MutationRecord 수로 각각 구분한다.
 */
export function createCommitReporter(doc = document) {
  const log = doc.querySelector('#commit-log');
  return (info) => {
    for (const [id, value] of [['render-count', info.renderCount], ['commit-count', info.commitCount],
      ['memo-count', info.memoCount], ['mutation-count', info.mutations?.total ?? '측정 불가']]) {
      doc.getElementById(id).textContent = String(value);
    }
    const counts = {};
    for (const { type } of info.changes) counts[type] = (counts[type] ?? 0) + 1;
    const summary = Object.entries(counts).map(([type, count]) => `${type} ${count}`).join(' · ');
    doc.querySelector('#patch-summary').textContent = info.isInitial ? '최초 DOM 생성' : summary || '변경 명령 없음';
    const item = doc.createElement('li');
    const title = doc.createElement('strong');
    title.textContent = `#${info.commitCount} ${info.isInitial ? 'mount' : 'update'} · 렌더 ${info.renderCount}회 · Memo ${info.memoCount}회`;
    item.append(title);
    const detail = doc.createElement('p');
    detail.textContent = `${info.isInitial ? '최초 생성' : summary || '명령 없음'} · DOM 관측 ${info.mutations?.total ?? '미측정'}건 · 적용 ${info.durationMs.toFixed(3)}ms`;
    item.append(detail);
    if (info.changes.length) {
      const commands = doc.createElement('p');
      commands.className = 'command-paths';
      commands.textContent = info.changes.slice(0, 10).map(({ type, path, parentPath }) =>
        `${type} [${(path ?? parentPath ?? []).join(',')}]`).join(' / ');
      item.append(commands);
    }
    log.prepend(item);
    while (log.children.length > 30) log.lastElementChild.remove();
  };
}
