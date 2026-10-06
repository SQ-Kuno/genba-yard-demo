import { html, render } from '../lib/html.js';
import { Icon } from './Icon.js';

let timer = null;

// 画面下の短い通知。action を渡すと「カートを見る」などのリンクを添える
export function showToast(message, { action = null, duration = 4000 } = {}) {
  const root = document.getElementById('toast-root');
  render(root, html`
    <div class="toast" role="status">
      <span class="toast__icon">${Icon('check')}</span>
      <p class="toast__text">${message}</p>
      ${action ? html`<a class="toast__action" href="${action.href}">${action.label}</a>` : ''}
    </div>`);
  requestAnimationFrame(() => root.firstElementChild?.classList.add('is-visible'));
  clearTimeout(timer);
  timer = setTimeout(() => {
    root.firstElementChild?.classList.remove('is-visible');
  }, duration);
}
