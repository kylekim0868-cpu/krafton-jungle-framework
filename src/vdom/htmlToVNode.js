import { TEXT } from './h.js';
import { domToVNode } from './domToVNode.js';
import { sanitizeVNode } from './sanitizeVNode.js';

// 공백을 그대로 보존해야 하는 태그 (화면에 공백/줄바꿈이 그대로 보임)
const PRESERVE_WHITESPACE_TAGS = new Set(['pre', 'textarea', 'code']);

/*
  HTML 문자열 → VNode 배열 (테스트 영역 textarea 의 내용을 VDOM 으로 바꿀 때 사용)

  textarea 에는 여러 개의 최상위 태그나 텍스트가 올 수 있으므로 "배열"로 반환합니다.
  반환: { children: VNode[], removed: string[] }
    removed: 보안상 제거된 요소 목록 (화면에 경고로 표시)
*/
export function htmlToVNodes(html) {
  // <template> 은 화면에 그려지지 않고, 내부 <script> 도 실행되지 않는 안전한 파서입니다.
  const template = document.createElement('template');
  template.innerHTML = html;

  const removed = [];
  const children = [];
  for (const node of template.content.childNodes) {
    const vnode = domToVNode(node);
    if (!vnode) continue;
    const result = sanitizeVNode(vnode, removed);
    if (result.vnode) children.push(result.vnode);
  }

  return { children: normalizeChildren(children), removed };
}

/*
  공백 정규화

  문제: 사람이 textarea 에서 들여쓰기를 하면
    <p>
      안녕
    </p>
  의 텍스트는 "\n    안녕\n  " 이 되어, 화면은 똑같은데 VDOM 은 "안녕" 과 달라집니다.
  → Patch 를 누를 때마다 의미 없는 TEXT 변경이 생깁니다.

  해결 (브라우저가 공백을 렌더링하는 규칙과 비슷하게):
   1) 연속된 공백/줄바꿈은 공백 한 칸으로 합칩니다.
   2) 형제 중 첫 번째 텍스트의 앞 공백, 마지막 텍스트의 뒤 공백은 제거합니다.
   3) <pre>, <textarea>, <code> 안은 공백이 의미가 있으므로 건드리지 않습니다.
*/
export function normalizeVNode(vnode) {
  if (vnode.type === TEXT || PRESERVE_WHITESPACE_TAGS.has(vnode.type)) return vnode;
  return { ...vnode, children: normalizeChildren(vnode.children) };
}

function normalizeChildren(children) {
  const result = children.map((child) =>
    child.type === TEXT ? { ...child, text: child.text.replace(/\s+/g, ' ') } : normalizeVNode(child),
  );

  const first = result[0];
  if (first?.type === TEXT) result[0] = { ...first, text: first.text.trimStart() };
  const lastIndex = result.length - 1;
  const last = result[lastIndex];
  if (last?.type === TEXT) result[lastIndex] = { ...last, text: last.text.trimEnd() };

  // 정규화 후 빈 문자열이 된 텍스트 노드는 제거
  return result.filter((child) => child.type !== TEXT || child.text !== '');
}
