/**
 * contenteditable이 Enter·붙여넣기 등으로 복제한 항목의 key 충돌을 정리한다.
 * 기존 편집 노드의 key는 유지하고 새로 생긴 중복 노드에만 일회성 key를 붙인다.
 * 텍스트·위치로 key를 계산하지 않으며 일반 텍스트 입력 때는 트리를 순회하지 않는다.
 * 엔진의 입력 검증을 대체하지 않으므로 기존 노드의 잘못된 key 수정은 그대로 거부된다.
 */
export function createEditorKeyTracker(root) {
  const known = new WeakMap();
  const used = new Set();
  let sequence = 0;

  // template.content도 포함하되 DOM의 주석·텍스트와 콘텐츠 순서는 변경하지 않는다.
  function visit(node, run) {
    const container = node.localName === 'template' ? node.content : node;
    const children = Array.from(container.childNodes).filter((child) => child.nodeType === 1);
    run(children);
    for (const child of children) visit(child, run);
  }

  function remember() {
    visit(root, (children) => {
      for (const node of children) {
        if (node.hasAttribute('data-key')) {
          known.set(node, node.getAttribute('data-key'));
          used.add(node.getAttribute('data-key'));
        }
      }
    });
  }

  function handleInput(event) {
    if (!['insertParagraph', 'insertLineBreak', 'insertFromPaste', 'insertFromDrop'].includes(event.inputType)) return;
    // 이번 편집에 들어온 key도 먼저 모아 자동 발급 값과 충돌하지 않게 한다.
    visit(root, (children) => {
      for (const node of children) if (node.hasAttribute('data-key')) used.add(node.getAttribute('data-key'));
    });
    visit(root, (children) => {
      const groups = new Map();
      for (const node of children) {
        const key = node.getAttribute('data-key');
        if (key === null || key.trim() === '') continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(node);
      }
      for (const [key, nodes] of groups) {
        // 브라우저가 유지한 기존 노드를 우선한다. 모두 새 노드이면 첫 항목을 남긴다.
        const original = nodes.find((node) => known.get(node) === key) ?? nodes[0];
        for (const node of nodes) {
          if (node === original || known.has(node)) continue;
          let fresh;
          do { fresh = `editor-${++sequence}`; } while (used.has(fresh));
          used.add(fresh);
          node.setAttribute('data-key', fresh);
        }
      }
    });
    remember();
  }

  return { remember, handleInput };
}
