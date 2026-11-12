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
| `src/vdom/createVNode.js` | 코드에서 같은 형식의 VNode 만들기 | HTML 태그·props 전용 자식 함수, 배열·빈 자식 정규화, 이벤트·폼 현재 값 분리 |
| `src/vdom/vnode.js` | 공통 입력·key 계약 검증 | 문자열 속성·순환 참조·빈/중복 형제 data-key 검사 |
| `src/vdom/diff.js`, `patch.js` | VNode 비교, 필요한 DOM 변경 | key 조회·이동 계획과 부분 Patch 구현. preparePatch로 준비·적용을 분리 |
| `demos/phase1/main.js` | 실제·편집 영역과 버튼 연결 | 초기화·부분 Patch·이력 복원·실패 복구. 양쪽 반영 성공 후에만 이력 후보를 확정 |
| `demos/phase1/history.js` | DOM 없는 스냅샷·위치 계산 | 초기 이력·새 저장·앞뒤 이동 후보를 순수 함수로 반환. 깊은 복사·동결로 과거 데이터를 보호 |
| `demos/phase1/editorKeys.js` | 브라우저 편집으로 복제된 key 정리 | 기존 항목 key를 추적하고 구조 변경 입력에서 새 중복 노드에만 일회성 key 발급. 공통 엔진의 중복 거부 정책 유지 |
| `src/component/FunctionComponent.js`, `hooks.js` | 루트의 이전 VNode·Hook 상태, mount·update | P2-01 생명주기와 P2-02의 루트 useState·useEffect·useMemo·unmount 구현. Hook 후보는 DOM 성공 후 확정 |
| `demos/phase2/` | 입력·클릭·Hooks 데모 | 루트 State의 이름·숫자, props 전용 Counter, 두 배 Memo, 제목·단축키 Effect와 해제 로그 |
| `tests/unit/`, `tests/browser/` | 모듈 계약과 실제 DOM·사용자 흐름 검사 | P1-00~04 회귀, P2-01 루트 생명주기, P2-02 Hooks·입력·이벤트·해제 검사를 연결. 사용자 이해·수용은 별도로 확인 |

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
- P2-01의 기본 VNode는 Phase 1의 문자열 HTML 속성 계약을 사용한다. P2-02에서 VNode 생성 API·이벤트·세 Hook을 연결하며 아래 확장 계약을 따른다.

## P2-02 Hooks·런타임 확장 계약

KJF-27은 사용자가 선택한 전체 통합 범위에 따라 P2-02와 선행 P2-03·04·05·06을 함께 구현한다.

- `createVNode(tag, props, ...children)`는 기존 요소·텍스트 VNode를 만든다. 배열을 펼치고 문자열·숫자를 텍스트로 바꾸며 null·undefined·불리언 자식을 생략한다. HTML 태그·속성 이름은 소문자로 정규화한다.
- `createVNode(Child, props)`는 자식을 Hook 프레임 없이 실행한다. 자식은 이 경로로 호출해 props만 사용한다. 루트 안에서 임의의 일반 함수를 직접 호출하는 경우에는 그 함수를 자식과 구분할 수 없다.
- 기존 `props`는 문자열 HTML 속성이다. 함수형 `onClick`·`onInput` 등은 `events` 맵으로 분리하고, input·textarea·select의 `value`와 input의 `checked`는 `properties`에 둔다. 기존 Phase 1의 속성 읽기·쓰기 계약은 유지한다. 런타임 값은 DOM → VNode 변환의 복원 대상이 아니다.
- 공통 Diff는 `EVENTS`·`PROPERTIES` 명령을 추가로 만든다. Patch는 이벤트의 이전 함수를 해제하고 새 함수를 등록한다. 폼 값은 구조 반영 후 현재 값이 달라질 때만 써서 입력 선택 범위를 유지한다. select는 요청 값이 같아도 option 변경 후 선택 값을 다시 확정한다. 이벤트 함수를 포함한 VNode는 데이터 맵을 복사하고 함수 참조를 보존한다.
- `useState(initial)`는 함수 초기값을 최초 성공 렌더에 사용하고 안정적인 setter를 반환한다. setter는 값 또는 이전 값을 받는 순수 함수를 받으며 Object.is로 같은 값이면 렌더를 생략한다. 일반 setter는 즉시 갱신한다. 렌더·초기화·Memo 계산 중 setter 호출은 거부한다.
- Hook 종류와 호출 수는 최초 렌더와 같아야 한다. 루트 밖·자식 생성 함수·Memo 계산 안의 Hook 호출을 거부한다. Hook 슬롯은 인스턴스별로 보존하며 렌더·준비·Patch 실패 시 후보를 버린다.
- `useMemo(calculate, deps)`는 얕게 복사한 의존성을 항목별 Object.is로 비교한다. 같은 배열 내용이면 이전 값을 반환하고, deps를 생략하면 매번 계산한다. 계산 함수는 순수해야 한다.
- `useEffect(callback, deps)`는 DOM과 Hooks 확정 후 실행한다. deps 생략은 매 렌더, []는 최초, 배열은 항목별 변경 시 실행한다. 변경된 Effect의 이전 정리를 모두 마친 뒤 새 콜백을 실행한다. 콜백은 정리 함수 또는 undefined를 반환한다.
- Effect 안의 setter는 현재 정리·실행을 마친 뒤 마이크로태스크에서 처리한다. 일반 이벤트 setter 여러 개를 묶는 Batching은 제공하지 않는다. Effect 오류는 다른 Effect 처리 후 AggregateError로 전달하며 이미 확정한 DOM·State는 유지한다.
- `unmount()`는 콘텐츠를 제거하고 Effect를 한 번 정리한다. 해제 후의 오래된 setter와 대기 중인 setter는 화면을 바꾸지 않는다. 같은 인스턴스의 재마운트는 지원하지 않는다. 정리 오류가 나도 나머지 자원은 정리한다.

