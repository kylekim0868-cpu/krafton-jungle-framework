# mini-react (yj)

Virtual DOM, Diff, Patch와 함수형 Component, Hooks를 Vanilla JavaScript로 직접 구현한 미니 리액트입니다.

- 브랜치: `feat/KJF-1-yj-mini-react` (팀원 yj의 독립 구현 브랜치)
- 저장소: [krafton-jungle-framework](https://github.com/kylekim0868-cpu/krafton-jungle-framework)

## 실행 방법

```bash
npm install
npm test          # 감시 모드 (저장할 때마다 재실행)
npm run test:run  # 1회 실행
```

## 폴더 구조

```
src/
├─ index.js              공개 API 진입점
├─ vdom/
│  ├─ h.js               VNode 생성 함수 h(), TEXT 상수
│  ├─ domToVNode.js      실제 DOM → VDOM
│  ├─ createElement.js   VDOM → 실제 DOM, 속성 설정/갱신
│  └─ vnodeToHTML.js     VDOM → HTML 문자열 (State History 이동 시 테스트 영역 표시용)
├─ diff/
│  ├─ diff.js            두 VDOM 비교 → patches 배열
│  ├─ diffProps.js       속성 비교
│  └─ patch.js           patches를 실제 DOM에 반영
└─ core/                 (Phase 2) FunctionComponent, Hooks
pages/
├─ phase1/               (Phase 1) 실제 영역 / 테스트 영역 / History 페이지
└─ app/                  (Phase 2) 데모 앱
tests/                   Vitest + jsdom 단위 테스트
```

## 진행 현황

| Jira 이슈 | 상태 | 관련 파일 |
|---|---|---|
| [Phase1] DOM → Virtual DOM 변환 | 완료 | `src/vdom/*` |
| [Phase1] Diff 알고리즘 구현 | 완료 | `src/diff/diff.js`, `src/diff/diffProps.js` |
| [Phase1] Patch 알고리즘 구현 | 완료 | `src/diff/patch.js` |
| [Phase1] State History 구현 | 예정 | |
| [Phase1] 테스트 페이지 구현 | 예정 | `pages/phase1` |
| [Phase2] FunctionComponent / useState / useEffect / useMemo | 예정 | `src/core` |

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

### 알려진 한계

- 자식은 인덱스로 비교합니다. 그래서 리스트 맨 앞에 삽입하면 뒤 항목이 모두 변경으로 잡힙니다. `key` 기반 비교로 개선할 예정입니다.

## 테스트

| 파일 | 대상 |
|---|---|
| `tests/vdom.test.js` | `h`, `domToVNode`, `createElement`, `vnodeToHTML`, 왕복 변환 |
| `tests/diff.test.js` | 5가지 케이스와 조합, 엣지 케이스 |
| `tests/patch.test.js` | 결과 일치(정/역방향), MutationObserver로 최소 변경 검증, 노드·입력값 유지, 이벤트 교체 |
| `tests/index.test.js` | 공개 API 목록 |
