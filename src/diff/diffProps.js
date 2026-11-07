// 두 props 객체를 비교해서 "바뀐 속성 목록"을 만드는 함수
//
// 반환 형태: [{ name, oldValue, newValue }, ...]
//  - 추가: oldValue === undefined
//  - 변경: oldValue !== newValue
//  - 삭제: newValue === undefined
//
// oldValue 까지 같이 넘기는 이유:
//  onClick 같은 이벤트 핸들러가 바뀌면 "이전 함수"를 알아야 removeEventListener 로 떼어낼 수 있기 때문입니다.
export function diffProps(oldProps = {}, newProps = {}) {
  const changes = [];

  // 1) 새 props 기준: 추가되었거나 값이 바뀐 속성
  for (const name of Object.keys(newProps)) {
    // Object.is: === 와 거의 같지만 NaN === NaN 을 true 로 처리
    if (!Object.is(oldProps[name], newProps[name])) {
      changes.push({ name, oldValue: oldProps[name], newValue: newProps[name] });
    }
  }

  // 2) 이전 props 기준: 새 props 에는 없는(=삭제된) 속성
  for (const name of Object.keys(oldProps)) {
    if (!(name in newProps)) {
      changes.push({ name, oldValue: oldProps[name], newValue: undefined });
    }
  }

  return changes;
}
