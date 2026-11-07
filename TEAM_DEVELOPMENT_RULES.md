# Mini React 팀 개발 규칙

> **팀 검토 전 초안.** 팀 검토 후 확정한다. 아래 절차는 팀에서 사용할 운영안이며, 자동화는 실제 저장소와 Jira 설정을 확인하고 팀이 실행 범위를 승인한 뒤 적용한다.

작업할 때는 아래 표에서 해당하는 문서만 읽는다. 예를 들어 Diff를 구현할 때는 검증 기준과 담당 Jira 이슈를 먼저 확인하고, PR을 열 때는 Git·PR 규칙과 자동화·승인 조건을 함께 확인한다.

| 작업 | 읽을 문서 |
| --- | --- |
| 작업 시작과 분담, 브랜치·커밋·코딩 컨벤션, PR·리뷰·병합 | [개발 흐름과 Git·PR 규칙](docs/team/development-workflow.md) |
| 이슈 작성·분류, 완료 기준, Epic 계층 검토 | [Jira 이슈 관리](docs/team/jira-issues.md) |
| Phase별 합격 기준, 하네스, 라이프사이클 훅과 검증 게이트 | [Codex 작업 계약과 검증](docs/team/verification.md) |
| 자동 검사, 조건부 Git·Jira 작업, 사람의 승인 범위 | [Git·Jira 자동화와 승인](docs/team/automation.md) |
| 작업 전 참고할 정보, 작업 기록, 다음 작업으로 넘길 내용 | [컨텍스트와 메모리 관리](docs/team/context-and-memory.md) |

## 팀 검토 필요

- **기본 브랜치** — `main`과 `master` 중 실제 기본 브랜치를 확인한다. [개발 흐름과 Git·PR 규칙](docs/team/development-workflow.md)
- **Epic 계층** — 프로젝트 단일 Epic, 팀원별 Epic, Phase별 Epic 중 운영 방식을 결정한다. [Jira 이슈 관리](docs/team/jira-issues.md)

팀에서 확정한 뒤에는 [AGENTS.md](AGENTS.md)에 이 목차와 작업별 참고 기준을 연결한다. 상세 규칙은 담당 문서에서 갱신한다.

작성 근거는 [미니 리액트 구현 대화](chatgpt-conversation://6aee0ffd-1d74-83ec-a984-ba623e794146)와 작업 폴더의 `AGENTS.md`다.
