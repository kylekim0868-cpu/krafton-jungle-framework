import { assertVNode } from '../vdom/vnode.js';
import { domToVNode } from '../vdom/domToVNode.js';
import { renderVNode } from '../vdom/renderVNode.js';
import { diff } from '../vdom/diff.js';
import { preparePatch } from '../vdom/patch.js';

/**
 * VNode 하나를 반환하는 루트 함수를 감싸고 마지막으로 반영한 트리를 보관한다.
 * 반환 VNode의 props는 Phase 1처럼 문자열 HTML 속성이다. 루트 함수의 입력 props는 앱 데이터다.
 * hooks는 이후 Hook 작업에서 사용할 저장소다.
 * 컨테이너 콘텐츠는 이 인스턴스가 소유하며 mount는 한 번, update는 동기적으로 실행한다.
 */
export class FunctionComponent {
  #render;
  #props;
  #container = null;
  #root = null;
  #vnode = null;
  #busy = false;
  #locked = false;

  /** render(props)는 매번 기존 계약의 요소 또는 텍스트 VNode 하나를 반환해야 한다. */
  constructor(render, props = {}) {
    if (typeof render !== 'function') throw new TypeError('A root render function is required.');
    this.#render = render;
    this.#props = props;
    this.hooks = [];
  }

  // 렌더 함수가 반환 객체를 다음 호출에서 수정해도 이전 화면의 비교 기준은 유지한다.
  #evaluate(props) {
    const vnode = this.#render(props);
    assertVNode(vnode);
    return structuredClone(vnode);
  }

  #assertAvailable() {
    if (this.#locked) throw new Error('Component recovery failed. Create a new instance.');
    if (this.#busy) throw new Error('A component cannot render recursively.');
  }

  /**
   * HTML 컨테이너의 콘텐츠를 최초 렌더 결과로 교체하고 생성한 루트 DOM을 반환한다.
   * 렌더·검증·DOM 준비 오류는 기존 콘텐츠를 유지한다. 중복 mount와 잘못된 대상은 거부한다.
   * 적용 도중 실패하면 이전 콘텐츠를 복원하고 예외를 전달한다.
   */
  mount(container) {
    this.#assertAvailable();
    if (this.#container) throw new Error('Component is already mounted.');
    if (!container || container.nodeType !== 1 || container.namespaceURI !== 'http://www.w3.org/1999/xhtml'
        || container.localName === 'template') throw new TypeError('An HTML mount container is required.');
    this.#busy = true;
    try {
      const nextVNode = this.#evaluate(this.#props);
      const root = renderVNode(nextVNode);
      const previousContent = Array.from(container.childNodes);
      try {
        container.replaceChildren(root);
      } catch (error) {
        try {
          container.replaceChildren(...previousContent);
        } catch (recoveryError) {
          this.#locked = true;
          throw new AggregateError([error, recoveryError], 'Mount and recovery failed.');
        }
        throw error;
      }
      this.#container = container;
      this.#root = root;
      this.#vnode = nextVNode;
      return root;
    } finally {
      this.#busy = false;
    }
  }

  /**
   * render(nextProps)와 이전 VNode를 diff하고 기존 preparePatch로 실제 DOM만 갱신한다.
   * 인자를 생략하면 마지막 성공 시의 props를 사용한다. 반환값은 유지되거나 교체된 루트 DOM이다.
   * 외부 DOM 변경·준비 실패는 적용 전에 거부한다. 적용 실패는 이전 VNode로 복구하며,
   * 복구도 실패하면 인스턴스를 잠근다. DOM 반영 성공 후에만 VNode와 props를 확정한다.
   */
  update(nextProps = this.#props) {
    this.#assertAvailable();
    if (!this.#container) throw new Error('Mount the component before updating.');
    this.#busy = true;
    try {
      if (this.#container.childNodes.length !== 1 || this.#container.firstChild !== this.#root
          || diff(this.#vnode, domToVNode(this.#root)).length) {
        throw new Error('Mounted DOM differs from the confirmed component tree.');
      }
      const nextVNode = this.#evaluate(nextProps);
      const changes = diff(this.#vnode, nextVNode);
      // 무변경이어도 props는 다음 렌더링에 쓰므로 성공한 입력으로 확정한다.
      if (changes.length) {
        const apply = preparePatch(this.#root, changes);
        try {
          this.#root = apply();
        } catch (error) {
          try {
            const restored = renderVNode(this.#vnode);
            this.#container.replaceChildren(restored);
            this.#root = restored;
          } catch (recoveryError) {
            this.#locked = true;
            throw new AggregateError([error, recoveryError], 'Update and recovery failed.');
          }
          throw error;
        }
      }
      this.#vnode = nextVNode;
      this.#props = nextProps;
      return this.#root;
    } finally {
      this.#busy = false;
    }
  }
}
