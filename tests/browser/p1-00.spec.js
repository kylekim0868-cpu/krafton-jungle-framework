import { test, expect } from '@playwright/test';

/**
 * 브라우저 내부 검사가 모두 끝나고 건수와 결과가 일치하는지 확인한다.
 * 모듈 로딩 실패로 running이 유지되거나 검사가 누락되면 성공으로 판단하지 않는다.
 * @param {import('@playwright/test').Page} page 실제 검증 페이지.
 * @param {number} timeout 완료를 기다릴 최대 시간으로 단위는 밀리초다.
 */
async function requirePassingSuite(page, timeout = 10000) {
  try {
    await page.waitForFunction(() => {
      const state = document.querySelector('#summary')?.dataset.state;
      return state === 'passed' || state === 'failed';
    }, undefined, { timeout });
  } catch {
    throw new Error('검사가 완료되지 않았습니다. 모듈 로딩과 브라우저 오류를 확인해 주세요.');
  }
  const summary = page.locator('#summary');
  const failures = await page.locator('[data-result="failed"]').allTextContents();
  // 기존 단위 15개와 기능 5개를 모두 실행하도록 요구한다. 추가 시 기대 건수도 갱신한다.
  expect(await summary.getAttribute('data-state'), failures.join('\n')).toBe('passed');
  await expect(summary).toHaveAttribute('data-passed', '20');
  await expect(summary).toHaveAttribute('data-failed', '0');
  await expect(page.locator('#results > li')).toHaveCount(20);
}

test('P1-00 / 기존 DOM 단위·초기화 기능 20개가 통과한다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/tests/browser/p1-00.html');
  await requirePassingSuite(page);
  expect(errors).toEqual([]);
});

test('P1-00 / 키 입력과 삭제를 해도 실제 영역은 유지된다', async ({ page }) => {
  await page.goto('/demos/phase1/');
  await expect(page.locator('html')).toHaveAttribute('data-app-state', 'ready');
  const original = await page.locator('#actual-area').innerHTML();
  const editor = page.locator('#test-area');
  // 브라우저에 키 이벤트를 전달한다. 운영체제의 한글 조합 입력은 직접 확인해야 한다.
  await editor.fill('keyboard');
  await editor.press('End');
  await editor.press('Backspace');
  await expect(editor).toHaveText('keyboar');
  expect(await page.locator('#actual-area').innerHTML()).toBe(original);
});

test('검증 기반 / DOM 검사 실패를 놓치지 않는다', async ({ page }) => {
  // 제품 파일을 수정하지 않고 가져올 테스트 모듈에 의도적인 실패를 주입한다.
  // 실패가 상위 실행 함수까지 전달되는지 확인하여 검사 실패를 성공으로 처리하지 않게 한다.
  await page.route('**/tests/unit/vdom.test.js', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nvdomTests[0][1] = () => { throw new Error('injected failure'); };` });
  });
  await page.goto('/tests/browser/p1-00.html');
  await expect(requirePassingSuite(page)).rejects.toThrow('injected failure');
  await expect(page.locator('#summary')).toHaveAttribute('data-failed', '1');
});

test('검증 기반 / 모듈 로딩 실패를 통과로 판단하지 않는다', async ({ page }) => {
  await page.route('**/tests/unit/vdom.test.js', (route) => route.abort());
  await page.goto('/tests/browser/p1-00.html');
  await expect(requirePassingSuite(page, 1000)).rejects.toThrow('검사가 완료되지 않았습니다');
  await expect(page.locator('#summary')).toHaveAttribute('data-state', 'running');
});
