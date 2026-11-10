import { h, mountRoot, useState, useEffect, useMemo, PATCH } from '../../src/index.js';

/*
  Phase 2 데모 페이지 (Day 4: Component + useState, Day 5: useEffect + useMemo)

  컴포넌트 구조 (상태는 App 에만 있음 → Lifting State Up)

    App  ← useState: count, isAutoIncrement, name, todos, draft, filter
         ← useEffect: 문서 제목 동기화 / 자동 증가 타이머(cleanup) / 할 일 localStorage 저장
         ← useMemo:   할 일 통계, 필터링된 목록
    ├─ CounterCard     (props: count, isAutoIncrement, onIncrement, onDecrement, onReset, onAddThree, onToggleAuto)
    ├─ GreetingCard    (props: name, onNameInput)
    └─ TodoCard        (props: visibleTodos, stats, filter, draft, onFilterChange, onDraftInput, onAdd, onToggle, onRemove)
         ├─ TodoFilter (props: filter, onFilterChange)
         └─ TodoItem   (props: todo, onToggle, onRemove)

  자식 컴포넌트는 모두 props 만 받아 VNode 를 돌려주는 순수 함수입니다.
*/

// ───────── 자식 컴포넌트 (Stateless) ─────────

/** 카운터 화면. 버튼 클릭은 부모(App)가 넘겨준 콜백으로 처리합니다. */
function CounterCard({ count, isAutoIncrement, onIncrement, onDecrement, onReset, onAddThree, onToggleAuto }) {
  return h('section', { class: 'card' },
    h('h3', null, '카운터'),
    h('div', { class: 'row' },
      h('span', { class: count < 0 ? 'count negative' : 'count', 'data-testid': 'count' }, count),
      h('button', { type: 'button', onClick: onDecrement }, '-1'),
      h('button', { type: 'button', onClick: onIncrement }, '+1'),
      h('button', { type: 'button', onClick: onAddThree, title: 'setState 3번 → 렌더링 1번' }, '+3 (batching)'),
      h('button', { type: 'button', onClick: onReset, disabled: count === 0 }, '초기화'),
    ),
    h('label', { class: 'auto-toggle' },
      h('input', { type: 'checkbox', checked: isAutoIncrement, onChange: onToggleAuto }),
      ` 1초마다 자동 +1 (useEffect 타이머 · 끄면 cleanup 으로 clearInterval)`,
    ),
  );
}

/** 입력창. value 를 상태로 제어하지만 input 노드가 유지되므로 포커스가 사라지지 않습니다. */
function GreetingCard({ name, onNameInput }) {
  return h('section', { class: 'card' },
    h('h3', null, '입력'),
    h('div', { class: 'row' },
      h('input', { class: 'text-input', type: 'text', placeholder: '이름을 입력하세요', value: name, onInput: onNameInput }),
    ),
    h('p', { class: 'footer-note' }, name ? `안녕하세요, ${name}님! (${name.length}자)` : '입력하면 이 문장만 바뀝니다.'),
  );
}

/** 할 일 한 줄 */
function TodoItem({ todo, onToggle, onRemove }) {
  return h('li', { class: todo.done ? 'todo-item done' : 'todo-item' },
    h('input', { type: 'checkbox', checked: todo.done, onChange: () => onToggle(todo.id) }),
    h('span', null, todo.text),
    h('button', { type: 'button', onClick: () => onRemove(todo.id), 'aria-label': `${todo.text} 삭제` }, '삭제'),
  );
}

/** 전체 / 진행 중 / 완료 필터 버튼 */
function TodoFilter({ filter, onFilterChange }) {
  return h('div', { class: 'row filter' },
    TODO_FILTERS.map(({ value, label }) =>
      h('button', {
        key: value,
        type: 'button',
        class: filter === value ? 'chip active' : 'chip',
        'aria-pressed': String(filter === value),
        onClick: () => onFilterChange(value),
      }, label)),
  );
}

/** 할 일 목록 + 추가 폼 (통계와 필터링 결과는 App 의 useMemo 가 계산해서 내려줌) */
function TodoCard({ visibleTodos, stats, filter, draft, onFilterChange, onDraftInput, onAdd, onToggle, onRemove }) {
  return h('section', { class: 'card' },
    h('h3', null, `할 일 (${stats.done}/${stats.total})`),
    h('p', { class: 'footer-note', 'data-testid': 'todo-stats' },
      `완료율 ${stats.percent}% · 통계 계산 ${stats.computeCount}회 (useMemo: 할 일이 바뀔 때만 다시 계산)`),
    h(TodoFilter, { filter, onFilterChange }),
    h('form', { class: 'row', onSubmit: onAdd },
      h('input', { class: 'text-input', type: 'text', placeholder: '할 일 추가', value: draft, onInput: onDraftInput }),
      h('button', { type: 'submit', disabled: draft.trim() === '' }, '추가'),
    ),
    visibleTodos.length === 0
      ? h('p', { class: 'footer-note' }, '표시할 할 일이 없습니다.')
      : h('ul', { class: 'todo-list' },
        visibleTodos.map((todo) => h(TodoItem, { key: todo.id, todo, onToggle, onRemove })),
      ),
  );
}

