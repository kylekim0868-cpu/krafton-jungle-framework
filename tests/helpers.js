import { domToVNode } from '../src/vdom/domToVNode.js';

// HTML 문자열 → 실제 DOM 요소
export const parse = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

// HTML 문자열 → VDOM
export const vdom = (html) => domToVNode(parse(html));
