# mini-react (yj)

Virtual DOM, Diff, Patch와 함수형 Component, Hooks를 Vanilla JavaScript로 직접 구현한 미니 리액트입니다.

- 브랜치: `feat/KJF-1-yj-mini-react` (팀원 yj의 독립 구현 브랜치)
- 저장소: [krafton-jungle-framework](https://github.com/kylekim0868-cpu/krafton-jungle-framework)

## 실행 방법

```bash
npm install
npm run dev       # 개발 서버 → http://localhost:5173 (Phase 1 페이지)
npm test          # 감시 모드 (저장할 때마다 재실행)
npm run test:run  # 1회 실행
```

페이지는 ES 모듈을 쓰므로 HTML 파일을 더블클릭(file://)하면 동작하지 않습니다. 반드시 `npm run dev`로 여세요.

## 폴더 구조

```
src/
├─ index.js              공개 API 진입점
├─ vdom/
│  ├─ h.js               VNode 생성 함수 h(), TEXT 상수
│  ├─ domToVNode.js      실제 DOM → VDOM
│  ├─ createElement.js   VDOM → 실제 DOM, 속성 설정/갱신
│  ├─ vnodeToHTML.js     VDOM → HTML 문자열 (State History 이동 시 테스트 영역 표시용)
│  ├─ htmlToVNode.js     HTML 문자열 → VNode 배열, 공백 정규화
│  └─ sanitizeVNode.js   script / 문자열 이벤트 속성 / javascript: 링크 제거 (XSS 방지)
├─ diff/
│  ├─ diff.js            두 VDOM 비교 → patches 배열
│  ├─ diffProps.js       속성 비교
│  └─ patch.js           patches를 실제 DOM에 반영
├─ history/
│  └─ stateHistory.js    State History (뒤로/앞으로, 미래 기록 삭제, 최대 개수)
└─ core/                 (Phase 2)
   ├─ functionComponent.js  FunctionComponent 클래스 (hooks 배열, mount, update), mountRoot
   ├─ hooks.js              useState
   ├─ hookRuntime.js        현재 렌더링 중인 컴포넌트와 훅 순번 관리, 훅 규칙 검사
   ├─ resolveVNode.js       자식 함수형 컴포넌트를 태그 VNode로 펼치기
   └─ scheduler.js          setState 업데이트 예약과 배칭
pages/
├─ phase1/               (Phase 1) 실제 영역 / 테스트 영역 / History 페이지
│  ├─ index.html, style.css
│  └─ phase1Page.js      페이지 컨트롤러
├─ phase2/               (Phase 2) 카운터, 입력, 할 일 데모 + 렌더링 로그
└─ app/                  (Phase 2) 최종 데모 앱 (예정)
scripts/devServer.js     개발용 정적 서버 (Node 내장 모듈만 사용)
tests/                   Vitest + jsdom 단위 / 기능 테스트
```

## 진행 현황

| Jira 이슈 | 상태 | 관련 파일 |
|---|---|---|
| [Phase1] DOM → Virtual DOM 변환 | 완료 | `src/vdom/*` |
| [Phase1] Diff 알고리즘 구현 | 완료 | `src/diff/diff.js`, `src/diff/diffProps.js` |
| [Phase1] Patch 알고리즘 구현 | 완료 | `src/diff/patch.js` |
| [Phase1] State History 구현 | 완료 | `src/history/stateHistory.js` |
| [Phase1] 테스트 페이지 구현 | 완료 | `pages/phase1` |
| [Phase2] FunctionComponent 구현 | 완료 | `src/core/functionComponent.js`, `resolveVNode.js` |
| [Phase2] useState 구현 | 완료 | `src/core/hooks.js`, `hookRuntime.js`, `scheduler.js` |
| [Phase2] useEffect / useMemo 구현 | 예정 | `src/core/hooks.js` |

## 설계

### VNode 구조

```js
// 요소 노드
{ type: 'div', props: { id: 'a' }, children: [ /* VNode */ ] }

// 텍스트 노드 (문자열 대신 객체로 통일 → diff 에서 분기 단순화)
{ type: '#text', props: {}, children: [], text: 'hello' }
```

변환 정책은 다음과 같습니다.

- 공백과 줄바꿈만 있는 텍스트 노드는 무시합니다.
- 주석 노드는 무시합니다.
- 태그 이름은 소문자로 저장합니다.
- `key`는 `props.key`로 보관하며, 실제 DOM 속성으로는 넣지 않습니다.
- `on*` 함수 props는 이벤트 리스너로, `value`와 `checked`는 DOM 프로퍼티로 설정합니다.

### Diff: 5가지 핵심 케이스

| 케이스 | 조건 | Patch |
|---|---|---|
| 1. 추가 | old 없음, new 있음 | `CREATE` |
| 2. 삭제 | old 있음, new 없음 | `REMOVE` |
| 3. 교체 | 태그(type) 또는 `key`가 다름, 텍스트 ↔ 요소 | `REPLACE` (하위 트리는 비교하지 않음) |
| 4. 텍스트 | 둘 다 텍스트, 내용이 다름 | `TEXT` |
| 5. 속성 | 같은 태그, 속성이 다름 | `PROPS` 후 자식을 같은 인덱스끼리 재귀 비교 |

각 patch는 루트부터의 자식 인덱스 경로 `path`(예: `[1, 0]`)를 가집니다.

### Patch

- `applyPatches(container, patches)`는 `container.childNodes[0]`을 VDOM 루트로 봅니다.
- **인덱스 밀림 방지**: DOM을 바꾸기 전에 모든 대상 노드를 먼저 찾아 둔 뒤(1단계), 노드 참조로 변경합니다(2단계).
- **전제**: container 안의 DOM은 `createElement(oldVNode)`로 그려진 것이어야 합니다. 사람이 쓴 HTML의 공백 텍스트 노드 때문에 인덱스가 어긋나는 것을 막기 위해서입니다. 어긋나면 명확한 에러를 던집니다.

### Phase 1 페이지

| 동작 | 처리 |
|---|---|
| 로드 | 실제 영역 → `domToVNode` → 공백 정규화 → VDOM으로 다시 그려 DOM과 VDOM을 일치시킴 → History[0] |
| Patch | 테스트 영역 HTML → `htmlToVNodes`(파싱, 정화, 정규화) → `diff` → `applyPatches` → History에 저장 |
| 뒤로/앞으로, 목록 클릭 | History의 VDOM으로 이동 → diff/patch로 실제 영역 갱신 + 테스트 영역 문자열 갱신 |
| 변경 없음 | DOM을 건드리지 않고 History에도 저장하지 않음 |
| 뒤로 간 뒤 Patch | 미래 기록을 버리고 새로 저장 |

- 실제 영역의 루트 요소(`#real-area`)는 고정하고, 테스트 영역은 루트의 자식만 편집합니다.
- 변경 로그에 patch 목록, 실제 DOM 변경 횟수(MutationObserver), 소요 시간, 전체 다시 그리기였을 때의 노드 수를 표시합니다.
- 바뀐 노드는 별도 레이어에 색 박스로 강조합니다. 실제 영역 DOM을 건드리지 않기 위해서입니다.
- 단축키: `Ctrl + Enter`는 Patch, `Tab`은 들여쓰기입니다.

### Phase 2: Component, State, Hooks

```
mountRoot(App, container)
  └─ new FunctionComponent(App).mount(container)
       └─ render()
            ├─ beginComponentRender(this)   현재 컴포넌트 등록, hookIndex = 0
            ├─ App(props)                    useState → claimHookSlot → hooks[0], hooks[1] ...
            ├─ resolveVNode(결과)            h(Child, props) → Child(props) 실행 → 태그 VNode
            └─ endComponentRender()
       └─ createElement(VDOM) → container에 처음 그림

클릭 → setState(next)
  ├─ 같은 값(Object.is)이면 종료
  ├─ hook.value = next
  └─ scheduleUpdate(component)       같은 틱의 여러 요청을 Set에 모음
        └─ (마이크로태스크) flushUpdates()
              └─ component.update()
                   ├─ render()                     새 VDOM
                   ├─ diff(이전 VDOM, 새 VDOM)      Phase 1 재사용
                   └─ applyPatches(container, …)   바뀐 부분만 실제 DOM에 반영
```

- **상태 유지**: 상태는 함수 밖 `component.hooks` 배열에 저장합니다. 렌더링마다 `hookIndex`를 0부터 다시 세서, 같은 순서로 호출된 훅이 같은 칸을 찾아갑니다.
- **훅 규칙 검사**
  - 컴포넌트 밖에서 호출하면 에러
  - 자식 컴포넌트 안에서 호출하면 에러 (상태는 루트에서만, Lifting State Up)
  - 렌더마다 훅 개수나 종류가 달라지면 에러
  - 렌더링 중 `setState`를 호출하면 에러
- **배칭**: `setState`를 여러 번 불러도 마이크로태스크에서 한 번만 렌더링합니다. 함수형 업데이트 `setState(prev => …)`는 누적됩니다.
- **자식 컴포넌트**: 인스턴스 없이 렌더링할 때마다 함수를 호출해 펼칩니다. `key`는 결과 태그로 옮깁니다.
- **이벤트**: 요소마다 이벤트 종류별 대리 리스너를 한 번만 등록하고, 실제 핸들러는 참조만 교체합니다. 렌더마다 새 함수가 만들어져도 리스너를 다시 등록하지 않습니다.
- **controlled input**: `value`가 이미 같으면 다시 넣지 않아 입력 중 커서가 튀지 않습니다. input 노드도 유지되어 포커스가 사라지지 않습니다.

### 알려진 한계

- 자식은 인덱스로 비교합니다. 그래서 리스트 맨 앞에 삽입하면 뒤 항목이 모두 변경으로 잡힙니다. `key` 기반 비교로 개선할 예정입니다.

## 테스트

| 파일 | 대상 |
|---|---|
| `tests/vdom.test.js` | `h`, `domToVNode`, `createElement`, `vnodeToHTML`, 왕복 변환 |
| `tests/diff.test.js` | 5가지 케이스와 조합, 엣지 케이스 |
| `tests/patch.test.js` | 결과 일치(정/역방향), MutationObserver로 최소 변경 검증, 노드·입력값 유지, 이벤트 교체 |
| `tests/index.test.js` | 공개 API 목록 |
| `tests/htmlToVNode.test.js` | HTML 파싱, 공백 정규화, XSS 정화 |
| `tests/stateHistory.test.js` | 이동, 미래 기록 삭제, 최대 개수, 불변성 |
| `tests/phase1Page.test.js` | 기능 테스트: 실제 `index.html`로 Patch, 뒤로/앞으로, 목록 이동, 보안 |
| `tests/functionComponent.test.js` | mount/update, useState, 배칭, 훅 규칙 위반, 자식 컴포넌트, 최소 patch, 이벤트 핸들러 교체 |
| `tests/phase2Page.test.js` | 기능 테스트: 카운터, 배칭, 입력 포커스 유지, 할 일 추가/토글/삭제, 렌더링 로그 |
