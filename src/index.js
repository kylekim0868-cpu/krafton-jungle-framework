// mini-react 공개 API 진입점
// 페이지(pages/)와 다른 모듈은 이 파일 하나만 import 하면 됩니다.
//  - 팀원별 구현을 비교할 때도 같은 이름의 API 로 테스트할 수 있도록 진입점을 하나로 모읍니다.

// Phase 1: Virtual DOM
export { h, createTextVNode, TEXT } from './vdom/h.js';
export { domToVNode } from './vdom/domToVNode.js';
export { createElement, setProp, updateProp, removeProp } from './vdom/createElement.js';
export { vnodeToHTML } from './vdom/vnodeToHTML.js';

// Phase 1: Diff + Patch
export { diff, PATCH } from './diff/diff.js';
export { diffProps } from './diff/diffProps.js';
export { applyPatches, patch } from './diff/patch.js';
