import { TEXT } from '../vdom/h.js';  //h.js 파일과 diffProps.js 파일을 가져옵니다.
import { diffProps } from './diffProps.js';

// Patch 종류 (최소 변경을 찾기 위한 5가지 핵심 케이스), freeze 로 불변 Object 객체 생성
export const PATCH = Object.freeze({
  CREATE: 'CREATE',   // 1. old 없음, new 있음  → 새 노드 추가
  REMOVE: 'REMOVE',   // 2. old 있음, new 없음  → 노드 삭제
  REPLACE: 'REPLACE', // 3. 타입(태그)이 다름     → 하위 트리 통째로 교체
  TEXT: 'TEXT',       // 4. 텍스트 내용이 다름   → 글자만 변경
  PROPS: 'PROPS',     // 5. 같은 태그, 속성이 다름 → 바뀐 속성만 변경 (+ 자식 재귀 비교)
});

/*
  두 VDOM 트리를 비교해서 "변경 목록(patches)" 배열을 반환합니다.
  DOM 은 전혀 건드리지 않습니다. (순수 함수 → 테스트하기 쉬움)

  path: 루트에서 해당 노드까지 내려가는 "자식 인덱스 경로"
    []      → 루트 노드
    [1]     → 루트의 두 번째 자식
    [1, 0]  → 루트의 두 번째 자식의 첫 번째 자식

  예) <ul><li>a</li><li>b</li></ul> → <ul><li>a</li><li>B</li></ul>
      결과: [{ type: 'TEXT', path: [1, 0], text: 'B' }]
*/
export function diff(oldVNode, newVNode) {
  const patches = [];
  diffNode(oldVNode, newVNode, [], patches);
  return patches;
}

function diffNode(oldVNode, newVNode, path, patches) {
  // 둘 다 없으면 할 일 없음
  if (oldVNode == null && newVNode == null) return;

  // [케이스 1] CREATE: 이전에는 없던 노드가 생김
  /*
    예시
    {
      type: 'CREATE',
      path: [1, 2],
      node: { type: 'span', props: {}, children: [] }
    }
  */
  if (oldVNode == null) {
    patches.push({ type: PATCH.CREATE, path, node: newVNode });
    return;
  }

  // [케이스 2] REMOVE: 있던 노드가 사라짐
  /*
    예시
    {
      type: 'REMOVE',
      path: [2]
    }
  */
  if (newVNode == null) {
    patches.push({ type: PATCH.REMOVE, path });
    return;
  }

  // [케이스 3] REPLACE: 태그 이름이 다르거나(div → span), 텍스트 ↔ 요소 로 바뀜, 또는 key 가 다름
  //  - React 의 가정: "타입이 다르면 완전히 다른 트리" → 자식까지 비교하지 않고 통째로 교체 (O(n) 의 비결)
  //  - 텍스트 노드의 type 은 '#text' 이므로, 텍스트 ↔ 요소 변경도 이 조건에 걸립니다.
  /*
    예시
    {
      type: 'REPLACE',
      path: [0, 1],
      node: { type: 'div', props: {}, children: [] }
    }
  */
  if (oldVNode.type !== newVNode.type || oldVNode.props?.key !== newVNode.props?.key) {
    patches.push({ type: PATCH.REPLACE, path, node: newVNode });
    return;
  }

  // [케이스 4] TEXT: 둘 다 텍스트 노드인데 내용이 다름
  //위에서 둘이 타입이 다른지 검사했으므로 oldVNode 만 검사해도 됨
  /*
    예시
    {
      type: 'TEXT',
      path: [1, 0],
      text: '안녕'
    }
  */
  if (oldVNode.type === TEXT) {
    if (oldVNode.text !== newVNode.text) {
      patches.push({ type: PATCH.TEXT, path, text: newVNode.text });
    }
    return; // 텍스트 노드는 자식이 없으므로 여기서 끝
  }

  // [케이스 5] PROPS: 같은 태그 → 속성만 비교
  /*
    예시
    {
      type: 'PROPS',
      path: [0],
      changes: [ { name: 'id', oldValue: 'btn', newValue: 'submit-btn' } ]
    }
  */
  const changes = diffProps(oldVNode.props, newVNode.props);
  if (changes.length > 0) {
    patches.push({ type: PATCH.PROPS, path, changes });
  }

  // 같은 태그이므로 자식들을 "같은 인덱스끼리" 재귀 비교
  //  - 길이가 다르면 짧은 쪽은 undefined 가 되어 CREATE / REMOVE 로 처리됩니다.
  //  - (한계) 리스트 맨 앞에 삽입하면 뒤의 항목이 전부 "바뀐 것"으로 잡힙니다 → 추후 key 기반 비교로 개선
  const max = Math.max(oldVNode.children.length, newVNode.children.length);
  for (let i = 0; i < max; i++) {
    //[...path, i]: 현재 탐색 경로 뒤에 자식 인덱스 i를 덧붙여서 아래로 계속 전달합니다.
    diffNode(oldVNode.children[i], newVNode.children[i], [...path, i], patches);
  }
}


/*

*/