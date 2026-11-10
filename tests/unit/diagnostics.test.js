import { FunctionComponent } from '../../src/component/FunctionComponent.js';
import { useState, useMemo, useEffect } from '../../src/component/hooks.js';
import { createVNode as h } from '../../src/vdom/createVNode.js';
import { measureCommit } from '../../src/component/commitDiagnostics.js';
import { assert } from './vdom.test.js';

function rejects(run) {
  let error;
  try { run(); } catch (caught) { error = caught; }
  assert(error instanceof Error, 'Expected an error');
}

/** 성공·실패 경계에서 관찰 기능이 제품 상태 관리를 바꾸지 않는지 실제 DOM으로 확인한다. */
export const diagnosticTests = [
  ['렌더·Memo·성공 반영·무변경을 각각 구분한다', () => {
    const reports = [];
    let setCount, setName;
    const root = new FunctionComponent(() => {
      const [count, s] = useState(0), [name, n] = useState('A');
      setCount = s;
      setName = n;
      const doubled = useMemo(() => count * 2, [count]);
      return h('p', {}, `${name}/${count}/${doubled}`);
    }, {}, { onCommit: (info) => reports.push(info) });
    const mount = document.createElement('div');
    root.mount(mount);
    assert(reports[0].renderCount === 1 && reports[0].commitCount === 1 && reports[0].memoCount === 1,
      'Initial counters differ');
    setName('B');
    assert(reports[1].renderCount === 2 && reports[1].memoCount === 1
      && reports[1].mutations.characterData === 1, 'Unrelated state recalculated Memo');
    setCount(1);
    assert(reports[2].memoCount === 2 && mount.textContent === 'B/1/2', 'Memo update missing');
    setCount(1);
    assert(reports.length === 3, 'No-op setter created a commit');
    root.update();
    assert(reports[3].changes.length === 0 && reports[3].mutations.total === 0,
      'Explicit unchanged update reports writes');
    root.unmount();
  }],
  ['이벤트 명령은 DOM 관측 기록과 구분하고 최신 함수를 사용한다', () => {
    let setCount, seen;
    const reports = [];
    const root = new FunctionComponent(() => {
      const [count, set] = useState(0);
      setCount = set;
      return h('button', { onClick: () => { seen = count; } }, 'same text');
    }, {}, { onCommit: (info) => reports.push(info) });
    const mount = document.createElement('div');
    root.mount(mount);
    setCount(1);
    assert(reports[1].changes.length === 1 && reports[1].changes[0].type === 'EVENTS'
      && reports[1].mutations.total === 0, 'Event work was counted as a DOM mutation');
    mount.firstChild.click();
    assert(seen === 1, 'Stale handler');
    root.unmount();
  }],
  ['진단 데이터는 읽기 전용이며 VNode와 Hook 저장소를 노출하지 않는다', () => {
    const reports = [];
    const root = new FunctionComponent(({ text }) => h('p', {}, text), { text: 'A' },
      { onCommit: (info) => reports.push(info) });
    root.mount(document.createElement('div'));
    root.update({ text: 'B' });
    const info = reports[1];
    assert(Object.isFrozen(info) && Object.isFrozen(info.changes) && Object.isFrozen(info.changes[0])
      && Object.isFrozen(info.changes[0].path) && Object.isFrozen(info.mutations), 'Mutable diagnostic metadata');
    assert(!('vnode' in info) && !('hooks' in info) && !('vnode' in info.changes[0]), 'Internal state exposed');
    rejects(() => info.changes[0].path.push(9));
    root.update({ text: 'C' });
    root.unmount();
  }],
  ['진단 콜백 오류·재진입이 성공한 상태 갱신을 실패시키지 않는다', () => {
    const warn = console.warn;
    let warnings = 0, setCount;
    console.warn = () => { warnings += 1; };
    const root = new FunctionComponent(() => {
      const [count, set] = useState(0);
      setCount = set;
      return h('p', {}, count);
    }, {}, { onCommit: () => { setCount((value) => value + 1); } });
    const mount = document.createElement('div');
    try {
      root.mount(mount);
      setCount(1);
      assert(mount.textContent === '1' && root.hooks[0].value === 1 && warnings === 2,
        'Diagnostic callback changed state or escaped');
      rejects(() => new FunctionComponent(() => h('p'), {}, { onCommit: 1 }));
    } finally { root.unmount(); console.warn = warn; }
  }],
  ['실패한 렌더는 반영하지 않고 재시도 시 실행 횟수만 따로 센다', () => {
    let setCount;
    const reports = [];
    const root = new FunctionComponent(() => {
      const [count, set] = useState(0);
      setCount = set;
      const doubled = useMemo(() => count * 2, [count]);
      if (count === 1) throw new Error('Injected render failure');
      return h('p', {}, doubled);
    }, {}, { onCommit: (info) => reports.push(info) });
    const mount = document.createElement('div');
    root.mount(mount);
    rejects(() => setCount(1));
    assert(reports.length === 1 && mount.textContent === '0' && root.hooks[0].value === 0, 'Failed candidate committed');
    setCount(2);
    assert(reports[1].renderCount === 3 && reports[1].commitCount === 2 && reports[1].memoCount === 3,
      'Attempts were confused with successful commits');
    root.unmount();
  }],
  ['부분 쓰기 실패 뒤 복구하면서 관측 자원도 종료한다', () => {
    const NativeObserver = window.MutationObserver;
    let active = 0, setCount;
    window.MutationObserver = class extends NativeObserver {
      observe(...args) { active += 1; return super.observe(...args); }
      disconnect() { active -= 1; return super.disconnect(); }
    };
    const reports = [];
    const root = new FunctionComponent(() => {
      const [count, set] = useState(0);
      setCount = set;
      return h('div', {}, h('p', {}, count), h('span', {}, count));
    }, {}, { onCommit: (info) => reports.push(info) });
    const mount = document.createElement('div');
    try {
      root.mount(mount);
      const text = mount.querySelector('span').firstChild;
      Object.defineProperty(text, 'data', { configurable: true, get: () => '0',
        set: () => { throw new Error('Injected text write failure'); } });
      rejects(() => setCount(1));
      assert(active === 0 && reports.length === 1 && mount.textContent === '00'
        && root.hooks[0].value === 0, 'Recovery or observer disposal failed');
      setCount(2);
      assert(mount.textContent === '22' && active === 0 && reports[1].commitCount === 2,
        'Recovery retry failed');
    } finally { root.unmount(); window.MutationObserver = NativeObserver; }
  }],
  ['Effect 오류 후에도 이미 성공한 DOM 반영 진단은 전달한다', () => {
    let setCount;
    const reports = [];
    const root = new FunctionComponent(() => {
      const [count, set] = useState(0);
      setCount = set;
      useEffect(() => { if (count === 1) throw new Error('Injected Effect failure'); }, [count]);
      return h('p', {}, count);
    }, {}, { onCommit: (info) => reports.push(info) });
    const mount = document.createElement('div');
    root.mount(mount);
    rejects(() => setCount(1));
    assert(mount.textContent === '1' && root.hooks[0].value === 1
      && reports.length === 2 && reports[1].commitCount === 2, 'Committed state was lost on Effect error');
    root.unmount();
  }],
  ['관측 등록 실패는 미측정으로 분리하고 실제 갱신은 한 번만 실행한다', () => {
    const NativeObserver = window.MutationObserver;
    let calls = 0, disconnected = 0;
    window.MutationObserver = class {
      observe() { throw new Error('Observer unavailable'); }
      disconnect() { disconnected += 1; }
    };
    try {
      const report = measureCommit(document.createElement('div'), () => { calls += 1; return 'result'; });
      assert(calls === 1 && report.value === 'result' && report.mutations === null
        && disconnected === 1, 'Observation failure changed DOM execution');
    } finally { window.MutationObserver = NativeObserver; }
  }],
];
