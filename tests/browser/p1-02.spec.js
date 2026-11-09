import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await page.goto('/demos/phase1/');
  await expect(page.locator('html')).toHaveAttribute('data-app-state', 'ready');
});

test('P1-02 / Diff·Patch 모듈 검사 20개를 실제 DOM에서 실행한다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/tests/browser/p1-02.html');
  await expect(page.locator('#summary')).toHaveAttribute('data-state', /passed|failed/);
  const failures = await page.locator('[data-result="failed"]').allTextContents();
  expect(failures).toEqual([]);
  await expect(page.locator('#summary')).toHaveAttribute('data-passed', '20');
  await expect(page.locator('#summary')).toHaveAttribute('data-failed', '0');
  await expect(page.locator('#results > li')).toHaveCount(20);
  expect(errors).toEqual([]);
});

test('P1-02 / 입력 후 Patch로 반영하고 미변경 실제 DOM을 보존한다', async ({ page }) => {
  await page.evaluate(() => {
    window.p102Refs = [document.querySelector('#actual-area h3'), document.querySelector('#actual-area strong')];
  });
  await page.locator('#test-area h3').fill('새 제목');
  await expect(page.locator('#actual-area h3')).toHaveText('나만의 미니 리액트');
  await page.locator('#patch-button').click();
  await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'success');
  await expect(page.locator('#actual-area h3')).toHaveText('새 제목');
  expect(await page.evaluate(() => window.p102Refs[0] === document.querySelector('#actual-area h3')
    && window.p102Refs[1] === document.querySelector('#actual-area strong'))).toBe(true);
  await page.locator('#test-area h3').fill('다음 제목');
  await page.locator('#patch-button').click();
  await expect(page.locator('#actual-area h3')).toHaveText('다음 제목');
});

test('P1-02 / key 앞 삽입·순서 변경 후에도 실제 항목 노드를 유지한다', async ({ page }) => {
  await page.evaluate(() => {
    window.p102Refs = Array.from(document.querySelectorAll('#actual-area li'));
    const list = document.querySelector('#test-area ul');
    const [a, b, c] = list.children;
    const added = document.createElement('li');
    added.dataset.key = 'new';
    added.textContent = '새 항목';
    list.replaceChildren(added, c, a, b);
  });
  await page.locator('#patch-button').click();
  await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'success');
  expect(await page.evaluate(() => {
    const nodes = document.querySelectorAll('#actual-area li');
    return nodes[1] === window.p102Refs[2] && nodes[2] === window.p102Refs[0] && nodes[3] === window.p102Refs[1];
  })).toBe(true);
  await expect(page.locator('#actual-area > div')).toHaveCount(0);
});

test('P1-02 / 목록에서 실제 Enter 입력으로 새 항목을 만들어도 key가 중복되지 않는다', async ({ page }) => {
  await page.evaluate(() => { window.p102OriginalItem = document.querySelector('#actual-area li[data-key="render"]'); });
  // 정확히 목록 끝에 커서를 둔다. 항목을 클릭하는 것만으로는 분할 위치가 보장되지 않는다.
  async function addItem(text) {
    await page.locator('#test-area').focus();
    await page.locator('#test-area li').last().evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(false);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await page.keyboard.press('Enter');
    await page.keyboard.insertText(text);
  }
  await addItem('새 항목');
  await expect(page.locator('#test-area li')).toHaveCount(4);
  const key = await page.locator('#test-area li').last().getAttribute('data-key');
  expect(key).toMatch(/^editor-\d+$/);
  await page.locator('#patch-button').click();
  await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'success');
  expect(await page.evaluate(() => document.querySelector('#actual-area li[data-key="render"]') === window.p102OriginalItem)).toBe(true);
  await expect(page.locator('#actual-area li').last()).toHaveText('새 항목');

  // 성공한 Patch의 편집 DOM 정규화 후에도 추적을 다시 연결해야 한다.
  await addItem('다음 새 항목');
  const secondKey = await page.locator('#test-area li').last().getAttribute('data-key');
  expect(secondKey).not.toBe(key);
  await page.locator('#patch-button').click();
  await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'success');
  await expect(page.locator('#actual-area li')).toHaveCount(5);
  await expect(page.locator('#actual-area li').last()).toHaveText('다음 새 항목');
});

