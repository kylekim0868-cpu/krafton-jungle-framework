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
| `src/vdom/vnode.js` | 공통 입력·key 계약 검증 | 문자열 속성·순환 참조·빈/중복 형제 data-key 검사 |
| `src/vdom/diff.js`, `patch.js` | VNode 비교, 필요한 DOM 변경 | key 조회·이동 계획과 부분 Patch 구현. preparePatch로 준비·적용을 분리 |
| `demos/phase1/main.js`, `history.js` | 실제·편집 영역 연결, 이력 저장·이동 | 고정 데이터 루트 초기화·Patch 버튼·실패 복구 구현. 이력 파일과 비활성 이력 버튼은 P1-04 대상 |
| `demos/phase1/editorKeys.js` | 브라우저 편집으로 복제된 key 정리 | 기존 항목 key를 추적하고 구조 변경 입력에서 새 중복 노드에만 일회성 key 발급. 공통 엔진의 중복 거부 정책 유지 |
| `src/component/FunctionComponent.js`, `hooks.js` | 루트의 이전 VNode·Hook 상태, mount·update | 빈 파일 |
| `demos/phase2/` | 입력·클릭·Hooks 데모 | HTML·JS 파일 모두 비어 있음 |
| `tests/unit/`, `tests/browser/` | 모듈 계약과 실제 DOM·사용자 흐름 검사 | P1-00·P1-01 회귀, P1-02 Diff·Patch·버튼·오류 복구와 제한된 성능 측정을 연결. 사용자 이해·수용은 별도로 확인 |

기존 VNode는 `{ kind: 'text', text }` 또는 `{ kind: 'element', tag, props, children }`다. `<p>안녕</p>`은 `p` 요소와 텍스트 자식으로 읽고 `renderVNode`가 각각 새 DOM을 만든다. 초기화 연결은 `demos/phase1/main.js`에서 볼 수 있다.

P1-02에서 HTML `data-key`를 같은 부모 안의 항목 식별자로 사용한다. 고유 key가 있는 항목은 이동해도 같은 DOM을 재사용하고, 없는 자식은 같은 위치에서 비교한다. Diff는 이전 트리 경로의 변경 목록을 만들고 Patch는 모든 참조와 최종 배치를 준비한 뒤 적용한다. 패널은 두 영역 반영 성공 후 기준 VNode를 확정하며 적용 중 실패 시 마지막 확정 상태로 복구한다. 구체적인 필드·지원 범위는 결정 0003을 따른다.

## 기존 결정의 상태

| 기록 | 유지할 상태와 읽을 시점 |
| --- | --- |
| [0001 · 초기화 계약](decisions/0001-vnode-initialization.md) | 승인된 요소·텍스트 범위와 변환·렌더 계약. P1-00·P1-01 작업 때 확인 |
| [0002 · Node 개발 서버](decisions/0002-node-development-server.md) | 선택한 실행 환경의 근거. 환경 변경 때 확인 |
| [0003 · Diff·Patch·이력 계약](decisions/0003-diff-patch-history-contract.md#항목별-승인-상태와-적용-단계) | 사용자 선택인 고정 루트·key 비교·실패 복구와 구현 세부사항의 수용을 구분한다. 이력은 설계안이며 P1-04에서 확정·연결 |

문서 정리는 기존 설계안의 승인을 뜻하지 않는다. 중요한 설계는 해당 작업의 예시와 영향을 함께 보고 하나씩 결정한다.

## Phase 2에서 결정할 것

현재 `props`는 HTML 속성 문자열이며 `renderVNode`는 `setAttribute()`를 사용한다. Phase 2 진입 때 VNode 생성·자식 정규화, 함수형 컴포넌트 실행, 이벤트 등록·교체·제거, `value`·`checked` 같은 DOM 프로퍼티 반영과 setter 갱신 시점을 결정한다. Effect의 실행·정리와 Memo 의존성 비교는 각 Hook 작업에서 결정한다.

상태와 Hooks는 루트에서만 사용하고 자식은 props만 사용하는 순수 함수다. Phase 1의 문자열 속성 변환을 유지하면서 공통 렌더·Patch를 확장하며 Phase 2 전용 Diff·Patch를 복제하지 않는다.
