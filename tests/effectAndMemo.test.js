import { describe, it, expect, vi } from 'vitest';
import { h } from '../src/vdom/h.js';
import { mountRoot } from '../src/core/functionComponent.js';
import { useState, useEffect, useMemo } from '../src/core/hooks.js';
import { flushUpdates } from '../src/core/scheduler.js';
import { depsChanged } from '../src/core/deps.js';

const container = () => document.createElement('div');

/**
 * 테스트용 루트: 렌더 함수 안에서 setState 를 밖으로 꺼내 쓸 수 있게 합니다.
 *   const { root, set } = setup((state) => { useEffect(...); return h(...) })
 */
function setup(body, initialState = 0) {
  const handle = {};
  function App() {
    const [state, setState] = useState(initialState);
    handle.set = setState;
    return body(state);
  }
  handle.root = mountRoot(App, container());
  handle.rerenderWith = (value) => {
    handle.set(value);
    flushUpdates();
  };
  return handle;
}

describe('depsChanged', () => {
  it.each([
    ['deps 생략 → 항상 변경', [1], undefined, true],
    ['처음(이전 없음) → 변경', undefined, [], true],
    ['빈 배열끼리 → 같음', [], [], false],
    ['같은 값 → 같음', [1, 'a'], [1, 'a'], false],
    ['값이 다름 → 변경', [1, 'a'], [2, 'a'], true],
    ['NaN 끼리 → 같음 (Object.is)', [NaN], [NaN], false],
    ['길이가 다름 → 변경', [1], [1, 2], true],
    ['내용이 같아도 다른 객체 → 변경 (참조 비교)', [{}], [{}], true],
  ])('%s', (_, prev, next, expected) => {
    expect(depsChanged(prev, next)).toBe(expected);
  });
});

describe('useEffect', () => {
  it('mount 후(DOM 반영 뒤)에 실행된다', () => {
    let seenText = null;
    const target = container();
    mountRoot(() => {
      useEffect(() => {
        seenText = target.textContent; // effect 안에서는 이미 그려진 DOM 이 보임
      });
      return h('p', null, '그려짐');
    }, target);
    expect(seenText).toBe('그려짐');
  });

  it('deps 생략: 매 렌더마다 실행', () => {
    const effect = vi.fn();
    const t = setup((state) => {
      useEffect(effect);
      return h('p', null, state);
    });
    t.rerenderWith(1);
    t.rerenderWith(2);
    expect(effect).toHaveBeenCalledTimes(3);
  });

  it('deps []: 처음 한 번만 실행', () => {
    const effect = vi.fn();
    const t = setup((state) => {
      useEffect(effect, []);
      return h('p', null, state);
    });
    t.rerenderWith(1);
    t.rerenderWith(2);
    expect(effect).toHaveBeenCalledTimes(1);
  });

  it('deps [a]: a 가 바뀔 때만 실행', () => {
    const seen = [];
    let setOther;
    function App() {
      const [a, setA] = useState(0);
      const [other, setO] = useState(0);
      setOther = setO;
      App.setA = setA;
      useEffect(() => {
        seen.push(a);
      }, [a]);
      return h('p', null, `${a}-${other}`);
    }
    mountRoot(App, container());
    setOther(1); // a 그대로 → 실행 안 됨
    flushUpdates();
    App.setA(5); // a 변경 → 실행
    flushUpdates();
    expect(seen).toEqual([0, 5]);
  });

  it('다시 실행되기 전에 이전 cleanup 을 먼저 호출한다 (이전 값 기준)', () => {
    const log = [];
    const t = setup((state) => {
      useEffect(() => {
        log.push(`effect ${state}`);
        return () => log.push(`cleanup ${state}`);
      }, [state]);
      return h('p', null, state);
    });
    t.rerenderWith(1);
    t.rerenderWith(2);
    expect(log).toEqual(['effect 0', 'cleanup 0', 'effect 1', 'cleanup 1', 'effect 2']);
  });

  it('unmount 하면 모든 cleanup 이 실행된다', () => {
    const cleanups = [];
    const t = setup(() => {
      useEffect(() => () => cleanups.push('a'), []);
      useEffect(() => () => cleanups.push('b'));
      return h('p');
    });
    t.root.unmount();
    expect(cleanups).toEqual(['a', 'b']);
    t.root.unmount(); // 두 번 호출해도 다시 실행되지 않음
    expect(cleanups).toEqual(['a', 'b']);
  });

  it('여러 effect 는 선언 순서대로, cleanup 들이 모두 먼저 실행된다', () => {
    const log = [];
    const t = setup((state) => {
      useEffect(() => {
        log.push(`A${state}`);
        return () => log.push(`~A${state}`);
      });
      useEffect(() => {
        log.push(`B${state}`);
        return () => log.push(`~B${state}`);
      });
      return h('p');
    });
    log.length = 0;
    t.rerenderWith(1);
    expect(log).toEqual(['~A0', '~B0', 'A1', 'B1']);
  });

  it('effect 안에서 setState 하면 한 번 더 렌더링된다 (예: 데이터 불러오기)', async () => {
    function App() {
      const [data, setData] = useState('로딩 중');
      useEffect(() => {
        setData('불러옴');
      }, []);
      return h('p', null, data);
    }
    const root = mountRoot(App, container());
    expect(root.container.textContent).toBe('로딩 중');
    await Promise.resolve();
    expect(root.container.textContent).toBe('불러옴');
    expect(root.renderCount).toBe(2);
  });

  it('배칭된 렌더 1번에는 effect 도 1번만 실행된다', () => {
    const effect = vi.fn();
    const t = setup((state) => {
      useEffect(effect, [state]);
      return h('p', null, state);
    });
    t.set(1);
    t.set(2);
    t.set(3);
    flushUpdates();
    expect(effect).toHaveBeenCalledTimes(2); // mount 1 + update 1
  });

  it('deps 를 빼먹어 effect 가 setState 를 반복하면 무한 루프 대신 에러', () => {
    // deps 없이 매번 새 값으로 setState 하는 실수
    function App() {
      const [state, setState] = useState(0);
      useEffect(() => {
        setState(state + 1);
      });
      return h('p', null, state);
    }
    mountRoot(App, container());
    expect(() => {
      for (let i = 0; i < 100; i += 1) flushUpdates();
    }).toThrow(/무한 렌더링 방지/);
  });

  it('잘못된 사용은 에러: deps 가 배열이 아님 / cleanup 이 함수가 아님', () => {
    expect(() => mountRoot(() => {
      useEffect(() => {}, 'count');
      return h('p');
    }, container())).toThrow(/배열이어야/);

    expect(() => mountRoot(() => {
      useEffect(() => 123);
      return h('p');
    }, container())).toThrow(/cleanup/);
  });
});

