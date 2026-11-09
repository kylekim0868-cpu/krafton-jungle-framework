import { TEXT } from './h.js';

/*
  사용자가 테스트 영역에 입력한 HTML 을 실제 영역에 그리기 전에 위험한 요소를 제거합니다.

  왜 필요한가?
   - <template> 로 파싱할 때는 <script> 가 실행되지 않지만,
     createElement 로 만든 <script> 를 문서에 붙이면 실행됩니다.
   - onclick="..." 같은 "문자열" 이벤트 속성은 setAttribute 로 넣는 순간 인라인 핸들러가 됩니다.
   - href="javascript:..." 는 클릭 시 코드가 실행됩니다.
  → 테스트 페이지에서 임의 코드가 실행되지 않도록(XSS 방지) VDOM 단계에서 걸러냅니다.
*/
export const BLOCKED_TAGS = new Set(['script', 'iframe', 'object', 'embed', 'frame', 'frameset', 'base', 'meta', 'link']);
const URL_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction', 'xlink:href']);
const DANGEROUS_URL = /^\s*(javascript|vbscript|data:text\/html)/i;

// 반환: { vnode, removed: ['<script>', 'onclick', ...] }  (vnode 가 통째로 막히면 vnode = null)
export function sanitizeVNode(vnode, removed = []) {
  if (vnode.type === TEXT) return { vnode, removed };

  if (BLOCKED_TAGS.has(vnode.type)) {
    removed.push(`<${vnode.type}>`);
    return { vnode: null, removed };
  }

  const props = {};
  for (const [name, value] of Object.entries(vnode.props)) {
    const lowerName = name.toLowerCase();
    // 문자열 이벤트 속성 (함수 핸들러는 Phase 2 에서 코드로만 넣으므로 허용)
    if (lowerName.startsWith('on') && typeof value !== 'function') {
      removed.push(lowerName);
      continue;
    }
    if (URL_ATTRIBUTES.has(lowerName) && DANGEROUS_URL.test(String(value))) {
      removed.push(`${lowerName}="${value}"`);
      continue;
    }
    props[name] = value;
  }

  const children = [];
  for (const child of vnode.children) {
    const result = sanitizeVNode(child, removed);
    if (result.vnode) children.push(result.vnode);
  }

  return { vnode: { ...vnode, props, children }, removed };
}
