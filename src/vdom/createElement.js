import { TEXT } from './h.js'; //h.js 파일에서 TEXT 상수('#text') 가져옴

//가상 돔을 진짜 DOM으로 재귀 생성하는 함수, vnode 인자는 h 반환값
export function createElement(vnode) {

  //노드의 type이 TEXT(#text)라면 태그를 만들 필요가 없습니다.
  //#text 타입은 예를 들어 <p>안녕</p> 에서 태그 안의 글자 '안녕'을 뜻함
  //브라우저 API인 document.createTextNode(vnode.text)를 써서 순수 글자 노드를 만들어 바로 반환합니다.

  // 아래처럼 인스턴스 생성
  // [ text 객체 (Type: Object / Class: Text) ]
  // │
  // ├── nodeType: 3          (브라우저가 빠르게 판별하기 위한 숫자 정수 코드)
  // ├── nodeName: "#text"    (사람과 엔진이 읽기 위한 공식 이름표 문자열)
  // ├── data: "안녕"         (진짜 화면에 찍힐 글자 내용)
  // └── ...기타 수십 개의 브라우저 내부 메서드들

  // 이런 형태로 저장
  if (vnode.type === TEXT) return document.createTextNode(vnode.text);


  //vnode.type에 적힌 태그 이름(div, button, h1 등)대로 실제 HTML 요소를 메모리에 생성합니다.

  // 모든 HTML 태그 요소는 부모 클래스인 Node와 Element, HTMLElement를 공통으로 상속받습니다.
  // Node (nodeType, nodeName, childNodes, appendChild 등 제공)
  //   └── Element (tagName, attributes, children, getAttribute 등 제공)
  //         └── HTMLElement (id, className, style, addEventListener 등 제공)
  //               ├── HTMLDivElement    (<div> 전용)
  //               ├── HTMLInputElement  (<input> 전용)
  //               └── HTMLImageElement  (<img> 전용)


  //예) div 태그를 만들면 브라우저가 내부적으로 HTMLDivElement라는 클래스 객체를 만들어 반환합니다.
  // [ element 객체 (Type: Object / Class: HTMLDivElement) ]
  // │
  // ├── nodeType: 1                 (ELEMENT_NODE)
  // ├── nodeName: "DIV"             (대문자 태그명)
  // ├── tagName: "DIV"              (태그 이름)
  // ├── id: "" / className: ""      (HTML 기본 속성들)
  // ├── attributes: NamedNodeMap    (태그에 붙은 속성 사전)
  // ├── childNodes: NodeList        (자식 노드 목록: 텍스트 노드 포함)
  // ├── children: HTMLCollection    (자식 요소 목록: 순수 태그만)
  // ├── style: CSSStyleDeclaration  (인라인 스타일 객체)
  // └── ...수백 개의 브라우저 C++ 바인딩 프로퍼티 및 메서드들 (addEventListener, appendChild 등) -> 바인딩 프로퍼티인 이유 DOM 의 내역은 C++ 랜더링 엔진과 JS 를 연결해준다는 뜻, 프로퍼티는 nodeType 이런거임
  const el = document.createElement(vnode.type);


  // vnode.props에 담긴 키-값 쌍(id: 'btn', class: 'box' 등)을 순회하며, 
  // 아래에 정의된 setProp 함수를 호출해 요소에 속성을 부여합니다.
  //entries가 하는일 : vnode.props가 { id: 'box', class: 'active' }일 때 -> [ ['id', 'box'], ['class', 'active'] ]
  for (const [name, value] of Object.entries(vnode.props)) setProp(el, name, value);

  //children 배열을 돌면서 자식 VNode마다 createElement(child)를 재귀 호출합니다.
  //만들어진 자식 실제 DOM 노드를 부모 요소의 뱃속에 el.appendChild(...)로 차곡차곡 집어넣은 뒤,
  //완성된 최상위 부모 노드(el)를 반환합니다.
  vnode.children.forEach(child => el.appendChild(createElement(child)));
  return el;
}

