# Mini React

HTML·CSS·Vanilla JavaScript로 DOM 변환·Diff·Patch·이력을 만들고 같은 엔진으로 루트 컴포넌트와 Hooks를 구현한다.

## 아키텍처와 설계 이유

두 Phase가 **공통 VNode와 DOM 갱신 엔진**을 사용하도록 구성한다. 아래는 목표 흐름이며 실제 구현 상태는 [아키텍처 문서](docs/architecture.md#현재-소스와-책임)에서 확인한다.

```text
Phase 1: 편집 DOM → domToVNode ──────────────┐
                                          ├→ 공통 VNode
Phase 2: 루트 상태 → 루트 렌더·createVNode ──┘
  최초 표시: VNode → renderVNode → 새 DOM
  상태 갱신: 이전·다음 VNode → diff → patch → 기존 DOM 부분 갱신
```

| 구성 | 역할과 설계 이유 |
| --- | --- |
| 공통 VNode · `src/vdom/` | DOM과 컴포넌트의 결과를 같은 데이터 형태로 표현해 두 Phase에서 변환·렌더·Diff·Patch를 재사용한다. |
| `domToVNode` · `renderVNode` | 원본 DOM 읽기와 새 DOM 생성을 분리한다. 원본을 유지한 채 독립적인 편집 영역을 만들고 각 방향을 따로 검사한다. |
| `diff` · `patch` | 변경 계산과 실제 DOM 수정을 분리해 비교 로직을 독립적으로 검사하고 필요한 부분만 갱신한다. key가 있는 항목은 기존 DOM을 찾아 재사용한다. |
| `demos/phase1/` · `demos/phase2/` | 패널·버튼·이벤트 연결은 데모가 맡고 공통 엔진은 화면의 id나 편집 UI에 의존하지 않게 한다. |
| 루트 컴포넌트 · `src/component/` | 과제 조건에 따라 상태·Hooks·이전 VNode를 루트에서 관리하고 자식은 props만 받는다. 상태 변경에서 DOM 갱신까지의 흐름을 한곳에서 추적한다. |
| Phase 1 이력 · `history.js` | 편집 화면의 VNode 스냅샷과 위치를 관리한다. Phase 2의 Hook 상태와 구분하며 세부 저장·복구 계약은 결정 0003의 설계안이다. |
| `tests/unit/` · `tests/browser/` | 모듈의 데이터 계약과 실제 DOM·사용자 흐름을 각각 검사한다. 코드 구현·검사 통과·사용자 이해·수용을 구분한다. |
| Node.js · npm | 정적 파일 제공과 검증 도구 실행을 맡는다. 제품 로직은 브라우저에서 실행하고 lockfile로 개발 도구 버전을 맞춘다. |

## Markdown 문서 한눈에 보기

문서는 역할별로 원본을 한곳에 두고 이 README에는 요약과 링크를 모은다. 실제 작업에는 해당 요구사항과 관련 문서만 읽는다.

| 문서 | 핵심 내용·지침 |
| --- | --- |
| [README.md](README.md) | 프로젝트 구조와 설계 이유, 문서 안내, 실행 명령과 현재 검증 범위의 시작점. |
| [AGENTS.md](AGENTS.md) | 기존 변경을 보존하고 예시 합의 → 작은 구현 → 검증 → 짧은 설명 → 사용자 수용으로 진행한다. 중요 설계는 사용자와 결정하고 한글 주석을 유지한다. |
| [docs/requirements.md](docs/requirements.md) | Phase 1·2, 기술 제한, 테스트의 필수 요구사항 14개와 완료 기준을 정의한다. 작업별 예시·선행 조건·검증 계획을 연결한다. |
| [docs/architecture.md](docs/architecture.md) | 모듈 책임·데이터 흐름·실제 구현 상태·기존 결정의 적용 범위를 설명한다. Phase 2의 이벤트·프로퍼티·Hook 계약 등 남은 결정을 구분한다. |
| [TEAM_DEVELOPMENT_RULES.md](TEAM_DEVELOPMENT_RULES.md) | 현재 개인 브랜치의 Git·Jira 정책. 구현 시 기존 이슈부터 확인하고, Commit·Push는 직접 요청 또는 수용 후, PR은 별도 요청 때 실행한다. Codex는 병합하지 않는다. 팀 초안은 개인 승인과 구분한다. |
| [docs/decisions/](docs/decisions/) | 설계 선택의 배경·이유·영향과 승인 상태를 기록한다. 요구사항 자체나 모든 구현의 작업 일지는 아니며, 설계안과 사용자 승인된 결정을 구분한다. |
| [결정 0001 · 초기화](docs/decisions/0001-vnode-initialization.md) | **사용자 승인.** 요소·텍스트 VNode, 문자열 속성, 원본 보존과 새 DOM 생성, 편집 영역의 초기화 범위를 정한다. |
| [결정 0002 · 개발 서버](docs/decisions/0002-node-development-server.md) | **사용자 승인.** 정적 서버를 Node/npm으로 통일한 이유와 `http-server`·버전 고정·포트·캐시 설정을 기록한다. |
| [결정 0003 · Diff·Patch·이력](docs/decisions/0003-diff-patch-history-contract.md#항목별-승인-상태와-적용-단계) | **부분 승인·설계안.** 고정 데이터 루트·key 비교·실패 복구의 사용자 선택, 구현 세부 계약과 수용 상태를 구분한다. 이력은 P1-04에서 확정한다. |
| [mini-react-task-plan/SKILL.md](.agents/skills/mini-react-task-plan/SKILL.md) | 구현 전 요구사항 ID와 근거·범위·합격 기준과 검증·남은 결정을 짧게 정리한다. 계획 자체는 구현이나 Git·Jira 쓰기의 승인이 아니다. |

기본 작업 흐름은 **입출력 예시 합의 → 작은 구현 → 검증 → 코드 흐름 설명 → 사용자 수용**이다. 계획은 대화에 짧게 남기고 같은 내용을 여러 문서에 복제하지 않는다. Git·Jira 정책과 개별 결정 기록은 해당 작업이 필요할 때 확인한다.

## P1-00 이해하기: DOM과 VNode

### DOM 구조를 데이터로 분리한다는 뜻

DOM 노드는 브라우저가 문서를 관리하는 객체다. `domToVNode`는 여기서 태그·속성·텍스트·자식 순서를 읽어 일반 JavaScript 객체와 배열로 옮긴다. 이 프로젝트에서는 그 결과를 VNode라고 부른다. VNode의 필드 이름과 형태는 결정 0001에서 정한 프로젝트 계약이다.

```html
<p class="note">안녕</p>
```

위 DOM을 변환한 결과는 다음과 같다.

```js
const vnode = {
  kind: 'element',
  tag: 'p',
  props: { class: 'note' },
  children: [{ kind: 'text', text: '안녕' }],
};
```

VNode에는 원본 `p` 노드의 참조가 들어 있지 않다. `vnode.children[0].text = '반가워'`를 실행하면 이 객체의 값만 바뀌고 원본 DOM은 그대로다. 반대로 DOM을 편집해도 이미 만든 VNode는 자동으로 바뀌지 않는다. 다시 읽으려면 `domToVNode`를 호출해야 한다.

`renderVNode(vnode)`는 이 데이터를 읽어 별도의 새 DOM을 만든다. 데이터를 비교·보관하는 일과 브라우저 DOM을 만드는 일을 나눌 수 있고, 이후 Diff는 이전·다음 VNode를 비교해 변경을 계산할 수 있다. DOM에서 읽은 이벤트 함수·포커스·폼의 현재 프로퍼티 상태까지 담는 스냅샷은 아니다.

### nodeType의 숫자는 누가 정했나

`nodeType`은 브라우저가 제공하는 DOM 표준의 읽기 전용 속성이다. 함수 호출이 아니라 `node.nodeType`으로 값을 읽는다. 숫자의 의미는 표준에 정해져 있다.

| 숫자 | 표준 상수 이름 | 노드 예시 | 이 프로젝트의 변환 결과 |
| --- | --- | --- | --- |
| `1` | `Node.ELEMENT_NODE` | `<p>...</p>` 요소 | HTML 요소라면 요소 VNode |
| `3` | `Node.TEXT_NODE` | `안녕`이라는 글자 부분 | 텍스트 VNode |
| `8` | `Node.COMMENT_NODE` | `<!-- 메모 -->` | `null`을 반환해 제외 |

예를 들어 `node.nodeType === 3`과 `node.nodeType === Node.TEXT_NODE`는 같은 종류를 검사한다. 숫자의 의미는 DOM 표준이고, 주석을 `null`로 변환해 제외하는 처리는 이 프로젝트가 선택한 동작이다. [MDN: nodeType](https://developer.mozilla.org/en-US/docs/Web/API/Node/nodeType)

### children과 childNodes를 구분하는 이유

브라우저는 태그 사이의 글자도 별도 텍스트 노드로 관리한다. 다음 `p`의 바로 아래에는 글자·요소·글자 세 개가 있다.

```html
<p>앞<strong>중간</strong>뒤</p>
```

```text
p
├─ 텍스트 노드: "앞"
├─ strong 요소
│  └─ 텍스트 노드: "중간"
└─ 텍스트 노드: "뒤"

p.children   → [strong 요소]
p.childNodes → [텍스트 노드 "앞", strong 요소, 텍스트 노드 "뒤"]
```

`children`은 바로 아래의 요소만, `childNodes`는 텍스트·주석을 포함한 바로 아래의 모든 노드를 읽는다. 따라서 `children`만 순회하면 `앞`과 `뒤`를 놓친다. `childNodes`로 세 자식을 차례로 읽고 `strong` 안에서도 같은 처리를 반복해야 전체 글자와 순서가 보존된다. 공백·줄바꿈도 텍스트 노드에 들어갈 수 있으며 현재 변환은 이를 지우지 않는다. [MDN: childNodes](https://developer.mozilla.org/en-US/docs/Web/API/Node/childNodes)

단, `vnode.children`은 위에서 직접 만든 배열이다. DOM의 `element.children`처럼 요소만 담는 규칙이 없으며 요소·텍스트 VNode를 모두 담는다.

관련 코드: [DOM → VNode](src/vdom/domToVNode.js), [VNode → 새 DOM](src/vdom/renderVNode.js), [초기화 연결](demos/phase1/main.js).

## 실행과 검증

Node.js 22 이상과 npm을 사용한다. 처음 받았거나 lockfile이 바뀌었을 때 의존성을 설치한다.

```sh
npm ci
npm run dev
```

- 데모: http://127.0.0.1:5173/demos/phase1/
- P1-00·P1-01 DOM 검사 화면: http://127.0.0.1:5173/tests/browser/p1-00.html
- P1-02 Diff·Patch 검사 화면: http://127.0.0.1:5173/tests/browser/p1-02.html

자동 브라우저 검사를 처음 실행할 때는 Chromium을 설치한다.

```sh
npm run test:install
npm run verify
```

| 명령 | 확인하는 것 |
| --- | --- |
| `npm run check` | JS 구문, JSON, Markdown 상대 링크의 존재, 줄 끝 공백, lockfile 일치와 제품 의존성 유무 |
| `npm test` | Playwright 17개: 기존 4개(내부 변환·렌더 27개와 초기화 5개 포함), P1-02 13개(내부 Diff·Patch 20개, 화면·Enter 편집·실패 복구·성능 측정 포함) |
| `npm run verify` | 위 두 명령을 순서대로 실행. 전체 과제의 완성을 증명하는 명령은 아님 |

Playwright는 전용 서버 `127.0.0.1:4173`을 시작·종료한다. 수동 개발 서버의 5173과 구분하며 4173을 다른 프로세스가 사용하면 검증 전에 확인한다.

기존 서버를 유지하려면 비어 있는 포트를 지정한다. 예: `MINI_REACT_TEST_PORT=4174 npm run verify`. 지정한 서버는 재사용하지 않고 검증 전용으로 실행·종료한다.

P1-01 검사는 대표 입력 `<p class="note">안녕</p>`, 문자열 속성과 실제 문자, 빈·연속 텍스트, 형제 순서, 중첩·빈 `template`, 주석 제외, 지원 밖 노드 거부, 원본·VNode·새 DOM의 독립성을 확인한다. 폼은 HTML 속성을 보존하며 사용자가 바꾼 현재 `value`·`checked`는 복사하지 않는 계약도 검사한다. DOM 검사 화면에서 각 항목과 전체 **32개**의 결과를 확인할 수 있다.

새 동작은 해당 모듈의 정상·경계 사례를 검사하고 DOM이나 사용자 흐름을 바꾸면 실제 브라우저 검사도 연결한다. 새 테스트를 작성한 뒤 같은 명령으로 실행하며 아직 없는 검사를 통과로 표시하지 않는다.

직접 확인할 때는 데모에서 Tab 또는 클릭으로 테스트 영역에 들어가 입력·삭제한 뒤 Patch 전에는 실제 영역이 유지되는지 본다. Patch를 누르면 두 영역에 편집 결과가 반영되어야 하며 뒤로·앞으로 버튼은 비활성이다. 한글 IME 조합, 포커스 이동과 시각적 사용성은 직접 확인한다. 준비 중에 머무르거나 모듈 로딩이 실패하면 통과가 아니다. 서버의 파일 응답만으로 DOM 동작이 검증됐다고 판단하지 않는다.

P1-02 모듈 검사는 기본 변경·key 삽입과 이동·혼합 자식·주석/공백/template 경로·오류 전 검증을 확인한다. 브라우저 검사는 적용 도중 실패하면 두 영역 복구, 복구 실패 시 편집·Patch 잠금과 재시도를 확인한다. `data-key`는 같은 부모 안에서 고유하고 비어 있지 않은 문자열이어야 한다. 없는 항목은 위치 기준으로 비교한다.

편집 영역에서 Enter로 목록을 분할하면 브라우저가 새 항목에 기존 `data-key`도 복사할 수 있다. 데모는 이런 구조 변경 입력에서 새로 복제된 중복 항목에만 `editor-번호` key를 한 번 부여하고 기존 노드의 key는 유지한다. Patch 후 새 편집 DOM도 다시 추적하며, 일반 텍스트 입력에서는 이 순회를 하지 않는다. 임의의 기존 노드를 같은 key로 수정한 경우에는 엔진이 계속 중복 오류를 표시한다.

성능 검사는 동일·앞 삽입·중간 삭제·순환 이동을 100개·1,000개 목록에서 key 유무로 비교한다. 각 조건은 예열 1회 후 3회의 중앙값을 기록하고, 실행 시간과 MutationObserver의 텍스트 변경·노드 추가/제거 건수를 구분한다. 이동 1회는 추가·제거 기록이 각각 생길 수 있다. 결과는 터미널과 `test-results/`의 `performance.json`에 남는다. 측정 구간은 Diff와 Patch의 JS·DOM 작업이며 페인트·편집 영역 정규화는 제외한다. 특정 속도 배율이나 모든 상황의 성능 우위는 합격 기준이 아니다.

자동 검사는 P1-03의 전체 복합 회귀·이력·Phase 2를 다루지 않는다. 결과는 **통과 / 실패 / 미실행**과 확인한 범위를 함께 보고한다.

Phase 1의 요구사항별 합격 기준·후속 검사·통합 수동 절차는 [검증 연결표](docs/requirements.md#phase-1-완료-기준과-검증-연결)를 따른다. Jira 연결 장애 시 로컬 작업의 진행 범위는 [개인 작업 정책](TEAM_DEVELOPMENT_RULES.md#연결-장애-시-진행-범위)을 확인한다.

## 차별화 전략: 프로젝트 대시보드

[미니 리액트 프로젝트 대시보드 열기](https://mini-react-lab-261110.kylekim0868.chatgpt.site)

기능별 **구현·테스트·설명 준비**와 Jira·GitHub 검증을 함께 추적하기 위해 GPT에 요청해 제작한 보조 대시보드다. 구현 결과에 검증 근거와 핵심 코드·설계 이유의 설명 준비를 연결해, 개발 과정과 학습 과정을 함께 보여주는 것을 차별화 전략으로 삼는다.

대시보드는 접근 권한이 있는 계정에서 열 수 있다.

### 검증 결과의 게시 절차

1. 실제 실행 결과를 [결과 기록 원칙](TEAM_DEVELOPMENT_RULES.md#pr과-결과-기록)에 따라 해당 작업의 결과 보고에 남긴다. 검사 결과·설명 준비·사용자 수용·게시 상태를 각각 구분한다.
2. 해당 요구사항 ID의 리포트를 등록·수정할 수 있는 승인된 경로가 확인되면 요약과 접근 가능한 원본 링크를 연결한다. 링크가 없으면 결과의 식별 정보와 필요한 요약을 남기고 링크를 만들지 않는다. 등록 후 다시 읽어 ID·검증 대상·결과가 저장됐는지 확인한 뒤 **게시 완료**로 표시한다.
3. 등록 경로가 없거나 저장을 확인할 수 없으면 **게시 대기 또는 게시 확인 불가**와 사유를 보고한다. 원본 결과 보고로 구현·검증을 이어가며 이를 대시보드 반영 성공으로 표시하지 않는다. 사이트 배포 성공이나 링크 존재만으로 리포트 저장을 증명하지 않는다.

## 참고한 작업 방식

[superpowers](https://github.com/obra/superpowers)의 [작업 분할](https://github.com/obra/superpowers/blob/main/skills/writing-plans/SKILL.md), [실행 증거에 따른 검증](https://github.com/obra/superpowers/blob/main/skills/verification-before-completion/SKILL.md), [원인부터 찾는 디버깅](https://github.com/obra/superpowers/blob/main/skills/systematic-debugging/SKILL.md) 원칙을 참고했다. 플러그인·외부 스킬·자동화를 설치한 것은 아니다.
