import { test, expect } from '@playwright/test';

test('P2-01 / 루트 컴포넌트 모듈 검사 14개가 실제 DOM에서 통과한다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/tests/browser/p2-01.html');
  await expect(page.locator('#summary')).toHaveAttribute('data-state', /passed|failed/);
  expect(await page.locator('[data-result="failed"]').allTextContents()).toEqual([]);
  await expect(page.locator('#summary')).toHaveAttribute('data-passed', '14');
  await expect(page.locator('#summary')).toHaveAttribute('data-failed', '0');
  expect(errors).toEqual([]);
});

test('P2-01 / mount 후 버튼과 키보드로 update하고 미변경 노드를 보존한다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/demos/phase2/');
  await expect(page.locator('html')).toHaveAttribute('data-app-state', 'ready');
  await expect(page.locator('[data-count]')).toHaveText('0');
  await page.evaluate(() => {
    const root = document.querySelector('#component-root');
    window.p201Refs = { article: root.firstChild, heading: root.querySelector('h2'),
      count: root.querySelector('[data-count]').firstChild, last: root.querySelector('p:last-child') };
  });
  const button = page.getByRole('button', { name: '숫자 +1 · update()' });
  await button.click();
  await expect(page.locator('[data-count]')).toHaveText('1');
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-count]')).toHaveText('2');
  expect(await page.evaluate(() => {
    const root = document.querySelector('#component-root');
    const refs = window.p201Refs;
    return root.firstChild === refs.article && root.querySelector('h2') === refs.heading
      && root.querySelector('[data-count]').firstChild === refs.count
      && root.querySelector('p:last-child') === refs.last;
  })).toBe(true);
  expect(errors).toEqual([]);
});
