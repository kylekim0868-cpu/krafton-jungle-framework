import { describe, it, expect, vi } from 'vitest';
import { h } from '../src/vdom/h.js';
import { FunctionComponent, mountRoot } from '../src/core/functionComponent.js';
import { useState } from '../src/core/hooks.js';
import { flushUpdates } from '../src/core/scheduler.js';

const container = () => document.createElement('div');
const nextTick = () => Promise.resolve(); // 예약된 마이크로태스크(flushUpdates)가 먼저 실행됨

// 테스트용 카운터: 렌더링될 때마다 외부 배열에 기록
function createCounter() {
  const renders = [];
  let api;
  function Counter() {
    const [count, setCount] = useState(0);
    api = { count, setCount };
    renders.push(count);
    return h('p', null, `count: ${count}`);
  }
  return { Counter, renders, get api() { return api; } };
}

describe('FunctionComponent - mount / update', () => {
  it('mount 하면 함수를 실행해 container 에 그린다', () => {
    const root = mountRoot(() => h('h1', { id: 't' }, 'hi'), container());
    expect(root.container.innerHTML).toBe('<h1 id="t">hi</h1>');
    expect(root.isMounted).toBe(true);
    expect(root.renderCount).toBe(1);
  });

  it('함수가 아니면 에러', () => {
    expect(() => new FunctionComponent('App')).toThrow(/함수형 컴포넌트/);
  });

  it('두 번 mount 하면 에러', () => {
    const root = mountRoot(() => h('p'), container());
    expect(() => root.mount(container())).toThrow(/이미 마운트/);
  });

  it('null 을 반환하면 아무것도 그리지 않는다', () => {
    const root = mountRoot(() => null, container());
    expect(root.container.innerHTML).toBe('');
  });

  it('props 를 루트 함수에 넘긴다', () => {
    const root = mountRoot(({ name }) => h('p', null, name), container(), { name: 'yj' });
    expect(root.container.textContent).toBe('yj');
  });
});

describe('useState', () => {
  it('setState 하면 다시 렌더링되고, 상태가 유지된다 (hooks 배열)', async () => {
    const t = createCounter();
    const root = mountRoot(t.Counter, container());
    t.api.setCount(1);
    await nextTick();
    expect(root.container.textContent).toBe('count: 1');
    expect(root.hooks[0].value).toBe(1);
    t.api.setCount(5);
    await nextTick();
    expect(t.renders).toEqual([0, 1, 5]);
  });

  it('여러 번 setState 해도 렌더링은 한 번 (batching)', async () => {
    const t = createCounter();
    const root = mountRoot(t.Counter, container());
    t.api.setCount((c) => c + 1);
    t.api.setCount((c) => c + 1);
    t.api.setCount((c) => c + 1);
    expect(root.renderCount).toBe(1); // 아직 렌더링 전
    await nextTick();
    expect(root.renderCount).toBe(2);
    expect(root.container.textContent).toBe('count: 3');
  });

  it('값으로 넣으면 같은 렌더 안의 count 를 기준으로 하므로 +1 만 된다 (함수형 업데이트와 비교)', async () => {
    const t = createCounter();
    const root = mountRoot(t.Counter, container());
    const { count, setCount } = t.api;
    setCount(count + 1);
    setCount(count + 1);
    await nextTick();
    expect(root.container.textContent).toBe('count: 1');
  });

  it('같은 값이면 다시 렌더링하지 않는다', async () => {
    const t = createCounter();
    const root = mountRoot(t.Counter, container());
    t.api.setCount(0);
    await nextTick();
    expect(root.renderCount).toBe(1);
  });

  it('초기값 함수는 첫 렌더링에서 한 번만 실행된다', async () => {
    const init = vi.fn(() => 10);
    let setValue;
    function App() {
      const [value, set] = useState(init);
      setValue = set;
      return h('p', null, value);
    }
    const root = mountRoot(App, container());
    setValue(11);
    await nextTick();
    expect(init).toHaveBeenCalledTimes(1);
    expect(root.container.textContent).toBe('11');
  });

  it('setState 함수는 렌더링이 바뀌어도 같은 참조다', async () => {
    const setters = [];
    function App() {
      const [value, setValue] = useState(0);
      setters.push(setValue);
      return h('p', null, value);
    }
    mountRoot(App, container());
    setters[0](1);
    await nextTick();
    expect(setters[1]).toBe(setters[0]);
  });

  it('useState 여러 개는 호출 순서로 구분된다', async () => {
    let api;
    function App() {
      const [a, setA] = useState('a');
      const [b, setB] = useState('b');
      api = { setA, setB };
      return h('p', null, `${a}${b}`);
    }
    const root = mountRoot(App, container());
    api.setB('B');
    await nextTick();
    expect(root.container.textContent).toBe('aB');
    expect(root.hooks.map((hook) => hook.value)).toEqual(['a', 'B']);
  });

  it('flushUpdates 로 예약된 업데이트를 즉시 실행할 수 있다', () => {
    const t = createCounter();
    const root = mountRoot(t.Counter, container());
    t.api.setCount(7);
    flushUpdates();
    expect(root.container.textContent).toBe('count: 7');
  });

  it('언마운트 후 setState 는 무시된다', async () => {
    const t = createCounter();
    const root = mountRoot(t.Counter, container());
    root.unmount();
    t.api.setCount(1);
    await nextTick();
    expect(root.container.innerHTML).toBe('');
    expect(root.renderCount).toBe(1);
  });
});

