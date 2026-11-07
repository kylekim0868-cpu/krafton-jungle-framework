import { describe, it, expect } from 'vitest';
import { diff, PATCH } from '../src/diff/diff.js';
import { diffProps } from '../src/diff/diffProps.js';
import { h } from '../src/vdom/h.js';
import { vdom } from './helpers.js';

describe('diffProps', () => {
  it('추가 / 변경 / 삭제된 속성을 찾는다', () => {
    const changes = diffProps({ id: 'a', class: 'x' }, { id: 'b', title: 't' });
    expect(changes).toEqual([
      { name: 'id', oldValue: 'a', newValue: 'b' },
      { name: 'title', oldValue: undefined, newValue: 't' },
      { name: 'class', oldValue: 'x', newValue: undefined },
    ]);
  });

  it('같으면 빈 배열', () => {
    expect(diffProps({ id: 'a' }, { id: 'a' })).toEqual([]);
  });
});

describe('diff - 5가지 핵심 케이스', () => {
  it('변경이 없으면 빈 배열', () => {
    expect(diff(vdom('<div><p>a</p></div>'), vdom('<div><p>a</p></div>'))).toEqual([]);
  });

  it('[1] CREATE: 자식 추가', () => {
    const patches = diff(vdom('<ul><li>a</li></ul>'), vdom('<ul><li>a</li><li>b</li></ul>'));
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({ type: PATCH.CREATE, path: [1] });
    expect(patches[0].node.type).toBe('li');
  });

  it('[2] REMOVE: 자식 삭제', () => {
    const patches = diff(vdom('<ul><li>a</li><li>b</li></ul>'), vdom('<ul><li>a</li></ul>'));
    expect(patches).toEqual([{ type: PATCH.REMOVE, path: [1] }]);
  });

  it('[3] REPLACE: 태그가 바뀌면 통째로 교체 (자식은 비교하지 않음)', () => {
    const patches = diff(vdom('<div><p>a</p></div>'), vdom('<div><span>a</span></div>'));
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({ type: PATCH.REPLACE, path: [0] });
  });

  it('[3] REPLACE: 텍스트 ↔ 요소', () => {
    const patches = diff(h('p', null, 'hi'), h('p', null, h('b', null, 'hi')));
    expect(patches[0]).toMatchObject({ type: PATCH.REPLACE, path: [0] });
  });

  it('[3] REPLACE: key 가 다르면 교체', () => {
    const patches = diff(h('li', { key: 1 }, 'a'), h('li', { key: 2 }, 'a'));
    expect(patches[0].type).toBe(PATCH.REPLACE);
  });

  it('[4] TEXT: 텍스트만 변경', () => {
    const patches = diff(vdom('<ul><li>a</li><li>b</li></ul>'), vdom('<ul><li>a</li><li>B</li></ul>'));
    expect(patches).toEqual([{ type: PATCH.TEXT, path: [1, 0], text: 'B' }]);
  });

  it('[5] PROPS: 속성만 변경', () => {
    const patches = diff(vdom('<div id="a"></div>'), vdom('<div id="b"></div>'));
    expect(patches).toEqual([
      { type: PATCH.PROPS, path: [], changes: [{ name: 'id', oldValue: 'a', newValue: 'b' }] },
    ]);
  });
});

describe('diff - 조합 / 엣지 케이스', () => {
  it('여러 자식을 한 번에 삭제', () => {
    const patches = diff(vdom('<ul><li>a</li><li>b</li><li>c</li></ul>'), vdom('<ul><li>a</li></ul>'));
    expect(patches.map((p) => p.type)).toEqual([PATCH.REMOVE, PATCH.REMOVE]);
  });

  it('속성 변경 + 깊은 곳의 텍스트 변경을 동시에 찾는다', () => {
    const patches = diff(
      vdom('<div class="a"><section><p>x</p></section></div>'),
      vdom('<div class="b"><section><p>y</p></section></div>'),
    );
    expect(patches.map((p) => [p.type, p.path])).toEqual([
      [PATCH.PROPS, []],
      [PATCH.TEXT, [0, 0, 0]],
    ]);
  });

  it('루트가 없다가 생기면 CREATE, 사라지면 REMOVE', () => {
    expect(diff(null, h('div'))[0]).toMatchObject({ type: PATCH.CREATE, path: [] });
    expect(diff(h('div'), null)).toEqual([{ type: PATCH.REMOVE, path: [] }]);
  });

  it('둘 다 없으면 빈 배열', () => {
    expect(diff(null, null)).toEqual([]);
  });
});
