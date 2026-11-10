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
  dirtyComponents.add(component);
  if (isFlushScheduled) return;
  isFlushScheduled = true;
  queueMicrotask(flushUpdates);
}

/**
 * 예약된 업데이트를 지금 즉시 실행합니다.
 *  - 마이크로태스크에서 자동 호출되며, 테스트에서 동기적으로 결과를 확인할 때 직접 호출할 수도 있습니다.
 *  - 렌더링 도중 다시 setState 가 호출되면(예: Day 5 의 useEffect) 다음 마이크로태스크로 다시 예약됩니다.
 */
export function flushUpdates() {
  isFlushScheduled = false;
  const components = [...dirtyComponents];
  dirtyComponents.clear();
  for (const component of components) {
    if (component.isMounted) component.update();
  }
}
