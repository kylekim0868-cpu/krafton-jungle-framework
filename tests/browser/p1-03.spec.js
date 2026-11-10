import { test, expect } from '@playwright/test';

const initial = '<section data-key="a"><h3>A</h3><ul><li data-key="u">U</li><li data-key="v">V</li></ul><input value="기본"></section><p data-key="b">B</p><aside data-key="c">C</aside>';
const compound = '<aside data-key="c">새 C</aside><p data-key="x">X</p><section data-key="a" class="changed"><h3>새 A</h3><ul><li data-key="v">새 V</li><li data-key="w"><b>W</b></li></ul><input value="기본"></section>';

/** 실제 패널은 건드리지 않고 편집 입력을 만든 뒤 사용자가 누르는 Patch 버튼으로 확정한다. */
async function editAndPatch(page, html) {
  await page.locator('#test-area').evaluate((editor, value) => { editor.innerHTML = value; }, html);
  await page.locator('#patch-button').click();
  await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'success');
  expect(await page.locator('#actual-area').innerHTML()).toBe(html);
  expect(await page.locator('#test-area').innerHTML()).toBe(html);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/demos/phase1/');
  await expect(page.locator('html')).toHaveAttribute('data-app-state', 'ready');
});

test('P1-03 / 복합 모듈 검사 8개와 부분 목록 1,040쌍을 실행한다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/tests/browser/p1-03.html');
  await expect(page.locator('#summary')).toHaveAttribute('data-state', /passed|failed/);
  expect(await page.locator('[data-result="failed"]').allTextContents()).toEqual([]);
  await expect(page.locator('#summary')).toHaveAttribute('data-passed', '8');
  await expect(page.locator('#summary')).toHaveAttribute('data-failed', '0');
  await expect(page.locator('#results > li')).toHaveCount(8);
  expect(errors).toEqual([]);
});

test('P1-03 / 중첩 변경·부모 이동을 연속 반영하고 실제 DOM과 현재 입력값을 유지한다', async ({ page }) => {
  await editAndPatch(page, initial);
  const original = await page.locator('#actual-area').innerHTML();
  await page.evaluate(() => {
    const area = document.querySelector('#actual-area');
    window.p103Refs = ['a', 'c', 'v'].map((key) => area.querySelector(`[data-key="${key}"]`));
    area.querySelector('input').value = '현재 입력값';
  });
  await page.locator('#test-area').evaluate((editor, html) => { editor.innerHTML = html; }, compound);
  expect(await page.locator('#actual-area').innerHTML()).toBe(original);
  await page.locator('#patch-button').click();
  await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'success');
  expect(await page.locator('#actual-area').innerHTML()).toBe(compound);
  expect(await page.locator('#test-area').innerHTML()).toBe(compound);
  expect(await page.evaluate(() => ['a', 'c', 'v'].every((key, i) =>
    document.querySelector(`#actual-area [data-key="${key}"]`) === window.p103Refs[i]))).toBe(true);
  await expect(page.locator('#actual-area input')).toHaveValue('현재 입력값');

  await editAndPatch(page, '<section data-key="a"><h3>다음 A</h3><ul><li data-key="w">다음 W</li><li data-key="v">다음 V</li></ul><input value="기본"></section><aside data-key="c">다음 C</aside>');
  expect(await page.evaluate(() => ['a', 'c', 'v'].every((key, i) =>
    document.querySelector(`#actual-area [data-key="${key}"]`) === window.p103Refs[i]))).toBe(true);
  await expect(page.locator('#actual-area input')).toHaveValue('현재 입력값');
  await page.locator('#patch-button').click();
  await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'unchanged');
});

test('P1-03 / 빈 화면과 여러 최상위 노드를 반복 전환해도 패널 앵커를 유지한다', async ({ page }) => {
  await page.evaluate(() => { window.p103Panels = ['actual-area', 'test-area'].map((id) => document.getElementById(id)); });
  for (let round = 0; round < 3; round += 1) {
    for (const html of ['', '앞<p data-key="a">A</p><p data-key="b">B</p>뒤',
      '<p data-key="b">변경 B</p><template><b>T</b></template>끝']) {
      await editAndPatch(page, html);
      expect(await page.evaluate(() => ['actual-area', 'test-area'].every((id, i) =>
        document.getElementById(id) === window.p103Panels[i]))).toBe(true);
      await expect(page.locator('#test-area')).toHaveAttribute('contenteditable', 'true');
    }
  }
});

