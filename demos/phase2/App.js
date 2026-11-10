/** P2-01 루트 함수. 입력 props로 공통 VNode 하나를 만들고 외부 상태를 변경하지 않는다. */
export function App({ count }) {
  return {
    kind: 'element', tag: 'article', props: { 'data-component': 'app' },
    children: [
      { kind: 'element', tag: 'h2', props: {},
        children: [{ kind: 'text', text: '루트 컴포넌트' }] },
      { kind: 'element', tag: 'p', props: { 'data-count': '' },
        children: [{ kind: 'text', text: String(count) }] },
      { kind: 'element', tag: 'p', props: {},
        children: [{ kind: 'text', text: '숫자를 바꿔도 이 문단과 제목의 DOM은 유지됩니다.' }] },
    ],
  };
}