Effect 오류 전파·동기 setter·마이크로태스크 예약은 이번 미니 구현의 계약이다. 실제 React의 모든 스케줄링 동작을 구현한 것으로 해석하지 않는다. 지원하지 않는 동작은 Fragment·Context·중첩 상태 컴포넌트·자동 Batching이며, SVG·MathML과 폼 선택 범위의 이력 복원도 기존 지원 범위 밖이다.

## YM YJ 통합 관찰 계약

KJF-28은 팀원과 합의한 방향을 전달한 사용자의 구현 요청에 따른 선별 통합이다. 기준 커밋과 채택 출처는 [README](../README.md#ym-yj-선별-통합)에 모은다. YJ의 VNode·key·Patch 루트와 State 선확정 구조를 복사하지 않고, YM 계약으로 관찰 기능을 연결한다.

- `new FunctionComponent(render, props, { onCommit })`의 세 번째 인자는 선택이다. 기존 두 인자 호출은 유지한다. 콜백은 DOM·Hooks 확정과 Effect 처리 후 실행하며 Effect가 예외를 던져도 성공한 반영 진단을 전달한다.
- 전달값은 `{ renderCount, commitCount, memoCount, isInitial, changes, durationMs, mutations }`다. 루트·Memo 실행 수는 실패한 호출도 포함하고 commit 수는 DOM·Hooks 확정 때만 늘어난다. 같은 값 setter는 렌더와 콜백을 생략한다. 변경 없는 명시적 update는 성공한 반영으로 세고 변경·관측 0건을 전달한다.
- `changes`는 type·이전 트리 path·parentPath·index만 복사한 읽기 전용 배열이다. VNode·함수·Hook 저장소는 노출하지 않는다. EVENTS는 이벤트 처리 명령이며 MutationRecord를 만들지 않을 수 있다.
- 관측은 onCommit을 사용하는 인스턴스의 DOM 삽입·적용 구간에서만 수행한다. `commitDiagnostics.js`가 observer를 성공·실패 모두 finally에서 종료한다. 복구 기록·Effect·진단 패널 쓰기는 성공한 적용의 관측 수에 포함하지 않는다. 관측 등록·조회 실패는 `mutations: null`로 분리한다.
- `mutations`는 total·childList·attributes·characterData별 MutationRecord 수다. DOM API 호출·폼 value/checked 대입·이벤트 등록·Reflow·Repaint 수가 아니다. `durationMs`는 적용 구간의 JS 경과 시간이며 Diff·preparePatch·Effect·layout/paint는 포함하지 않는다.
- onCommit은 관찰 전용이다. 호출 중 재진입·setter는 기존 busy 검사로 거부하며 콜백 예외는 경고로 분리해 성공한 화면·State를 되돌리지 않는다. 콜백 내부의 임의 외부 부작용까지 복구하지는 않는다.
- `useMemo`는 계산 함수를 호출할 때 Hook 프레임의 계수만 증가시킨다. 캐시 값·의존성 비교·순수 계산 계약은 바꾸지 않는다. 데모는 이 계수를 DOM 바깥 로그에 표시해 루트 재렌더와 Memo 재계산을 비교한다.
- 데모 자동 증가의 상태는 루트에 두며 Effect 의존성은 `[isAutoIncrement]`다. 카운트 변경으로 타이머를 재등록하지 않고 함수형 setter를 사용한다. 끄기·unmount 시 interval을 해제한다. 일반 이벤트의 동기 갱신과 기존 제목·단축키 Effect는 유지한다.
- 데모 로그는 반영 30개·Effect 12개로 제한한다. 기존 디자인과 입력 DOM 참조·초점·선택 범위를 보존한다. Batching·proxy·이력 상한은 별도 검토 대상으로 남긴다.
- 이름의 작성 중 값은 입력 DOM에 유지하고, 이름 적용 버튼 또는 Enter의 폼 제출에서만 State를 갱신한다. 타이핑만으로 렌더·Effect 기록을 추가하지 않으며 같은 이름의 재제출도 기존 동일 값 setter 계약에 따라 생략한다.