// ───────── 루트 컴포넌트 (상태와 상태 변경 로직은 모두 여기) ─────────

export const TODO_STORAGE_KEY = 'mini-react:todos';
export const AUTO_INCREMENT_INTERVAL_MS = 1000;
const TODO_FILTERS = [
  { value: 'all', label: '전체' },
  { value: 'active', label: '진행 중' },
  { value: 'done', label: '완료' },
];
const DEFAULT_TODOS = [
  { id: 1, text: 'Virtual DOM 복습', done: true },
  { id: 2, text: 'useState 구현', done: false },
];

/** localStorage 에서 할 일 목록을 읽습니다. (없거나 깨졌거나 접근 불가면 기본값) */
function loadTodos() {
  try {
    const saved = JSON.parse(localStorage.getItem(TODO_STORAGE_KEY));
    return Array.isArray(saved) ? saved : DEFAULT_TODOS;
  } catch {
    return DEFAULT_TODOS;
  }
}

let statsComputeCount = 0; // useMemo 효과를 눈으로 보기 위한 계산 횟수

/** 할 일 통계 계산 (useMemo 로 감싸서 todos 가 바뀔 때만 실행) */
function computeTodoStats(todos) {
  statsComputeCount += 1;
  const done = todos.filter((todo) => todo.done).length;
  const percent = todos.length === 0 ? 0 : Math.round((done / todos.length) * 100);
  return { total: todos.length, done, percent, computeCount: statsComputeCount };
}

/**
 * 루트 컴포넌트: 모든 상태를 소유하고, 자식에게 값과 콜백을 props 로 내려줍니다.
 * @param {{ onEffectLog?: (type: 'EFFECT'|'CLEANUP', message: string) => void }} props
 *        effect 실행/정리를 페이지 로그에 보여주기 위한 콜백 (루트 props 예시)
 */
export function App({ onEffectLog = () => {} }) {
  const [count, setCount] = useState(0);
  const [isAutoIncrement, setIsAutoIncrement] = useState(false);
  const [name, setName] = useState('');
  const [todos, setTodos] = useState(loadTodos); // 초기값 함수: 첫 렌더에서만 localStorage 읽음
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState('all');

  // ── useMemo ──
  // 이름 입력이나 카운터 클릭으로 리렌더돼도 todos 가 그대로면 이전 결과를 재사용
  const stats = useMemo(() => computeTodoStats(todos), [todos]);
  const visibleTodos = useMemo(() => {
    if (filter === 'active') return todos.filter((todo) => !todo.done);
    if (filter === 'done') return todos.filter((todo) => todo.done);
    return todos;
  }, [todos, filter]);

  // ── useEffect ──
  // 1) count 가 바뀔 때만 문서 제목 동기화 (화면 밖 = 부수 효과)
  useEffect(() => {
    document.title = `카운트 ${count} · mini-react`;
    onEffectLog('EFFECT', `document.title ← "카운트 ${count}"  [deps: count]`);
  }, [count]);

  // 2) 자동 증가 타이머: 켜지면 setInterval, 꺼지거나 언마운트되면 cleanup 으로 clearInterval
  useEffect(() => {
    if (!isAutoIncrement) return undefined;
    const timerId = setInterval(() => setCount((c) => c + 1), AUTO_INCREMENT_INTERVAL_MS);
    onEffectLog('EFFECT', `setInterval 시작 (id ${timerId})  [deps: isAutoIncrement]`);
    return () => {
      clearInterval(timerId);
      onEffectLog('CLEANUP', `clearInterval (id ${timerId})`);
    };
  }, [isAutoIncrement]);

  // 3) 할 일 목록이 바뀔 때마다 localStorage 에 저장 (새로고침해도 유지)
  useEffect(() => {
    try {
      localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(todos));
    } catch {
      // 사생활 보호 모드 등에서 저장이 막혀도 앱은 계속 동작
    }
    onEffectLog('EFFECT', `localStorage 저장 (${todos.length}개)  [deps: todos]`);
  }, [todos]);

  const nextTodoId = () => todos.reduce((max, todo) => Math.max(max, todo.id), 0) + 1;

  const addTodo = (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setTodos((prev) => [...prev, { id: nextTodoId(), text, done: false }]);
    setDraft('');
  };

  return h('div', { class: 'app' },
    h(CounterCard, {
      count,
      isAutoIncrement,
      onToggleAuto: () => setIsAutoIncrement((on) => !on),
      onIncrement: () => setCount((c) => c + 1),
      onDecrement: () => setCount((c) => c - 1),
      onReset: () => setCount(0),
      // 함수형 업데이트라 3번 모두 누적(+3)되고, 배칭 덕분에 렌더링은 1번
      onAddThree: () => {
        setCount((c) => c + 1);
        setCount((c) => c + 1);
        setCount((c) => c + 1);
      },
    }),
    h(GreetingCard, { name, onNameInput: (event) => setName(event.target.value) }),
    h(TodoCard, {
      visibleTodos,
      stats,
      filter,
      onFilterChange: setFilter,
      draft,
      onDraftInput: (event) => setDraft(event.target.value),
      onAdd: addTodo,
      onToggle: (id) => setTodos((prev) => prev.map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo))),
      onRemove: (id) => setTodos((prev) => prev.filter((todo) => todo.id !== id)),
    }),
  );
}