test('P1-02 / 기존에 사용한 자동 key와 충돌하지 않고 새 복제 항목만 정리한다', async ({ page }) => {
  await page.locator('#test-area').evaluate((editor) => {
    const list = editor.querySelector('ul');
    const external = document.createElement('li');
    external.dataset.key = 'editor-1';
    external.textContent = '사용자가 넣은 고유 key';
    list.appendChild(external);
    list.appendChild(list.querySelector('[data-key="render"]').cloneNode(true));
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
  });
  await expect(page.locator('#test-area [data-key="render"]')).toHaveCount(1);
  await expect(page.locator('#test-area [data-key="editor-1"]')).toHaveCount(1);
  await expect(page.locator('#test-area li').last()).toHaveAttribute('data-key', 'editor-2');
  await page.locator('#patch-button').click();
  await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'success');
});

for (const kind of ['SVG', '중복 key']) {
  test(`P1-02 / ${kind} 준비 오류는 원본과 편집을 유지하고 수정 후 재시도한다`, async ({ page }) => {
    const original = await page.locator('#actual-area').innerHTML();
    await page.evaluate((input) => {
      const editor = document.querySelector('#test-area');
      if (input === 'SVG') editor.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
      else editor.querySelectorAll('li')[1].dataset.key = editor.querySelector('li').dataset.key;
    }, kind);
    const edited = await page.locator('#test-area').innerHTML();
    await page.locator('#patch-button').click();
    await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'error');
    expect(await page.locator('#actual-area').innerHTML()).toBe(original);
    expect(await page.locator('#test-area').innerHTML()).toBe(edited);
    await page.evaluate((input) => {
      const editor = document.querySelector('#test-area');
      if (input === 'SVG') editor.querySelector('svg').remove();
      else editor.querySelectorAll('li')[1].dataset.key = 'order';
      editor.querySelector('h3').textContent = '재시도';
    }, kind);
    await page.locator('#patch-button').click();
    await expect(page.locator('#actual-area h3')).toHaveText('재시도');
    await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'success');
  });
}

test('P1-02 / 실제 DOM 적용 도중 예외는 두 영역을 복구하고 재시도한다', async ({ page }) => {
  const original = await page.locator('#actual-area').innerHTML();
  await page.evaluate(() => {
    document.querySelector('#test-area article').className = 'changed';
    document.querySelector('#test-area h3').setAttribute('title', '실패 주입');
    const heading = document.querySelector('#actual-area h3');
    const native = heading.setAttribute;
    heading.setAttribute = function (...args) {
      this.setAttribute = native;
      window.p102Partial = document.querySelector('#actual-area article').className === 'changed';
      throw new Error('injected DOM write failure');
    };
  });
  await page.locator('#patch-button').click();
  await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'recovered');
  expect(await page.evaluate(() => window.p102Partial)).toBe(true);
  expect(await page.locator('#actual-area').innerHTML()).toBe(original);
  expect(await page.locator('#test-area').innerHTML()).toBe(original);
  await page.locator('#test-area h3').fill('복구 후 재시도');
  await page.locator('#patch-button').click();
  await expect(page.locator('#actual-area h3')).toHaveText('복구 후 재시도');
});

test('P1-02 / 편집 영역 반영 실패도 기준 상태 확정 전에 복구한다', async ({ page }) => {
  const original = await page.locator('#actual-area').innerHTML();
  await page.locator('#test-area h3').fill('미확정 제목');
  await page.evaluate(() => {
    const editor = document.querySelector('#test-area');
    const native = editor.replaceChildren;
    editor.replaceChildren = function () {
      this.replaceChildren = native;
      window.p102Partial = document.querySelector('#actual-area h3').textContent === '미확정 제목';
      throw new Error('injected editor write failure');
    };
  });
  await page.locator('#patch-button').click();
  await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'recovered');
  expect(await page.evaluate(() => window.p102Partial)).toBe(true);
  expect(await page.locator('#actual-area').innerHTML()).toBe(original);
  expect(await page.locator('#test-area').innerHTML()).toBe(original);
  await page.locator('#patch-button').click();
  await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'unchanged');
});

test('P1-02 / 복구까지 실패하면 편집·Patch를 잠근다', async ({ page }) => {
  await page.locator('#test-area h3').fill('미확정 제목');
  await page.evaluate(() => {
    document.querySelector('#test-area').replaceChildren = () => { throw new Error('persistent failure'); };
  });
  await page.locator('#patch-button').click();
  await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'locked');
  await expect(page.locator('#patch-button')).toBeDisabled();
  await expect(page.locator('#test-area')).toHaveAttribute('contenteditable', 'false');
  await expect(page.locator('html')).toHaveAttribute('data-app-state', 'error');
});

