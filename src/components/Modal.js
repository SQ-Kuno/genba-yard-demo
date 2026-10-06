import { html, render } from '../lib/html.js';
import { Icon } from './Icon.js';

let activeClose = null;

// 汎用モーダル。Esc・背景クリック・閉じるボタンで閉じ、閉じたら開く前の要素にフォーカスを戻す
export function openModal(content, { label, className = '' } = {}) {
  activeClose?.();
  const root = document.getElementById('overlay-root');
  const opener = document.activeElement;
  render(root, html`
    <div class="modal ${className}" role="dialog" aria-modal="true" aria-label="${label}">
      <div class="modal__backdrop" data-modal-close></div>
      <div class="modal__panel" tabindex="-1">
        <button class="modal__close icon-btn" type="button" data-modal-close aria-label="閉じる">${Icon('close')}</button>
        ${content}
      </div>
    </div>`);
  document.body.classList.add('has-modal');
  const panel = root.querySelector('.modal__panel');
  requestAnimationFrame(() => root.querySelector('.modal')?.classList.add('is-open'));
  panel.focus();

  const onKey = (event) => {
    if (event.key === 'Escape') close();
  };
  const onClick = (event) => {
    if (event.target.closest('[data-modal-close]')) close();
  };

  function close() {
    root.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKey);
    root.innerHTML = '';
    document.body.classList.remove('has-modal');
    activeClose = null;
    opener?.focus?.();
  }

  root.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  activeClose = close;
  return { close, panel };
}

export const closeModal = () => activeClose?.();
