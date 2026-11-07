import { domToVNode } from '../../src/vdom/domToVNode.js';
import { renderVNode } from '../../src/vdom/renderVNode.js';

// 패널 컨테이너는 화면의 책임이다. 공통 VDOM 엔진에 패널의 제목·버튼·편집 속성을 넣지 않는다.
const actualArea = document.querySelector('#actual-area');
const testArea = document.querySelector('#test-area');
const status = document.querySelector('#app-status');

try {
  // 1. 실제 영역에서 샘플 article 하나를 변환 루트로 선택한다.
  // firstElementChild는 HTML 들여쓰기로 생긴 앞쪽 공백 텍스트를 루트로 고르지 않는다.
  const sampleRoot = actualArea.firstElementChild;
  // 2. 원본 DOM을 VNode 데이터로 읽는다. 이 시점에 실제 영역의 DOM은 바뀌지 않는다.
  const initialVNode = domToVNode(sampleRoot);
  // 3. 같은 VNode로 새 DOM을 만든 뒤 테스트 영역에 마운트한다.
  // 원본 노드를 이동하지 않으므로 테스트 영역을 편집해도 실제 영역은 유지된다.
  testArea.replaceChildren(renderVNode(initialVNode));
  // 4. 사용자는 초기화 안내를 보고, 브라우저 테스트는 appState로 초기화 성공 여부를 읽는다.
  // ready는 초기 렌더 완료만 뜻하며 Diff·Patch·이력 기능의 구현이나 검사 통과를 뜻하지 않는다.
  status.textContent = '초기화 완료 · 테스트 영역을 자유롭게 편집해 보세요. 변경 내용은 아직 실제 영역에 반영되지 않습니다.';
  document.documentElement.dataset.appState = 'ready';
} catch (error) {
  // 변환·렌더 중 실패하면 편집을 막고 화면에 실패를 알린다.
  // 구체적인 원인은 콘솔에 남기며 정상 초기화 상태인 ready로 표시하지 않는다.
  testArea.contentEditable = 'false';
  status.textContent = '초기 화면을 만들지 못했습니다. 페이지를 새로고침해 주세요.';
  document.documentElement.dataset.appState = 'error';
  console.error('Phase 1 initialization failed:', error);
}
