import { FunctionComponent } from '../../src/component/FunctionComponent.js';
import { assert } from './vdom.test.js';

const text = (value) => ({ kind: 'text', text: String(value) });
const element = (tag, props = {}, children = []) => ({ kind: 'element', tag, props, children });
const title = ({ value }) => element('p', { title: String(value) }, [text(value)]);

function rejects(run, type = Error) {
  let error;
  try { run(); } catch (caught) { error = caught; }
  assert(error instanceof type, `Expected ${type.name}`);
  return error;
}

/** 브라우저의 실제 DOM에서 루트 생명주기·스냅샷·실패 시 기준 보존을 검사한다. */
export const functionComponentTests = [
  ['mount는 props로 최초 표시하고 hooks 저장소를 인스턴스별로 만든다', () => {
    const container = document.createElement('div');
    container.innerHTML = '<b>이전 콘텐츠</b>';
    const component = new FunctionComponent(title, { value: 0 });
    const other = new FunctionComponent(title, { value: 9 });
    const root = component.mount(container);
    assert(container.firstChild === root && root.outerHTML === '<p title="0">0</p>', 'Mount result differs');
    assert(component.hooks.length === 0 && component.hooks !== other.hooks, 'Hook storage is shared');
  }],
  ['update는 렌더를 재실행하고 기존 요소·텍스트와 hooks 배열을 유지한다', () => {
    let calls = 0;
    const component = new FunctionComponent((props) => { calls += 1; return title(props); }, { value: 0 });
    const root = component.mount(document.createElement('div'));
    const textNode = root.firstChild;
    const hooks = component.hooks;
    hooks.push({ saved: true });
    assert(component.update({ value: 1 }) === root, 'Update recreated the root');
    assert(root.firstChild === textNode && textNode.data === '1', 'Text identity was lost');
    assert(calls === 2 && component.hooks === hooks && hooks[0].saved, 'Render or hook storage differs');
  }],
  ['무변경 갱신은 DOM을 쓰지 않으며 새 props를 다음 호출에서 사용한다', () => {
    let received;
    const component = new FunctionComponent((props) => {
      received = props;
      return text('동일 화면');
    });
    const root = component.mount(document.createElement('div'));
    const observer = new MutationObserver(() => {});
    observer.observe(root, { characterData: true });
    const nextProps = { extra: 1 };
    component.update(nextProps);
    component.update();
    assert(received === nextProps && observer.takeRecords().length === 0, 'No-op wrote DOM or lost props');
    observer.disconnect();
  }],
  ['루트 태그·텍스트 교체 뒤에도 다음 update가 새 루트를 가리킨다', () => {
    const component = new FunctionComponent(({ mode }) => mode === 'text' ? text('텍스트')
      : element(mode, {}, [text(mode)]), { mode: 'section' });
    const container = document.createElement('div');
    const first = component.mount(container);
    const second = component.update({ mode: 'article' });
    assert(second !== first && container.firstChild === second && second.localName === 'article', 'Tag replacement failed');
    const third = component.update({ mode: 'text' });
    assert(third.nodeType === 3 && container.firstChild === third, 'Text root replacement failed');
    assert(component.update() === third && third.data === '텍스트', 'Replaced root was not tracked');
    assert(component.update({ mode: 'p' }).localName === 'p', 'Text-to-element update failed');
  }],
  ['key가 있는 목록 이동은 기존 Diff·Patch로 같은 항목 DOM을 재사용한다', () => {
    const component = new FunctionComponent(({ ids }) => element('ul', {}, ids.map((id) =>
      element('li', { 'data-key': id }, [text(id)]))), { ids: ['a', 'b', 'c'] });
    const root = component.mount(document.createElement('div'));
    const before = Array.from(root.children);
    component.update({ ids: ['c', 'a', 'b'] });
    assert(root.children[0] === before[2] && root.children[1] === before[0]
      && root.children[2] === before[1], 'Keyed update recreated items');
  }],
  ['렌더 결과 객체를 다음 호출 전에 수정해도 이전 비교 기준은 오염되지 않는다', () => {
    const shared = element('p', {}, [text('A')]);
    const component = new FunctionComponent(() => shared);
    const root = component.mount(document.createElement('div'));
    shared.children[0].text = 'B';
    assert(root.textContent === 'A', 'Source mutation changed DOM');
    component.update();
    assert(root.textContent === 'B', 'Source mutation corrupted the previous VNode');
  }],
  ['mount 전 update·중복 mount·잘못된 렌더 함수와 마운트 대상을 거부한다', () => {
    rejects(() => new FunctionComponent(null), TypeError);
    const component = new FunctionComponent(title, { value: 'A' });
    rejects(() => component.update());
    for (const target of [null, {}, document.createTextNode('x'), document.createElement('template')]) {
      rejects(() => component.mount(target), TypeError);
    }
    const container = document.createElement('div');
    const root = component.mount(container);
    rejects(() => component.mount(document.createElement('div')));
    assert(container.firstChild === root, 'Invalid lifecycle calls changed DOM');
  }],
  ['최초 렌더·검증 실패는 기존 콘텐츠를 유지하고 mount를 재시도한다', () => {
    const container = document.createElement('div');
    const previous = document.createElement('b');
    container.appendChild(previous);
    let result = null;
    const component = new FunctionComponent(() => result);
    rejects(() => component.mount(container), TypeError);
    assert(container.firstChild === previous, 'Failed mount replaced content');
    result = title({ value: '재시도' });
    component.mount(container);
    assert(container.textContent === '재시도', 'Mount retry failed');
  }],
  ['mount 적용 도중 실패하면 이전 DOM 참조를 복원하고 재시도한다', () => {
    const container = document.createElement('div');
    const previous = document.createElement('b');
    container.appendChild(previous);
    const replace = container.replaceChildren;
    let failOnce = true;
    container.replaceChildren = function (...nodes) {
      replace.apply(this, nodes);
      if (failOnce) { failOnce = false; throw new Error('Injected mount failure'); }
    };
    const component = new FunctionComponent(title, { value: 'A' });
    rejects(() => component.mount(container));
    assert(container.firstChild === previous, 'Mount rollback lost old DOM');
    component.mount(container);
    assert(container.textContent === 'A', 'Mount retry failed');
  }],
  ['렌더 예외·잘못된 VNode·DOM 준비 실패는 이전 props와 DOM을 보존한다', () => {
    const component = new FunctionComponent((props) => {
      if (props.fail) throw new Error('Injected render failure');
      if (props.invalid) return null;
      if (props.badProp) return element('p', { 'bad name': 'x' }, [text('B')]);
      return title(props);
    }, { value: 'A' });
    const root = component.mount(document.createElement('div'));
    for (const props of [{ fail: true }, { invalid: true }, { badProp: true }]) {
      rejects(() => component.update(props));
      assert(component.update() === root && root.textContent === 'A', 'Failed input was committed');
    }
    component.update({ value: 'B' });
    assert(root.textContent === 'B', 'Update retry failed');
  }],
  ['부분 적용 실패는 이전 화면을 복원하고 이전 props로 다시 렌더한다', () => {
    const container = document.createElement('div');
    const component = new FunctionComponent(title, { value: 'A' });
    const root = component.mount(container);
    const setAttribute = root.setAttribute;
    root.setAttribute = function (name, value) {
      setAttribute.call(this, name, value);
      throw new Error('Injected write failure');
    };
    rejects(() => component.update({ value: 'B' }));
    assert(container.innerHTML === '<p title="A">A</p>', 'Update rollback failed');
    component.update();
    assert(container.textContent === 'A', 'Failed props were committed');
    component.update({ value: 'C' });
    assert(container.innerHTML === '<p title="C">C</p>', 'Retry after rollback failed');
  }],
  ['복구까지 실패하면 후속 mount·update를 잠근다', () => {
    const container = document.createElement('div');
    const component = new FunctionComponent(title, { value: 'A' });
    const root = component.mount(container);
    root.setAttribute = () => { throw new Error('Injected write failure'); };
    container.replaceChildren = () => { throw new Error('Injected recovery failure'); };
    rejects(() => component.update({ value: 'B' }), AggregateError);
    rejects(() => component.update());
    rejects(() => component.mount(document.createElement('div')));
  }],
  ['외부에서 변경하거나 분리한 DOM을 이전 VNode로 잘못 패치하지 않는다', () => {
    const container = document.createElement('div');
    const component = new FunctionComponent(title, { value: 'A' });
    const root = component.mount(container);
    root.firstChild.data = '외부 변경';
    rejects(() => component.update({ value: 'B' }));
    assert(root.textContent === '외부 변경', 'External content was patched');
    root.firstChild.data = 'A';
    root.remove();
    rejects(() => component.update());
    container.appendChild(root);
    component.update({ value: 'B' });
    assert(root.textContent === 'B', 'Restored external DOM could not update');
  }],
  ['렌더 중 재진입을 거부하고 예외 후에도 정상 갱신할 수 있다', () => {
    let recurse = false;
    const component = new FunctionComponent(() => {
      if (recurse) component.update();
      return text('정상');
    });
    component.mount(document.createElement('div'));
    recurse = true;
    rejects(() => component.update());
    recurse = false;
    assert(component.update().data === '정상', 'Render guard was not released');
  }],
];
