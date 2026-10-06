import { html } from '../lib/html.js';
import { yen } from '../lib/format.js';
import { getPricing, priceLabel } from '../lib/pricing.js';
import { isPriceHidden } from '../lib/status.js';
import { Icon } from './Icon.js';

// SECRET PRICE は、会員がタップするまで価格を伏せる（タップで開く・何度でも見られる）
function SecretButton(product, { large = false } = {}) {
  return html`
    <button class="secret ${large ? 'secret--lg' : ''}" type="button" data-action="reveal-secret" data-product-id="${product.id}">
      <span class="secret__title en">SECRET PRICE</span>
      <span class="secret__hint">${Icon('lock')}タップで会員価格を表示</span>
    </button>`;
}

const Rate = (pricing) => (pricing.showRate ? html`<span class="price__rate num">${pricing.rate}%OFF</span>` : '');

// 比較の基準は「その商品自体のメーカー希望小売価格」だけ。自店の通常価格や後継機の価格とは並べない
export function PriceDisplay(product, { variant = 'card' } = {}) {
  const pricing = getPricing(product);
  const hidden = isPriceHidden(product);

  if (variant === 'card') {
    return html`
      <div class="price price--card">
        ${pricing.showRate ? html`<p class="price__ref"><span>${pricing.referenceShort}</span><span class="num">${yen(pricing.reference)}</span></p>` : ''}
        ${hidden
          ? SecretButton(product)
          : html`<p class="price__main">
              <span class="price__label">${priceLabel(pricing)}</span>
              <span class="price__value num">${yen(pricing.final)}</span>
              ${Rate(pricing)}
            </p>`}
      </div>`;
  }

  // 商品詳細
  return html`
    <div class="price price--detail">
      ${pricing.showRate ? html`<dl class="price__rows">
        <div class="price__row">
          <dt>${pricing.referenceLabel}</dt>
          <dd class="num">${yen(pricing.reference)}</dd>
        </div>
      </dl>` : ''}
      ${hidden
        ? SecretButton(product, { large: true })
        : html`<div class="price__final">
            <p class="price__label">${priceLabel(pricing)}<span>（税込）</span></p>
            <p class="price__figure">
              <span class="price__value num">${yen(pricing.final)}</span>
              ${Rate(pricing)}
            </p>
          </div>`}
      <p class="price__note">${pricing.showRate ? `割引率は、${pricing.referenceNote}との比較です。` : ''}自店の過去の価格や、後継機など別の商品の価格とは比べていません。</p>
    </div>`;
}
