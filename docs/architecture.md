# Mini React 구조

모듈의 책임과 연결만 설명한다. 요구사항·작업 순서는 [requirements.md](requirements.md), 실행·검증은 [README](../README.md)가 원본이다.

```text
Phase 1 편집 DOM → domToVNode ──┐
                               ├→ 이전·다음 VNode → diff → patch → 실제 DOM
Phase 2 상태 변경 → 루트 렌더 ──┘
```

## 현재 소스와 책임

| 위치 | 책임 | 현재 구현 상태 |
| --- | --- | --- |
| `src/vdom/domToVNode.js` | DOM을 요소·텍스트 VNode로 읽기 | 구현 있음. 원본 보존·문자열 속성·주석 제외 |
| `src/vdom/renderVNode.js` | VNode로 새 DOM 만들기 | 구현 있음. 문서에 붙이는 일은 호출자가 담당 |
| `src/vdom/createVNode.js` | 코드에서 같은 형식의 VNode 만들기 | 빈 파일 |
| `src/vdom/diff.js`, `patch.js` | VNode 비교, 필요한 DOM 변경 | 빈 파일 |
| `demos/phase1/main.js`, `history.js` | 실제·편집 영역 연결, 이력 저장·이동 | 초기화만 구현. 이력 파일은 비어 있고 Patch·이력 버튼은 비활성화 |
| `src/component/FunctionComponent.js`, `hooks.js` | 루트의 이전 VNode·Hook 상태, mount·update | 빈 파일 |
| `demos/phase2/` | 입력·클릭·Hooks 데모 | HTML·JS 파일 모두 비어 있음 |
| `tests/unit/`, `tests/browser/` | 모듈 계약과 실제 DOM·사용자 흐름 검사 | 현재 P1-00 검사만 있음. 실행 결과와 사용자 이해는 별도로 확인 |

기존 VNode는 `{ kind: 'text', text }` 또는 `{ kind: 'element', tag, props, children }`다. `<p>안녕</p>`은 `p` 요소와 텍스트 자식으로 읽고 `renderVNode`가 각각 새 DOM을 만든다. 초기화 연결은 `demos/phase1/main.js`에서 볼 수 있다.

## 기존 결정의 상태

| 기록 | 유지할 상태와 읽을 시점 |
| --- | --- |
| [0001 · 초기화 계약](decisions/0001-vnode-initialization.md) | 승인된 요소·텍스트 범위와 변환·렌더 계약. P1-00·P1-01 작업 때 확인 |
| [0002 · Node 개발 서버](decisions/0002-node-development-server.md) | 선택한 실행 환경의 근거. 환경 변경 때 확인 |
| [0003 · Diff·Patch·이력 계약](decisions/0003-diff-patch-history-contract.md#항목별-승인-상태와-적용-단계) | 승인된 루트 방식, 검증 대기인 경로 보완안, 수용 대기인 비교·Patch·복구·이력 설계를 구분한다. P1-02·P1-03·P1-04마다 해당 계약만 확정하며 이력은 P1-04에서 연결 |

문서 정리는 기존 설계안의 승인을 뜻하지 않는다. 중요한 설계는 해당 작업의 예시와 영향을 함께 보고 하나씩 결정한다.

## Phase 2에서 결정할 것

현재 `props`는 HTML 속성 문자열이며 `renderVNode`는 `setAttribute()`를 사용한다. Phase 2 진입 때 VNode 생성·자식 정규화, 함수형 컴포넌트 실행, 이벤트 등록·교체·제거, `value`·`checked` 같은 DOM 프로퍼티 반영과 setter 갱신 시점을 결정한다. Effect의 실행·정리와 Memo 의존성 비교는 각 Hook 작업에서 결정한다.

상태와 Hooks는 루트에서만 사용하고 자식은 props만 사용하는 순수 함수다. Phase 1의 문자열 속성 변환을 유지하면서 공통 렌더·Patch를 확장하며 Phase 2 전용 Diff·Patch를 복제하지 않는다.