describe('useMemo', () => {
  it('deps 가 같으면 다시 계산하지 않고 캐시를 반환한다', () => {
    const factory = vi.fn((n) => ({ doubled: n * 2 }));
    const results = [];
    let setOther;
    function App() {
      const [n, setN] = useState(2);
      const [other, setO] = useState(0);
      App.setN = setN;
      setOther = setO;
      const value = useMemo(() => factory(n), [n]);
      results.push(value);
      return h('p', null, `${value.doubled}-${other}`);
    }
    const root = mountRoot(App, container());
    setOther(1);
    flushUpdates();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(results[1]).toBe(results[0]); // 같은 객체 참조

    App.setN(5);
    flushUpdates();
    expect(factory).toHaveBeenCalledTimes(2);
    expect(root.container.textContent).toBe('10-1');
  });

  it('deps []: 처음 한 번만 계산 / deps 생략: 매번 계산', () => {
    const once = vi.fn(() => 'once');
    const every = vi.fn(() => 'every');
    const t = setup((state) => {
      useMemo(once, []);
      useMemo(every);
      return h('p', null, state);
    });
    t.rerenderWith(1);
    t.rerenderWith(2);
    expect(once).toHaveBeenCalledTimes(1);
    expect(every).toHaveBeenCalledTimes(3);
  });

  it('렌더링 중에 바로 값을 돌려준다 (useEffect 와 다름)', () => {
    const root = mountRoot(() => {
      const total = useMemo(() => [1, 2, 3].reduce((a, b) => a + b, 0), []);
      return h('p', null, total);
    }, container());
    expect(root.container.textContent).toBe('6');
  });

  it('factory 가 함수가 아니면 에러', () => {
    expect(() => mountRoot(() => {
      useMemo(42, []);
      return h('p');
    }, container())).toThrow(/함수여야/);
  });
});

describe('Hook 순서 검사 (여러 종류 혼합)', () => {
  it('훅 종류의 순서가 바뀌면 에러', () => {
    let swap;
    function App() {
      const [isSwapped, setIsSwapped] = useState(false);
      swap = () => setIsSwapped(true);
      if (isSwapped) {
        useEffect(() => {});
        useMemo(() => 1, []);
      } else {
        useMemo(() => 1, []);
        useEffect(() => {});
      }
      return h('p');
    }
    mountRoot(App, container());
    swap();
    expect(() => flushUpdates()).toThrow(/종류가 바뀌었습니다/);
  });

  it('hooks 배열에 state / memo / effect 가 호출 순서대로 저장된다', () => {
    const root = mountRoot(() => {
      useState('s');
      useMemo(() => 'm', []);
      useEffect(() => {}, []);
      return h('p');
    }, container());
    expect(root.hooks.map((hook) => hook.type)).toEqual(['state', 'memo', 'effect']);
  });
});
