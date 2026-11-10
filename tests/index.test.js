import { describe, it, expect } from 'vitest';
import * as miniReact from '../src/index.js';

// 공개 API 진입점이 필요한 함수를 모두 내보내는지 확인 (팀원별 구현 비교 시 기준이 되는 API 목록)
describe('src/index.js 공개 API', () => {
  it.each([
    ['h'], ['createTextVNode'], ['domToVNode'], ['createElement'], ['updateProp'], ['removeProp'],
    ['vnodeToHTML'], ['htmlToVNodes'], ['normalizeVNode'], ['sanitizeVNode'],
    ['diff'], ['diffProps'], ['applyPatches'], ['patch'], ['getNode'], ['StateHistory'],
    ['FunctionComponent'], ['mountRoot'], ['useState'], ['resolveVNode'], ['flushUpdates'],
  ])('%s 함수를 내보낸다', (name) => {
    expect(typeof miniReact[name]).toBe('function');
  });

  it('TEXT, PATCH 상수를 내보낸다', () => {
    expect(miniReact.TEXT).toBe('#text');
    expect(Object.keys(miniReact.PATCH)).toEqual(['CREATE', 'REMOVE', 'REPLACE', 'TEXT', 'PROPS']);
  });
});
