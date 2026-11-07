# P1-00 초기화의 VNode와 편집 계약

- 상태: 사용자 승인, 2026-11-07
- 근거: P1-00 구현 대화에서 제안한 초기 계약에 사용자가 “제안한 계약으로 진행”이라고 응답
- 요구사항: P1-00, 초기화에 필요한 P1-01의 최소 변환·렌더 연결
- Jira: [KJF-14](https://kylekim0868.atlassian.net/browse/KJF-14), 상위 Epic KJF-2 / YM-mini-react. 생성 후 부모·제목·본문 저장을 재조회로 확인

## 결정

요소는 `{ kind: 'element', tag, props, children }`, 텍스트는 `{ kind: 'text', text }`로 표현한다. `props`는 HTML 속성 이름과 문자열 값의 객체다. 텍스트에는 공백을 그대로 포함하며 자식 순서를 유지한다.

`domToVNode(node)`는 전달한 노드 자신을 읽고 입력 DOM을 변경하지 않는다. HTML 요소·텍스트를 지원하며 주석은 제외한다. 주석 자체를 입력하면 `null`을 반환한다. SVG 등 다른 네임스페이스의 요소, Document·DocumentFragment 등 지원하지 않는 노드는 오류 처리한다. template의 자식은 `content`에서 읽는다.

`renderVNode(vnode)`는 새 DOM 노드를 반환한다. 호출자가 마운트 위치를 결정한다. 텍스트 노드는 `createTextNode`로 만들고 속성은 `setAttribute`로 반영한다. template의 자식은 `content`에 넣는다. DOM에서 읽은 이벤트 함수, 폼 요소의 현재 프로퍼티 상태는 이번 계약에 포함하지 않는다.

실제 영역의 샘플 article을 VNode 루트로 사용한다. 두 영역의 UI 컨테이너는 VNode에 포함하지 않는다. 테스트 영역은 `contenteditable`로 렌더된 DOM을 직접 편집한다. 초기화는 `domToVNode` 결과를 `renderVNode`로 렌더하며 원본 노드를 복제하거나 HTML 문자열을 복사해 우회하지 않는다.

P1-00에서는 Patch·뒤로가기·앞으로가기 버튼을 표시하되 비활성화한다. Diff·Patch·이력 이동은 후속 작업이다.

## 이유와 영향

두 Phase가 공통으로 사용할 요소/텍스트 표현을 먼저 정하고, 화면 초기화를 실제 변환 경로로 검증한다. 패널의 편집 속성과 실제 콘텐츠 속성을 분리하기 위해 샘플 article을 변환한다. contenteditable의 편집 결과는 브라우저 DOM 규칙을 따른다.

Phase 2의 이벤트 표현과 상태 프로퍼티, 자식 비교 기준은 아직 결정하지 않았다. 이후 확장 시 이 계약과의 호환성과 기존 테스트를 확인해야 한다. 초기화 검증 통과만으로 P1-01 전체 범위 또는 후속 요구사항 수용을 선언하지 않는다.
