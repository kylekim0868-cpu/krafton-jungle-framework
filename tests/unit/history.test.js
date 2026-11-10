import { createHistory, recordHistory, moveHistory } from '../../demos/phase1/history.js';
import { assert } from './vdom.test.js';

const text = (value) => ({ kind: 'text', text: value });
const tree = (value) => ({ kind: 'element', tag: 'p', props: { title: value }, children: [text(value)] });
const current = (history) => history.entries[history.index];

/** 예외의 발생 자체와 종류를 확인한다. 실패한 검사 호출을 통과로 숨기지 않는다. */
function rejects(run, type = TypeError) {
  let caught;
  try { run(); } catch (error) { caught = error; }
  assert(caught instanceof type, `Expected ${type.name}`);
}

/** DOM 없이 이력 값·스냅샷 보호·후보의 불변성을 검사한다. Node와 브라우저에서 실행 가능하다. */
export const historyTests = [
  ['초기 스냅샷 하나와 위치 0으로 시작하고 입력과 깊이 분리된다', () => {
    const input = tree('A');
    const history = createHistory(input);
    input.props.title = '원본 변경';
    input.children[0].text = '원본 변경';
    input.children.push(text('추가'));
    assert(history.entries.length === 1 && history.index === 0, 'Wrong initial history');
    assert(current(history).props.title === 'A' && current(history).children[0].text === 'A'
      && current(history).children.length === 1, 'Snapshot shares input data');
  }],
  ['외부에서 현재 위치·스냅샷·속성·자식을 수정할 수 없다', () => {
    const history = createHistory(tree('A'));
    for (const mutate of [
      () => { history.index = 5; }, () => history.entries.push(tree('B')),
      () => { current(history).tag = 'b'; }, () => { current(history).props.title = '변경'; },
      () => { current(history).children[0].text = '변경'; }, () => current(history).children.pop(),
    ]) rejects(mutate);
    assert(history.index === 0 && current(history).children[0].text === 'A', 'Stored history changed');
  }],
  ['앞뒤 이동은 기존 스냅샷을 유지하며 위치만 바꾼다', () => {
    const a = createHistory(tree('A'));
    const b = recordHistory(a, tree('B'));
    const c = recordHistory(b, tree('C'));
    const back = moveHistory(c, -1);
    assert(back.index === 1 && current(back).props.title === 'B', 'Undo failed');
    assert(back.entries === c.entries && c.index === 2 && a.entries.length === 1, 'Movement modified history');
    const forward = moveHistory(back, 1);
    assert(forward.index === 2 && current(forward).props.title === 'C' && forward.entries.length === 3, 'Redo created a record');
  }],
  ['과거에서 새 저장 후보를 만들면 앞으로 기록만 잘라 새 상태를 붙인다', () => {
    const c = recordHistory(recordHistory(createHistory(tree('A')), tree('B')), tree('C'));
    const b = moveHistory(c, -1);
    const input = tree('D');
    const d = recordHistory(b, input);
    input.children[0].text = '저장 후 원본 수정';
    assert(d.entries.map((node) => node.props.title).join() === 'A,B,D' && d.index === 2, 'Wrong branch');
    assert(c.entries.map((node) => node.props.title).join() === 'A,B,C' && b.index === 1, 'Candidate changed previous history');
    assert(current(d).children[0].text === 'D', 'New snapshot shares input');
    assert(moveHistory(d, 1) === d, 'Future survived branching');
  }],
  ['무변경 저장은 과거 위치에서도 같은 이력과 앞으로 기록을 유지한다', () => {
    const c = recordHistory(recordHistory(createHistory(tree('A')), tree('B')), tree('C'));
    const b = moveHistory(c, -1);
    assert(recordHistory(b, tree('B')) === b, 'No-op created a history');
    assert(current(moveHistory(b, 1)).props.title === 'C', 'No-op removed future');
  }],
  ['후보를 버리면 이동·분기·실패 확정 전의 이력은 바뀌지 않는다', () => {
    const b = recordHistory(createHistory(tree('A')), tree('B'));
    const before = JSON.stringify(b);
    moveHistory(b, -1);
    recordHistory(b, tree('C'));
    rejects(() => recordHistory(b, null));
    assert(JSON.stringify(b) === before, 'Discarded candidate or error changed confirmed history');
  }],
  ['양 끝의 이동은 무변경이며 한 칸 이외의 이동값은 거부한다', () => {
    const a = createHistory(tree('A'));
    assert(moveHistory(a, -1) === a && moveHistory(a, 1) === a, 'Boundary moved');
    const b = recordHistory(a, tree('B'));
    assert(moveHistory(b, 1) === b, 'Moved past last entry');
    for (const direction of [0, 2, -2, NaN, '1', null]) rejects(() => moveHistory(b, direction), RangeError);
  }],
  ['잘못된 VNode·중복 key·순환 참조를 저장하지 않는다', () => {
    const duplicate = { kind: 'element', tag: 'div', props: {}, children: ['a', 'b'].map((value) =>
      ({ ...tree(value), props: { 'data-key': 'same' } })) };
    const cycle = tree('A');
    cycle.children.push(cycle);
    const history = createHistory(tree('A'));
    for (const invalid of [null, text(3), duplicate, cycle]) {
      rejects(() => createHistory(invalid));
      rejects(() => recordHistory(history, invalid));
    }
    assert(history.entries.length === 1, 'Invalid input changed history');
  }],
  ['빈 루트·일반 텍스트·중첩 template도 스냅샷으로 복원한다', () => {
    const empty = { kind: 'element', tag: 'div', props: {}, children: [] };
    const nested = { ...empty, children: [text(' 앞 '), { kind: 'element', tag: 'template', props: {},
      children: [{ kind: 'element', tag: 'template', props: {}, children: [tree('안')] }] }, text(' 뒤 ')] };
    const history = recordHistory(recordHistory(createHistory(empty), nested), text('텍스트 루트'));
    const back = moveHistory(history, -1);
    nested.children[1].children[0].children[0].children[0].text = '원본 수정';
    assert(current(back).children[1].children[0].children[0].children[0].text === '안', 'Nested snapshot changed');
    assert(current(moveHistory(back, -1)).children.length === 0, 'Empty snapshot was lost');
  }],
];
