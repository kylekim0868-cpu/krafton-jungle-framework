// mini-react 공개 API 진입점
// 페이지(pages/)와 다른 모듈은 이 파일 하나만 import 하면 됩니다.
//  - 팀원별 구현을 비교할 때도 같은 이름의 API 로 테스트할 수 있도록 진입점을 하나로 모읍니다.

// export {...} from 문법 : 재내보내기
// 원래 :  import { h } from 
//          export { h };
//이 문법을 한줄로 합친것
//외부에서 가져다 쓸 때 경로가 엄청 깔끔해짐


// Phase 1: Virtual DOM
export { h, createTextVNode, TEXT } from './vdom/h.js';
export { domToVNode } from './vdom/domToVNode.js';
export { createElement, setProp, updateProp, removeProp } from './vdom/createElement.js';
export { vnodeToHTML } from './vdom/vnodeToHTML.js';
export { htmlToVNodes, normalizeVNode } from './vdom/htmlToVNode.js';
export { sanitizeVNode } from './vdom/sanitizeVNode.js';

// Phase 1: Diff + Patch
export { diff, PATCH } from './diff/diff.js';
export { diffProps } from './diff/diffProps.js';
export { applyPatches, patch, getNode } from './diff/patch.js';

// Phase 1: State History
export { StateHistory, MAX_HISTORY_SIZE } from './history/stateHistory.js';

// Phase 2: Component + Hooks
export { FunctionComponent, mountRoot } from './core/functionComponent.js';
export { useState, useEffect, useMemo } from './core/hooks.js';
export { resolveVNode } from './core/resolveVNode.js';
export { flushUpdates } from './core/scheduler.js';
