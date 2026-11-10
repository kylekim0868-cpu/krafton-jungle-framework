import { domToVNode } from '../../src/vdom/domToVNode.js';
import { diff } from '../../src/vdom/diff.js';
import { patch, preparePatch } from '../../src/vdom/patch.js';
import { assert } from './vdom.test.js';

function fixture(html) {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host.firstChild;
}

function equal(actual, expected) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `Unexpected value: ${JSON.stringify(actual)}`);
}

function rejects(run) {
  let failed = false;
  try { run(); } catch { failed = true; }
  assert(failed, 'Invalid input was accepted.');
}

/** 실제 DOM을 변환·비교·Patch하고 목표 DOM과 독립적인 동등성 검사도 수행한다. */
function roundTrip(before, after) {
  const source = fixture(before);
  const target = fixture(after);
  const previous = domToVNode(source);
  const next = domToVNode(target);
  const inputs = JSON.stringify([previous, next]);
  const changes = diff(previous, next);
  const result = patch(source, changes);
  assert(result.isEqualNode(target), `Wrong DOM: ${result.outerHTML ?? result.data}`);
  assert(JSON.stringify([previous, next]) === inputs, 'Diff or Patch changed input VNodes.');
  return { source, result, changes };
}

export const diffPatchTests = [
  ['동일 트리는 변경·DOM 쓰기가 없다', () => {
    const root = fixture('<div class="x"><b>A</b></div>');
    const child = root.firstChild;
    const observer = new MutationObserver(() => {});
    observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
    const changes = diff(domToVNode(root), domToVNode(root));
    equal(changes, []);
    assert(patch(root, changes) === root && root.firstChild === child, 'Unchanged nodes were replaced.');
    assert(observer.takeRecords().length === 0, 'No-op patch wrote DOM.');
    observer.disconnect();
  }],
  ['텍스트만 바꾸고 요소·텍스트 참조를 보존한다', () => {
    const root = fixture('<p>안녕</p>');
    const text = root.firstChild;
    const changes = diff(domToVNode(root), domToVNode(fixture('<p>반가워</p>')));
    equal(changes, [{ type: 'TEXT', path: [0], text: '반가워' }]);
    assert(patch(root, changes) === root && root.firstChild === text && text.data === '반가워', 'Text reference changed.');
  }],
  ['속성 추가·변경·삭제와 빈 문자열을 처리한다', () => {
    const { changes } = roundTrip('<p class="old" title="remove">A</p>', '<p class="new" data-empty="">A</p>');
    equal(changes, [{ type: 'PROPS', path: [], set: { class: 'new', 'data-empty': '' }, remove: ['title'] }]);
  }],
  ['key 없는 자식 끝에 추가한다', () => {
    const { changes } = roundTrip('<div><b>A</b></div>', '<div><b>A</b><i>B</i></div>');
    assert(changes.length === 1 && changes[0].type === 'INSERT' && changes[0].index === 1, 'Wrong insertion.');
  }],
  ['여러 꼬리 자식을 이전 경로로 삭제한다', () => {
    const { changes } = roundTrip('<div><b>A</b><i>B</i><u>C</u></div>', '<div><b>A</b></div>');
    equal(changes, [{ type: 'REMOVE', path: [2] }, { type: 'REMOVE', path: [1] }]);
  }],
  ['마운트된 루트를 교체하고 새 루트 참조를 반환한다', () => {
    const source = fixture('<p>A</p>');
    const host = source.parentNode;
    const next = domToVNode(fixture('<section>B</section>'));
    const result = patch(source, diff(domToVNode(source), next));
    assert(host.firstChild === result && result.localName === 'section' && result.textContent === 'B', 'Root replacement failed.');
    assert(source.parentNode === null, 'Old root remained mounted.');
  }],
  ['앞 삽입은 새 key 하나만 추가하고 기존 항목을 유지한다', () => {
    const root = fixture('<ul><li data-key="a">A</li><li data-key="b">B</li></ul>');
    const [a, b] = root.children;
    const next = domToVNode(fixture('<ul><li data-key="x">X</li><li data-key="a">A</li><li data-key="b">B</li></ul>'));
    const changes = diff(domToVNode(root), next);
    assert(changes.length === 1 && changes[0].type === 'INSERT', 'Existing keys were unnecessarily changed.');
    patch(root, changes);
    assert(root.children[1] === a && root.children[2] === b && root.textContent === 'XAB', 'Key identity was lost.');
  }],
  ['순환 이동은 MOVE 하나로 처리하고 현재 입력값을 보존한다', () => {
    const root = fixture('<div><p data-key="a">A<input></p><p data-key="b">B</p><p data-key="c">C</p></div>');
    const [a, b, c] = root.children;
    a.querySelector('input').value = '현재 입력';
    const target = fixture('<div><p data-key="c">C</p><p data-key="a">A<input></p><p data-key="b">B</p></div>');
    const changes = diff(domToVNode(root), domToVNode(target));
    assert(changes.length === 1 && changes[0].type === 'MOVE', 'Rotation required unnecessary moves.');
    patch(root, changes);
    assert(root.children[0] === c && root.children[1] === a && root.children[2] === b, 'Moved nodes were recreated.');
    assert(a.querySelector('input').value === '현재 입력', 'Move lost live input state.');
  }],
  ['key·공백·일반 텍스트가 섞여 있어도 목표 순서가 된다', () => {
    roundTrip('<div> <b data-key="a">A</b>\n<b data-key="b">B</b> 끝</div>',
      '<div> <b data-key="b">B</b>\n<i data-key="x">X</i> <b data-key="a">A</b> 끝</div>');
  }],
  ['key가 바뀌면 같은 위치·태그여도 새 항목이다', () => {
    const root = fixture('<div><b data-key="a">A</b></div>');
    const old = root.firstChild;
    patch(root, diff(domToVNode(root), domToVNode(fixture('<div><b data-key="x">A</b></div>'))));
    assert(root.firstChild !== old && old.parentNode === null, 'Different keys shared identity.');
  }],
  ['같은 key의 태그 교체와 이동을 함께 처리한다', () => {
    roundTrip('<div><b data-key="a">A</b><b data-key="b">B</b><b data-key="c">C</b></div>',
      '<div><b data-key="c">C</b><i data-key="a">새 A</i><b data-key="b" class="changed">B</b></div>');
  }],
  ['주석·공백·중첩 template 경로가 실제 텍스트를 가리킨다', () => {
    const root = fixture('<div>A<!-- 메모 --><template> <b>B</b><!-- 설명 -->C</template>D</div>');
    const comment = root.childNodes[1];
    const content = root.querySelector('template').content;
    const text = content.querySelector('b').firstChild;
    const target = fixture('<div>A<!-- 메모 --><template> <b>변경</b><!-- 설명 -->C</template>D</div>');
    const changes = diff(domToVNode(root), domToVNode(target));
    equal(changes, [{ type: 'TEXT', path: [1, 1, 0], text: '변경' }]);
    patch(root, changes);
    assert(text.data === '변경' && root.childNodes[1] === comment, 'Template path or comment preservation failed.');
  }],
  ['끝 삽입은 뒤쪽 주석 다음과 template.content에 적용한다', () => {
    const root = fixture('<div>A<!-- 끝 --></div>');
    patch(root, [{ type: 'INSERT', parentPath: [], index: 1, vnode: { kind: 'text', text: 'X' } }]);
    assert(root.innerHTML === 'A<!-- 끝 -->X', 'Trailing comment anchor changed.');
    const template = fixture('<template><!-- 메모 --></template>');
    patch(template, [{ type: 'INSERT', parentPath: [], index: 0, vnode: domToVNode(fixture('<b>B</b>')) }]);
    assert(template.innerHTML === '<!-- 메모 --><b>B</b>', 'Template insertion failed.');
  }],
  ['준비는 DOM을 변경하지 않고 적용 함수는 한 번만 실행한다', () => {
    const root = fixture('<p>A</p>');
    const apply = preparePatch(root, [{ type: 'TEXT', path: [0], text: 'B' }]);
    assert(root.textContent === 'A', 'Preparation modified DOM.');
    assert(apply() === root && root.textContent === 'B', 'Prepared apply failed.');
    rejects(apply);
  }],
  ['잘못된 경로가 있으면 앞선 정상 변경도 적용하지 않는다', () => {
    for (const path of [[1], [-1], [0.5], [0, 0]]) {
      const root = fixture('<p>A</p>');
      rejects(() => patch(root, [{ type: 'TEXT', path: [0], text: 'B' }, { type: 'TEXT', path, text: 'C' }]));
      assert(root.textContent === 'A', 'Invalid path partially applied.');
    }
  }],
  ['잘못된 속성 이름을 적용 전에 거부한다', () => {
    const root = fixture('<p>A</p>');
    rejects(() => patch(root, [{ type: 'TEXT', path: [0], text: 'B' },
      { type: 'PROPS', path: [], set: { 'bad name': 'x' }, remove: [] }]));
    assert(root.outerHTML === '<p>A</p>', 'Invalid attribute partially applied.');
  }],
  ['겹친 변경·루트 삭제·중복 배치·범위 밖 삽입을 거부한다', () => {
    const root = fixture('<div><b>A</b></div>');
    const text = { kind: 'text', text: 'X' };
    for (const changes of [
      [{ type: 'REMOVE', path: [] }],
      [{ type: 'REMOVE', path: [0] }, { type: 'TEXT', path: [0, 0], text: 'B' }],
      [{ type: 'TEXT', path: [0, 0], text: 'B' }, { type: 'TEXT', path: [0, 0], text: 'C' }],
      [{ type: 'INSERT', parentPath: [], index: 0, vnode: text }, { type: 'INSERT', parentPath: [], index: 0, vnode: text }],
      [{ type: 'INSERT', parentPath: [], index: 3, vnode: text }],
    ]) rejects(() => patch(root, changes));
    assert(root.outerHTML === '<div><b>A</b></div>', 'Rejected changes modified DOM.');
  }],
  ['중복·빈 key와 지원 밖 VNode를 거부한다', () => {
    const valid = domToVNode(fixture('<div></div>'));
    for (const html of ['<div><b data-key="a"></b><i data-key="a"></i></div>', '<div><b data-key=" "></b></div>']) {
      rejects(() => diff(valid, domToVNode(fixture(html))));
    }
    rejects(() => diff(valid, null));
    rejects(() => patch(fixture('<div><b data-key="a"></b></div>'), [
      { type: 'INSERT', parentPath: [], index: 1, vnode: domToVNode(fixture('<i data-key="a"></i>')) },
    ]));
  }],
  ['빈 고정 루트와 여러 최상위 노드를 연속 갱신한다', () => {
    const root = fixture('<div><p>A</p><p>B</p></div>');
    for (const html of ['<div></div>', '<div>텍스트<b>B</b></div>', '<div><i>C</i></div>']) {
      const target = fixture(html);
      assert(patch(root, diff(domToVNode(root), domToVNode(target))) === root, 'Fixed root changed.');
      assert(root.isEqualNode(target), 'Sequential patch failed.');
    }
  }],
  ['여러 key 순열에서 목표 구조와 모든 생존 항목 참조를 유지한다', () => {
    const ids = ['a', 'b', 'c', 'd'];
    function permutations(values) {
      return values.length ? values.flatMap((value, index) => permutations(values.filter((_, i) => i !== index))
        .map((rest) => [value, ...rest])) : [[]];
    }
    const html = (keys) => `<ul>${keys.map((key) => `<li data-key="${key}">${key}</li>`).join('')}</ul>`;
    for (const order of permutations(ids)) {
      const root = fixture(html(ids));
      const refs = new Map(Array.from(root.children, (node) => [node.dataset.key, node]));
      const target = fixture(html(order));
      patch(root, diff(domToVNode(root), domToVNode(target)));
      assert(root.isEqualNode(target), `Permutation failed: ${order}`);
      assert(Array.from(root.children).every((node) => refs.get(node.dataset.key) === node), 'Permutation recreated nodes.');
    }
  }],
];
