/*
  개발용 정적 파일 서버 (외부 패키지 없이 Node 내장 모듈만 사용)

  왜 필요한가?
   - 페이지가 <script type="module"> 로 src/ 의 파일을 import 하는데,
     브라우저는 보안 정책(CORS) 때문에 file:// 로 연 HTML 에서는 모듈을 불러오지 못합니다.
   - 그래서 http://localhost 로 프로젝트 폴더를 서빙합니다.

  실행: npm run dev  →  http://localhost:5173
*/
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT) || 5173;
const DEFAULT_PAGE = '/pages/phase1/';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = createServer(async (request, response) => {
  try {
    const { pathname } = new URL(request.url, `http://${request.headers.host}`);
    if (pathname === '/') {
      response.writeHead(302, { Location: DEFAULT_PAGE }).end();
      return;
    }

    // ../ 로 프로젝트 밖 파일을 읽지 못하도록 막습니다.
    let filePath = normalize(join(ROOT_DIR, decodeURIComponent(pathname)));
    if (!filePath.startsWith(ROOT_DIR) || filePath.includes('node_modules')) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    if ((await stat(filePath)).isDirectory()) filePath = join(filePath, 'index.html');

    const body = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store', // 코드 수정 후 새로고침하면 바로 반영
    });
    response.end(body);
  } catch {
    response.writeHead(404).end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`mini-react dev server: http://localhost:${PORT}${DEFAULT_PAGE}`);
});
