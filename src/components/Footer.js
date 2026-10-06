import { html } from '../lib/html.js';
import { SITE } from '../config/site.js';
import { Logo } from './Logo.js';

export function Footer() {
  return html`
    <div class="footer container">
      <div class="footer__brand">
        ${Logo({ invert: true })}
        <p class="footer__tagline">${SITE.tagline}</p>
        <p class="footer__eligibility">${SITE.eligibility}</p>
      </div>
      <nav class="footer__nav" aria-label="ご利用ガイド">
        <a href="#/guide?s=shipping">送料・お届け</a>
        <a href="#/guide?s=returns">返品・初期不良</a>
        <a href="#/guide?s=warranty">保証・メーカーサポート</a>
        <a href="#/guide?s=payment">お支払い方法</a>
        <a href="#/guide?s=price">価格表示について</a>
        <a href="#/guide?s=law">特定商取引法に基づく表記</a>
      </nav>
      <div class="footer__support">
        <p class="footer__support-title">会員サポート</p>
        <a class="footer__tel num" href="${SITE.support.telHref}">${SITE.support.tel}</a>
        <p>${SITE.support.hours}</p>
      </div>
      <p class="footer__demo">これはデモ環境です。掲載の商品・ブランド・価格・会員情報・注文はすべて架空で、実際の購入・決済は行われません。<button class="footer__reset" type="button" data-action="demo-reset">デモを最初の状態に戻す</button></p>
      <p class="footer__copy en">© ${SITE.name} (demo)</p>
    </div>`;
}
