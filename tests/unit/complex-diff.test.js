import { domToVNode } from '../../src/vdom/domToVNode.js';
import { diff } from '../../src/vdom/diff.js';
import { patch } from '../../src/vdom/patch.js';
import { assert } from './vdom.test.js';

/** 패널처럼 여러 최상위 노드·빈 콘텐츠를 담는 고정 루트 fixture를 만든다. */
function panel(html) {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

/** 이전 스냅샷으로 비교하고, 주석을 제외한 목표 데이터와 입력 불변성을 검사한다. */
function apply(root, previous, html) {
  const target = panel(html);
  const next = domToVNode(target);
  const inputs = JSON.stringify([previous, next]);
  const result = patch(root, diff(previous, next));
  assert(result === root, '고정 루트가 교체됨');
  assert(JSON.stringify(domToVNode(result)) === JSON.stringify(next), `목표 구조 불일치: ${html}`);
  assert(JSON.stringify([previous, next]) === inputs, '입력 VNode가 변경됨');
  assert(diff(next, domToVNode(result)).length === 0, '적용 후에도 변경이 남음');
  return next;
}

/** 중첩·경로 밀림·반복 실행을 실제 DOM에서 검사한다. 각 항목은 독립적으로 실행한다. */
export const complexDiffTests = [
  ['A,B,C → C,X,A 이동·추가·삭제와 A 내부 변경을 함께 반영한다', () => {
    const root = panel('<section data-key="a" title="제거"><b>이전</b><ul><li data-key="u">U</li><li data-key="v">V</li></ul></section><p data-key="b">B</p><aside data-key="c">C</aside>');
    const [a, b, c] = root.children;
    const text = a.querySelector('b').firstChild;
    const v = a.querySelector('[data-key="v"]');
    const next = apply(root, domToVNode(root), '<aside data-key="c">C</aside><p data-key="x">X</p><section data-key="a" class="new"><b>다음</b><ul><li data-key="v">새 V</li><li data-key="w"><em>W</em></li></ul></section>');
    assert(root.children[0] === c && root.children[2] === a, '생존 부모 참조 손실');
    assert(b.parentNode === null && a.querySelector('[data-key="u"]') === null, '삭제 대상 잔존');
    assert(a.querySelector('b').firstChild === text && text.data === '다음', '텍스트 경로 밀림');
    assert(a.querySelector('[data-key="v"]') === v && v.textContent === '새 V', '중첩 key 재사용 실패');
    apply(root, next, root.innerHTML);
  }],
  ['여러 형제의 삭제·삽입·교체·이동은 이전 대상 참조로 처리한다', () => {
    const root = panel('<b data-key="a">A</b><b data-key="b">B</b><b data-key="c">C</b><b data-key="d">D</b><b data-key="e">E</b>');
    const [a, b, c, d, e] = root.children;
    apply(root, domToVNode(root), '<i data-key="e">새 E</i><u data-key="x">X</u><b data-key="c" title="변경">새 C</b><u data-key="y">Y</u><b data-key="a">새 A</b>');
    assert(root.children[2] === c && root.children[4] === a, '밀린 위치의 다른 노드를 수정함');
    assert([b, d, e].every((node) => node.parentNode === null), '삭제·태그 교체된 노드가 남음');
  }],
  ['이동한 부모마다 같은 key를 독립적으로 비교하고 중첩 자식을 재사용한다', () => {
    const root = panel('<section data-key="left"><b data-key="same">L</b><i data-key="gone">삭제</i></section><section data-key="right"><b data-key="same">R</b></section>');
    const [left, right] = root.children;
    const l = left.firstChild;
    const r = right.firstChild;
    apply(root, domToVNode(root), '<section data-key="right"><i data-key="new">추가</i><b data-key="same">새 R</b></section><section data-key="left"><b data-key="same">새 L</b></section>');
    assert(root.children[0] === right && root.children[1] === left, '부모 이동 실패');
    assert(left.firstChild === l && right.lastChild === r && l !== r, '다른 부모의 key를 혼동함');
  }],
  ['부모가 달라진 항목은 이전 부모에서 제거하고 새 부모에 생성한다', () => {
    const root = panel('<section data-key="left"><b data-key="item">A</b></section><section data-key="right"></section>');
    const old = root.querySelector('b');
    apply(root, domToVNode(root), '<section data-key="left"></section><section data-key="right"><b data-key="item">A</b></section>');
    assert(root.querySelector('b') !== old && old.parentNode === null, '부모 간 key를 재사용함');
  }],
  ['주석·공백·중첩 template 안팎에서 이동과 내부 편집을 함께 처리한다', () => {
    const root = panel('앞<!-- 루트 --><template data-key="t"> <b data-key="a">A</b><!-- 내부 --><template data-key="n"><i data-key="i">I</i></template><b data-key="b">B</b> 끝</template><p data-key="p">P</p>');
    const comment = root.childNodes[1];
    const template = root.querySelector('template');
    const inner = template.content.querySelector('template');
    const italic = inner.content.querySelector('i');
    const a = template.content.querySelector('b');
    const nestedComment = template.content.childNodes[2];
    apply(root, domToVNode(root), '先<p data-key="p">新 P</p><template data-key="t"> <b data-key="b">新 B</b><template data-key="n"><u data-key="x">X</u><i data-key="i">新 I</i></template><b data-key="a">新 A</b> 終</template>');
    assert(root.childNodes[1] === comment, '루트 주석을 불필요하게 제거함');
    assert(root.lastChild === template && template.content.querySelector('template') === inner, 'template 참조 손실');
    assert(inner.content.querySelector('i') === italic && italic.textContent === '新 I', '중첩 content 경로 오류');
    assert(template.content.querySelector('[data-key="a"]') === a, 'template 자식 참조 손실');
    assert(nestedComment.parentNode === template.content, '기존 내부 주석 제거');
  }],
  ['공백·key 없는 요소와 key 항목이 섞여도 위치 계약을 유지한다', () => {
    const root = panel(' <b data-key="a">A</b><span>이전</span>\n<b data-key="b">B</b>');
    const span = root.querySelector('span');
    const a = root.querySelector('[data-key="a"]');
    apply(root, domToVNode(root), ' <b data-key="b">새 B</b><span>다음</span>\n<i data-key="x">X</i><b data-key="a">새 A</b>');
    assert(root.querySelector('span') === span && span.textContent === '다음', '같은 위치의 key 없는 요소 교체');
    assert(root.lastChild === a, '혼합 자식의 key 항목 교체');
  }],
  ['이전 확정 VNode를 이어 사용해 빈 화면·여러 루트를 반복 갱신한다', () => {
    const root = panel('<p data-key="a">A</p><p data-key="b">B</p>');
    let previous = domToVNode(root);
    const stages = ['', '앞<p data-key="b">B</p><template><b>T</b></template>뒤',
      '<section data-key="c"><i>중첩</i></section><p data-key="b">새 B</p>', '',
      '<p data-key="a">새 A</p><p data-key="b">다시 B</p>', '<p data-key="b">끝 B</p>'];
    for (let round = 0; round < 3; round += 1) {
      for (const html of stages) previous = apply(root, previous, html);
    }
  }],
  ['부분 목록 1,040쌍에서 추가·삭제·순서와 모든 생존 key 참조를 확인한다', () => {
    // 3개 key의 모든 부분 순열 16개 × 새 key x를 포함한 4개의 부분 순열 65개다.
    // 고정된 작은 입력 공간이며, 큰 목록 성능이나 임의 깊이의 완전 탐색은 아니다.
    function orders(keys) {
      return [[], ...keys.flatMap((key, index) => orders(keys.filter((_, i) => i !== index))
        .map((rest) => [key, ...rest]))];
    }
    const html = (keys, version) => keys.map((key) => `<p data-key="${key}" title="${version}"><b>${key}:${version}</b></p>`).join('');
    let checked = 0;
    for (const before of orders(['a', 'b', 'c'])) {
      for (const after of orders(['a', 'b', 'c', 'x'])) {
        const root = panel(html(before, '전'));
        const refs = new Map(Array.from(root.children, (node) => [node.dataset.key, [node, node.firstChild]]));
        apply(root, domToVNode(root), html(after, '후'));
        for (const [key, [node, child]] of refs) {
          if (after.includes(key)) {
            assert(root.querySelector(`[data-key="${key}"]`) === node && node.firstChild === child, `참조 손실: ${before} → ${after}`);
          } else assert(node.parentNode === null, '삭제 항목 잔존');
        }
        checked += 1;
      }
    }
    assert(checked === 1040, '검사 입력 공간이 달라짐');
  }],
];
