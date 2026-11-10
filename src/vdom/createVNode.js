import { assertVNode } from './vnode.js';
import { withoutHooks } from '../component/hooks.js';

/**
 * HTML 태그 또는 props만 받는 자식 함수로 공통 VNode를 만든다.
 * 문자열 HTML 속성은 props, onClick 같은 함수는 events, value·checked는 properties에 둔다.
 * 배열 자식을 펼치고 문자열·숫자는 텍스트로 바꾸며 null·undefined·불리언은 생략한다.
 */
export function createVNode(type, props = {}, ...children) {
  const normalized = children.flat(Infinity).filter((child) => child != null && typeof child !== 'boolean')
    .map((child) => typeof child === 'object' ? child : { kind: 'text', text: String(child) });
  if (typeof type === 'function') {
    const vnode = withoutHooks(() => type({ ...props, children: normalized }));
    assertVNode(vnode);
    return vnode;
  }
  if (typeof type !== 'string' || !type) throw new TypeError('A tag or child component is required.');
  type = type.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  const vnode = { kind: 'element', tag: type, props: {}, children: normalized };
  for (const [name, value] of Object.entries(props ?? {})) {
    if (/^on[A-Z]/.test(name)) {
      if (value == null) continue;
      if (typeof value !== 'function') throw new TypeError('Event props require functions.');
      vnode.events ??= {};
      vnode.events[name.slice(2).toLowerCase()] = value;
    } else if ((name === 'value' && ['input', 'textarea', 'select'].includes(type)) || name === 'checked') {
      if (value == null) continue;
      vnode.properties ??= {};
      vnode.properties[name] = name === 'value' ? String(value) : value;
    } else if (value != null && value !== false) {
      if (!['string', 'number', 'boolean'].includes(typeof value)) throw new TypeError('HTML props require primitive values.');
      const attribute = name.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
      vnode.props[attribute] = value === true ? '' : String(value);
    }
  }
  assertVNode(vnode);
  return vnode;
}
