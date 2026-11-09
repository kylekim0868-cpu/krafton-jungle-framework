export const TEXT = '#text'; //일반 태그와 순수 텍스트를 구분하기 위한 식별자 상수입니다.

/*
    숫자나 불리언이 들어와도 화면에 글자로 안전하게 렌더링되도록 String(text)로 강제 변환하며, 
    자식이 없는 빈 배열(children: [])을 가진 VNode 객체로 만들어 반환합니다.
*/
export function createTextVNode(text) {
  return { type: TEXT, props: {}, children: [], text: String(text) };
}

export function h(type, props, ...children) {
  return {
    type, //이부분이 태그의 타입으로 결정
    props: props ?? {},  //이부분이 태그의 속성으로 결정
    children: children  //이부분이 태그안에 있는 내용 또는 태그로 결정
      .flat(Infinity)  // 배열 children 펼치기
      .filter(c => c != null && c !== false && c !== true) // 조건부 렌더링 대응
      //자식으로 들어온 원소가 이미 VNode 객체라면 그대로 통과 
      .map(c => (typeof c === 'object' ? c : createTextVNode(c))),
  };
}

/*
최종적으로 vdom 을 반환
{
  type: '',
  props: { id: '', class: '' }, 
  children: [ ... ]
}
*/

/*
<div>
  <p>안녕하세요</p>
</div>

아래와 같이 나타낼 수 있음

{
  type: 'div',
  props: {}, // 👈 1. 빈 객체 ({ id: '', class: '' } 아님)
  children: [
    {
      type: 'p',
      props: {}, 
      children: [
        {
          type: '#text',
          props: {},
          children: [],
          text: '안녕하세요' // 👈 2. children에 글자를 넣는 게 아니라 text 필드에 저장
        }
      ]
    }
  ]
}
*/