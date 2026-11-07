# Mini React

Vanilla HTML·CSS·JavaScript 또는 TypeScript로 두 단계의 미니 리액트를 만든다. Phase 1에서 만든 DOM 변환·Diff·Patch를 Phase 2의 컴포넌트 상태 갱신에 재사용한다.

## 현재 단계

P1-00의 화면 초기화를 구현하고 검증하는 단계다. 실제 영역의 샘플 DOM을 VNode로 읽어 직접 편집 가능한 테스트 영역을 만든다. Patch·뒤로가기·앞으로가기는 후속 작업이며 현재 비활성화돼 있다.

## 실행과 검증

Node.js와 npm을 사용한다. 저장소를 처음 받았거나 lockfile이 변경되면 의존성을 설치한 뒤 개발 서버를 실행한다.

```sh
npm ci
npm run dev
```

개발 서버는 개발 의존성 `http-server`로 정적 HTML·CSS·JavaScript 파일을 제공한다. `127.0.0.1:5173`에서 실행하며, `-c-1`로 캐시를 꺼 수정한 파일을 확인한다. Python 설치는 필요 없다. 도구 버전은 `package-lock.json`으로 재현한다. [환경 선택 이유](docs/decisions/0002-node-development-server.md)

- 데모: http://127.0.0.1:5173/demos/phase1/
- 단위·기능 검사: http://127.0.0.1:5173/tests/browser/p1-00.html

검증 페이지는 실제 브라우저 DOM으로 변환·렌더 단위 검사와 데모 iframe의 초기화·버튼·편집 가능 여부·원본 보존을 검사한다. 상단의 통과/실패 개수와 각 항목을 확인한다. JavaScript 모듈 로딩이 실패하면 검증 준비 중 상태에 머무르므로 이를 통과로 판단하지 않는다.

서버 구동·파일 응답 확인과 제품의 DOM 테스트 통과는 별도로 판단한다. Node.js는 파일을 제공하고 제품 코드와 DOM 테스트는 브라우저에서 실행한다.

직접 확인할 때는 데모에서 Tab 또는 클릭으로 테스트 영역에 들어가 문자를 입력·삭제하고, 실제 영역이 유지되는지 확인한다. 페이지를 새로고침하면 초기 샘플로 돌아온다. Diff·Patch·이력 이동, Phase 2, 폼의 현재 프로퍼티·이벤트 함수 복원은 이번 검증에 포함하지 않는다.

관련 이슈: [KJF-14](https://kylekim0868.atlassian.net/browse/KJF-14) · [승인한 초기화 계약](docs/decisions/0001-vnode-initialization.md)

## 작업 시작

1. [요구사항](docs/requirements.md)에서 이번 이슈가 충족할 기준을 찾는다.
2. [아키텍처 초안](docs/architecture.md)에서 해당 모듈의 책임과 결정할 계약을 확인한다.
3. VS Code의 Codex에서 `$mini-react-task-plan`을 선택하고 Jira 이슈키나 작업 설명을 전달한다.

[Codex 작업 지침](AGENTS.md) · [팀 개발 규칙 초안](TEAM_DEVELOPMENT_RULES.md) · [작업 계획 스킬](.agents/skills/mini-react-task-plan/SKILL.md)
