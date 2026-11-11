# Mini React

**DOM 편집과 상태 변경을 하나의 Diff·Patch 엔진으로 처리합니다.**

크래프톤 정글 팀 프로젝트 · HTML, CSS, Vanilla JavaScript, Node.js, Playwright

## 1. 프로젝트 목표와 구조

사용자 입력이 실제 DOM을 바꾸는 흐름을 구현하고, 브라우저에서 검증했습니다. Phase 1은 편집한 DOM을 읽고, Phase 2는 루트 컴포넌트를 실행해 새 VNode를 만듭니다. 두 Phase 모두 이전 VNode와 비교한 뒤 필요한 변경을 실제 DOM에 반영합니다.

![Phase 1은 편집한 DOM을 읽고, Phase 2는 루트 컴포넌트를 다시 실행합니다. 두 흐름 모두 새 VNode를 만든 뒤 Diff로 이전 VNode와 비교하고 Patch로 실제 DOM에 변경을 반영합니다](docs/images/architecture.png)

## 2. 두 가지 데모

### Phase 1 · 편집과 이력 복원

[Phase 1 데모 열기](http://127.0.0.1:5173/demos/phase1/)

![테스트 영역의 제목을 편집한 뒤 Patch를 누르기 전의 두 영역](docs/images/phase1-demo.png)

### Phase 2 · 상태 변경과 Hooks

[Phase 2 데모 열기](http://127.0.0.1:5173/demos/phase2/)

![이름과 카운터를 변경한 뒤 루트 실행 수와 Memo 계산 수가 표시된 화면](docs/images/phase2-demo.png)

## 3. 차별점과 검증

Phase 2 데모에서 **루트 실행, Memo 계산, DOM 변경**을 입력별로 확인할 수 있습니다. 최근 Diff 명령과 성공한 반영 횟수도 함께 기록합니다.

![이름 변경은 루트 실행 1회, Memo 재계산 0회, DOM 텍스트 변경 1건. 숫자 +1은 각각 1회, 1회, 2건. 기존 항목 1,000개 앞에 하나를 삽입했을 때 텍스트 변경은 위치 기준 1,000건, data-key 기준 0건](docs/images/differentiation.png)


## 4. AI 활용과 협업

팀이 입력과 기대 결과를 먼저 정하고, AI로 두 브랜치의 구현을 비교했습니다. 같은 Chromium 환경에서 동작을 확인한 뒤 통합 범위를 결정했습니다.

![입력과 기대 결과 합의, AI 코드 분석, Chromium 검증 순서. 팀은 YM의 엔진·Hooks·실패 복구와 YJ의 렌더·Memo 관찰 기능·타이머 데모를 통합하고 이름 변경, 숫자 증가, 타이머 정지를 다시 검증했습니다](docs/images/ai-collaboration.png)