test('P1-03 / 복합 변경 일부 적용 후 실패하면 마지막 확정 상태로 복구하고 재시도한다', async ({ page }) => {
  await editAndPatch(page, initial);
  await page.evaluate(() => {
    const area = document.querySelector('#actual-area');
    const native = area.insertBefore;
    let calls = 0;
    // 삭제와 첫 배치까지 실제로 수행한 뒤 두 번째 배치에서 실패시킨다.
    area.insertBefore = function (...args) {
      if (++calls === 2) {
        this.insertBefore = native;
        window.p103Partial = this.querySelector('[data-key="b"]') === null
          && this.querySelector('[data-key="x"]') !== null && this.querySelector('h3').textContent === '새 A';
        throw new Error('injected second placement failure');
      }
      return native.apply(this, args);
    };
  });
  await page.locator('#test-area').evaluate((editor, html) => { editor.innerHTML = html; }, compound);
  await page.locator('#patch-button').click();
  await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'recovered');
  expect(await page.evaluate(() => window.p103Partial)).toBe(true);
  expect(await page.locator('#actual-area').innerHTML()).toBe(initial);
  expect(await page.locator('#test-area').innerHTML()).toBe(initial);
  await page.locator('#patch-button').click();
  await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'unchanged');
  await editAndPatch(page, compound);
  await page.locator('#test-area h3').fill('복구 후 다음 편집');
  await page.locator('#patch-button').click();
  await expect(page.locator('#actual-area h3')).toHaveText('복구 후 다음 편집');
});

test('P1-03 / 연속 성공 후 준비 실패는 직전 확정 DOM과 편집 내용을 유지한다', async ({ page }) => {
  await editAndPatch(page, initial);
  await editAndPatch(page, compound);
  const invalid = compound + '<p data-key="x">중복</p>';
  await page.locator('#test-area').evaluate((editor, html) => { editor.innerHTML = html; }, invalid);
  await page.locator('#patch-button').click();
  await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'error');
  expect(await page.locator('#actual-area').innerHTML()).toBe(compound);
  expect(await page.locator('#test-area').innerHTML()).toBe(invalid);
  await editAndPatch(page, '<p data-key="x">수정한 X</p>');
  await page.locator('#patch-button').click();
  await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'unchanged');
});

test('P1-03 / 실제 Enter로 중간 항목을 분할한 뒤에도 연속 Patch가 가능하다', async ({ page }) => {
  await editAndPatch(page, '<ul><li data-key="a">ABCD</li><li data-key="b">뒤</li></ul>');
  await page.evaluate(() => { window.p103Item = document.querySelector('#actual-area [data-key="a"]'); });
  await page.locator('#test-area').focus();
  await page.locator('#test-area [data-key="a"]').evaluate((node) => {
    const range = document.createRange();
    range.setStart(node.firstChild, 2);
    range.collapse(true);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('새 ');
  await expect(page.locator('#test-area li')).toHaveCount(3);
  const keys = await page.locator('#test-area li').evaluateAll((nodes) => nodes.map((node) => node.dataset.key));
  expect(new Set(keys).size).toBe(3);
  expect(keys[0]).toBe('a');
  expect(keys[1]).toMatch(/^editor-\d+$/);
  await page.locator('#patch-button').click();
  await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'success');
  await expect(page.locator('#actual-area li')).toHaveText(['AB', '새 CD', '뒤']);
  expect(await page.evaluate(() => document.querySelector('#actual-area [data-key="a"]') === window.p103Item)).toBe(true);
  await page.locator('#test-area li').nth(1).fill('다음 편집');
  await page.locator('#patch-button').click();
  await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'success');
  await expect(page.locator('#actual-area li')).toHaveText(['AB', '다음 편집', '뒤']);
});