//DOM 속성/이벤트 완벽 분기 처리
export function setProp(el, name, value) {
  //key는 리액트 엔진 내부에서 노드를 식별하기 위한 특수 속성일 뿐, 실제 HTML 태그 속성이 아니므로 건너뜁니다.
  if (name === 'key') return;

  //속성 이름이 onClick, onInput처럼 'on'으로 시작하고 값이 함수라면 
  // 실제 브라우저 이벤트로 등록합니다. (Day 4: setEventHandler 로 위임 → 핸들러 교체 시 재등록 불필요)
  if (name.startsWith('on') && typeof value === 'function') {
    setEventHandler(el, toEventName(name), value);
  } 
  
  //<input>의 입력값이나 체크박스의 체크 여부는 setAttribute('value', ...)로 
  // 넣으면 버그가 생기기 때문에 프로퍼티로 설정
  //Day 4: 값이 같으면 다시 넣지 않습니다. (입력 중인 input 에 같은 값을 다시 넣으면 커서가 맨 끝으로 튀는 브라우저가 있음)
  else if (name === 'value' || name === 'checked') {
    const nextValue = name === 'value' ? String(value) : Boolean(value);
    if (el[name] !== nextValue) el[name] = nextValue;
  }


  //값이 false, null, undefined라면 해당 속성을 태그에서 제거
  else if (value === false || value == null) {
    el.removeAttribute(name);
  } 
  
  /*
    그 외의 경우는 일반적인 HTML 속성으로 간주하고 setAttribute(name, value)로 설정합니다.
    단, value가 true라면 <input disabled>처럼 속성만 존재하는 HTML 태그를 만들기 위해, false 일때는 위에서 삭제하기 때문에
    setAttribute(name, '')로 처리합니다.
  */
  else {
    el.setAttribute(name, value === true ? '' : value);
  }
}




// ───────────────────────── Day 2: Patch 용 속성 갱신 ─────────────────────────

//속성 이름이 'onClick', 'onInput'처럼 'on'으로 시작하고, 그 값이 함수인지 검사하는 판별 함수입니다.
// 이벤트 관련 처리를 할 때 중복 코드를 줄이기 위해 깔끔하게 분리해 둔 유틸리티입니다.
const isEvent = (name, value) => name.startsWith('on') && typeof value === 'function';

//속성 하나를 "이전 값 → 새 값" 으로 갱신합니다. (diffProps 의 결과를 반영할 때 사용)
export function updateProp(el, name, oldValue, newValue) {
  if (name === 'key') return;

  // 이벤트 핸들러: 리스너는 그대로 두고 "현재 핸들러" 참조만 교체합니다. (없어지면 null → 호출 안 됨)
  if (isEvent(name, oldValue) || isEvent(name, newValue)) {
    setEventHandler(el, toEventName(name), typeof newValue === 'function' ? newValue : null);
    return;
  }

  // 값이 사라졌거나 false/null 이면 속성 제거
  if (newValue === undefined || newValue === null || newValue === false) {
    removeProp(el, name);
    return;
  }

  setProp(el, name, newValue);
}

/*
  Day 4: 이벤트 핸들러 위임 (handler proxy)

  문제: 함수형 컴포넌트는 렌더링마다 onClick={() => ...} 같은 "새 함수"를 만듭니다.
       매번 removeEventListener + addEventListener 를 하면 비용이 들고, 이전 함수를 잘못 떼면 핸들러가 쌓입니다.
  해결: 요소마다 이벤트 종류별로 "대리 리스너"를 딱 한 번만 등록하고,
       실제로 호출할 함수는 el.__miniReactHandlers[이벤트명] 에 저장해 두었다가 참조만 바꿉니다.
         click 발생 → 대리 리스너 → 현재 저장된 핸들러 호출
*/
const HANDLERS_KEY = '__miniReactHandlers';

function toEventName(propName) {
  return propName.slice(2).toLowerCase(); // onClick → click, onInput → input
}

function setEventHandler(el, eventName, handler) {
  if (!el[HANDLERS_KEY]) el[HANDLERS_KEY] = {};
  const handlers = el[HANDLERS_KEY];
  const isListening = eventName in handlers;
  handlers[eventName] = handler;
  if (!isListening) {
    el.addEventListener(eventName, (event) => handlers[eventName]?.(event));
  }
}

//속성 제거. value/checked 는 프로퍼티라서 removeAttribute 만으로는 화면 값이 안 지워집니다.
export function removeProp(el, name) {
  if (name === 'value') el.value = '';
  else if (name === 'checked') el.checked = false;
  el.removeAttribute(name);
}
