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
  //keys 로 객체에 들어있는 값은 빼고 키 이름들만 배열로 나열해 줌
  for (const name of Object.keys(newProps)) {
    //Object.is(a, b)를 쓴 이유: ===와 거의 같지만, 자바스크립트 특유의 기괴한 문법인 NaN === NaN이 false가 되는 문제를 true로 정상 판별해주고,
    //+0과 -0을 구분해 주는 더 안전하고 정확한 동등 비교 연산입니다.
    if (!Object.is(oldProps[name], newProps[name])) {
      changes.push({ name, oldValue: oldProps[name], newValue: newProps[name] });
    }
  }

  // 2) 이전 props 기준: 새 props 에는 없는(=삭제된) 속성
  for (const name of Object.keys(oldProps)) {
    //이전 props 의 키가 새 props 에도 있는지 검사 (없으면 삭제된 속성)
    if (!(name in newProps)) {
      changes.push({ name, oldValue: oldProps[name], newValue: undefined });
    }
  }
  //정리: 1) 은 새 props 기준으로 '추가/변경', 2) 는 이전 props 기준으로 '삭제' 를 찾습니다.


  return changes; //변경 사항 저장하는 오브젝트 타입 배열
}
