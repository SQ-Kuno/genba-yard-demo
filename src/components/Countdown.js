import { html } from '../lib/html.js';
import { remaining } from '../lib/format.js';

// 終了日時までの残り時間。main.js の1秒タイマーが [data-countdown] をまとめて更新する
export function Countdown(endsAt, { className = '', prefix = '' } = {}) {
  return html`<span class="countdown ${className}" data-countdown="${endsAt.toISOString()}" data-prefix="${prefix}" role="timer">${prefix}${remaining(endsAt - Date.now())}</span>`;
}

// 表示中のカウントダウンをまとめて進める。どれかが0になったら true を返す（価格を描き直す合図）
export function tickCountdowns() {
  const now = Date.now();
  let expired = false;
  document.querySelectorAll('[data-countdown]').forEach((element) => {
    const left = new Date(element.dataset.countdown) - now;
    element.textContent = `${element.dataset.prefix}${remaining(left)}`;
    element.classList.toggle('is-urgent', left < 3 * 3600 * 1000);
    if (left <= 0 && !element.dataset.expired) {
      element.dataset.expired = 'true';
      expired = true;
    }
  });
  return expired;
}
