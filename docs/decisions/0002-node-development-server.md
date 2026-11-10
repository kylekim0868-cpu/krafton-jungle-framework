# Node.js 기반 정적 개발 서버

- 상태: 사용자 승인, 2026-11-07
- 근거: Node.js와 Python 서버의 차이 및 권장안을 설명한 뒤 사용자가 “nodejs로 프로젝트 환경 변경작업을 해줘”라고 요청
- 관련 작업: [KJF-14 / P1-00](https://kylekim0868.atlassian.net/browse/KJF-14)의 로컬 실행 환경 변경

## 결정과 이유

개발 서버는 Node.js 기반 `http-server`를 개발 의존성으로 설치한다. 기존 Python 내장 서버 실행 명령을 제거하여 npm 명령 실행에 Node와 Python이 모두 필요했던 구성을 Node/npm 환경으로 통일한다. 현재 필요한 기능이 정적 파일 제공이므로 직접 서버를 구현하거나 별도 빌드 시스템을 추가하지 않는다.

`http-server`는 제품 프레임워크가 아닌 개발 도구이며 VDOM·Diff·Patch·Hooks 로직을 대신하지 않는다. 정확한 패키지 버전은 `package.json`에 기록하고 전이 의존성은 `package-lock.json`으로 고정한다. 설치는 `npm ci`, 실행은 `npm run dev`를 사용한다.

서버는 `127.0.0.1:5173`에 바인딩하고 개발 중 캐시는 `-c-1`로 비활성화한다. 데모·검증 페이지의 경로와 브라우저에서 실행하는 제품 코드는 유지한다. `node_modules/`는 Git에서 제외한다.

## 검증과 한계

서버가 HTML·JavaScript를 올바른 MIME 타입과 캐시 정책으로 제공하는지 확인한다. 이는 브라우저에서 DOM 검사와 사용자 동작 검증을 실행하는 것과 별개다. 실제 검증 상태는 작업 결과에서 통과·실패·미실행으로 구분한다.

외부 패키지를 내려받는 설치 단계가 생긴다. lockfile과 npm의 재현 설치로 팀 환경을 맞춘다. 운영 배포 서버나 API 서버 도입은 이번 결정의 범위가 아니다.

참고: [http-server 공식 문서](https://github.com/http-party/http-server).
