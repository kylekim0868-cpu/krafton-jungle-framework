import { defineConfig } from '@playwright/test';

// 기본 포트가 사용 중이면 환경 변수로 빈 포트를 지정해 기존 서버를 유지한다.
const testPort = Number(process.env.MINI_REACT_TEST_PORT ?? 4173);
if (!Number.isInteger(testPort) || testPort < 1 || testPort > 65535) {
  throw new Error('MINI_REACT_TEST_PORT는 1~65535 범위의 정수여야 합니다.');
}

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
    baseURL: `http://127.0.0.1:${testPort}`,
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `http-server . -a 127.0.0.1 -p ${testPort} -c-1`,
    url: `http://127.0.0.1:${testPort}/demos/phase1/`,
    reuseExistingServer: false,
    timeout: 10000,
  },
});
