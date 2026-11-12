import { test, expect } from '@playwright/test';

// 새 Hook·런타임 계약의 모듈 검사도 실제 브라우저 실행에 연결한다.
test('P2-02 / Hooks와 런타임 VNode의 모듈 검사 19개가 통과한다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/tests/browser/p2-02.html');
  await expect(page.locator('#summary')).toHaveAttribute('data-state', /passed|failed/);
  expect(await page.locator('[data-result="failed"]').allTextContents()).toEqual([]);
  await expect(page.locator('#summary')).toHaveAttribute('data-passed', '19');
  await expect(page.locator('#summary')).toHaveAttribute('data-failed', '0');
  expect(errors).toEqual([]);
});

test('P2-02 / 실제 입력·클릭은 상태와 표시를 바꾸고 같은 DOM·초점·선택 범위를 유지한다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/demos/phase2/');
  await expect(page.locator('html')).toHaveAttribute('data-app-state', 'ready');
  const input = page.getByRole('textbox', { name: '이름' });
  await input.fill('Jungle');
  await expect(page.locator('[data-greeting]')).toHaveText('안녕하세요, 미니 리액트!');
  await expect(page).toHaveTitle('미니 리액트 · 0');
  await input.press('Enter');
  await expect(page.locator('[data-greeting]')).toHaveText('안녕하세요, Jungle!');
  await expect(page).toHaveTitle('Jungle · 0');
  await input.evaluate((node) => {
    window.p202Refs = { input: node, heading: document.querySelector('#component-root h2'),
      count: document.querySelector('[data-count]').firstChild };
    node.setSelectionRange(3, 3);
  });
  await page.keyboard.insertText('!');
  await expect(input).toHaveValue('Jun!gle');
  await expect(page.locator('[data-greeting]')).toHaveText('안녕하세요, Jungle!');
  expect(await input.evaluate((node) => document.activeElement === node && node.selectionStart === 4
    && node.selectionEnd === 4 && window.p202Refs.input === node)).toBe(true);
  const button = page.getByRole('button', { name: '숫자 +1 · update()' });
  await button.click();
  await button.click();
  await expect(page.locator('[data-count]')).toHaveText('2');
  await expect(page.locator('[data-double]')).toHaveText('두 배 값 · 4');
  await expect(input).toHaveValue('Jun!gle');
  await page.getByRole('button', { name: '이름 적용', exact: true }).click();
  await expect(page.locator('[data-greeting]')).toHaveText('안녕하세요, Jun!gle!');
  await expect(page).toHaveTitle('Jun!gle · 2');
  expect(await page.evaluate(() => window.p202Refs.heading === document.querySelector('#component-root h2')
    && window.p202Refs.count === document.querySelector('[data-count]').firstChild)).toBe(true);
  expect(errors).toEqual([]);
});

test('P2-02 / Effect 의존성 변경과 해제에서 이전 구독·문서 제목을 정리한다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/demos/phase2/');
  await expect(page.locator('html')).toHaveAttribute('data-app-state', 'ready');
  await expect(page.locator('#effect-log li')).toHaveText(['실행 · 이름 미니 리액트 / 숫자 0']);
  await page.getByRole('button', { name: '숫자 +1 · update()' }).click();
  await expect(page.locator('#effect-log li')).toHaveText([
    '실행 · 이름 미니 리액트 / 숫자 0', '정리 · 이름 미니 리액트 / 숫자 0', '실행 · 이름 미니 리액트 / 숫자 1',
  ]);
  // input·button의 기본 키 동작과 분리해 문서 단축키 구독이 한 개만 남았는지 확인한다.
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('+');
  await expect(page.locator('[data-count]')).toHaveText('2');
  await page.getByRole('button', { name: '컴포넌트 해제' }).click();
  await expect(page.locator('#component-root')).toBeEmpty();
  await expect(page).toHaveTitle('Mini React · Phase 2');
  await expect(page.locator('#effect-log li').last()).toHaveText('정리 · 이름 미니 리액트 / 숫자 2');
  const logs = await page.locator('#effect-log li').count();
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('+');
  await expect(page.locator('#effect-log li')).toHaveCount(logs);
  await expect(page.locator('#component-root')).toBeEmpty();
  expect(errors).toEqual([]);
});
