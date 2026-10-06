import { html } from '../lib/html.js';
import { Provenance } from './ProductSupport.js';

// 「この商品が特別価格の理由」。値引き率ではなく、なぜこの価格で買えるのかを先に伝える
export function PriceReason(product) {
  const reason = product.priceReason;
  return html`
    <section class="reason" aria-labelledby="reason-title">
      <div class="reason__main">
        <p class="eyebrow">WHY THIS PRICE</p>
        <h2 class="reason__title" id="reason-title">この商品が特別価格の理由</h2>
        <p class="reason__label"><span class="tag tag--navy">${reason.label}</span></p>
        <p class="reason__headline">${reason.headline}</p>
        <p class="reason__body">${reason.body}</p>
      </div>
      ${Provenance(product)}
    </section>`;
}
