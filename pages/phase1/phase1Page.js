import {
  domToVNode,
  createElement,
  vnodeToHTML,
  diff,
  applyPatches,
  getNode,
  PATCH,
  TEXT,
} from '../../src/index.js';
import { htmlToVNodes, normalizeVNode } from '../../src/vdom/htmlToVNode.js';
import { StateHistory } from '../../src/history/stateHistory.js';

const HIGHLIGHT_DURATION_MS = 1400;
const MAX_LOG_GROUPS = 30;

/*
  Phase 1 테스트 페이지 컨트롤러

  흐름
   [로드]  실제 영역 HTML → domToVNode → (공백 정규화) → History[0] → 테스트 영역에 HTML 문자열로 표시
   [Patch] 테스트 영역 HTML → VDOM → diff(현재, 새것) → 바뀐 부분만 실제 영역에 patch → History 에 저장
   [뒤로/앞으로] History 의 VDOM 으로 이동 → diff/patch 로 실제 영역 갱신 + 테스트 영역 문자열 갱신

  설계 결정
   - 실제 영역의 "루트 요소(#real-area)"는 고정하고, 테스트 영역은 루트의 "자식들"만 편집합니다.
     (textarea 에 여러 최상위 태그를 써도 VDOM 루트가 하나로 유지되도록)
   - 기능 테스트(jsdom)에서도 쓸 수 있도록 document 를 인자로 받습니다.
*/
export function setupPhase1Page(doc = document) {
  const ui = {
    realMount: doc.getElementById('real-mount'),
    realWrapper: doc.getElementById('real-wrapper'),
    highlightLayer: doc.getElementById('highlight-layer'),
    testArea: doc.getElementById('test-area'),
    patchButton: doc.getElementById('patch-button'),
    backButton: doc.getElementById('back-button'),
    forwardButton: doc.getElementById('forward-button'),
    resetButton: doc.getElementById('reset-button'),
    historyLabel: doc.getElementById('history-label'),
    historyList: doc.getElementById('history-list'),
    patchLog: doc.getElementById('patch-log'),
    stats: doc.getElementById('stats'),
    dirtyBadge: doc.getElementById('dirty-badge'),
  };

  // 1) 실제 영역 → VDOM
  const rootElement = ui.realMount.firstElementChild;
  const initialVNode = normalizeVNode(domToVNode(rootElement));

  // 2) 사람이 쓴 HTML 에는 공백 텍스트 노드가 섞여 있어 VDOM 과 인덱스가 어긋나므로,
  //    VDOM 으로 실제 영역을 한 번 다시 그려 "DOM == createElement(VDOM)" 상태를 만듭니다. (patch 의 전제 조건)
  ui.realMount.replaceChildren(createElement(initialVNode));

  const history = new StateHistory(initialVNode, { label: '초기 상태', createdAt: new Date() });
  writeTestArea(initialVNode);
  renderHistory();

  // ───────── 이벤트 ─────────
  ui.patchButton.addEventListener('click', handlePatch);
  ui.backButton.addEventListener('click', () => moveHistory(history.index - 1));
  ui.forwardButton.addEventListener('click', () => moveHistory(history.index + 1));
  ui.resetButton.addEventListener('click', () => writeTestArea(history.current));
  ui.testArea.addEventListener('input', updateDirtyBadge);
  ui.testArea.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      handlePatch();
    }
    // Tab 키로 들여쓰기 (기본 동작은 포커스 이동)
    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      insertAtCursor(ui.testArea, '  ');
    }
  });
  ui.historyList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-index]');
    if (button) moveHistory(Number(button.dataset.index));
  });

  // ───────── 동작 ─────────
  function handlePatch() {
    const { children, removed } = htmlToVNodes(ui.testArea.value);
    const previousVNode = history.current;
    const nextVNode = { ...previousVNode, children };

    const result = commit(previousVNode, nextVNode);

    if (result.patches.length === 0) {
      appendLog({ title: '변경 없음', result, warnings: removedWarnings(removed) });
      writeTestArea(previousVNode); // 정규화된 형태로 다시 표시
      return;
    }

    history.push(nextVNode, { label: summarize(result.patches), createdAt: new Date() });
    writeTestArea(nextVNode);
    appendLog({ title: `Patch → #${history.index}`, result, warnings: removedWarnings(removed) });
    renderHistory();
  }

  function moveHistory(targetIndex) {
    if (targetIndex < 0 || targetIndex >= history.size || targetIndex === history.index) return;
    const previousVNode = history.current;
    const fromIndex = history.index;
    const nextVNode = history.goTo(targetIndex);

    const result = commit(previousVNode, nextVNode);
    writeTestArea(nextVNode);
    const direction = targetIndex < fromIndex ? '뒤로가기' : '앞으로가기';
    appendLog({ title: `${direction} #${fromIndex} → #${targetIndex}`, result });
    renderHistory();
  }

  // diff → patch 실행 + 측정 + 하이라이트
  function commit(previousVNode, nextVNode) {
    const patches = diff(previousVNode, nextVNode);
    const observer = new MutationObserver(() => {});
    observer.observe(ui.realMount, { subtree: true, childList: true, attributes: true, characterData: true });

    const startedAt = performance.now();
    let error = null;
    try {
      applyPatches(ui.realMount, patches);
    } catch (caught) {
      // DOM 과 VDOM 이 어긋난 비정상 상황: 전체를 다시 그려 복구하고 로그에 남깁니다.
      error = caught;
      ui.realMount.replaceChildren(createElement(nextVNode));
    }
    const elapsedMs = performance.now() - startedAt;

    const mutationCount = observer.takeRecords().length;
    observer.disconnect();

    if (!error) highlightPatches(patches);
    return { patches, mutationCount, elapsedMs, fullRenderNodeCount: countNodes(nextVNode), error };
  }

  // ───────── 화면 갱신 ─────────
  function writeTestArea(vnode) {
    ui.testArea.value = vnode.children.map((child) => vnodeToHTML(child)).join('\n');
    updateDirtyBadge();
  }

  function updateDirtyBadge() {
    const savedHTML = history ? history.current.children.map((child) => vnodeToHTML(child)).join('\n') : '';
    ui.dirtyBadge.hidden = ui.testArea.value === savedHTML;
  }

  function renderHistory() {
    ui.historyLabel.textContent = `${history.index + 1} / ${history.size}`;
    ui.backButton.disabled = !history.canBack();
    ui.forwardButton.disabled = !history.canForward();

    ui.historyList.replaceChildren(
      ...history.list().map(({ index, meta, isCurrent }) => {
        const item = doc.createElement('li');
        const button = doc.createElement('button');
        button.type = 'button';
        button.dataset.index = String(index);
        button.setAttribute('aria-current', String(isCurrent));
        button.textContent = `#${index}  ${formatTime(meta.createdAt)}  ${meta.label}`;
        item.appendChild(button);
        return item;
      }),
    );
    ui.historyList.querySelector('[aria-current="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }

  function appendLog({ title, result, warnings = [] }) {
    const group = doc.createElement('li');
    group.className = 'log-group';

    const heading = doc.createElement('div');
    heading.className = 'log-title';
    heading.textContent = title;
    const time = doc.createElement('span');
    time.className = 'time';
    time.textContent = formatTime(new Date());
    heading.appendChild(time);
    group.appendChild(heading);

    if (result.patches.length === 0) {
      group.appendChild(textLine('log-empty', '바뀐 부분이 없어 DOM 을 건드리지 않았습니다.'));
    }
    for (const patch of result.patches) group.appendChild(renderPatchLine(patch));
    for (const warning of warnings) group.appendChild(textLine('log-warning', warning));
    if (result.error) group.appendChild(textLine('log-warning', `⚠ ${result.error.message} → 전체 다시 그리기로 복구`));

    ui.patchLog.prepend(group);
    while (ui.patchLog.children.length > MAX_LOG_GROUPS) ui.patchLog.lastElementChild.remove();

    ui.stats.textContent =
      `patch ${result.patches.length}개 · 실제 DOM 변경 ${result.mutationCount}회 · ` +
      `${result.elapsedMs.toFixed(2)}ms · (전체 다시 그리기였다면 노드 ${result.fullRenderNodeCount}개 생성)`;
  }

  function renderPatchLine(patch) {
    const line = doc.createElement('li');
    line.className = 'log-item';
    const badge = doc.createElement('span');
    badge.className = `type type-${patch.type}`;
    badge.textContent = patch.type;
    const path = doc.createElement('span');
    path.className = 'path';
    path.textContent = formatPath(patch.path);
    const detail = doc.createElement('span');
    detail.textContent = describePatch(patch);
    line.append(badge, path, detail);
    return line;
  }

  // 바뀐 노드 위에 색 박스를 잠깐 띄웁니다.
  //  - 실제 영역 DOM 에 class 를 붙이면 그것도 "DOM 변경"이 되어 VDOM 과 어긋나므로, 별도 레이어에 그립니다.
  function highlightPatches(patches) {
    const wrapperRect = ui.realWrapper.getBoundingClientRect();
    for (const patch of patches) {
      if (patch.type === PATCH.REMOVE) continue; // 이미 사라진 노드
      let node;
      try {
        node = getNode(ui.realMount, patch.path);
      } catch {
        continue;
      }
      const element = node.nodeType === 1 ? node : node.parentElement;
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      const box = doc.createElement('div');
      box.className = `flash flash-${patch.type}`;
      Object.assign(box.style, {
        left: `${rect.left - wrapperRect.left}px`,
        top: `${rect.top - wrapperRect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
      ui.highlightLayer.appendChild(box);
      setTimeout(() => box.remove(), HIGHLIGHT_DURATION_MS);
    }
  }

  function textLine(className, text) {
    const line = doc.createElement('li');
    line.className = `log-item ${className}`;
    line.textContent = text;
    return line;
  }

  return { history, ui, handlePatch, moveHistory };
}

// ───────── 순수 유틸 (DOM 무관) ─────────
function describePatch(patch) {
  switch (patch.type) {
    case PATCH.CREATE:
      return `추가 ${shortTag(patch.node)}`;
    case PATCH.REMOVE:
      return '삭제';
    case PATCH.REPLACE:
      return `교체 → ${shortTag(patch.node)}`;
    case PATCH.TEXT:
      return `텍스트 → "${truncate(patch.text, 40)}"`;
    case PATCH.PROPS:
      return patch.changes
        .map(({ name, oldValue, newValue }) => `${name}: ${formatValue(oldValue)} → ${formatValue(newValue)}`)
        .join(', ');
    default:
      return '';
  }
}

function shortTag(vnode) {
  return vnode.type === TEXT ? `"${truncate(vnode.text, 30)}"` : `<${vnode.type}>`;
}

function formatValue(value) {
  if (value === undefined) return '(없음)';
  if (value === '') return '""';
  return truncate(String(value), 30);
}

function formatPath(path) {
  return path.length === 0 ? 'root' : `root › ${path.join(' › ')}`;
}

function summarize(patches) {
  const counts = {};
  for (const { type } of patches) counts[type] = (counts[type] ?? 0) + 1;
  return Object.entries(counts)
    .map(([type, count]) => `${type} ${count}`)
    .join(', ');
}

function removedWarnings(removed) {
  return removed.length ? [`⚠ 보안상 제거됨: ${removed.join(', ')}`] : [];
}

function countNodes(vnode) {
  return 1 + vnode.children.reduce((sum, child) => sum + countNodes(child), 0);
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function formatTime(date) {
  return date instanceof Date ? date.toTimeString().slice(0, 8) : '';
}

function insertAtCursor(textarea, text) {
  const { selectionStart, selectionEnd, value } = textarea;
  textarea.value = value.slice(0, selectionStart) + text + value.slice(selectionEnd);
  textarea.selectionStart = textarea.selectionEnd = selectionStart + text.length;
  textarea.dispatchEvent(new Event('input'));
}
