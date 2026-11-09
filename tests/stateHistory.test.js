import { describe, it, expect } from 'vitest';
import { StateHistory } from '../src/history/stateHistory.js';
import { h } from '../src/vdom/h.js';

const v = (text) => h('p', null, text);

describe('StateHistory', () => {
  it('초기 상태 하나로 시작하고, 앞뒤로 갈 수 없다', () => {
    const history = new StateHistory(v('0'));
    expect(history.size).toBe(1);
    expect(history.canBack()).toBe(false);
    expect(history.canForward()).toBe(false);
    expect(history.back()).toBe(null);
    expect(history.forward()).toBe(null);
  });

  it('push / back / forward 로 이동한다', () => {
    const history = new StateHistory(v('0'));
    history.push(v('1'));
    history.push(v('2'));
    expect(history.back().children[0].text).toBe('1');
    expect(history.back().children[0].text).toBe('0');
    expect(history.forward().children[0].text).toBe('1');
    expect(history.index).toBe(1);
  });

  it('뒤로 간 상태에서 push 하면 미래 기록을 버린다', () => {
    const history = new StateHistory(v('0'));
    history.push(v('1'));
    history.push(v('2'));
    history.back();
    history.back();
    history.push(v('새것'));
    expect(history.size).toBe(2);
    expect(history.canForward()).toBe(false);
    expect(history.current.children[0].text).toBe('새것');
  });

  it('최대 개수를 넘으면 가장 오래된 기록을 버린다', () => {
    const history = new StateHistory(v('0'), {}, 3);
    ['1', '2', '3'].forEach((text) => history.push(v(text)));
    expect(history.size).toBe(3);
    expect(history.entries[0].vnode.children[0].text).toBe('1');
    expect(history.index).toBe(2);
  });

  it('저장된 VDOM 은 동결되어 밖에서 바꿔도 기록이 오염되지 않는다', () => {
    const original = v('0');
    const history = new StateHistory(original);
    original.children.push(v('침입'));
    expect(history.current.children).toHaveLength(1);
    expect(Object.isFrozen(history.current)).toBe(true);
  });

  it('goTo 범위를 벗어나면 에러', () => {
    const history = new StateHistory(v('0'));
    expect(() => history.goTo(5)).toThrow(/범위/);
  });

  it('list() 는 meta 와 현재 위치를 알려준다', () => {
    const history = new StateHistory(v('0'), { label: '초기' });
    history.push(v('1'), { label: 'TEXT 1' });
    expect(history.list()).toEqual([
      { index: 0, meta: { label: '초기' }, isCurrent: false },
      { index: 1, meta: { label: 'TEXT 1' }, isCurrent: true },
    ]);
  });
});
