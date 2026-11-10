/*
  업데이트 스케줄러 (Batching)

  문제: 클릭 한 번에 setA(); setB(); setC(); 를 부르면 렌더링이 3번 일어난다.
  해결: setState 는 "다시 그려야 함" 표시만 하고, 실제 렌더링은 현재 작업(이벤트 핸들러)이 끝난 직후
       마이크로태스크에서 한 번에 처리한다.

    click 핸들러 ─ setA() → 예약(마이크로태스크 1개 등록)
                 ─ setB() → 이미 예약됨, 무시
                 ─ setC() → 이미 예약됨, 무시
    핸들러 종료 → 마이크로태스크 → flushUpdates() → update() 1번 → diff/patch 1번

  React 18 의 automatic batching 과 같은 아이디어입니다.
*/

const dirtyComponents = new Set(); // 다시 그려야 하는 컴포넌트 (Set 이라 중복 등록 자동 제거)
let isFlushScheduled = false;

/**
 * 컴포넌트 업데이트를 예약합니다. 같은 틱 안의 여러 요청은 한 번의 렌더링으로 합쳐집니다.
 */
export function scheduleUpdate(component) {
  dirtyComponents.add(component); // 1. 장부에 "이 컴포넌트 다시 그려야 함" 등록
  if (isFlushScheduled) return; // 2. 이미 기사님(flushUpdates)을 불렀다면 그냥 통과
  isFlushScheduled = true; // 3. 기사님 호출 플래그 켜기
  queueMicrotask(flushUpdates);  // 4. 자바스크립트 마이크로태스크 큐에 작업 예약
  /*
    queueMicrotask는 브라우저 이벤트 루프 API입니다.
    지금 실행 중인 자바스크립트 코드(사용자의 클릭 이벤트 핸들러)가 완전히 끝나자마자 
    브라우저가 화면을 그리기 직전의 그 찰나의 순간에 flushUpdates를 실행해라!라는 뜻입니다.
  */
}

/**
 * 예약된 업데이트를 지금 즉시 실행합니다.
 *  - 마이크로태스크에서 자동 호출되며, 테스트에서 동기적으로 결과를 확인할 때 직접 호출할 수도 있습니다.
 *  - 렌더링 도중 다시 setState 가 호출되면(예: Day 5 의 useEffect) 다음 마이크로태스크로 다시 예약됩니다.
 */
export function flushUpdates() {
  isFlushScheduled = false; // 1. 예약 스위치 리셋 (다음 예약을 받을 수 있게)
  const components = [...dirtyComponents]; // 2. 장부에 적힌 컴포넌트들을 복사해옴
  dirtyComponents.clear();  // 3. 원래 장부는 깨끗이 비움
  for (const component of components) { 
    if (component.isMounted) component.update();  // 4. 컴포넌트의 update()를 딱 1번만 실행!
  }
}
