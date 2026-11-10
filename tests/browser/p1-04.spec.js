import { test, expect } from '@playwright/test';

const initialTitle = '나만의 미니 리액트';

/** 실제 입력과 Patch 클릭으로 제목을 확정하고 양쪽 화면의 일치를 확인한다. */
async function saveTitle(page, title) {
  await page.locator('#test-area h3').fill(title);
  await page.locator('#patch-button').click();
  await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'success');
  await titles(page, title);
}

async function titles(page, title) {
  await expect(page.locator('#actual-area h3')).toHaveText(title);
  await expect(page.locator('#test-area h3')).toHaveText(title);
}

/** 사용자에게 표시되는 이력 위치와 양 끝 버튼으로 논리 상태를 관찰한다. */
async function position(page, index, length) {
  await expect(page.locator('#history-position')).toHaveText(`이력 ${index} / ${length}`);
  if (index === 1) await expect(page.locator('#back-button')).toBeDisabled();
  else await expect(page.locator('#back-button')).toBeEnabled();
  if (index === length) await expect(page.locator('#forward-button')).toBeDisabled();
  else await expect(page.locator('#forward-button')).toBeEnabled();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/demos/phase1/');
  await expect(page.locator('html')).toHaveAttribute('data-app-state', 'ready');
});

test('P1-04 / 순수 이력 모듈 검사 9개가 브라우저에서도 통과한다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/tests/browser/p1-04.html');
  await expect(page.locator('#summary')).toHaveAttribute('data-state', /passed|failed/);
  expect(await page.locator('[data-result="failed"]').allTextContents()).toEqual([]);
  await expect(page.locator('#summary')).toHaveAttribute('data-passed', '9');
  await expect(page.locator('#summary')).toHaveAttribute('data-failed', '0');
  await expect(page.locator('#results > li')).toHaveCount(9);
  expect(errors).toEqual([]);
});

test('P1-04 / A→B→C→뒤로 B→뒤로 A→앞으로 B→새 D로 분기한다', async ({ page }) => {
  const original = await page.locator('#actual-area').innerHTML();
  await position(page, 1, 1);
  await saveTitle(page, 'B');
  await position(page, 2, 2);
  await saveTitle(page, 'C');
  await position(page, 3, 3);
  await page.locator('#back-button').click();
  await titles(page, 'B');
  await position(page, 2, 3);
  await page.locator('#back-button').click();
  await titles(page, initialTitle);
  await position(page, 1, 3);
  expect(await page.locator('#actual-area').innerHTML()).toBe(original);
  expect(await page.locator('#test-area').innerHTML()).toBe(original);
  await page.locator('#forward-button').click();
  await titles(page, 'B');
  await saveTitle(page, 'D');
  await position(page, 3, 3);
  await page.locator('#back-button').click();
  await titles(page, 'B');
  await page.locator('#forward-button').click();
  await titles(page, 'D');
  await position(page, 3, 3);
});

test('P1-04 / 과거 위치의 무변경·준비 실패는 앞으로 기록을 유지한다', async ({ page }) => {
  await saveTitle(page, 'B');
  await saveTitle(page, 'C');
  await page.locator('#back-button').click();
  await page.locator('#patch-button').click();
  await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'unchanged');
  await position(page, 2, 3);
  await page.locator('#test-area').evaluate((editor) => {
    editor.querySelector('h3').textContent = '미확정 D';
    editor.querySelectorAll('li')[1].dataset.key = 'read';
  });
  const draft = await page.locator('#test-area').innerHTML();
  await page.locator('#patch-button').click();
  await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'error');
  await expect(page.locator('#actual-area h3')).toHaveText('B');
  expect(await page.locator('#test-area').innerHTML()).toBe(draft);
  await position(page, 2, 3);
  await page.locator('#forward-button').click();
  await titles(page, 'C');
  await position(page, 3, 3);
});

test('P1-04 / 과거 위치의 Patch 적용 실패는 분기 후보를 버리고 기존 미래를 보존한다', async ({ page }) => {
  await saveTitle(page, 'B');
  await saveTitle(page, 'C');
  await page.locator('#back-button').click();
  await page.locator('#test-area h3').fill('실패할 D');
  await page.evaluate(() => {
    const editor = document.querySelector('#test-area');
    const native = editor.replaceChildren;
    editor.replaceChildren = function () {
      this.replaceChildren = native;
      window.p104Partial = document.querySelector('#actual-area h3').textContent === '실패할 D';
      throw new Error('injected patch editor failure');
    };
  });
  await page.locator('#patch-button').click();
  await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'recovered');
  expect(await page.evaluate(() => window.p104Partial)).toBe(true);
  await titles(page, 'B');
  await position(page, 2, 3);
  await page.locator('#forward-button').click();
  await titles(page, 'C');
});

test('P1-04 / 이동 준비 실패는 화면·미확정 편집·위치를 그대로 둔다', async ({ page }) => {
  await saveTitle(page, 'B');
  await page.locator('#test-area h3').fill('미확정');
  await page.evaluate(() => {
    const native = document.createElement;
    document.createElement = function (tag, ...args) {
      if (tag === 'article') {
        this.createElement = native;
        throw new Error('injected history render failure');
      }
      return native.call(this, tag, ...args);
    };
  });
  await page.locator('#back-button').click();
  await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'error');
  await expect(page.locator('#actual-area h3')).toHaveText('B');
  await expect(page.locator('#test-area h3')).toHaveText('미확정');
  await position(page, 2, 2);
  await page.locator('#back-button').click();
  await titles(page, initialTitle);
  await position(page, 1, 2);
});

