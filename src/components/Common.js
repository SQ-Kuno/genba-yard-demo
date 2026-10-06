import { html, attr } from '../lib/html.js';
import { Icon } from './Icon.js';

export function Breadcrumb(items) {
  return html`
    <nav class="breadcrumb container" aria-label="現在地">
      <ol>
        <li><a href="#/">トップ</a></li>
        ${items.map((item) => html`<li>${Icon('chevronRight')}${item.href ? html`<a href="${item.href}">${item.label}</a>` : html`<span aria-current="page">${item.label}</span>`}</li>`)}
      </ol>
    </nav>`;
}

// 空状態でも「次に何をすればいいか」を必ず示す
export function EmptyState({ icon = 'search', title, text, action = null }) {
  return html`
    <div class="empty">
      <span class="empty__icon">${Icon(icon)}</span>
      <p class="empty__title">${title}</p>
      <p class="empty__text">${text}</p>
      ${action ? html`<a class="btn btn--secondary" href="${action.href}">${action.label}</a>` : ''}
    </div>`;
}

// 購入までの道のり。短い導線であることを見せる
export function Steps(current, labels = ['カート', 'ご注文内容の確認', '完了']) {
  return html`
    <ol class="steps" aria-label="購入の手順">
      ${labels.map((label, index) => html`
        <li class="steps__item ${index === current ? 'is-current' : ''} ${index < current ? 'is-done' : ''}" ${attr('aria-current', index === current && 'step')}>
          <span class="steps__num num">${index + 1}</span><span>${label}</span>
        </li>`)}
    </ol>`;
}
