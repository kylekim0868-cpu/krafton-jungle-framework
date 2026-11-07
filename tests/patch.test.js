import { describe, it, expect, vi } from 'vitest';
import { patch } from '../src/diff/patch.js';
import { createElement } from '../src/vdom/createElement.js';
import { h } from '../src/vdom/h.js';
import { vdom } from './helpers.js';

// old VDOM 으로 그린 container 를 만들어 반환
function mount(oldV) {
  const container = document.createElement('div');
  if (oldV) container.appendChild(createElement(oldV));
  return container;
}

// patch 결과가 "새 VDOM 을 처음부터 그린 결과"와 똑같은지 확인
function expectSameAsFresh(oldHTML, newHTML) {
  const oldV = vdom(oldHTML);
  const newV = vdom(newHTML);
  const container = mount(oldV);
  patch(container, oldV, newV);
  expect(container.innerHTML).toBe(createElement(newV).outerHTML);
}

// container 에서 일어난 DOM 변경 횟수를 MutationObserver 로 셈
function countMutations(container, fn) {
  const observer = new MutationObserver(() => {});
  observer.observe(container, { subtree: true, childList: true, attributes: true, characterData: true });
  fn();
  const records = observer.takeRecords(); // 비동기 콜백을 기다리지 않고 즉시 꺼냄
  observer.disconnect();
  return records;
}

describe('patch - 결과가 새로 그린 것과 같다', () => {
  const cases = [
    ['텍스트 변경', '<p>a</p>', '<p>b</p>'],
    ['속성 추가', '<div></div>', '<div id="x" class="c"></div>'],
    ['속성 삭제', '<div id="x" class="c"></div>', '<div></div>'],
    ['속성 변경', '<a href="/a">a</a>', '<a href="/b">a</a>'],
    ['태그 교체', '<div><p>a</p></div>', '<div><h2>a</h2></div>'],
    ['루트 교체', '<div>a</div>', '<section>a</section>'],
    ['자식 추가', '<ul><li>1</li></ul>', '<ul><li>1</li><li>2</li><li>3</li></ul>'],
    ['자식 여러 개 삭제 (인덱스 밀림)', '<ul><li>1</li><li>2</li><li>3</li><li>4</li></ul>', '<ul><li>1</li></ul>'],
    ['텍스트 → 요소', '<p>hi</p>', '<p><b>hi</b></p>'],
    ['요소 → 텍스트', '<p><b>hi</b></p>', '<p>hi</p>'],
    ['깊은 중첩 동시 변경',
      '<div class="a"><section><h1>T</h1><ul><li>1</li><li>2</li></ul></section></div>',
      '<div class="b"><section><h1>T2</h1><ul><li>1</li></ul><p>new</p></section></div>'],
    ['빈 요소 ↔ 자식 있는 요소', '<div></div>', '<div><span>x</span><br></div>'],
    ['특수문자 텍스트', '<p>a</p>', '<p>1 &lt; 2 &amp; 3</p>'],
  ];

  it.each(cases)('%s', (_, oldHTML, newHTML) => expectSameAsFresh(oldHTML, newHTML));
  it.each(cases)('%s (역방향)', (_, oldHTML, newHTML) => expectSameAsFresh(newHTML, oldHTML));
});

describe('patch - 최소 변경 (MutationObserver 로 검증)', () => {
  it('텍스트 하나만 바뀌면 DOM 변경도 1번', () => {
    const oldV = vdom('<ul><li>a</li><li>b</li><li>c</li></ul>');
    const newV = vdom('<ul><li>a</li><li>B</li><li>c</li></ul>');
    const container = mount(oldV);
    const records = countMutations(container, () => patch(container, oldV, newV));
    expect(records).toHaveLength(1);
    expect(records[0].type).toBe('characterData');
  });

  it('속성 하나만 바뀌면 DOM 변경도 1번', () => {
    const oldV = vdom('<div><p class="a">x</p><p>y</p></div>');
    const newV = vdom('<div><p class="b">x</p><p>y</p></div>');
    const container = mount(oldV);
    const records = countMutations(container, () => patch(container, oldV, newV));
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ type: 'attributes', attributeName: 'class' });
  });

  it('변경이 없으면 DOM 을 전혀 건드리지 않는다', () => {
    const oldV = vdom('<div><p>x</p></div>');
    const container = mount(oldV);
    const records = countMutations(container, () => patch(container, oldV, vdom('<div><p>x</p></div>')));
    expect(records).toHaveLength(0);
  });
});

describe('patch - 노드 유지 (재생성하지 않음)', () => {
  it('텍스트만 바뀌면 부모 요소는 같은 객체로 유지된다', () => {
    const oldV = vdom('<div><p>a</p></div>');
    const container = mount(oldV);
    const before = container.querySelector('p');
    patch(container, oldV, vdom('<div><p>b</p></div>'));
    expect(container.querySelector('p')).toBe(before);
  });

  it('input 이 유지되어 사용자가 입력한 값이 사라지지 않는다', () => {
    const oldV = h('div', null, h('input', { type: 'text' }), h('span', null, '0'));
    const container = mount(oldV);
    const input = container.querySelector('input');
    input.value = '타이핑 중';
    patch(container, oldV, h('div', null, h('input', { type: 'text' }), h('span', null, '1')));
    expect(container.querySelector('input')).toBe(input);
    expect(input.value).toBe('타이핑 중');
  });
});

describe('patch - 이벤트 / 프로퍼티', () => {
  it('이벤트 핸들러가 바뀌면 이전 것은 떼고 새 것만 동작', () => {
    const first = vi.fn();
    const second = vi.fn();
    const oldV = h('button', { onClick: first }, 'btn');
    const container = mount(oldV);
    patch(container, oldV, h('button', { onClick: second }, 'btn'));
    container.querySelector('button').click();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('이벤트 핸들러가 사라지면 더 이상 호출되지 않는다', () => {
    const fn = vi.fn();
    const oldV = h('button', { onClick: fn });
    const container = mount(oldV);
    patch(container, oldV, h('button', {}));
    container.querySelector('button').click();
    expect(fn).not.toHaveBeenCalled();
  });

  it('value / checked 는 프로퍼티로 반영된다', () => {
    const oldV = h('div', null, h('input', { value: 'a' }), h('input', { type: 'checkbox', checked: false }));
    const container = mount(oldV);
    patch(container, oldV, h('div', null, h('input', { value: 'b' }), h('input', { type: 'checkbox', checked: true })));
    const [text, box] = container.querySelectorAll('input');
    expect(text.value).toBe('b');
    expect(box.checked).toBe(true);
  });
});

describe('patch - 루트 / 에러', () => {
  it('빈 container 에 루트 생성 (old 가 null)', () => {
    const container = mount(null);
    patch(container, null, h('p', null, 'hi'));
    expect(container.innerHTML).toBe('<p>hi</p>');
  });

  it('루트 제거 (new 가 null)', () => {
    const oldV = h('p', null, 'hi');
    const container = mount(oldV);
    patch(container, oldV, null);
    expect(container.innerHTML).toBe('');
  });

  it('DOM 과 VDOM 이 어긋나면 이해하기 쉬운 에러를 던진다', () => {
    const container = document.createElement('div');
    container.innerHTML = '<ul></ul>'; // 실제로는 자식이 없는데
    const oldV = vdom('<ul><li>a</li></ul>'); // VDOM 은 자식이 있다고 생각
    expect(() => patch(container, oldV, vdom('<ul><li>b</li></ul>'))).toThrow(/어긋났습니다/);
  });
});
