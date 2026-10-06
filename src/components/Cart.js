import { html } from '../lib/html.js';
import { yen } from '../lib/format.js';
import { getPricing, includedTax, priceLabel, unitPriceOf } from '../lib/pricing.js';
import { stockOf, maxOrderQty, orderLimitOf } from '../lib/store.js';
import { brandById } from '../data/brands.js';
import { SITE } from '../config/site.js';
import { ProductImage } from './ProductImage.js';
import { Countdown } from './Countdown.js';
import { unitOf } from './StockMeter.js';
import { lowStockThreshold } from '../lib/status.js';
import { Icon } from './Icon.js';

export function QtyStepper(product, qty, { scope = 'cart' } = {}) {
  const max = maxOrderQty(product);
  return html`
    <div class="qty" data-qty-scope="${scope}" data-product-id="${product.id}">
      <button class="qty__btn" type="button" data-action="qty-dec" aria-label="数量を減らす" ${qty <= 1 ? 'disabled' : ''}>${Icon('minus')}</button>
      <span class="qty__value num" aria-live="polite">${qty}</span>
      <button class="qty__btn" type="button" data-action="qty-inc" aria-label="数量を増やす" ${qty >= max ? 'disabled' : ''}>${Icon('plus')}</button>
    </div>`;
}

// カートの数量を変えた・外した理由（カートと購入画面で共通）
function changeText(change) {
  const unit = unitOf(change.product);
  if (change.reason === 'unavailable') return '販売期間外になったか、販売を停止したため、カートから外しました';
  if (change.reason === 'limit') {
    return change.to
      ? `1契約で購入できる上限に合わせて${change.to}${unit}にしました（まとめ買いは見積でご相談ください）`
      : '1契約で購入できる上限まで購入済みのため、カートから外しました（まとめ買いは見積でご相談ください）';
  }
  return change.to ? `在庫が減ったため${change.to}${unit}に変更しました` : '在庫が減ったため、カートから外しました（完売）';
}

export const StockChangeNotice = (changes) => (changes.length
  ? html`<div class="form__error" role="alert">${changes.map((change) => html`<p>${change.product.model}：${changeText(change)}。</p>`)}</div>`
  : '');

// 期間限定・残りわずかの情報は、カートと購入画面でも出し続ける
export function LineUrgency(product, { quoted = false } = {}) {
  const pricing = getPricing(product);
  const stock = stockOf(product);
  const notes = [];
  if (pricing.sale && !quoted) notes.push(html`<span class="urgency urgency--time">${Icon('clock')}${pricing.sale.label}終了まで ${Countdown(pricing.sale.endsAt)}</span>`);
  if (stock <= lowStockThreshold()) notes.push(html`<span class="urgency urgency--stock">残り${stock}${unitOf(product)}</span>`);
  return notes.length ? html`<p class="line__urgency">${notes}</p>` : '';
}

export function CartLine(product, qty, { scope = 'cart', editable = true, unitPrice = null } = {}) {
  const pricing = getPricing(product);
  const price = unitPriceOf({ product, unitPrice });
  // 見積からの注文で、本日の価格の方が安ければそちらを適用している
  const quoted = unitPrice !== null && price === unitPrice;
  const unitLabel = unitPrice === null ? priceLabel(pricing) : quoted ? '見積単価' : `${priceLabel(pricing)}（見積単価${yen(unitPrice)}より安いため適用）`;
  const brand = brandById(product.brandId);
  return html`
    <li class="line">
      <a class="line__media" href="#/product/${product.id}">${ProductImage(product, { className: 'pimg--thumb' })}</a>
      <div class="line__body">
        <p class="line__brand en">${brand.name} ${product.model}</p>
        <a class="line__name" href="#/product/${product.id}">${product.name}</a>
        ${LineUrgency(product, { quoted })}
        <p class="line__unit"><span>${unitLabel}</span><span class="num">${yen(price)}</span></p>
      </div>
      <div class="line__side">
        ${editable ? QtyStepper(product, qty, { scope }) : html`<p class="line__qty">数量 <span class="num">${qty}</span></p>`}
        ${editable && qty >= maxOrderQty(product) ? html`<p class="line__limit">${maxOrderQty(product) < stockOf(product) ? `1契約${orderLimitOf(product)}${unitOf(product)}までです` : '在庫の上限です'}</p>` : ''}
        <p class="line__total num">${yen(price * qty)}</p>
        ${scope === 'cart' ? html`<button class="link-btn line__remove" type="button" data-action="remove-line" data-product-id="${product.id}">${Icon('trash')}削除</button>` : ''}
      </div>
    </li>`;
}

export function OrderSummary(summary, { cta = '' } = {}) {
  // 送料無料の判定は標準送料の商品だけで行う（個別送料の商品は別に加算）
  const standardFee = summary.shipping - summary.individualShipping;
  const remainingForFree = SITE.shipping.freeThreshold - summary.standardSubtotal;
  return html`
    <div class="summary">
      <dl class="summary__rows">
        <div><dt>商品の小計（${summary.count}点）</dt><dd class="num">${yen(summary.subtotal)}</dd></div>
        <div><dt>送料</dt><dd class="num">${summary.shipping === 0 ? '無料' : yen(summary.shipping)}</dd></div>
        <div class="summary__total"><dt>お支払い合計<small>（税込）</small></dt><dd class="num">${yen(summary.total)}</dd></div>
        <div class="summary__tax"><dt>うち消費税（10%）</dt><dd class="num">${yen(includedTax(summary.total))}</dd></div>
      </dl>
      ${standardFee > 0 && remainingForFree > 0
        ? html`<p class="summary__hint">あと <strong class="num">${yen(remainingForFree)}</strong> で送料無料になります。</p>`
        : summary.standardSubtotal > 0 ? html`<p class="summary__hint summary__hint--ok">${Icon('truck')}送料無料（${yen(SITE.shipping.freeThreshold)}以上のご注文）</p>` : ''}
      ${summary.individualShipping > 0 ? html`<p class="summary__hint">個別送料の商品を含みます（${yen(summary.individualShipping)}）。</p>` : ''}
      ${summary.savings > 0 ? html`<p class="summary__savings">${summary.savingsPartial ? '比較できる商品の' : ''}${summary.savingsIncludesStore ? '比較元の価格' : 'メーカー希望小売価格'}${summary.savingsIncludesLaunch ? '（廃番・終売品は発売時の価格）' : ''}の合計との差 <span class="num">${yen(summary.savings)}</span></p>` : ''}
      ${cta}
    </div>`;
}
