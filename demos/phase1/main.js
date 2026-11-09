import { domToVNode } from '../../src/vdom/domToVNode.js';
import { renderVNode } from '../../src/vdom/renderVNode.js';
import { diff } from '../../src/vdom/diff.js';
import { preparePatch } from '../../src/vdom/patch.js';
import { createEditorKeyTracker } from './editorKeys.js';

// 패널 컨테이너는 화면의 책임이다. 공통 VDOM 엔진에 패널의 제목·버튼·편집 속성을 넣지 않는다.
const actualArea = document.querySelector('#actual-area');
const testArea = document.querySelector('#test-area');
const status = document.querySelector('#app-status');
const patchButton = document.querySelector('#patch-button');
const editorKeys = createEditorKeyTracker(testArea);
let currentVNode;

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

/** 복구도 실패한 경우 편집·Patch를 잠근다. 새로고침 전까지 성공 상태로 진행하지 않는다. */
function lock(message) {
  testArea.contentEditable = 'false';
  patchButton.disabled = true;
  status.textContent = message;
  status.dataset.state = 'locked';
  document.documentElement.dataset.appState = 'error';
}

/**
 * 편집을 읽고 사전 검증·DOM 준비 후 실제 영역을 부분 갱신한다.
 * 두 영역 반영이 끝난 뒤에만 기준 VNode를 확정한다. 준비 오류는 편집을 유지하고,
 * 적용 중 오류는 두 영역을 마지막 확정 상태로 복구한다. 이력은 아직 저장하지 않는다.
 */
function applyEdit() {
  let nextVNode;
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
    // 편집 영역 정규화와 Patch 모두 준비한 뒤 적용 단계로 넘어간다.
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
    currentVNode = nextVNode;
    status.textContent = 'Patch 완료 · 편집 내용을 실제 영역에 반영했습니다. 이력 기능은 아직 연결되지 않았습니다.';
    status.dataset.state = 'success';
  } catch (error) {
    try {
      const actualContent = prepareContent(currentVNode);
      const testContent = prepareContent(currentVNode);
      actualArea.replaceChildren(...actualContent);
      testArea.replaceChildren(...testContent);
      editorKeys.remember();
      status.textContent = 'Patch 적용 실패 · 두 영역을 마지막 확정 상태로 복구했습니다. 미확정 편집은 취소됐습니다.';
      status.dataset.state = 'recovered';
    } catch (recoveryError) {
      lock('Patch 복구 실패 · 편집과 Patch를 잠갔습니다. 페이지를 새로고침해 주세요.');
      console.error('Phase 1 recovery failed:', recoveryError);
    }
    console.error('Phase 1 patch failed:', error);
  }
}

try {
  const initialVNode = readPanel(actualArea);
  // 초기 상태도 중복 key 등 Diff의 지원 계약을 충족해야 한다.
  diff(initialVNode, initialVNode);
  testArea.replaceChildren(...prepareContent(initialVNode));
  editorKeys.remember();
  testArea.addEventListener('input', editorKeys.handleInput);
  currentVNode = initialVNode;
  patchButton.disabled = false;
  patchButton.addEventListener('click', applyEdit);
  status.textContent = '초기화 완료 · 테스트 영역을 편집하고 Patch를 눌러 실제 영역에 반영하세요.';
  status.dataset.state = 'ready';
  document.documentElement.dataset.appState = 'ready';
} catch (error) {
  lock('초기 화면을 만들지 못했습니다. 페이지를 새로고침해 주세요.');
  console.error('Phase 1 initialization failed:', error);
}