// ───────── 페이지 설정 ─────────

/**
 * 페이지를 초기화합니다. (기능 테스트에서도 쓸 수 있도록 document 를 인자로 받음)
 * @returns 루트 FunctionComponent 인스턴스
 */
export function setupPhase2Page(doc = document) {
  const commitLog = doc.getElementById('commit-log');
  const renderStats = doc.getElementById('render-stats');

  /** 렌더링(커밋)이 끝날 때마다 몇 번째 렌더인지와 적용된 patch 를 로그에 남깁니다. */
  const logCommit = ({ patches, renderCount, isInitial }) => {
    renderStats.textContent = `렌더링 ${renderCount}회`;
    const item = doc.createElement('li');
    item.className = 'log-group';
    const title = doc.createElement('div');
    title.className = 'log-title';
    // 렌더링마다 onClick={() => ...} 같은 새 함수가 만들어져서 PROPS patch 가 생기지만,
    // 대리 리스너 덕분에 실제 DOM 변경 없이 참조만 바뀝니다. → 로그에서는 한 줄로 요약
    const handlerOnly = patches.filter(isHandlerOnlyPatch);
    const domPatches = patches.filter((patch) => !isHandlerOnlyPatch(patch));
    title.textContent = isInitial
      ? `#${renderCount} mount (전체 생성)`
      : `#${renderCount} update · DOM 변경 patch ${domPatches.length}개`;
    item.appendChild(title);
    if (handlerOnly.length > 0) {
      const note = doc.createElement('div');
      note.className = 'log-item log-empty';
      note.textContent = `+ 이벤트 핸들러 참조 교체 ${handlerOnly.length}개 (DOM 변경 없음)`;
      item.appendChild(note);
    }
    for (const patch of domPatches) {
      const line = doc.createElement('div');
      line.className = 'log-item';
      const badge = doc.createElement('span');
      badge.className = `type type-${patch.type}`;
      badge.textContent = patch.type;
      const detail = doc.createElement('span');
      detail.className = 'path';
      detail.textContent = describePatch(patch);
      line.append(badge, detail);
      item.appendChild(line);
    }
    commitLog.prepend(item);
    while (commitLog.children.length > 30) commitLog.lastElementChild.remove();
  };

  /** useEffect 실행/정리를 가장 최근 렌더링 로그 묶음 아래에 붙입니다. */
  const logEffect = (type, message) => {
    const line = doc.createElement('div');
    line.className = 'log-item';
    const badge = doc.createElement('span');
    badge.className = `type type-${type}`;
    badge.textContent = type;
    const detail = doc.createElement('span');
    detail.textContent = message;
    line.append(badge, detail);
    (commitLog.firstElementChild ?? commitLog).appendChild(line);
  };

  return mountRoot(App, doc.getElementById('app'), { onEffectLog: logEffect }, { onCommit: logCommit });
}

/** 이벤트 핸들러(함수)만 바뀐 PROPS patch 인지 판별 */
function isHandlerOnlyPatch(patch) {
  return patch.type === PATCH.PROPS && patch.changes.every(
    ({ oldValue, newValue }) => typeof oldValue === 'function' && typeof newValue === 'function',
  );
}

/** patch 한 개를 사람이 읽기 쉬운 한 줄로 */
function describePatch(patch) {
  const path = patch.path.length ? `root › ${patch.path.join(' › ')}` : 'root';
  switch (patch.type) {
    case PATCH.TEXT:
      return `${path}  "${patch.text}"`;
    case PATCH.PROPS:
      return `${path}  ${patch.changes.map((change) => change.name).join(', ')}`;
    case PATCH.CREATE:
    case PATCH.REPLACE:
      return `${path}  <${patch.node.type}>`;
    default:
      return path;
  }
}
