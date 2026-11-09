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
//함수나 매크로 가져오기


//매크로 정의
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
  // /화면(HTML)에 이미 만들어져 있는 각종 버튼, 텍스트창, 로그창 같은 실제 태그들을 자바스크립트 변수로 
  // 쏙 집어와서 하나의 ui 객체로 깔끔하게 정리(캐싱)해 줍니다
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
  //루트 DOM 을 뽑아낸뒤
  const rootElement = ui.realMount.firstElementChild;
  //가상 DOM 으로 변환
  const initialVNode = normalizeVNode(domToVNode(rootElement));

  // 2) 사람이 쓴 HTML 에는 공백 텍스트 노드가 섞여 있어 VDOM 과 인덱스가 어긋나므로,
  //    VDOM 으로 실제 영역을 한 번 다시 그려 "DOM == createElement(VDOM)" 상태를 만듭니다. (patch 의 전제 조건)
  ui.realMount.replaceChildren(createElement(initialVNode));

  //현제 기록 상태를 관리하는 StateHistory 생성
  //초기 VDOM 상태를 히스토리(되돌리기/다시실행 저장소) 0번에 넣고, 오른쪽 텍스트 편집창에 HTML 문자열로 띄워줍니다.
  const history = new StateHistory(initialVNode, { label: '초기 상태', createdAt: new Date() });
  writeTestArea(initialVNode);
  renderHistory();

  // ───────── 이벤트 ─────────
  //[Patch 버튼]: 입력한 HTML로 가상 돔을 비교해 실제 화면을 부분 수정.
  ui.patchButton.addEventListener('click', handlePatch);
  //[뒤로/앞으로 버튼]: 이전 상태/다음 상태로 타임머신 이동.
  ui.backButton.addEventListener('click', () => moveHistory(history.index - 1));
  ui.forwardButton.addEventListener('click', () => moveHistory(history.index + 1));
  //[리셋 버튼]: 입력창의 내용을 현재 상태의 HTML로 원복.
  ui.resetButton.addEventListener('click', () => writeTestArea(history.current));
  ui.testArea.addEventListener('input', updateDirtyBadge);
  //키보드 단축키 지원: Ctrl + Enter 누르면 바로 패치 실행, Tab 키 누르면 스페이스 2칸 들여쓰기 삽입.
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
  
  //사용자가 오른쪽 텍스트 창에서 HTML을 편집한 뒤 [Patch] 버튼을 눌렀을 때 실행되는 전체 렌더링 파이프라인의 핵심 관문입니다.
  function handlePatch() {
    //현제 HTML을 VDOM 으로 바꿔서 children 으로 변환
    //children : 루트 노드의 직속 자식, removed : 보안상 삭제된 내용 리스트
    const { children, removed } = htmlToVNodes(ui.testArea.value);

    //현제 상태 가져오기
    const previousVNode = history.current;

    //현제 상태에서 children 만 바꾸기 -> 새로운 VDOM 트리 완성
    const nextVNode = { ...previousVNode, children };

    //내부적으로 diff(previousVNode, nextVNode)를 실행해 작업 지시서 목록(patches)을 뽑아냅니다.
    const result = commit(previousVNode, nextVNode);

    /*
      diff 결과 변경 사항이 0개라면? 
      화면을 건드릴 이유가 전혀 없으므로, 로그 창에 "변경 없음"이라고만 남깁니다.
      (만약 악성 스크립트가 걸러졌다면 경고 문구 warnings를 띄워줍니다.)
      return으로 함수를 즉시 끝내버려 쓸데없는 히스토리 생성을 막습니다.
    */
    if (result.patches.length === 0) {
      appendLog({ title: '변경 없음', result, warnings: removedWarnings(removed) });
      writeTestArea(previousVNode); // 정규화된 형태로 다시 표시
      return;
    }

    //방금 적용된 새 VDOM(nextVNode)을 히스토리 스택에 새 스냅샷으로 저장합니다.
    //라벨에는 summarize(result.patches)를 통해 "TEXT 1, PROPS 1"처럼 무엇이 바뀌었는지 요약 메모를 남겨둡니다.
    history.push(nextVNode, { label: summarize(result.patches), createdAt: new Date() });

    //텍스트 입력창의 내용을 방금 확정된 깨끗한 VDOM 기준으로 다시 포맷팅해 써넣습니다.
    //이 함수가 실행되면서 입력창과 저장된 상태가 같아졌으므로 "수정됨(Dirty)" 배지가 화면에서 숨겨집니다(hidden = true).
    writeTestArea(nextVNode);

    //하단 패치 로그 창에 Patch → #1 같은 번호와 함께 실제 DOM 조작 횟수, 걸린 시간(ms), 변경된 노드 경로를 상세히 기록합니다.    
    appendLog({ title: `Patch → #${history.index}`, result, warnings: removedWarnings(removed) });

    //히스토리에 새 기록이 생겼으므로, 좌측 하단의 히스토리 타임라인 버튼 목록과 현재 위치 라벨(예 : "2 / 2")을 최신 상태로 새로고침합니다.
    renderHistory();
  }

  /*
    이 moveHistory 함수는 사용자가 [뒤로가기] 버튼, [앞으로가기] 버튼, 또는 히스토리 목록의 특정 시점 버튼(#0, #1 등)을 클릭했을 때 실행되는 "시간 여행(Time-Travel) 컨트롤러"입니다.
  */
  function moveHistory(targetIndex) {
    /*
      targetIndex < 0: 0번보다 더 과거로 갈 수는 없습니다.
      targetIndex >= history.size: 저장된 전체 이력 개수보다 더 먼 미래로 갈 수는 없습니다.
      targetIndex === history.index: 이미 지금 보고 있는 시점과 똑같은 버튼을 또 누른 경우입니다.
    */
    if (targetIndex < 0 || targetIndex >= history.size || targetIndex === history.index) return;

    //이동하기 전 현제 상태를 저장
    const previousVNode = history.current;
    const fromIndex = history.index;
    const nextVNode = history.goTo(targetIndex); //target 인덱스 상태 얻기

    //이동하기 전 상태와 현제 상태를 비교해서 바뀐 사항만 추출하기
    const result = commit(previousVNode, nextVNode);
    //코드 입력창 갱신
    writeTestArea(nextVNode);
    //타겟 인덱스가 현제 인덱스보다 큰지 작은지 비교해서 direction에 저장
    const direction = targetIndex < fromIndex ? '뒤로가기' : '앞으로가기';
    appendLog({ title: `${direction} #${fromIndex} → #${targetIndex}`, result });
    renderHistory();
  }

  // diff → patch 실행 + 측정 + 하이라이트
  //현제 상태, 이전 / 이후 상태 인자로 받음
  function commit(previousVNode, nextVNode) {
    //이전 VDOM과 새 VDOM을 비교해서 무엇을 고쳐야 하는지 적어둔 작업 지시서 배열(patches)을 생성합니다.
    const patches = diff(previousVNode, nextVNode);
    //브라우저가 기본 제공하는 "실제 DOM 변경 감시자(CCTV)"입니다.
    const observer = new MutationObserver(() => {});
    /*
      ui.realMount(실제 렌더링 영역) 안에서:
      childList: 태그가 추가되거나 삭제되었는지  
      attributes: class, id 등 속성이 바뀌었는지
      characterData: 글자 내용이 바뀌었는지
      subtree: 그 밑의 모든 깊은 자식들까지 전부 감시하라고 켜둡니다.
    */
    observer.observe(ui.realMount, { subtree: true, childList: true, attributes: true, characterData: true });

    //브라우저의 초정밀 고해상도 타이머(소수점 단위 밀리초까지 측정)로 시작 시각을 기록합니다. 최적화 측정 수단?
    const startedAt = performance.now();
    let error = null;
    try {
      //앞서 만든 patches 지시서를 바탕으로 진짜 브라우저 DOM을 조작합니다, 인자로 실제 랜더링 영역을 넘겨줘서 바로 패치 가능
      applyPatches(ui.realMount, patches);
    } catch (caught) {
      // DOM 과 VDOM 이 어긋난 비정상 상황: 전체를 다시 그려 복구하고 로그에 남깁니다.
      error = caught;
      ui.realMount.replaceChildren(createElement(nextVNode));
    }
    //패치에 총 몇 밀리초(ms)가 걸렸는지 계산합니다
    const elapsedMs = performance.now() - startedAt;

    //applyPatches가 실행되는 동안 실제 브라우저 DOM 변경이 정확히 몇 번 발생했는지 기록된 영수증의 개수를 가져옵니다.
    const mutationCount = observer.takeRecords().length;
    //측정이 끝났으므로 감시 카메라를 끕니다.
    observer.disconnect();

    if (!error) highlightPatches(patches);
    /*
      patches: 변경 지시서 목록
      mutationCount: 실제 브라우저 DOM이 변경된 횟수 (예: 2회)
      elapsedMs: 패치에 걸린 시간 (예: 0.15ms)
      fullRenderNodeCount: 만약 가상 돔을 안 쓰고 매번 화면 전체를 처음부터 무식하게 다 다시 그렸다면 생성해야 했을 전체 노드 개수 (가상 돔의 효율성을 비교해서 보여주기 위한 지표)
      error: 발생한 에러 객체 (정상이면 null)
    */
    return { patches, mutationCount, elapsedMs, fullRenderNodeCount: countNodes(nextVNode), error };
  }

  // ───────── 화면 갱신 ─────────

  /*
    {
      type: 'div', // 👈 루트 태그 (#real-mount)
      props: { id: 'real-mount' },
      children: [  // 👈 바로 이 자식들만 순회!
        { type: 'h1', props: {}, children: [...], text: '제목' },
        { type: 'p', props: {}, children: [...], text: '설명글' }
      ]
    }
    일때

    vnode.children.map(...)은 루트인 div는 건너뛰고 자식인 h1과 p만 꺼냅니다.
    각각 vnodeToHTML을 호출하여:
    1번째 자식: <h1>제목</h1>
    2번째 자식: <p>설명글</p>
    .join('\n')으로 합쳐서 텍스트 입력창(ui.testArea.value)에는 이렇게 표시됩니다:
    <h1>제목</h1>
    <p>설명글</p>
  */
  function writeTestArea(vnode) {
    ui.testArea.value = vnode.children.map((child) => vnodeToHTML(child)).join('\n');
    updateDirtyBadge();
  }

  function updateDirtyBadge() {
    const savedHTML = history ? history.current.children.map((child) => vnodeToHTML(child)).join('\n') : '';
    ui.dirtyBadge.hidden = ui.testArea.value === savedHTML;
  }

  function renderHistory() {
    //인덱스 번호 및 버튼 활성화 상태 갱신
    //화면에 현재 위치를 표시합니다. (예: 총 5개의 이력 중 2번째에 있다면 "2 / 5"로 표시)
    ui.historyLabel.textContent = `${history.index + 1} / ${history.size}`;
    //뒤로 갈 곳이 없으면(맨 처음): [뒤로가기] 버튼을 비활성화(disabled = true).
    //앞으로 갈 곳이 없으면(맨 끝 최신 상태): [앞으로가기] 버튼을 비활성화(disabled = true).
    ui.backButton.disabled = !history.canBack();
    ui.forwardButton.disabled = !history.canForward();



    /*
      history.list()에서 저장된 모든 이력(과거부터 현재까지의 VDOM 스냅샷들)을 꺼내옵니다.  
      각 이력마다 클릭 가능한 <button> 태그를 가진 <li> 아이템을 만듭니다.
      버튼 텍스트 예시: #0  16:10:05  초기 상태, #1  16:15:20  TEXT 1개 수정
      replaceChildren(...): 기존 목록을 싹 비우고 새로 만든 목록으로 깔끔하게 교체합니다.
    */
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
    
    //히스토리 목록이 길어져서 스크롤이 생겼을 때, 현재 내가 보고 있는 상태 버튼(aria-current="true")이 
    // 화면 밖으로 가려지지 않도록 자동으로 스크롤을 내려서 보이게 맞춰줍니다.
    ui.historyList.querySelector('[aria-current="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }

  //변경사항 알림
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
  /*
  value: 텍스트창에 적혀 있는 전체 글자 문자열.
  selectionStart: 커서의 시작 위치 (글자 인덱스 번호)
  selectionEnd: 커서의 끝 위치.
  */
  const { selectionStart, selectionEnd, value } = textarea;

  //문자열을 3등분으로 쪼개서 가운데에 원하는 text(스페이스 2칸)를 넣고 합칩니다:
  textarea.value = value.slice(0, selectionStart) + text + value.slice(selectionEnd);

  /*
    글자를 끼워 넣고 가만히 두면, 브라우저 기본 특성상 커서가 입력창 맨 끝으로 튕겨 나가 버립니다.
    그래서 방금 삽입한 글자의 길이(text.length, 스페이스 2칸이면 2)만큼 커서 위치를 오른쪽으로 옮겨서, 
    사용자가 이어서 자연스럽게 다음 글자를 칠 수 있도록 커서 위치를 강제로 보정해 줍니다.
  */

  textarea.selectionStart = textarea.selectionEnd = selectionStart + text.length;

  //브라우저에 "글자 수정됨!" 알림 발송하기
  textarea.dispatchEvent(new Event('input'));
}
