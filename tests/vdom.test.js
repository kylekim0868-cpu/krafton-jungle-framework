import { describe, it, expect } from 'vitest';
import { h } from '../src/vdom/h.js';
import { domToVNode } from '../src/vdom/domToVNode.js';
import { createElement } from '../src/vdom/createElement.js';
import { vnodeToHTML } from '../src/vdom/vnodeToHTML.js';

//문자열로 된 HTML('<div id="a">...</div>')을 브라우저 메모리 상의 실제 DOM 요소(Element)로 변환해 주는 도구입니다.
const parse = html => {
  //<template>이라는 특수한 HTML 요소를 메모리에 생성합니다
  //template 태그는 화면에 렌더링되지 않으면서 내부 HTML 파싱만 안전하게 수행하므로, 단위 테스트에서 가짜 DOM 노드를 만들 때 표준적으로 쓰는 기법입니다.
  const t = document.createElement('template');
  t.innerHTML = html.trim(); 
  return t.content.firstElementChild; //파싱된 DOM 트리의 최상위 요소를 꺼내 반환합니다.
};

//실제 DOM의 계층 구조와 속성이 VNode 객체로 온전히 옮겨지는지 확인합니다.
describe('domToVNode', () => {
  it('중첩 요소와 속성을 변환한다', () => {
    const v = domToVNode(parse('<div id="a"><p class="x">hi</p></div>'));
    expect(v.type).toBe('div');
    expect(v.props.id).toBe('a');
    expect(v.children[0].children[0].text).toBe('hi');
  });
  //줄바꿈 공백(\n  )과 HTML 주석(<!-- c -->)이 필터링되는지 확인합니다.
  it('공백 텍스트와 주석을 무시한다', () => {
    const v = domToVNode(parse('<ul>\n  <!-- c -->\n  <li>1</li>\n</ul>'));
    expect(v.children).toHaveLength(1);
  });
});

//왕복 변환 테스트
describe('왕복 변환', () => {
  it('DOM → VDOM → DOM 결과가 같다', () => {
    const html = '<section><h1 title="t">제목</h1><input type="text"><br></section>';
    const el = createElement(domToVNode(parse(html)));
    expect(el.outerHTML).toBe(html);
  });
});

//h 함수 테스트
describe('h', () => {
  it('null/false children을 거르고 배열을 펼친다', () => {
    const v = h('ul', null, [1, 2].map(n => h('li', null, n)), false, null);
    expect(v.children).toHaveLength(2);
  });
});

describe('vnodeToHTML', () => {
  it('VDOM → HTML → VDOM 왕복 시 같은 구조', () => {
    const v1 = domToVNode(parse('<div id="a"><p>1 &lt; 2</p><br><input disabled></div>'));
    const v2 = domToVNode(parse(vnodeToHTML(v1)));
    expect(v2).toEqual(v1);
  });

  it('들여쓰기된 문자열을 만든다', () => {
    const v = domToVNode(parse('<ul><li>a</li><li>b</li></ul>'));
    expect(vnodeToHTML(v)).toBe('<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>');
  });
});