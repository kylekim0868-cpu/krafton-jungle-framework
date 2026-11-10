import { readdir, readFile, access } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const excluded = new Set(['.git', 'node_modules', 'test-results', 'playwright-report']);

/**
 * 생성 결과와 의존성 패키지를 제외한 프로젝트 파일을 재귀적으로 수집한다.
 * @param {string} directory 읽을 디렉터리.
 * @returns {Promise<string[]>} 검사할 파일의 절대 경로 목록.
 */
async function collectFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

/**
 * 현재 Node로 구문을 검사하고 실패 시 전체 검사가 0이 아닌 종료 코드를 반환하게 한다.
 * 제품 코드를 실행하지 않으므로 이 성공을 DOM이나 제품 기능 검증으로 취급하지 않는다.
 * @param {string[]} args Node에 전달할 구문 검사 인수.
 * @param {string} [input] HTML에서 추출한 인라인 모듈 코드.
 */
function checkSyntax(args, input) {
  const result = spawnSync(process.execPath, args, { input, encoding: 'utf8' });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || 'JavaScript 구문 검사에 실패했습니다.');
}

try {
  const files = await collectFiles(root);
  for (const path of files) {
    const extension = extname(path);
    if (!['.js', '.mjs', '.html', '.md', '.json'].includes(extension)) continue;
    const source = await readFile(path, 'utf8');
    if (extension === '.js' || extension === '.mjs') checkSyntax(['--check', path]);
    if (extension === '.html') {
      // 외부 모듈은 각 JS 파일에서 검사하고 여기서는 HTML에 포함된 모듈을 검사한다.
      for (const [, code] of source.matchAll(/<script\b[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/g)) {
        checkSyntax(['--input-type=module', '--check'], code);
      }
    }
    if (extension === '.json') JSON.parse(source);
    if (extension === '.md') {
      // 외부 URL과 페이지 내부 앵커는 제외하고 상대 링크 대상의 존재를 확인한다.
      // 기본 Markdown 링크를 대상으로 하며 제목 앵커나 표시 레이아웃은 검사하지 않는다.
      for (const [, destination] of source.matchAll(/\]\(([^)]+)\)/g)) {
        if (/^[a-z][a-z\d+.-]*:|^#/i.test(destination)) continue;
        const target = destination.replace(/^<|>$/g, '').split('#')[0];
        await access(resolve(dirname(path), decodeURIComponent(target)));
      }
    }
    assert(!source.split(/\r?\n/).some((line) => /[\t ]+$/.test(line)), `${path}: 줄 끝에 불필요한 공백이 있습니다.`);
  }

  const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(resolve(root, 'package-lock.json'), 'utf8'));
  assert.deepEqual(lock.packages[''].devDependencies, packageJson.devDependencies);
  assert.deepEqual(lock.packages[''].engines, packageJson.engines);
  assert.equal(Object.keys(packageJson.dependencies ?? {}).length, 0, '제품 의존성 패키지를 확인해 주세요.');
  console.log('통과: JavaScript 구문·JSON·문서 링크·줄 끝 공백·lockfile 일치');
} catch (error) {
  console.error(`실패: ${error.message}`);
  process.exitCode = 1;
}
