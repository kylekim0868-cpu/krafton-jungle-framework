import { createVNode as h } from '../../src/vdom/createVNode.js';
import { useState, useEffect, useMemo } from '../../src/component/hooks.js';

export const AUTO_INCREMENT_INTERVAL_MS = 1000;

/** 자식은 부모가 넘긴 값과 이벤트 함수만 사용한다. */
function Counter({ count, doubled, onIncrement, onSameValue }) {
  return h('section', { 'data-counter': '' },
    h('p', { 'data-count': '' }, count),
    h('p', { 'data-double': '' }, `두 배 값 · ${doubled}`),
    h('div', { class: 'counter-actions' },
      h('button', { id: 'update-button', type: 'button', onClick: onIncrement }, '숫자 +1 · update()'),
      h('button', { id: 'same-value-button', type: 'button', onClick: onSameValue }, '같은 숫자 다시 설정')));
}

/** 루트의 세 Hook으로 입력·카운터·외부 작업을 연결하고 공통 VNode를 반환한다. */
export function App({ onEffect = () => {} }) {
  const [count, setCount] = useState(0);
  const [name, setName] = useState('미니 리액트');
  const [isAutoIncrement, setAutoIncrement] = useState(false);
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

  // YJ 타이머 예시의 동작을 YM Effect 계약으로 이식한다. count가 바뀌어도 타이머는 재등록하지 않는다.
  useEffect(() => {
    if (!isAutoIncrement) return;
    const timer = setInterval(() => setCount((value) => value + 1), AUTO_INCREMENT_INTERVAL_MS);
    onEffect('타이머 실행 · 1초마다 +1');
    return () => {
      clearInterval(timer);
      onEffect('타이머 정리 · 자동 증가 중지');
    };
  }, [isAutoIncrement]);

  return h('article', { 'data-component': 'app' },
    h('h2', {}, '루트 컴포넌트'),
    // 작성 중인 값은 입력 DOM에 두고, 버튼·Enter 제출에서만 State를 확정한다.
    // 타이핑마다 setter를 호출하지 않아 렌더·Effect 관찰 기록이 쌓이지 않는다.
    h('form', { class: 'name-form', onSubmit: (event) => {
      event.preventDefault();
      setName(event.currentTarget.elements.namedItem('name').value);
    } },
      h('label', { class: 'name-field' }, '이름',
        h('input', { id: 'name-input', name: 'name', type: 'text', value: name })),
      h('button', { type: 'submit' }, '이름 적용')),
    h('p', { 'data-greeting': '' }, `안녕하세요, ${name || '(빈 값)'}!`),
    h(Counter, { count, doubled, onIncrement: () => setCount((value) => value + 1),
      onSameValue: () => setCount(count) }),
    h('label', { class: 'auto-toggle' },
      h('input', { id: 'auto-increment', type: 'checkbox', checked: isAutoIncrement,
        onChange: (event) => setAutoIncrement(event.currentTarget.checked) }),
      '1초마다 자동 +1 · 끄거나 해제하면 타이머 정리'),
    h('p', {}, '숫자를 바꿔도 이 문단과 제목의 DOM은 유지됩니다.'));
}
