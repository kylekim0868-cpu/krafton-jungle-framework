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
| `demos/phase1/main.js` | 실제·편집 영역과 버튼 연결 | 초기화·부분 Patch·이력 복원·실패 복구. 양쪽 반영 성공 후에만 이력 후보를 확정 |
| `demos/phase1/history.js` | DOM 없는 스냅샷·위치 계산 | 초기 이력·새 저장·앞뒤 이동 후보를 순수 함수로 반환. 깊은 복사·동결로 과거 데이터를 보호 |
| `demos/phase1/editorKeys.js` | 브라우저 편집으로 복제된 key 정리 | 기존 항목 key를 추적하고 구조 변경 입력에서 새 중복 노드에만 일회성 key 발급. 공통 엔진의 중복 거부 정책 유지 |
| `src/component/FunctionComponent.js`, `hooks.js` | 루트의 이전 VNode·Hook 상태, mount·update | P2-01 루트 함수·mount·명시적 update 구현. hooks 배열은 인스턴스에 유지하며 Hook 함수 파일은 후속 작업 |
| `demos/phase2/` | 입력·클릭·Hooks 데모 | P2-01에서 외부 버튼이 새 props로 update를 호출하는 숫자 데모. Hook 함수는 후속 작업 |
| `tests/unit/`, `tests/browser/` | 모듈 계약과 실제 DOM·사용자 흐름 검사 | P1-00·P1-01 회귀, P1-02 Diff·Patch·성능, P1-03 복합 변경, P1-04 이력·분기·실패 보존을 연결. 사용자 이해·수용은 별도로 확인 |

기존 VNode는 `{ kind: 'text', text }` 또는 `{ kind: 'element', tag, props, children }`다. `<p>안녕</p>`은 `p` 요소와 텍스트 자식으로 읽고 `renderVNode`가 각각 새 DOM을 만든다. 초기화 연결은 `demos/phase1/main.js`에서 볼 수 있다.

P1-02에서 HTML `data-key`를 같은 부모 안의 항목 식별자로 사용한다. 고유 key가 있는 항목은 이동해도 같은 DOM을 재사용하고, 없는 자식은 같은 위치에서 비교한다. Diff는 이전 트리 경로의 변경 목록을 만들고 Patch는 모든 참조와 최종 배치를 준비한 뒤 적용한다. 패널은 두 영역 반영 성공 후 기준 VNode를 확정하며 적용 중 실패 시 마지막 확정 상태로 복구한다. 구체적인 필드·지원 범위는 결정 0003을 따른다.

P1-04의 기준 상태는 이력의 `entries[index]`다. 새 저장·이동은 원본을 바꾸지 않는 후보로 준비하고 두 영역 반영 성공 후 확정한다. 새 저장이 성공하면 앞으로 기록을 자르고, 무변경·실패는 보존한다. 앞뒤 이동은 미확정 편집을 버리고 저장된 VNode로 새 DOM을 만든다. 스냅샷은 페이지 메모리에 복사·동결하며 새로고침하면 초기화한다.

## 기존 결정의 상태

| 기록 | 유지할 상태와 읽을 시점 |
| --- | --- |
| [0001 · 초기화 계약](decisions/0001-vnode-initialization.md) | 승인된 요소·텍스트 범위와 변환·렌더 계약. P1-00·P1-01 작업 때 확인 |
| [0002 · Node 개발 서버](decisions/0002-node-development-server.md) | 선택한 실행 환경의 근거. 환경 변경 때 확인 |
| [0003 · Diff·Patch·이력 계약](decisions/0003-diff-patch-history-contract.md#항목별-승인-상태와-적용-단계) | 고정 루트·key 비교·실패 복구와 이력 분기·미확정 편집의 사용자 선택을 기록. 구현 세부사항과 실행 검증·사용자 수용은 구분 |

문서 정리는 기존 설계안의 승인을 뜻하지 않는다. 중요한 설계는 해당 작업의 예시와 영향을 함께 보고 하나씩 결정한다.

## P2-01 루트 컴포넌트 계약

KJF-26의 구현 선택이다. 사용자 이해·수용 여부는 실행 결과와 별도로 확인한다.

- `new FunctionComponent(render, props)`는 props를 받아 기존 형식의 VNode 하나를 반환하는 루트 함수를 감싼다. `hooks` 배열은 인스턴스마다 생성해 재렌더링에서도 유지한다.
- `mount(container)`는 HTML 컨테이너 콘텐츠를 최초 렌더 결과로 교체하고 루트 DOM을 반환한다. `update(nextProps)`는 동기적으로 루트 함수를 재실행하고 기존 `diff`·`preparePatch`로 갱신한다. 인자를 생략하면 마지막 성공 시의 props를 사용한다. 루트 교체 시 새 DOM을 추적한다.
- 렌더 결과는 검증 후 복사한다. 컨테이너 콘텐츠는 인스턴스가 소유하며, 외부 DOM 변경·mount 전 update·중복 mount·렌더 중 재진입을 거부한다. 렌더 함수는 입력과 외부 상태를 변경하지 않아야 한다.
- 준비 오류는 DOM과 확정 기준을 유지한다. 적용 중 실패하면 이전 콘텐츠 또는 VNode로 복구하고 오류를 전달한다. 복구까지 실패하면 인스턴스를 잠근다. 무변경 갱신은 DOM을 쓰지 않고 props를 확정한다.
- 데모의 버튼은 컨트롤러가 `addEventListener`로 연결한다. VNode는 Phase 1의 문자열 HTML 속성 계약을 사용한다. `useState`·`useEffect`·`useMemo`와 VNode 생성 API는 후속 요구사항에서 구현한다.

## Phase 2에서 결정할 것

현재 `props`는 HTML 속성 문자열이며 `renderVNode`는 `setAttribute()`를 사용한다. Phase 2 진입 때 VNode 생성·자식 정규화, 함수형 컴포넌트 실행, 이벤트 등록·교체·제거, `value`·`checked` 같은 DOM 프로퍼티 반영과 setter 갱신 시점을 결정한다. Effect의 실행·정리와 Memo 의존성 비교는 각 Hook 작업에서 결정한다.

상태와 Hooks는 루트에서만 사용하고 자식은 props만 사용하는 순수 함수다. Phase 1의 문자열 속성 변환을 유지하면서 공통 렌더·Patch를 확장하며 Phase 2 전용 Diff·Patch를 복제하지 않는다.
