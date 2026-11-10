import { domToVNode } from '../../src/vdom/domToVNode.js';
import { renderVNode } from '../../src/vdom/renderVNode.js';

/**
 * 검증 조건이 거짓이면 예외를 던져 브라우저의 테스트 실행 함수에 실패 이유를 전달한다.
 * @param {boolean} condition 확인할 조건.
 * @param {string} message 조건을 충족하지 못했을 때 표시할 이유.
 * @throws {Error} 조건을 충족하지 못한 경우 발생한다.
 */
export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// 여기서는 같은 속성 순서로 구성한 JSON 직렬화 가능한 VNode 기대값을 비교한다.
// 객체의 모든 동등성 규칙을 검사하는 범용 함수가 아니라 fixture의 구조와 값을 확인한다.
function equal(actual, expected) {
  assert(JSON.stringify(actual) === JSON.stringify(expected),
    `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}

// 지원하지 않는 입력이 명시적으로 TypeError를 발생시키는지 확인한다.
// 예외가 없거나 다른 종류의 예외가 발생하면 이 보조 함수가 검사를 실패시킨다.
function throwsTypeError(callback) {
  let error;
  try { callback(); } catch (caught) { error = caught; }
  assert(error instanceof TypeError, 'Expected an explicit TypeError.');
}

// 테스트용 HTML로 입력 DOM을 준비한다. 제품의 렌더링 경로에는 사용하지 않는다.
// document에 마운트하지 않으므로 이 입력을 변경해도 데모 화면에는 영향을 주지 않는다.
function fixture(html) {
  const container = document.createElement('div');
  container.innerHTML = html;
  return container.firstChild;
}

// 각 항목을 [검증 이름, 검증 함수]로 묶어 브라우저 실행 페이지에 전달한다.
// 배열 정의만으로 통과한 것은 아니며 브라우저가 각 함수를 실제 실행해야 결과가 나온다.
export const vdomTests = [
  ['태그·속성·텍스트·중첩 자식 순서를 읽는다', () => {
    const input = fixture('<section id="card" data-kind="sample">앞<strong>중간</strong>뒤</section>');
    equal(domToVNode(input), {
      kind: 'element', tag: 'section', props: { id: 'card', 'data-kind': 'sample' },
      children: [
        { kind: 'text', text: '앞' },
        { kind: 'element', tag: 'strong', props: {}, children: [{ kind: 'text', text: '중간' }] },
        { kind: 'text', text: '뒤' },
      ],
    });
  }],
  ['비어 있는 요소를 읽는다', () => {
    equal(domToVNode(fixture('<div></div>')), {
      kind: 'element', tag: 'div', props: {}, children: [],
    });
  }],
  ['텍스트 루트와 공백을 보존한다', () => {
    equal(domToVNode(document.createTextNode(' 앞\n  뒤 ')), { kind: 'text', text: ' 앞\n  뒤 ' });
  }],
  ['공백만 있는 자식도 유지한다', () => {
    // children만 순회하거나 trim하면 사라질 수 있는 공백 노드를 별도로 검사한다.
    equal(domToVNode(fixture('<div> \n <span></span> </div>')).children, [
      { kind: 'text', text: ' \n ' },
      { kind: 'element', tag: 'span', props: {}, children: [] },
      { kind: 'text', text: ' ' },
    ]);
  }],
  ['자식 주석만 제외하고 양쪽 텍스트는 유지한다', () => {
    // 주석을 제거하더라도 앞뒤의 독립된 텍스트 노드를 임의로 합치지 않는 계약이다.
    equal(domToVNode(fixture('<p>A<!-- comment -->B</p>')).children, [
      { kind: 'text', text: 'A' }, { kind: 'text', text: 'B' },
    ]);
  }],
  ['주석 루트는 null이다', () => {
    equal(domToVNode(document.createComment('comment')), null);
  }],
  ['boolean·빈 속성의 문자열 값을 유지한다', () => {
    equal(domToVNode(fixture('<input disabled value="" data-empty="">')).props,
      { disabled: '', value: '', 'data-empty': '' });
  }],
  ['SVG와 중첩 SVG는 조용히 누락하지 않고 거부한다', () => {
    throwsTypeError(() => domToVNode(document.createElementNS('http://www.w3.org/2000/svg', 'svg')));
    throwsTypeError(() => domToVNode(fixture('<div><svg></svg></div>')));
  }],
  ['Document·Fragment·잘못된 입력을 거부한다', () => {
    for (const node of [document, document.createDocumentFragment(), null, {}]) {
      throwsTypeError(() => domToVNode(node));
    }
  }],
  ['변환이 원본 DOM과 노드 참조를 변경하지 않는다', () => {
    // 직렬화한 모양뿐 아니라 기존 자식의 참조도 같아야 읽기 전용 변환임을 확인할 수 있다.
    const input = fixture('<div data-id="source"><b>원본</b> text</div>');
    const before = input.outerHTML;
    const child = input.firstChild;
    domToVNode(input);
    assert(input.outerHTML === before && input.firstChild === child, 'Source DOM changed.');
  }],
  ['명시한 VNode로 마운트되지 않은 DOM을 만든다', () => {
    const actual = renderVNode({
      kind: 'element', tag: 'section', props: { 'data-test': 'sample' },
      children: [{ kind: 'text', text: 'hello' }],
    });
    assert(actual.outerHTML === '<section data-test="sample">hello</section>', 'Wrong rendered DOM.');
    assert(actual.parentNode === null, 'Renderer mounted the node.');
  }],
  ['텍스트를 HTML로 해석하지 않는다', () => {
    const text = '<strong>literal & text</strong>';
    const actual = renderVNode({ kind: 'element', tag: 'div', props: {}, children: [{ kind: 'text', text }] });
    assert(actual.textContent === text && actual.children.length === 0, 'Text was interpreted as markup.');
  }],
  ['변환·렌더 왕복에서 구조를 보존하며 새 노드를 만든다', () => {
    // 구조의 동등성과 노드의 독립성을 따로 확인한다.
    // 마지막에는 새 트리를 수정해 원본 트리로 변경이 전파되지 않는지 검사한다.
    const input = fixture('<article class="card"><p>안녕 <em>DOM</em></p><br><input value="sample" disabled></article>');
    const rendered = renderVNode(domToVNode(input));
    assert(rendered.isEqualNode(input), 'Round trip changed DOM structure.');
    assert(rendered !== input && rendered.firstChild !== input.firstChild, 'Source nodes were reused.');
    rendered.firstChild.textContent = '수정';
    assert(input.firstChild.textContent === '안녕 DOM', 'Editing rendered DOM changed source.');
  }],
  ['template의 content를 보존한다', () => {
    // template은 일반 childNodes만 읽으면 내부 내용이 비므로 별도 회귀 사례로 둔다.
    const input = fixture('<template><p data-x="1">template <b>text</b></p></template>');
    const vnode = domToVNode(input);
    assert(vnode.children.length === 1, 'Template content was lost.');
    assert(renderVNode(vnode).innerHTML === input.innerHTML, 'Template round trip failed.');
  }],
  ['잘못된 VNode를 명시적으로 거부한다', () => {
    for (const vnode of [null, {}, { kind: 'text', text: 42 },
      { kind: 'element', tag: 'div', props: {}, children: null }]) {
      throwsTypeError(() => renderVNode(vnode));
    }
  }],
  ['P1-01 / 대표 입력의 변환 결과와 새 DOM이 계약에 맞는다', () => {
    const source = fixture('<p class="note">안녕</p>');
    const vnode = domToVNode(source);
    equal(vnode, {
      kind: 'element', tag: 'p', props: { class: 'note' },
      children: [{ kind: 'text', text: '안녕' }],
    });
    const rendered = renderVNode(vnode);
    assert(rendered.isEqualNode(source), 'Representative round trip changed structure.');
    assert(rendered !== source && rendered.firstChild !== source.firstChild, 'Source nodes were reused.');
    assert(rendered.parentNode === null, 'Renderer mounted the result.');
  }],
  ['P1-01 / HTML 엔티티는 DOM에서 읽은 실제 문자로 보존한다', () => {
    // 원래 HTML 표기법이 아니라 브라우저가 해석한 속성·텍스트 문자열을 저장한다.
    const source = fixture('<p title="A &amp; &quot;B&quot;">&lt;b&gt;&amp;&nbsp;한글 😀</p>');
    const vnode = domToVNode(source);
    equal(vnode.props, { title: 'A & "B"' });
    equal(vnode.children, [{ kind: 'text', text: '<b>&\u00a0한글 😀' }]);
    const rendered = renderVNode(vnode);
    assert(rendered.isEqualNode(source) && rendered.children.length === 0, 'Characters became markup.');
  }],
  ['P1-01 / 빈 텍스트 루트와 연속된 텍스트 노드를 합치지 않는다', () => {
    const empty = domToVNode(document.createTextNode(''));
    equal(empty, { kind: 'text', text: '' });
    const emptyDOM = renderVNode(empty);
    assert(emptyDOM.nodeType === 3 && emptyDOM.data === '', 'Empty text root was lost.');

    // HTML 직렬화만 비교하면 연속 텍스트의 경계가 사라져도 발견할 수 없다.
    const source = document.createElement('p');
    source.append(document.createTextNode('A'), document.createTextNode(''), document.createTextNode('B'));
    const vnode = domToVNode(source);
    equal(vnode.children, [
      { kind: 'text', text: 'A' }, { kind: 'text', text: '' }, { kind: 'text', text: 'B' },
    ]);
    const rendered = renderVNode(vnode);
    assert(rendered.childNodes.length === 3 && rendered.isEqualNode(source), 'Text node boundaries changed.');
  }],
  ['P1-01 / 같은 태그의 형제도 공백·텍스트와 함께 순서를 보존한다', () => {
    const source = fixture('<div> <b data-id="a">A</b>\n<b data-id="b">B</b> 끝</div>');
    equal(domToVNode(source).children, [
      { kind: 'text', text: ' ' },
      { kind: 'element', tag: 'b', props: { 'data-id': 'a' }, children: [{ kind: 'text', text: 'A' }] },
      { kind: 'text', text: '\n' },
      { kind: 'element', tag: 'b', props: { 'data-id': 'b' }, children: [{ kind: 'text', text: 'B' }] },
      { kind: 'text', text: ' 끝' },
    ]);
    assert(renderVNode(domToVNode(source)).isEqualNode(source), 'Sibling order changed.');
  }],
  ['P1-01 / 중첩 template의 텍스트·공백은 보존하고 주석만 제외한다', () => {
    const source = fixture('<template> 앞<!-- 제외 --><template><b>B</b></template> 뒤 </template>');
    const original = source.innerHTML;
    const originalNodes = Array.from(source.content.childNodes);
    const vnode = domToVNode(source);
    equal(vnode, {
      kind: 'element', tag: 'template', props: {}, children: [
        { kind: 'text', text: ' 앞' },
        { kind: 'element', tag: 'template', props: {}, children: [
          { kind: 'element', tag: 'b', props: {}, children: [{ kind: 'text', text: 'B' }] },
        ] },
        { kind: 'text', text: ' 뒤 ' },
      ],
    });
    const rendered = renderVNode(vnode);
    assert(rendered.childNodes.length === 0 && rendered.content.childNodes.length === 3, 'Wrong template container.');
    const nested = rendered.content.childNodes[1];
    assert(nested.content.firstChild.firstChild.data === 'B', 'Nested template text was lost.');
    assert(source.innerHTML === original, 'Source template content changed.');
    assert(originalNodes.every((node, index) => source.content.childNodes[index] === node), 'Source template nodes changed.');
    equal(domToVNode(rendered), vnode);
  }],
  ['P1-01 / 빈 template과 주석만 있는 template을 빈 children으로 읽는다', () => {
    for (const html of ['<template></template>', '<template><!-- 유지할 원본 주석 --></template>']) {
      const source = fixture(html);
      const original = source.innerHTML;
      const vnode = domToVNode(source);
      equal(vnode, { kind: 'element', tag: 'template', props: {}, children: [] });
      assert(renderVNode(vnode).content.childNodes.length === 0, 'Empty template gained children.');
      assert(source.innerHTML === original, 'Reading removed source comments.');
    }
  }],
  ['P1-01 / 변환된 VNode와 원본 DOM은 양방향으로 독립적이다', () => {
    const source = fixture('<p class="before"><b>원본</b></p>');
    const first = domToVNode(source);
    source.setAttribute('class', 'after');
    source.firstChild.firstChild.data = 'DOM 수정';
    assert(first.props.class === 'before' && first.children[0].children[0].text === '원본', 'VNode retained live DOM data.');

    const second = domToVNode(source);
    second.props.class = 'VNode 수정';
    second.children[0].children[0].text = 'VNode 수정';
    second.children.push({ kind: 'text', text: '추가' });
    assert(source.className === 'after' && source.textContent === 'DOM 수정', 'VNode mutation changed source.');
    assert(source.childNodes.length === 1, 'VNode children shared the DOM child list.');
    assert(first !== second && first.props !== second.props && first.children !== second.children, 'Conversions shared data objects.');
  }],
  ['P1-01 / 렌더링은 동결된 VNode를 변경하지 않고 매번 새 노드를 만든다', () => {
    const vnode = domToVNode(fixture('<div data-id="a"><template><b>B</b></template> 끝</div>'));
    // 입력 전체를 동결해 깊은 곳의 속성·자식 수정도 예외로 드러낸다.
    function freezeTree(node) {
      if (node.kind === 'element') {
        Object.freeze(node.props);
        node.children.forEach(freezeTree);
        Object.freeze(node.children);
      }
      Object.freeze(node);
    }
    freezeTree(vnode);
    const before = JSON.stringify(vnode);
    const first = renderVNode(vnode);
    const second = renderVNode(vnode);
    assert(first.isEqualNode(second) && first !== second, 'Renders reused the same root.');
    const firstText = first.firstChild.content.firstChild.firstChild;
    const secondText = second.firstChild.content.firstChild.firstChild;
    assert(firstText !== secondText, 'Renders shared nested template nodes.');
    firstText.data = '수정';
    assert(secondText.data === 'B' && JSON.stringify(vnode) === before, 'Rendering or editing changed input data.');
  }],
  ['P1-01 / 폼의 현재 프로퍼티가 아닌 HTML 속성을 읽는다', () => {
    const source = fixture('<div><input type="text" value="initial"><input type="checkbox" checked></div>');
    const [textInput, checkbox] = source.children;
    // 텍스트 입력의 value와 체크박스의 checked는 현재 상태를 HTML 속성과 분리해 바꿀 수 있다.
    // 체크박스의 value는 속성도 바꾸므로 이 경계의 검사 입력으로 사용하지 않는다.
    textInput.value = '사용자가 입력한 값';
    checkbox.checked = false;
    const vnode = domToVNode(source);
    equal(vnode.children[0].props, { type: 'text', value: 'initial' });
    equal(vnode.children[1].props, { type: 'checkbox', checked: '' });
    const rendered = renderVNode(vnode);
    assert(rendered.children[0].value === 'initial' && rendered.children[1].checked === true, 'Renderer copied live form properties.');
    assert(textInput.value === '사용자가 입력한 값' && checkbox.checked === false, 'Source form state changed.');
  }],
  ['P1-01 / MathML·다른 네임스페이스·속성·doctype 노드는 거부한다', () => {
    for (const node of [
      document.createElementNS('http://www.w3.org/1998/Math/MathML', 'math'),
      document.createElementNS('urn:unsupported', 'item'),
      document.createAttribute('title'), document.doctype,
    ]) throwsTypeError(() => domToVNode(node));
    throwsTypeError(() => domToVNode(fixture('<div><math><mi>x</mi></math></div>')));
  }],
  ['P1-01 / 중첩된 지원 밖 입력에서 실패해도 원본 전체를 보존한다', () => {
    const source = fixture('<div>앞<b>B</b><template>안<svg></svg>뒤</template>끝</div>');
    const original = source.outerHTML;
    const nodes = Array.from(source.childNodes);
    const templateNodes = Array.from(source.querySelector('template').content.childNodes);
    throwsTypeError(() => domToVNode(source));
    assert(source.outerHTML === original, 'Failed conversion changed source structure.');
    assert(nodes.every((node, index) => source.childNodes[index] === node), 'Failed conversion replaced source nodes.');
    const content = source.querySelector('template').content;
    assert(templateNodes.every((node, index) => content.childNodes[index] === node), 'Failed conversion changed template nodes.');
  }],
  ['P1-01 / 다른 문서의 HTML을 읽고 현재 문서에 독립적인 DOM을 만든다', () => {
    const otherDocument = document.implementation.createHTMLDocument('입력 문서');
    otherDocument.body.innerHTML = '<p class="note">다른 문서</p>';
    const source = otherDocument.body.firstChild;
    const original = source.outerHTML;
    const rendered = renderVNode(domToVNode(source));
    assert(rendered.ownerDocument === document && source.ownerDocument === otherDocument, 'Wrong owner document.');
    assert(rendered.isEqualNode(source) && rendered !== source, 'Cross-document conversion failed.');
    assert(source.parentNode === otherDocument.body && source.outerHTML === original, 'Source document changed.');
  }],
];