test('P1-02 / 무변경 Patch는 두 영역의 DOM을 다시 만들지 않는다', async ({ page }) => {
  await page.evaluate(() => {
    window.p102Refs = [document.querySelector('#actual-area article'), document.querySelector('#test-area article')];
  });
  await page.locator('#patch-button').click();
  await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'unchanged');
  expect(await page.evaluate(() => window.p102Refs[0] === document.querySelector('#actual-area article')
    && window.p102Refs[1] === document.querySelector('#test-area article'))).toBe(true);
});

test('P1-02 / 빈 화면·여러 최상위 노드도 고정 패널로 반영한다', async ({ page }) => {
  for (const html of ['', '텍스트<p>첫째</p><p>둘째</p>']) {
    await page.locator('#test-area').evaluate((editor, value) => { editor.innerHTML = value; }, html);
    await page.locator('#patch-button').click();
    await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'success');
    expect(await page.locator('#actual-area').innerHTML()).toBe(html);
    await expect(page.locator('#actual-area > div')).toHaveCount(0);
  }
});

test('P1-02 / key·위치 비교의 DOM 변경과 실행 시간을 측정한다', async ({ page }, testInfo) => {
  const rows = await page.evaluate(async () => {
    const { diff } = await import('/src/vdom/diff.js');
    const { patch } = await import('/src/vdom/patch.js');
    const { renderVNode } = await import('/src/vdom/renderVNode.js');
    const rows = [];
    const make = (ids, keyed) => ({ kind: 'element', tag: 'ul', props: {}, children: ids.map((id) => ({
      kind: 'element', tag: 'li', props: keyed ? { 'data-key': String(id) } : {},
      children: [{ kind: 'text', text: String(id) }],
    })) });
    for (const size of [100, 1000]) {
      const ids = Array.from({ length: size }, (_, index) => index);
      const workloads = { same: ids, prepend: ['x', ...ids],
        middleDelete: ids.filter((_, index) => index !== Math.floor(size / 2)),
        rotate: [ids.at(-1), ...ids.slice(0, -1)] };
      for (const [workload, target] of Object.entries(workloads)) {
        for (const keyed of [false, true]) {
          const samples = [];
          let mutations;
          for (let round = 0; round < 4; round += 1) {
            const before = make(ids, keyed);
            const after = make(target, keyed);
            const root = renderVNode(before);
            document.body.appendChild(root);
            const observer = new MutationObserver(() => {});
            observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true });
            const start = performance.now();
            const changes = diff(before, after);
            const compared = performance.now();
            patch(root, changes);
            const end = performance.now();
            const records = observer.takeRecords();
            observer.disconnect();
            mutations = { text: records.filter((record) => record.type === 'characterData').length,
              added: records.reduce((sum, record) => sum + record.addedNodes.length, 0),
              removed: records.reduce((sum, record) => sum + record.removedNodes.length, 0) };
            root.remove();
            // 첫 회는 예열이다. 시간은 페인트를 기다리지 않는 JS·DOM 반영 구간의 관찰값이다.
            if (round) samples.push({ diffMs: compared - start, patchMs: end - compared });
          }
          const median = (name) => Number(samples.map((sample) => sample[name]).sort((a, b) => a - b)[1].toFixed(3));
          rows.push({ size, workload, mode: keyed ? 'key' : 'position', ...mutations,
            diffMs: median('diffMs'), patchMs: median('patchMs') });
        }
      }
    }
    return rows;
  });
  for (const size of [100, 1000]) {
    const key = rows.find((row) => row.size === size && row.workload === 'prepend' && row.mode === 'key');
    const position = rows.find((row) => row.size === size && row.workload === 'prepend' && row.mode === 'position');
    expect(key).toMatchObject({ text: 0, added: 1, removed: 0 });
    expect(position).toMatchObject({ text: size, added: 1, removed: 0 });
    expect(rows.find((row) => row.size === size && row.workload === 'middleDelete' && row.mode === 'key'))
      .toMatchObject({ text: 0, added: 0, removed: 1 });
    expect(rows.find((row) => row.size === size && row.workload === 'rotate' && row.mode === 'key'))
      .toMatchObject({ text: 0, added: 1, removed: 1 });
    for (const row of rows.filter((item) => item.size === size && item.workload === 'same')) {
      expect(row).toMatchObject({ text: 0, added: 0, removed: 0 });
    }
  }
  console.table(rows);
  const path = testInfo.outputPath('performance.json');
  await writeFile(path, JSON.stringify({ environment: 'Playwright Chromium headless; 1 warmup + median of 3; no paint or editor normalization', rows }, null, 2));
  await testInfo.attach('P1-02 performance', { path, contentType: 'application/json' });
});
