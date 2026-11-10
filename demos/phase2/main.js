import { FunctionComponent } from '../../src/component/FunctionComponent.js';
import { App } from './App.js';

const container = document.querySelector('#component-root');
const updateButton = document.querySelector('#update-button');
const status = document.querySelector('#app-status');
const component = new FunctionComponent(App, { count: 0 });
let count = 0;

try {
  component.mount(container);
  updateButton.disabled = false;
  status.textContent = 'mount 완료 · 숫자 0을 표시했습니다.';
  document.documentElement.dataset.appState = 'ready';
} catch (error) {
  status.textContent = `mount 실패 · ${error.message}`;
  document.documentElement.dataset.appState = 'error';
}

// P2-01에서는 컨트롤러가 props를 전달한다. 성공한 갱신 뒤에만 다음 숫자를 확정한다.
updateButton.addEventListener('click', () => {
  const nextCount = count + 1;
  try {
    component.update({ count: nextCount });
    count = nextCount;
    status.textContent = `update 완료 · 숫자 ${count}를 표시했습니다.`;
  } catch (error) {
    status.textContent = `update 실패 · ${error.message}`;
  }
});
