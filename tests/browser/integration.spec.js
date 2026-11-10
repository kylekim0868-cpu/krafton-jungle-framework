import { test, expect } from '@playwright/test';

test('KJF-28 / 관찰 모듈 검사 8개가 실제 DOM에서 통과한다', async ({ page }) => {
  await page.goto('/tests/browser/integration.html');
  await expect(page.locator('#summary')).toHaveAttribute('data-state', 'passed');
  await expect(page.locator('#summary')).toHaveAttribute('data-passed', '8');
  await expect(page.locator('[data-result="failed"]')).toHaveCount(0);
});

// YJ의 “서로 다른 입력에서 계산 횟수 비교” 시나리오를 YM API와 계측 정보에 맞춰 채택한다.
test('KJF-28 / 이름·숫자·동일 값에서 렌더와 Memo·변경 명령을 구분한다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/demos/phase2/');
  await expect(page.locator('#render-count')).toHaveText('1');
  await expect(page.locator('#memo-count')).toHaveText('1');
  await page.locator('#name-input').fill('Jungle');
  await expect(page.locator('#render-count')).toHaveText('2');
  await expect(page.locator('#memo-count')).toHaveText('1');
  await expect(page.locator('#patch-summary')).toContainText('TEXT 1');
  await expect(page.locator('#patch-summary')).toContainText('EVENTS');
  await expect(page.locator('#mutation-count')).toHaveText('1');
  await page.locator('#update-button').click();
  await expect(page.locator('#render-count')).toHaveText('3');
  await expect(page.locator('#commit-count')).toHaveText('3');
  await expect(page.locator('#memo-count')).toHaveText('2');
  await expect(page.locator('#patch-summary')).toContainText('TEXT 2');
  await expect(page.locator('#mutation-count')).toHaveText('2');
  const entries = await page.locator('#commit-log li').count();
  await page.locator('#same-value-button').click();
  await expect(page.locator('#render-count')).toHaveText('3');
  await expect(page.locator('#commit-log li')).toHaveCount(entries);
  expect(errors).toEqual([]);
});

// YJ의 타이머 on/off 정리 예시를 가상 시계로 실제 증가·정지까지 검증한다.
test('KJF-28 / 타이머는 한 번 구독하고 끄기·해제 후에는 증가하지 않는다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install();
  await page.goto('/demos/phase2/');
  await page.locator('#auto-increment').check();
  await page.clock.runFor(3000);
  await expect(page.locator('[data-count]')).toHaveText('3');
  await expect(page.locator('#effect-log li').filter({ hasText: '타이머 실행' })).toHaveCount(1);
  await page.locator('#auto-increment').uncheck();
  await page.clock.runFor(3000);
  await expect(page.locator('[data-count]')).toHaveText('3');
  await expect(page.locator('#effect-log li').last()).toHaveText('타이머 정리 · 자동 증가 중지');
  await page.locator('#auto-increment').check();
  await page.clock.runFor(1000);
  await expect(page.locator('[data-count]')).toHaveText('4');
  await page.locator('#unmount-button').click();
  const renders = await page.locator('#render-count').textContent();
  const logs = await page.locator('#effect-log li').allTextContents();
  await page.clock.runFor(5000);
  await expect(page.locator('#component-root')).toBeEmpty();
  await expect(page.locator('#render-count')).toHaveText(renders);
  expect(await page.locator('#effect-log li').allTextContents()).toEqual(logs);
  await expect(page).toHaveTitle('Mini React · Phase 2');
  expect(errors).toEqual([]);
});

test('KJF-28 / 로그 상한과 공통 모바일 배치를 유지한다', async ({ page }) => {
  await page.goto('/demos/phase2/');
  for (let i = 0; i < 35; i += 1) await page.locator('#update-button').click();
  await expect(page.locator('#commit-log li')).toHaveCount(30);
  await expect(page.locator('#effect-log li')).toHaveCount(12);
  await expect(page.locator('#render-count')).toHaveText('36');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
