import { FunctionComponent } from '../../src/component/FunctionComponent.js';
import { App } from './App.js';
import { createCommitReporter } from './diagnostics.js';

const container = document.querySelector('#component-root');
const unmountButton = document.querySelector('#unmount-button');
const status = document.querySelector('#app-status');
const log = document.querySelector('#effect-log');

function reportEffect(message) {
  const item = document.createElement('li');
  item.textContent = message;
  log.appendChild(item);
  while (log.children.length > 12) log.firstChild.remove();
}

const component = new FunctionComponent(App, { onEffect: reportEffect }, { onCommit: createCommitReporter() });
try {
  component.mount(container);
  unmountButton.disabled = false;
  status.textContent = 'mount 완료 · 이름 입력과 버튼 클릭이 루트 상태를 갱신합니다.';
  document.documentElement.dataset.appState = 'ready';
} catch (error) {
  status.textContent = `mount 실패 · ${error.message}`;
  document.documentElement.dataset.appState = 'error';
}

unmountButton.addEventListener('click', () => {
  try {
    component.unmount();
    unmountButton.disabled = true;
    status.textContent = 'unmount 완료 · 화면과 단축키를 정리했습니다. 새로고침하면 다시 시작합니다.';
  } catch (error) {
    status.textContent = `unmount 실패 · ${error.message}`;
  }
});
