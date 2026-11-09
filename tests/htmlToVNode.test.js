import { describe, it, expect } from 'vitest';
import { htmlToVNodes, normalizeVNode } from '../src/vdom/htmlToVNode.js';
import { sanitizeVNode } from '../src/vdom/sanitizeVNode.js';
import { vnodeToHTML } from '../src/vdom/vnodeToHTML.js';
import { h } from '../src/vdom/h.js';

const toHTML = (children) => children.map((child) => vnodeToHTML(child)).join('\n');

describe('htmlToVNodes', () => {
  it('여러 최상위 노드를 배열로 변환한다', () => {
    const { children } = htmlToVNodes('<h1>a</h1>\n<p>b</p>\n텍스트');
    expect(children.map((child) => child.type)).toEqual(['h1', 'p', '#text']);
  });

  it('빈 입력이면 빈 배열', () => {
    expect(htmlToVNodes('').children).toEqual([]);
    expect(htmlToVNodes('   \n  ').children).toEqual([]);
  });

  it('닫히지 않은 태그는 브라우저 파서 규칙대로 보정된다', () => {
    const { children } = htmlToVNodes('<div><p>a');
    expect(toHTML(children)).toBe('<div>\n  <p>a</p>\n</div>');
  });

  it('들여쓰기만 다른 HTML 은 같은 VDOM 이 된다 (의미 없는 TEXT patch 방지)', () => {
    const compact = htmlToVNodes('<p>안녕 <b>세상</b></p>').children;
    const indented = htmlToVNodes('<p>\n    안녕\n    <b>세상</b>\n  </p>').children;
    expect(indented).toEqual(compact);
  });

  it('pre 안의 공백은 보존한다', () => {
    const { children } = htmlToVNodes('<pre>  a\n   b</pre>');
    expect(children[0].children[0].text).toBe('  a\n   b');
  });

  it('VDOM → HTML → VDOM 왕복이 안정적이다 (텍스트와 태그가 섞인 경우 포함)', () => {
    const first = htmlToVNodes('<div><p>안녕 <b>세상</b> 끝</p><ul><li>1</li><li>2</li></ul></div>').children;
    const second = htmlToVNodes(toHTML(first)).children;
    expect(second).toEqual(first);
  });
});

describe('normalizeVNode', () => {
  it('연속 공백을 한 칸으로, 양 끝 공백은 제거', () => {
    const vnode = normalizeVNode(h('p', null, '  a   b  '));
    expect(vnode.children[0].text).toBe('a b');
  });
});

describe('sanitizeVNode (XSS 방지)', () => {
  it('<script> 를 제거하고 목록에 남긴다', () => {
    const { children, removed } = htmlToVNodes('<p>a</p><script>alert(1)</script>');
    expect(children).toHaveLength(1);
    expect(removed).toEqual(['<script>']);
  });

  it('문자열 이벤트 속성과 javascript: 링크를 제거한다', () => {
    const { children, removed } = htmlToVNodes('<a href="javascript:alert(1)" onclick="x()" class="c">a</a>');
    expect(children[0].props).toEqual({ class: 'c' });
    expect(removed).toHaveLength(2);
  });

  it('함수 이벤트 핸들러(코드로 넣은 것)는 유지한다', () => {
    const onClick = () => {};
    const { vnode } = sanitizeVNode(h('button', { onClick }, 'ok'));
    expect(vnode.props.onClick).toBe(onClick);
  });
});