for (const panel of ['actual-area', 'test-area']) {
  test(`P1-04 / ${panel} 이동 적용 실패는 두 화면과 위치를 복구하고 재시도한다`, async ({ page }) => {
    await saveTitle(page, 'B');
    await saveTitle(page, 'C');
    await page.locator('#back-button').click();
    await page.evaluate((id) => {
      const area = document.getElementById(id);
      const native = area.replaceChildren;
      area.replaceChildren = function (...args) {
        this.replaceChildren = native;
        native.apply(this, args);
        window.p104Partial = document.querySelector('#actual-area h3').textContent === '나만의 미니 리액트';
        throw new Error('injected history mount failure');
      };
    }, panel);
    await page.locator('#back-button').click();
    await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'recovered');
    expect(await page.evaluate(() => window.p104Partial)).toBe(true);
    await titles(page, 'B');
    await position(page, 2, 3);
    await page.locator('#back-button').click();
    await titles(page, initialTitle);
    await position(page, 1, 3);
    await page.locator('#forward-button').click();
    await page.locator('#forward-button').click();
    await titles(page, 'C');
    await position(page, 3, 3);
  });
}

test('P1-04 / 이동 복구도 실패하면 세 버튼과 편집을 잠그고 후속 요청을 무시한다', async ({ page }) => {
  await saveTitle(page, 'B');
  await saveTitle(page, 'C');
  await page.locator('#back-button').click();
  await position(page, 2, 3);
  await page.evaluate(() => {
    document.querySelector('#test-area').replaceChildren = () => { throw new Error('persistent history failure'); };
  });
  await page.locator('#back-button').click();
  await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'locked');
  for (const id of ['patch-button', 'back-button', 'forward-button']) await expect(page.locator(`#${id}`)).toBeDisabled();
  await expect(page.locator('#test-area')).toHaveAttribute('contenteditable', 'false');
  await expect(page.locator('html')).toHaveAttribute('data-app-state', 'error');
  const locked = await page.locator('#actual-area').innerHTML();
  await page.evaluate(() => {
    for (const id of ['patch-button', 'back-button', 'forward-button']) document.getElementById(id).dispatchEvent(new Event('click'));
  });
  expect(await page.locator('#actual-area').innerHTML()).toBe(locked);
  await expect(page.locator('#history-position')).toHaveText('이력 2 / 3');
  await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'locked');
});

test('P1-04 / 미확정 편집은 이동 시 버리고 경계 요청에서는 유지한다', async ({ page }) => {
  await saveTitle(page, 'B');
  await page.locator('#test-area h3').fill('저장하지 않은 내용');
  await page.locator('#back-button').click();
  await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'restored');
  await titles(page, initialTitle);
  await page.locator('#test-area').evaluate((editor) => {
    editor.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
  });
  const draft = await page.locator('#test-area').innerHTML();
  await page.locator('#back-button').evaluate((button) => button.dispatchEvent(new Event('click')));
  expect(await page.locator('#test-area').innerHTML()).toBe(draft);
  await position(page, 1, 2);
  // 편집 DOM이 지원 밖 상태여도, 저장된 화면으로 이동할 때 그 편집을 변환할 필요는 없다.
  await page.locator('#forward-button').click();
  await titles(page, 'B');
  await expect(page.locator('#test-area svg')).toHaveCount(0);
  await position(page, 2, 2);
});

test('P1-04 / 빈 화면·여러 루트·중첩 template를 복원하고 다음 Patch를 처리한다', async ({ page }) => {
  const stages = ['', '앞<p data-key="a">A</p><template> <template><b>T</b></template> </template>뒤',
    '<section data-key="c">C</section><p data-key="a">새 A</p>'];
  for (const html of stages) {
    await page.locator('#test-area').evaluate((editor, value) => { editor.innerHTML = value; }, html);
    await page.locator('#patch-button').click();
    await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'success');
  }
  for (const index of [1, 0]) {
    await page.locator('#back-button').click();
    expect(await page.locator('#actual-area').innerHTML()).toBe(stages[index]);
    expect(await page.locator('#test-area').innerHTML()).toBe(stages[index]);
  }
  await position(page, 2, 4);
  await page.locator('#forward-button').click();
  await page.locator('#test-area [data-key="a"]').fill('복원 후 편집');
  await page.locator('#patch-button').click();
  await expect(page.locator('#actual-area [data-key="a"]')).toHaveText('복원 후 편집');
  await position(page, 4, 4);
  await expect(page.locator('#actual-area > div')).toHaveCount(0);
});

test('P1-04 / 이력 복원 후 Enter key 추적과 새 분기가 과거 스냅샷을 바꾸지 않는다', async ({ page }) => {
  await saveTitle(page, 'B');
  await saveTitle(page, 'C');
  await page.locator('#back-button').click();
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
  await page.keyboard.insertText('복원 후 새 항목');
  const key = await page.locator('#test-area li').last().getAttribute('data-key');
  expect(key).toMatch(/^editor-\d+$/);
  await page.locator('#patch-button').click();
  await expect(page.locator('#app-status')).toHaveAttribute('data-state', 'success');
  await position(page, 3, 3);
  await page.locator('#back-button').click();
  await expect(page.locator('#actual-area li')).toHaveCount(3);
  await titles(page, 'B');
  await page.locator('#forward-button').click();
  await expect(page.locator('#actual-area li')).toHaveCount(4);
  await expect(page.locator('#actual-area li').last()).toHaveAttribute('data-key', key);
  await expect(page.locator('#test-area li').last()).toHaveText('복원 후 새 항목');
});

test('P1-04 / 새로고침하면 페이지의 초기 이력으로 시작한다', async ({ page }) => {
  await saveTitle(page, 'B');
  await position(page, 2, 2);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-app-state', 'ready');
  await titles(page, initialTitle);
  await position(page, 1, 1);
});
