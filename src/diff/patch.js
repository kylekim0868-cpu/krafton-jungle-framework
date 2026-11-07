import { createElement, updateProp } from '../vdom/createElement.js';
import { diff, PATCH } from './diff.js';

/*
  diff() 가 만든 변경 목록을 실제 DOM 에 반영합니다.

  container: VDOM 루트가 그려져 있는 "부모" 요소
             (container.childNodes[0] 이 VDOM 의 루트 노드에 해당)

  ⚠ 전제: container 안의 DOM 은 반드시 createElement(oldVNode) 로 그려진 것이어야 합니다.
     사람이 쓴 HTML 에는 공백 텍스트 노드가 섞여 있어서 VDOM 과 인덱스가 어긋나기 때문입니다.

  [인덱스 밀림 문제와 해결]
    자식 [a, b, c] 에서 b, c 를 지운다고 할 때,
    b(인덱스 1)를 먼저 지우면 c 가 인덱스 1 로 당겨져서 "인덱스 2" 를 찾으면 없습니다.
    → 해결: DOM 을 바꾸기 "전에" 모든 patch 의 대상 노드를 먼저 찾아둔 뒤(1단계),
            찾아둔 노드 참조를 이용해 변경합니다(2단계). 인덱스가 아니라 노드 자체를 붙잡고 있으므로 밀려도 상관없습니다.
*/
export function applyPatches(container, patches) {
  // 1단계: 대상 노드 미리 찾기
  const jobs = patches.map((patch) => {
    if (patch.type === PATCH.CREATE) {
      // CREATE 는 아직 없는 노드이므로 "부모"를 찾아둡니다.
      const parentPath = patch.path.slice(0, -1);
      const parent = patch.path.length === 0 ? container : getNode(container, parentPath);
      return { patch, parent, index: patch.path[patch.path.length - 1] };
    }
    return { patch, target: getNode(container, patch.path) };
  });

  // 2단계: 실제 DOM 변경
  for (const { patch, target, parent, index } of jobs) {
    switch (patch.type) {
      case PATCH.CREATE: {
        // index 위치에 끼워 넣기 (해당 위치에 노드가 없으면 insertBefore(x, null) = appendChild)
        const ref = index === undefined ? null : parent.childNodes[index] ?? null;
        parent.insertBefore(createElement(patch.node), ref);
        break;
      }
      case PATCH.REMOVE:
        target.parentNode.removeChild(target);
        break;
      case PATCH.REPLACE:
        target.parentNode.replaceChild(createElement(patch.node), target);
        break;
      case PATCH.TEXT:
        // 노드를 새로 만들지 않고 글자만 바꿈 → characterData 변경 1번
        target.nodeValue = patch.text;
        break;
      case PATCH.PROPS:
        for (const { name, oldValue, newValue } of patch.changes) {
          updateProp(target, name, oldValue, newValue);
        }
        break;
      default:
        throw new Error(`알 수 없는 patch 타입: ${patch.type}`);
    }
  }

  return patches;
}

// path(인덱스 배열)를 따라 실제 DOM 노드를 찾아 내려갑니다.
function getNode(container, path) {
  let node = container.childNodes[0];
  for (const i of path) {
    if (!node) break;
    node = node.childNodes[i];
  }
  if (!node) {
    throw new Error(`[patch] 경로 [${path.join(', ')}] 에 해당하는 DOM 노드가 없습니다. 실제 DOM 과 VDOM 이 어긋났습니다.`);
  }
  return node;
}

// 편의 함수: 이전 VDOM 과 새 VDOM 을 비교해서 바로 반영
//  (Phase 1 페이지와 Phase 2 컴포넌트 update() 에서 이 함수 하나만 쓰면 됩니다)
export function patch(container, oldVNode, newVNode) {
  return applyPatches(container, diff(oldVNode, newVNode));
}
