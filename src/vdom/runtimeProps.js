/** HTML 속성과 구분해 함수 이벤트와 폼의 현재 값을 검증한다. */
export function assertRuntimeProps(events = {}, properties = {}) {
  if (!events || typeof events !== 'object' || Array.isArray(events)
      || !Object.entries(events).every(([name, handler]) => /^[a-z][a-z0-9]*$/.test(name)
        && typeof handler === 'function')) throw new TypeError('Invalid VNode events.');
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)
      || !Object.entries(properties).every(([name, value]) =>
        (name === 'value' && typeof value === 'string') || (name === 'checked' && typeof value === 'boolean'))) {
    throw new TypeError('Only string value and boolean checked properties are supported.');
  }
}

/** 이전 핸들러 참조를 제거한 뒤 다음 함수를 등록한다. HTML 문자열 이벤트는 여기서 처리하지 않는다. */
export function applyEvents(node, previous = {}, next = {}) {
  for (const [name, handler] of Object.entries(previous)) node.removeEventListener(name, handler);
  for (const [name, handler] of Object.entries(next)) node.addEventListener(name, handler);
}

/** 프로퍼티의 존재를 적용 전에 확인한다. 같은 값은 다시 쓰지 않아 입력 선택 범위를 보존한다. */
export function assertPropertyTarget(node, properties) {
  for (const name of Object.keys(properties)) {
    if (!(name in node) || (name === 'value' && !['input', 'textarea', 'select'].includes(node.localName))
        || (name === 'checked' && node.localName !== 'input')) {
      throw new TypeError(`Element does not support runtime ${name}.`);
    }
  }
}

/** 제거된 제어 값은 기본값으로 되돌리고, 바뀐 현재 값만 DOM 프로퍼티에 쓴다. */
export function applyProperties(node, previous = {}, next = {}) {
  for (const name of new Set([...Object.keys(previous), ...Object.keys(next)])) {
    const value = Object.hasOwn(next, name) ? next[name] : name === 'checked' ? false : '';
    if (!Object.is(node[name], value)) node[name] = value;
  }
}
