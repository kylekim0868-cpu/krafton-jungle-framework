import { domToVNode } from '../../src/vdom/domToVNode.js';
import { renderVNode } from '../../src/vdom/renderVNode.js';
import { diff } from '../../src/vdom/diff.js';
import { preparePatch } from '../../src/vdom/patch.js';
import { createEditorKeyTracker } from './editorKeys.js';
import { createHistory, recordHistory, moveHistory } from './history.js';

// 패널 컨테이너는 화면의 책임이다. 공통 VDOM 엔진에 패널의 제목·버튼·편집 속성을 넣지 않는다.
const actualArea = document.querySelector('#actual-area');
const testArea = document.querySelector('#test-area');
const status = document.querySelector('#app-status');
const patchButton = document.querySelector('#patch-button');
const backButton = document.querySelector('#back-button');
const forwardButton = document.querySelector('#forward-button');
const historyPosition = document.querySelector('#history-position');
const editorKeys = createEditorKeyTracker(testArea);
let history;
let locked = false;

/**
 * 패널의 모든 콘텐츠를 고정 div VNode 아래 읽는다. UI 속성은 데이터에서 제외한다.
 * 원본은 변경하지 않으며 주석만 제외하고 공백·여러 최상위 노드·빈 화면을 유지한다.
 */
function readPanel(panel) {
  return { kind: 'element', tag: 'div', props: {},
    children: Array.from(panel.childNodes, domToVNode).filter((node) => node !== null) };
}

/** 새 DOM을 미리 만들고 콘텐츠 자식만 반환한다. 고정 div를 패널에 중첩하지 않는다. */
function prepareContent(vnode) {
  return Array.from(renderVNode(vnode).childNodes);
}

/** 이력의 양 끝 버튼과 현재 순번을 표시한다. 이 함수 자체는 이력을 확정하지 않는다. */
function updateControls(nextHistory) {
  backButton.disabled = nextHistory.index === 0;
  forwardButton.disabled = nextHistory.index === nextHistory.entries.length - 1;
  historyPosition.textContent = `이력 ${nextHistory.index + 1} / ${nextHistory.entries.length}`;
}

/** 복구도 실패한 경우 편집·세 버튼을 잠근다. 새로고침 전까지 진행하지 않는다. */
function lock(message) {
  locked = true;
  testArea.contentEditable = 'false';
  patchButton.disabled = true;
  backButton.disabled = true;
  forwardButton.disabled = true;
  status.textContent = message;
  status.dataset.state = 'locked';
  document.documentElement.dataset.appState = 'error';
}

/**
 * 적용 중 실패하면 아직 확정하지 않은 후보를 버리고 마지막 저장 상태로 두 영역을 복구한다.
 * 이력 배열·위치는 변경하지 않는다. 복구도 실패하면 모든 조작을 잠근다.
 */
function recover(operation, error) {
  try {
    const currentVNode = history.entries[history.index];
    const actualContent = prepareContent(currentVNode);
    const testContent = prepareContent(currentVNode);
    actualArea.replaceChildren(...actualContent);
    testArea.replaceChildren(...testContent);
    editorKeys.remember();
    updateControls(history);
    status.textContent = `${operation} 적용 실패 · 두 영역을 마지막 확정 상태로 복구했습니다. 미확정 편집은 취소됐습니다.`;
    status.dataset.state = 'recovered';
  } catch (recoveryError) {
    lock(`${operation} 복구 실패 · 편집과 모든 버튼을 잠갔습니다. 페이지를 새로고침해 주세요.`);
    console.error('Phase 1 recovery failed:', recoveryError);
  }
  console.error(`Phase 1 ${operation} failed:`, error);
}

/**
 * 편집을 읽고 사전 검증·DOM 준비 후 실제 영역을 부분 갱신한다.
 * 두 영역 반영이 끝난 뒤에만 새 이력을 확정한다. 준비 오류는 편집을 유지하고,
 * 적용 중 오류는 두 영역을 마지막 확정 상태로 복구한다. 무변경·실패는 이력을 보존한다.
 */
