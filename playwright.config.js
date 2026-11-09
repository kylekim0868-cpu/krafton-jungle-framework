import { defineConfig } from '@playwright/test';

// 검증 전용 서버를 실행하고 종료 시 중지한다. 수동 데모의 5173과 분리하며,
// 같은 포트의 다른 서버를 재사용하여 오래된 코드를 검사하는 일을 막는다.
export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.spec.js',
  timeout: 20000,
  expect: { timeout: 10000 },
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    browserName: 'chromium',
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'http-server . -a 127.0.0.1 -p 4173 -c-1',
    url: 'http://127.0.0.1:4173/demos/phase1/',
    reuseExistingServer: false,
    timeout: 10000,
  },
});
