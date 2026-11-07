# Mini React 아키텍처 초안

아래 구조는 작업을 나누기 위한 설계 제안이다. 모듈 사이의 공개 계약은 구현에 앞서 해당 작업에서 확정한다.

| 영역 | 책임 |
| --- | --- |
| `src/vdom/` | `domToVNode`로 DOM을 읽고 `createVNode`로 같은 형식의 VNode를 생성한다. `renderVNode`는 초기 DOM을 만들고, `diff`와 `patch`는 부분 갱신에 사용한다. |
| `demos/phase1/` | 실제·편집 영역과 버튼을 연결한다. `history.js`는 저장한 상태와 현재 이력 위치를 관리한다. |
| `src/component/` | 루트 `FunctionComponent`가 Hook 슬롯과 이전 VNode를 보관한다. 상태 변경 시 새 VNode를 얻어 공통 엔진에 전달한다. |
| `demos/phase2/` | 루트 마운트와 클릭·입력 시나리오를 담당한다. |
| `tests/unit/` · `tests/browser/` | 데이터·상태 계약과 실제 DOM 동작을 각각 검증한다. |

```text
Phase 1 편집 DOM → domToVNode ──┐
                               ├→ 이전·다음 VNode → diff → patch → 실제 DOM
Phase 2 상태 변경 → 루트 렌더 ──┘
```

## 첫 리뷰에서 정할 계약

- `domToVNode`의 입력 루트와 지원 노드, 요소·텍스트의 VNode 표현, 속성·텍스트·자식 순서 보존 범위
- `diff`의 변경 목록과 자식 위치 기준, `patch`의 적용 순서와 루트 교체 시 반환값
- 이력 초기 상태와 경계, 과거 상태에서 새로 Patch할 때 앞으로가기 이력 처리
- 루트 Hook 슬롯의 순서, Effect 실행과 정리 시점, 의존성 비교, Memo 재계산

P1-00 초기화에 필요한 VNode·입력 루트·지원 노드·편집 방식은 [결정 0001](decisions/0001-vnode-initialization.md)에 사용자 승인 근거와 함께 기록했다. 나머지 계약은 해당 작업에서 확정한다. 구현 파일이 있다는 사실과 요구사항 전체 수용은 구분한다.

## 개발 실행 환경

Node.js 기반 `http-server`는 저장소의 정적 파일을 제공하는 개발 도구다. VDOM 엔진과 화면 코드는 브라우저에서 실행하며 서버에 제품 로직을 두지 않는다. 환경 선택의 이유와 재현 방법은 [결정 0002](decisions/0002-node-development-server.md), 실제 실행법은 [README](../README.md)를 따른다.
