import { FunctionComponent } from '../../src/component/FunctionComponent.js';
import { useState, useMemo, useEffect } from '../../src/component/hooks.js';
import { createVNode as h } from '../../src/vdom/createVNode.js';
import { domToVNode } from '../../src/vdom/domToVNode.js';
import { renderVNode } from '../../src/vdom/renderVNode.js';
import { diff } from '../../src/vdom/diff.js';
import { patch, preparePatch } from '../../src/vdom/patch.js';
import { assert } from './vdom.test.js';

function rejects(run, type = Error) {
  let error;
  try { run(); } catch (caught) { error = caught; }
  assert(error instanceof type, `Expected ${type.name}`);
  return error;
}

const container = () => document.createElement('div');
const equal = (actual, expected) => assert(JSON.stringify(actual) === JSON.stringify(expected),
  `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);

/** 루트 Hook 계약과 공통 엔진의 이벤트·폼 확장을 실제 DOM에서 검사한다. */
export const hookTests = [
  ['State는 슬롯별 값·setter를 보존하고 함수 초기값을 한 번 계산한다', () => {
    let setCount, setLabel, firstSetter, calls = 0, initializations = 0;
    const root = new FunctionComponent(() => {
      calls += 1;
      const [count, setter] = useState(() => { initializations += 1; return 0; });
      const [label, otherSetter] = useState('A');
      setCount = setter;
      setLabel = otherSetter;
      return h('p', {}, `${count}/${label}`);
    });
    const node = root.mount(container());
    firstSetter = setCount;
    setCount((count) => count + 1);
    setCount((count) => count + 1);
    setLabel('B');
    assert(node.textContent === '2/B' && calls === 4 && initializations === 1, 'State did not persist');
    assert(setCount === firstSetter, 'Setter identity changed');
    setCount(2);
    assert(calls === 4, 'Same state triggered a render');
    root.unmount();
  }],
  ['루트 인스턴스마다 State가 분리된다', () => {
    const setters = [];
    function Counter() {
      const [value, set] = useState(0);
      setters.push(set);
      return h('p', {}, value);
    }
    const first = new FunctionComponent(Counter);
    const second = new FunctionComponent(Counter);
    const a = first.mount(container());
    const b = second.mount(container());
    setters[0](1);
    assert(a.textContent === '1' && b.textContent === '0', 'Root state was shared');
    first.unmount(); second.unmount();
  }],
  ['Memo는 의존성이 같으면 객체를 재사용하고 무관한 State 변경에서 계산을 생략한다', () => {
    let setCount, setLabel, memo, computations = 0;
    const root = new FunctionComponent(() => {
      const [count, set] = useState(0);
      const [label, other] = useState('A');
      setCount = set; setLabel = other;
      memo = useMemo(() => { computations += 1; return { doubled: count * 2 }; }, [count]);
      return h('p', {}, `${memo.doubled}/${label}`);
    });
    root.mount(container());
    const initial = memo;
    setLabel('B');
    assert(memo === initial && computations === 1, 'Unrelated state recomputed memo');
    setCount(2);
    assert(memo !== initial && memo.doubled === 4 && computations === 2, 'Dependency change was ignored');
    root.unmount();
  }],
  ['Memo 의존성은 복사·Object.is 비교하며 생략하면 매번 계산한다', () => {
    const deps = [NaN];
    let computations = 0, always = 0;
    const root = new FunctionComponent(() => {
      const value = useMemo(() => ++computations, deps);
      useMemo(() => ++always);
      return h('p', {}, value);
    });
    root.mount(container());
    root.update();
    assert(computations === 1 && always === 2, 'NaN or omitted dependency comparison differs');
    deps[0] = -0;
    root.update();
    deps[0] = 0;
    root.update();
    assert(computations === 3, 'Dependency snapshot or signed zero comparison differs');
    root.unmount();
  }],
  ['Effect는 DOM 확정 후 실행하고 변경 시 이전 작업 정리 후 재실행한다', () => {
    const target = container();
    const trace = [];
    const root = new FunctionComponent(({ value }) => {
      useEffect(() => {
        trace.push(`setup ${value}/${target.textContent}`);
        return () => trace.push(`cleanup ${value}/${target.textContent}`);
      }, [value]);
      return h('p', {}, value);
    }, { value: 'A' });
    root.mount(target);
    root.update({ value: 'A' });
    root.update({ value: 'B' });
    root.unmount();
    root.unmount();
    equal(trace, ['setup A/A', 'cleanup A/B', 'setup B/B', 'cleanup B/']);
  }],
  ['Effect의 []는 최초에만, 생략은 매번 실행하며 모든 이전 정리를 먼저 마친다', () => {
    const trace = [];
    const root = new FunctionComponent(() => {
      useEffect(() => { trace.push('once'); return () => trace.push('once clean'); }, []);
      useEffect(() => { trace.push('first'); return () => trace.push('first clean'); });
      useEffect(() => { trace.push('second'); return () => trace.push('second clean'); });
      return h('p');
    });
    root.mount(container());
    root.update();
    equal(trace, ['once', 'first', 'second', 'first clean', 'second clean', 'first', 'second']);
    root.unmount();
    equal(trace.slice(-3), ['once clean', 'first clean', 'second clean']);
  }],
  ['Effect 안의 setter는 Effect 처리가 끝난 뒤 재렌더하고 오래된 setter는 해제 후 무시한다', async () => {
    let setter;
    const trace = [];
    const target = container();
    const root = new FunctionComponent(() => {
      const [value, set] = useState(0);
      setter = set;
      useEffect(() => {
        trace.push(`effect ${value}`);
        if (value === 0) set((current) => current + 1);
      }, [value]);
      return h('p', {}, value);
    });
    root.mount(target);
    assert(target.textContent === '0', 'Effect reentered the current commit');
    await Promise.resolve();
    assert(target.textContent === '1', 'Effect setter was not processed');
    equal(trace, ['effect 0', 'effect 1']);
    root.unmount();
    setter(9);
    assert(target.childNodes.length === 0, 'Old setter remounted content');
  }],
  ['해제는 대기 중인 Effect setter가 DOM을 다시 만들지 못하게 한다', async () => {
    const target = container();
    const root = new FunctionComponent(() => {
      const [value, set] = useState(0);
      useEffect(() => { set(1); }, []);
      return h('p', {}, value);
    });
    root.mount(target);
    root.unmount();
    await Promise.resolve();
    assert(target.childNodes.length === 0, 'Queued setter survived unmount');
  }],
  ['루트 밖·자식·Memo 계산의 Hooks와 렌더 중 setter를 거부한다', () => {
    for (const run of [() => useState(0), () => useMemo(() => 0, []), () => useEffect(() => {}, [])]) rejects(run);
    const child = new FunctionComponent(() => h(() => { useState(0); return h('p'); }));
    rejects(() => child.mount(container()));
    const memo = new FunctionComponent(() => { useMemo(() => useState(0), []); return h('p'); });
    rejects(() => memo.mount(container()));
    const setter = new FunctionComponent(() => { const [, set] = useState(0); set(1); return h('p'); });
    rejects(() => setter.mount(container()));
  }],
  ['Hook 종류·개수가 바뀌면 확정 상태를 유지하고 올바른 순서로 재시도한다', () => {
    const target = container();
    const root = new FunctionComponent(({ mode }) => {
      if (mode === 'memo') useMemo(() => 0, []);
      else useState(0);
      if (mode === 'extra') useState(1);
      return h('p', {}, mode);
    }, { mode: 'state' });
    root.mount(target);
    for (const mode of ['memo', 'extra']) rejects(() => root.update({ mode }));
    assert(target.textContent === 'state', 'Failed Hook order changed the DOM');
    root.update();
    assert(target.textContent === 'state', 'Failed props were committed');
    root.unmount();
  }],
  ['잘못된 의존성·콜백을 적용 전에 거부한다', () => {
    for (const render of [
      () => { useEffect(null); return h('p'); },
      () => { useEffect(() => {}, null); return h('p'); },
      () => { useMemo(null); return h('p'); },
      () => { useMemo(() => 0, {}); return h('p'); },
    ]) rejects(() => new FunctionComponent(render).mount(container()), TypeError);
  }],
  ['준비 실패는 새 State·Memo·Effect를 확정하지 않고 다음 setter에서 재시도한다', () => {
    let setter, fail = false, memoCalls = 0;
    const trace = [];
    const target = container();
    const root = new FunctionComponent(() => {
      const [value, set] = useState(0); setter = set;
      const memo = useMemo(() => { memoCalls += 1; return value * 2; }, [value]);
      useEffect(() => { trace.push(`setup ${value}`); return () => trace.push(`clean ${value}`); }, [value]);
      return h('p', fail ? { 'bad name': 'x' } : {}, `${value}/${memo}`);
    });
    root.mount(target);
    fail = true;
    rejects(() => setter(1));
    assert(target.textContent === '0/0', 'Failed preparation changed DOM');
    equal(trace, ['setup 0']);
    fail = false;
    setter((value) => value + 1);
    assert(target.textContent === '1/2' && memoCalls === 3, 'Failed hook candidate was retained');
    equal(trace, ['setup 0', 'clean 0', 'setup 1']);
    root.unmount();
  }],
  ['부분 적용 실패는 이전 이벤트·폼 값·State와 Effect를 함께 복원한다', () => {
    let setter;
    const trace = [];
    const target = container();
    const root = new FunctionComponent(() => {
      const [value, set] = useState(0); setter = set;
      useEffect(() => { trace.push(value); }, [value]);
      return h('div', { title: String(value) },
        h('input', { value: String(value) }), h('button', { onClick: () => set((current) => current + 1) }, 'add'));
    });
    const node = root.mount(target);
    const setAttribute = node.setAttribute;
    node.setAttribute = function (name, value) { setAttribute.call(this, name, value); throw new Error('write failure'); };
    rejects(() => setter(1));
    assert(target.firstChild.title === '0' && target.querySelector('input').value === '0', 'Runtime rollback failed');
    equal(trace, [0]);
    target.querySelector('button').click();
    assert(target.querySelector('input').value === '1', 'Restored event or State was stale');
    equal(trace, [0, 1]);
    root.unmount();
  }],
  ['Effect 오류 뒤에도 확정된 DOM·State를 유지하고 다른 Effect를 실행한다', () => {
    let setter;
    const trace = [];
    const target = container();
    const root = new FunctionComponent(() => {
      const [value, set] = useState(0); setter = set;
      useEffect(() => { if (value === 1) throw new Error('effect failure'); }, [value]);
      useEffect(() => { trace.push(value); }, [value]);
      return h('p', {}, value);
    });
    root.mount(target);
    rejects(() => setter(1), AggregateError);
    assert(target.textContent === '1', 'Committed state was rolled back after Effect failure');
    equal(trace, [0, 1]);
    setter((value) => value + 1);
    assert(target.textContent === '2', 'State was not committed before Effect failure');
    root.unmount();
  }],
  ['정리 오류가 나도 다른 Effect 자원을 정리하고 두 번 정리하지 않는다', () => {
    const trace = [];
    const root = new FunctionComponent(() => {
      useEffect(() => () => { trace.push('first'); throw new Error('cleanup failure'); }, []);
      useEffect(() => () => trace.push('second'), []);
      return h('p');
    });
    const target = container();
    root.mount(target);
    rejects(() => root.unmount(), AggregateError);
    root.unmount();
    equal(trace, ['first', 'second']);
    assert(target.childNodes.length === 0, 'Failed cleanup retained DOM');
  }],
  ['이벤트 교체·제거는 이전 함수를 해제하며 HTML 속성은 그대로 읽힌다', () => {
    const called = [];
    const old = h('button', { title: 'A', onClick: () => called.push('A') }, 'button');
    const root = renderVNode(old);
    root.click();
    const next = h('button', { title: 'B', onClick: () => called.push('B') }, 'button');
    patch(root, diff(old, next));
    root.click();
    patch(root, diff(next, h('button', { title: 'B' }, 'button')));
    root.click();
    equal(called, ['A', 'B']);
    equal(domToVNode(root).props, { title: 'B' });
    assert(!root.hasAttribute('onClick'), 'Event function became an HTML attribute');
  }],
  ['value·checked는 현재 값으로 반영하고 원래 문자열 속성 계약은 보존한다', () => {
    const before = h('input', { type: 'checkbox', value: 'A', checked: true });
    const root = renderVNode(before);
    assert(root.value === 'A' && root.checked && !root.hasAttribute('checked'), 'Runtime properties differ');
    const after = h('input', { type: 'checkbox', value: 'B', checked: false });
    patch(root, diff(before, after));
    assert(root.value === 'B' && !root.checked, 'Properties were not updated');
    const plain = { kind: 'element', tag: 'input', props: { value: 'attribute' }, children: [] };
    const legacy = renderVNode(plain);
    assert(legacy.getAttribute('value') === 'attribute', 'Legacy attribute contract changed');
  }],
  ['select는 option 구조 변경 뒤 현재 값을 반영한다', () => {
    const before = h('select', { value: 'a' }, h('option', { value: 'a' }, 'A'));
    const root = renderVNode(before);
    const after = h('select', { value: 'b' }, h('option', { value: 'b' }, 'B'));
    patch(root, diff(before, after));
    assert(root.value === 'b', 'Select property was applied before option changes');
    const stableBefore = h('select', { value: 'b' }, h('option', { 'data-key': 'a', value: 'a' }, 'A'),
      h('option', { 'data-key': 'old-b', value: 'b' }, 'B'));
    const stableAfter = h('select', { value: 'b' }, h('option', { 'data-key': 'a', value: 'a' }, 'A'),
      h('option', { 'data-key': 'new-b', value: 'b' }, 'B'));
    const select = renderVNode(stableBefore);
    patch(select, diff(stableBefore, stableAfter));
    assert(select.value === 'b', 'Same controlled value was lost after option replacement');
    assert(diff(stableAfter, stableAfter).length === 0, 'Unchanged select produced a patch');
  }],
  ['VNode 생성은 배열·빈 자식·숫자를 정규화하고 잘못된 런타임 props를 거부한다', () => {
    const vnode = h('p', { hidden: true, title: 3 }, ['A', [null, false, 2]]);
    equal(vnode.props, { hidden: '', title: '3' });
    equal(vnode.children.map((node) => node.text), ['A', '2']);
    rejects(() => h('button', { onClick: 'bad' }), TypeError);
    rejects(() => h('input', { checked: 'yes' }), TypeError);
    rejects(() => renderVNode({ ...h('div'), properties: { value: 'unsupported' } }), TypeError);
    const node = renderVNode(h('p', {}, 'A'));
    rejects(() => preparePatch(node, [{ type: 'EVENTS', path: [], previous: {}, next: { click: 1 } }]), TypeError);
    assert(node.textContent === 'A', 'Invalid runtime change touched DOM');
  }],
];