function applyEdit() {
  if (locked) return;
  const currentVNode = history.entries[history.index];
  let nextVNode;
  let candidate;
  let apply;
  let content;
  try {
    nextVNode = readPanel(testArea);
    const changes = diff(currentVNode, nextVNode);
    if (diff(currentVNode, readPanel(actualArea)).length) throw new Error('Actual DOM differs from the confirmed state.');
    if (!changes.length) {
      status.textContent = '변경 사항 없음 · 현재 상태를 유지합니다.';
      status.dataset.state = 'unchanged';
      return;
    }
    // 앞으로가기 기록을 자른 후보도 미리 만들되 실제 성공 전에는 대입하지 않는다.
    candidate = recordHistory(history, nextVNode);
    content = prepareContent(nextVNode);
    apply = preparePatch(actualArea, changes);
  } catch (error) {
    status.textContent = `Patch 준비 실패 · 편집 내용은 유지됩니다. ${error.message}`;
    status.dataset.state = 'error';
    console.error('Phase 1 patch preparation failed:', error);
    return;
  }

  try {
    apply();
    testArea.replaceChildren(...content);
    editorKeys.remember();
    updateControls(candidate);
    status.textContent = 'Patch 완료 · 편집 내용을 반영하고 이력에 저장했습니다.';
    status.dataset.state = 'success';
    history = candidate;
  } catch (error) {
    recover('Patch', error);
  }
}

/**
 * 저장된 앞뒤 스냅샷을 새 DOM으로 두 영역에 복원한다. 미확정 편집은 읽거나 저장하지 않는다.
 * 경계는 무변경이다. 준비 실패는 화면·편집·위치 유지, 적용 실패는 마지막 확정 상태로 복구한다.
 * 두 영역과 버튼 반영 성공 후 위치만 확정하며 이동 자체는 새 이력을 만들지 않는다.
 */
function navigate(direction) {
  if (locked) return;
  let candidate;
  let actualContent;
  let testContent;
  try {
    candidate = moveHistory(history, direction);
    if (candidate === history) return;
    const target = candidate.entries[candidate.index];
    // 한 영역만 바꾸고 렌더 오류가 나는 일을 막기 위해 양쪽 DOM을 먼저 준비한다.
    actualContent = prepareContent(target);
    testContent = prepareContent(target);
  } catch (error) {
    status.textContent = `이력 이동 준비 실패 · 화면과 편집 내용을 유지합니다. ${error.message}`;
    status.dataset.state = 'error';
    console.error('Phase 1 history preparation failed:', error);
    return;
  }
  try {
    actualArea.replaceChildren(...actualContent);
    testArea.replaceChildren(...testContent);
    editorKeys.remember();
    updateControls(candidate);
    status.textContent = '이력 이동 완료 · 저장된 화면을 복원했습니다. Patch 전 편집 내용은 저장하지 않습니다.';
    status.dataset.state = 'restored';
    history = candidate;
  } catch (error) {
    recover('이력 이동', error);
  }
}

try {
  const initialVNode = readPanel(actualArea);
  // 초기 상태도 중복 key 등 Diff의 지원 계약을 충족해야 한다.
  diff(initialVNode, initialVNode);
  testArea.replaceChildren(...prepareContent(initialVNode));
  editorKeys.remember();
  testArea.addEventListener('input', editorKeys.handleInput);
  history = createHistory(initialVNode);
  updateControls(history);
  patchButton.disabled = false;
  patchButton.addEventListener('click', applyEdit);
  backButton.addEventListener('click', () => navigate(-1));
  forwardButton.addEventListener('click', () => navigate(1));
  status.textContent = '초기화 완료 · 테스트 영역을 편집하고 Patch를 눌러 실제 영역에 반영하세요.';
  status.dataset.state = 'ready';
  document.documentElement.dataset.appState = 'ready';
} catch (error) {
  lock('초기 화면을 만들지 못했습니다. 페이지를 새로고침해 주세요.');
  console.error('Phase 1 initialization failed:', error);
}