describe('Hook 규칙 위반 감지', () => {
  it('컴포넌트 밖에서 훅을 호출하면 에러', () => {
    expect(() => useState(0)).toThrow(/렌더링하는 중에만/);
  });

  it('자식 컴포넌트에서 훅을 호출하면 에러 (상태는 루트에서만)', () => {
    function Child() {
      useState(0);
      return h('span');
    }
    expect(() => mountRoot(() => h('div', null, h(Child)), container())).toThrow(/루트 컴포넌트에서만/);
  });

  it('조건문 때문에 훅 개수가 바뀌면 에러', async () => {
    let api;
    function App() {
      const [show, setShow] = useState(false);
      if (show) useState('extra');
      api = { setShow };
      return h('p');
    }
    const root = mountRoot(App, container());
    api.setShow(true);
    expect(() => flushUpdates()).toThrow(/훅 호출 개수가 바뀌었습니다/);
    expect(root.isRendering).toBe(false);
  });

  it('렌더링 중 setState 는 에러 (무한 루프 방지)', () => {
    function App() {
      const [value, setValue] = useState(0);
      setValue(value + 1);
      return h('p');
    }
    expect(() => mountRoot(App, container())).toThrow(/렌더링 중에는 setState/);
  });
});

describe('자식 컴포넌트 (Stateless) 와 Lifting State Up', () => {
  it('부모 상태를 props 로 받아 그리고, 콜백으로 부모 상태를 바꾼다', async () => {
    function Display({ value }) {
      return h('strong', null, value);
    }
    function IncrementButton({ onIncrement, children }) {
      return h('button', { type: 'button', onClick: onIncrement }, ...children);
    }
    function App() {
      const [count, setCount] = useState(0);
      return h('div', null,
        h(Display, { value: count }),
        h(IncrementButton, { onIncrement: () => setCount((c) => c + 1) }, '+1'),
      );
    }
    const root = mountRoot(App, container());
    expect(root.container.innerHTML).toBe('<div><strong>0</strong><button type="button">+1</button></div>');
    root.container.querySelector('button').click();
    await nextTick();
    expect(root.container.querySelector('strong').textContent).toBe('1');
  });

  it('자식이 null 을 반환하면 그 자리는 비워진다', () => {
    const Hidden = () => null;
    const root = mountRoot(() => h('div', null, h(Hidden), h('p', null, 'x')), container());
    expect(root.container.innerHTML).toBe('<div><p>x</p></div>');
  });
});

describe('Phase 1 연계: 바뀐 부분만 patch', () => {
  it('상태가 바뀌면 diff/patch 로 텍스트 노드 하나만 바뀐다', async () => {
    let setCount;
    function App() {
      const [count, set] = useState(0);
      setCount = set;
      return h('div', null, h('h1', null, '제목'), h('p', null, count), h('input', { type: 'text' }));
    }
    const root = mountRoot(App, container());
    const input = root.container.querySelector('input');
    const observer = new MutationObserver(() => {});
    observer.observe(root.container, { subtree: true, childList: true, attributes: true, characterData: true });

    setCount(1);
    flushUpdates();

    const records = observer.takeRecords();
    expect(records).toHaveLength(1);
    expect(records[0].type).toBe('characterData');
    expect(root.container.querySelector('input')).toBe(input); // input 노드 유지
  });

  it('onCommit 으로 적용된 patch 를 알려준다', async () => {
    const commits = [];
    let setText;
    function App() {
      const [text, set] = useState('a');
      setText = set;
      return h('p', null, text);
    }
    mountRoot(App, container(), {}, { onCommit: (info) => commits.push(info) });
    setText('b');
    await nextTick();
    expect(commits.map((c) => c.isInitial)).toEqual([true, false]);
    expect(commits[1].patches[0]).toMatchObject({ type: 'TEXT', text: 'b' });
  });

  it('렌더링마다 새로 만들어진 이벤트 핸들러도 최신 것이 호출된다', async () => {
    let clicks = 0;
    let setLabel;
    function App() {
      const [label, set] = useState('v1');
      setLabel = set;
      return h('button', { onClick: () => { clicks += label === 'v2' ? 10 : 1; } }, label);
    }
    const root = mountRoot(App, container());
    const button = root.container.querySelector('button');
    const addSpy = vi.spyOn(button, 'addEventListener');
    setLabel('v2');
    await nextTick();
    button.click();
    expect(clicks).toBe(10); // 새 핸들러(최신 label)가 호출됨
    expect(addSpy).not.toHaveBeenCalled(); // 리스너를 다시 등록하지 않음 (참조만 교체)
  });
});
