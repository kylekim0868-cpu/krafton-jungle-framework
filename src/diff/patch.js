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


  patches 는 이런식으로 구성되있음
    const patches = [
    {
      type: 'TEXT',        // 텍스트만 고쳐라
      path: [1, 0],        // 루트 -> 1번 자식(li) -> 0번 자식(#text)
      text: 'NEW!'         // 바꿀 글자
    },
    {
      type: 'PROPS',       // 속성을 고쳐라
      path: [0],           // 루트 -> 0번 자식(첫 번째 li)
      changes: [
        { name: 'class', oldValue: undefined, newValue: 'active' }
      ]
    }
  ];
*/
export function applyPatches(container, patches) {

  /*
    patches 형태
    [
      // 0번 인덱스: 1번째 작업 지시서 (객체)
      {
        type: 'TEXT',
        path: [0, 2, 3, 1, 0], 
        text: '새 글자'
      },

      // 1번 인덱스: 2번째 작업 지시서 (객체)
      {
        type: 'CREATE',
        path: [2, 3, 1, 3, 0],  
        node: { type: 'span', props: {}, children: [] }
      }
    ]
  */ 



  // 1단계: 대상 노드 미리 찾기
  const jobs = patches.map((patch) => { //안쪽 콜백(람다) 함수 시작 //초기 patch : [0, 2, 3, 1, 2, 0]
    if (patch.type === PATCH.CREATE) {
      // CREATE 는 아직 없는 노드이므로 "부모"를 찾아둡니다.
      const parentPath = patch.path.slice(0, -1);
      // 결과: [0, 2, 3, 1, 2]  (맨 끝의 0 하나만 똑 떼어냄!)
      const parent = patch.path.length === 0 ? container : getNode(container, parentPath);
      //길이가 0이라면 container(루트) 노드 반환 아니면 [0, 2, 3, 1, 2] 경로를 타고 가서 2의 dom을 반환
      return { patch, parent, index: patch.path[patch.path.length - 1] };
      //위와 같은 경우면 index = 0이 됨
    }
    return { patch, target: getNode(container, patch.path) }; //[0, 2, 3, 1, 2, 0] 경로를 타고 가서 0의 dom을 반환
  });

  // 2단계: 실제 DOM 변경
  //jobs 에 들어간 반환값을 순회하며 반복
  for (const { patch, target, parent, index } of jobs) {
    switch (patch.type) {
      case PATCH.CREATE: {
        //타입이 CREATE 라면 노드 추가하기
        // index 위치에 끼워 넣기 (해당 위치에 노드가 없으면 insertBefore(x, null) = appendChild)
        const ref = index === undefined ? null : parent.childNodes[index] ?? null;
        parent.insertBefore(createElement(patch.node), ref);
        break;
      }
      case PATCH.REMOVE:
        //타입이 REMOVE 라면 타겟 삭제
        target.parentNode.removeChild(target);
        break;
      case PATCH.REPLACE:
        //타입이 REPLACE 라면 
        target.parentNode.replaceChild(createElement(patch.node), target);
        break;
      case PATCH.TEXT:
        // 노드를 새로 만들지 않고 글자만 바꿈 -> characterData 변경 1번
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
function getNode(container, path) { //예 : path = [1, 0] -> 루트의 1번 자식 -> 1번 자식의 0번 자식
  // VDOM의 루트 노드로 진입
  let node = container.childNodes[0];
  for (const i of path) {
    if (!node) break;
    // i번째 자식으로 한 단계씩 파고듦
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
