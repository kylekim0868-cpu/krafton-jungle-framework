import { createVNode as h } from '../../src/vdom/createVNode.js';
import { useState, useEffect, useMemo } from '../../src/component/hooks.js';

/** 자식은 부모가 넘긴 값과 이벤트 함수만 사용한다. */
function Counter({ count, doubled, onIncrement }) {
  return h('section', { 'data-counter': '' },
    h('p', { 'data-count': '' }, count),
    h('p', { 'data-double': '' }, `두 배 값 · ${doubled}`),
    h('button', { id: 'update-button', type: 'button', onClick: onIncrement }, '숫자 +1 · update()'));
}

/** 루트의 세 Hook으로 입력·카운터·외부 작업을 연결하고 공통 VNode를 반환한다. */
export function App({ onEffect = () => {} }) {
  const [count, setCount] = useState(0);
  const [name, setName] = useState('미니 리액트');
  const doubled = useMemo(() => count * 2, [count]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${name || '미니 리액트'} · ${count}`;
    const onKeyDown = (event) => {
      if (event.key === '+' && event.target === document.body) setCount((value) => value + 1);
    };
    window.addEventListener('keydown', onKeyDown);
    onEffect(`실행 · 이름 ${name || '(빈 값)'} / 숫자 ${count}`);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.title = previousTitle;
      onEffect(`정리 · 이름 ${name || '(빈 값)'} / 숫자 ${count}`);
    };
  }, [count, name]);

  return h('article', { 'data-component': 'app' },
    h('h2', {}, '루트 컴포넌트'),
    h('label', { class: 'name-field' }, '이름',
      h('input', { id: 'name-input', type: 'text', value: name,
        onInput: (event) => setName(event.currentTarget.value) })),
    h('p', { 'data-greeting': '' }, `안녕하세요, ${name || '(빈 값)'}!`),
    h(Counter, { count, doubled, onIncrement: () => setCount((value) => value + 1) }),
    h('p', {}, '숫자를 바꿔도 이 문단과 제목의 DOM은 유지됩니다.'));
}
