import { html, render as renderInto } from '../lib/html.js';
import { yen, yearMonth, monthDay, dateTime } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { productById } from '../lib/catalog.js';
import { getPricing, priceLabel } from '../lib/pricing.js';
import { addToCart, cartCount, maxOrderQty, orderLimitOf, purchasedQty } from '../lib/store.js';
import { runsOnOwnedBattery, isPriceHidden, isPurchasable } from '../lib/status.js';
import { deliveryLabel, cutoffNote, leadOf, leadText } from '../lib/delivery.js';
import { track, toItem } from '../lib/analytics.js';
import { SITE } from '../config/site.js';
import { listedProducts, saleState, sellerById } from '../lib/market.js';
import { brandById } from '../data/brands.js';
import { categoryById, LIFECYCLES } from '../data/categories.js';
import { platformById } from '../data/batteries.js';
import { ProductImage, imageFiles } from '../components/ProductImage.js';
import { StatusBadges } from '../components/StatusBadge.js';
import { PriceDisplay } from '../components/PriceDisplay.js';
import { StockMeter, unitOf } from '../components/StockMeter.js';
import { Countdown } from '../components/Countdown.js';
import { FavoriteButton } from '../components/ProductCard.js';
import { ProductGrid } from '../components/ProductGrid.js';
import { PriceReason } from '../components/PriceReason.js';
import { ProductSupport } from '../components/ProductSupport.js';
import { ComparisonTeaser, comparisonFor } from '../components/ProductComparison.js';
import { SectionHeader } from '../components/Section.js';
import { Breadcrumb, EmptyState } from '../components/Common.js';
import { showToast } from '../components/Toast.js';
import { openModal } from '../components/Modal.js';
import { Icon } from '../components/Icon.js';

const GALLERY_LABELS = ['商品', '特長', '同梱品'];

function Gallery(product) {
  const views = imageFiles(product).slice(0, 3);
  return html`
    <div class="gallery" data-gallery>
      <div class="gallery__main" data-gallery-main>${ProductImage(product, { eager: true, className: 'pimg--large' })}</div>
      <div class="gallery__thumbs" role="tablist" aria-label="商品画像">
        ${views.map((_, index) => html`
          <button class="gallery__thumb ${index === 0 ? 'is-active' : ''}" type="button" role="tab" aria-selected="${index === 0}" data-gallery-view="${index}">
            ${ProductImage(product, { view: index, className: 'pimg--thumb' })}
            <span class="gallery__thumb-label">${GALLERY_LABELS[index]}</span>
          </button>`)}
      </div>
    </div>`;
}

function KeyDates(product) {
  return html`
    <dl class="keydates">
      <div><dt>発売</dt><dd>${product.releaseDate ? yearMonth(product.releaseDate) : '—'}</dd></div>
      <div><dt>製造終了</dt><dd>${product.productionEnd ? yearMonth(product.productionEnd) : product.lifecycle === 'current' ? '製造中' : '確認中'}</dd></div>
      <div><dt>販売終了</dt><dd>${product.salesEnd ? yearMonth(product.salesEnd) : product.lifecycle === 'current' ? 'メーカー販売中' : '確認中'}</dd></div>
    </dl>`;
}

// SALE の繰り返し方（カウントダウンだけだと「今日だけ」と受け取られやすいので添える）
const SALE_NOTES = {
  timesale: 'TIME SALE の対象は毎日入れ替わります。同じ商品の次の登場は、早くても3日後です。',
  weekend: '週末限定SALEは毎週土日の価格です。',
};

// 購入できないときの説明（販売状況・販売期間・在庫から）
function closedMessage(product) {
  const state = saleState(product);
  if (state === 'scheduled') return `${dateTime(new Date(product.saleStart))} から販売します。`;
  if (state === 'expired' || state === 'ended') return 'この商品の販売は終了しました。';
  if (state === 'suspended') return '現在、この商品のお取り扱いを停止しています。';
  return '今回の放出分は完売しました。再入荷の予定はありません。';
}

function BuyBox(product) {
  const pricing = getPricing(product);
  const hidden = isPriceHidden(product);
  const soldOut = !isPurchasable(product);
  const seller = sellerById(product.sellerId);
  const fulfiller = sellerById(product.fulfillerId);
  const lead = leadOf([product]);
  const owned = runsOnOwnedBattery(product);
  return html`
    <div class="buybox">
      ${PriceDisplay(product, { variant: 'detail' })}
      <p class="buybox__reason"><span class="tag tag--outline">${product.priceReason.label}</span><button class="link-btn" type="button" data-scroll-reason>この価格の理由を見る</button></p>
      ${pricing.sale ? html`
        <p class="buybox__sale">${Icon('clock')}<span>${pricing.sale.label}は${pricing.sale.kind === 'timesale' ? '本日' : monthDay(pricing.sale.endsAt)} 23:59まで</span>${Countdown(pricing.sale.endsAt, { prefix: 'あと ' })}</p>
        ${SALE_NOTES[pricing.sale.kind] ? html`<p class="buybox__sale-note">${SALE_NOTES[pricing.sale.kind]}</p>` : ''}` : ''}
      ${StockMeter(product)}
      ${owned ? html`<p class="buybox__owned">${Icon('battery')}手持ちの${platformById(product.support.battery.platform).name}バッテリーで動きます</p>` : ''}
      ${soldOut
        ? html`<p class="buybox__soldout">${closedMessage(product)}</p>
            <a class="btn btn--secondary btn--block" href="#/products?cat=${product.categoryId}&stock=1">同じカテゴリーの在庫ありを見る</a>`
        : maxOrderQty(product) === 0
        ? html`<p class="buybox__soldout">1契約で購入できる上限（${orderLimitOf(product)}${unitOf(product)}）まで購入済みです。まとめ買いは<a href="#/mypage?tab=quotes">見積</a>でご相談ください。</p>`
        : html`
          <div class="buybox__qty">
            <span class="buybox__qty-label">数量</span>
            <div class="qty" data-detail-qty>
              <button class="qty__btn" type="button" data-step="-1" aria-label="数量を減らす" disabled>${Icon('minus')}</button>
              <span class="qty__value num" data-qty-value aria-live="polite">1</span>
              <button class="qty__btn" type="button" data-step="1" aria-label="数量を増やす" ${maxOrderQty(product) <= 1 ? 'disabled' : ''}>${Icon('plus')}</button>
            </div>
            <span class="buybox__qty-max">1契約につき${orderLimitOf(product)}${unitOf(product)}まで（今回の放出分）${purchasedQty(product.id) ? `・購入済み${purchasedQty(product.id)}${unitOf(product)}` : ''}</span>
          </div>
          <p class="buybox__limit">転売目的と判断したご注文はお取り消しします。まとめ買いは<a href="#/mypage?tab=quotes">見積</a>でご相談ください。</p>
          ${hidden ? html`<p class="buybox__hint">${Icon('lock')}SECRET PRICE を表示すると購入できます。</p>` : ''}
          <div class="buybox__actions">
            <button class="btn btn--primary btn--lg btn--block" type="button" data-buy-now ${hidden ? 'disabled' : ''}>今すぐ購入</button>
            <button class="btn btn--secondary btn--lg btn--block" type="button" data-add-to-cart ${hidden ? 'disabled' : ''}>${Icon('cart')}カートに入れる</button>
          </div>`}
      <div class="buybox__fav">${FavoriteButton(product, { withLabel: true })}</div>
      <ul class="assurances">
        ${soldOut ? '' : lead
          ? html`<li>${Icon('truck')}<span><strong>${leadText(lead)}</strong>（出品元から直送）。登録済みの現場へ届けられます。</span></li>`
          : html`<li>${Icon('truck')}<span><strong>${deliveryLabel()} お届け</strong>（${cutoffNote()}）。登録済みの現場へ直送できます。</span></li>`}
        <li>${Icon('box')}<span>${product.shipping.fee != null ? `送料 ${yen(product.shipping.fee)}（この商品の個別送料）` : `送料 ${yen(SITE.shipping.fee)}（${yen(SITE.shipping.freeThreshold)}以上のご注文は無料）`}</span></li>
        ${seller ? html`<li>${Icon('building')}<span>出品元：${seller.name}${fulfiller && fulfiller.id !== seller.id ? `（発送：${fulfiller.name}）` : ''}。商品は出品元から直接お届けします。</span></li>` : ''}
        <li>${Icon('shield')}<span>初期不良は到着後${SITE.initialDefectDays}日以内に交換。未開封なら到着後${SITE.returnDays}日以内の返品も承ります。</span></li>
        <li>${Icon('receipt')}<span>適格請求書（インボイス）対応の領収書を発行。請求書払い（月末締め）も選べます。</span></li>
      </ul>
      <button class="consult" type="button" data-consult>
        ${Icon('video')}<span><strong>手持ちの道具に合うか、ビデオで相談</strong><small>スタッフが実物を見ながら確認します（LiveCall）</small></span>${Icon('chevronRight')}
      </button>
    </div>`;
}

function Specs(product) {
  const brand = brandById(product.brandId);
  const rows = [
    ['ブランド', brand.name],
    ['型番', product.model],
    ['カテゴリー', categoryById(product.categoryId).name],
    ['商品の状態', `${LIFECYCLES[product.lifecycle].label}（${LIFECYCLES[product.lifecycle].description}）`],
    ...product.specs,
    ['同梱品', product.inBox.join('／')],
  ];
  return html`
    <section class="detail-section" aria-labelledby="spec-title">
      ${SectionHeader({ id: 'spec-title', eyebrow: 'SPECIFICATIONS', title: '商品説明・主要スペック' })}
      <div class="spec-layout">
        <p class="spec-description">${product.description}</p>
        <table class="spec">
          <tbody>${rows.map(([label, value]) => html`<tr><th scope="row">${label}</th><td>${value}</td></tr>`)}</tbody>
        </table>
      </div>
    </section>`;
}

function Related(product) {
  const compatible = product.compatibleIds.map(productById).filter((item) => item && isPurchasable(item));
  const sameCategory = listedProducts().filter((item) => item.categoryId === product.categoryId && item.id !== product.id && !product.compatibleIds.includes(item.id) && isPurchasable(item));
  const items = [...compatible, ...sameCategory].slice(0, 4);
  if (!items.length) return '';
  return html`
    <section class="detail-section" aria-labelledby="related-title">
      ${SectionHeader({ id: 'related-title', eyebrow: 'GOES WELL WITH', title: compatible.length ? 'このモデルと一緒に使える道具' : '同じカテゴリーの道具' })}
      ${ProductGrid(items, { layout: 'rail', listName: '関連商品' })}
    </section>`;
}

function StickyCta(product) {
  const pricing = getPricing(product);
  const hidden = isPriceHidden(product);
  if (maxOrderQty(product) === 0) return '';
  return html`
    <div class="sticky-cta" aria-label="購入">
      <div class="sticky-cta__price">
        <span class="sticky-cta__label">${hidden ? 'SECRET PRICE' : priceLabel(pricing)}</span>
        <span class="sticky-cta__value num">${hidden ? '—' : yen(pricing.final)}</span>
      </div>
      <button class="btn btn--secondary" type="button" data-add-to-cart ${hidden ? 'disabled' : ''} aria-label="カートに入れる">${Icon('cart')}<span class="sticky-cta__cart-label">カート</span></button>
      <button class="btn btn--primary" type="button" data-buy-now ${hidden ? 'disabled' : ''}>今すぐ購入</button>
    </div>`;
}

function openConsult(product) {
  openModal(html`
    <div class="consult-modal">
      <p class="eyebrow">VIDEO CONSULTATION</p>
      <h2 class="consult-modal__title">ビデオで相談する</h2>
      <p>${product.model} がお手持ちのバッテリー・先端工具に合うか、スタッフがビデオ通話で一緒に確認します。カメラは会員さまの側だけでも大丈夫です。</p>
      <dl class="consult-modal__info">
        <div><dt>現在の待ち時間</dt><dd>約2分（デモ表示）</dd></div>
        <div><dt>受付時間</dt><dd>${SITE.support.hours}</dd></div>
      </dl>
      <button class="btn btn--primary btn--block" type="button" disabled>接続する（デモでは接続しません）</button>
      <p class="note">デモのため、この画面からは接続しません。</p>
    </div>`, { label: 'ビデオで相談する' });
}

export function render({ params }) {
  const product = productById(params.id);
  // 下書きは購入者画面に出さない（URLを知っていても見つからない扱い）
  if (!product || product.saleStatus === 'draft') {
    return {
      title: '商品が見つかりません',
      view: html`<div class="container">${EmptyState({ title: '商品が見つかりませんでした', text: '掲載が終了したか、URLが変わった可能性があります。', action: { href: '#/products', label: '商品一覧へ' } })}</div>`,
    };
  }
  const brand = brandById(product.brandId);
  const category = categoryById(product.categoryId);
  const comparison = comparisonFor(product);
  return {
    title: `${brand.name} ${product.model} ${product.name}`,
    bodyClass: 'has-sticky-cta',
    view: html`
      ${Breadcrumb([{ label: category.name, href: `#/products?cat=${category.id}` }, { label: product.model }])}
      <article class="detail container">
        ${Gallery(product)}
        <div class="detail__info">
          ${StatusBadges(product)}
          <p class="detail__brand"><a class="en" href="#/products?brand=${brand.id}">${brand.name}</a><span>${brand.tagline}</span></p>
          <h1 class="detail__name">${product.name}</h1>
          <p class="detail__model">型番 <span class="en">${product.model}</span></p>
          <ol class="detail__highlights">
            ${product.highlights.map((point, index) => html`<li><span class="num">0${index + 1}</span>${point}</li>`)}
          </ol>
          ${KeyDates(product)}
          ${BuyBox(product)}
        </div>
      </article>
      <div class="container detail-sections">
        ${PriceReason(product)}
        ${comparison ? ComparisonTeaser(product, comparison) : ''}
        ${ProductSupport(product)}
        ${Specs(product)}
        ${Related(product)}
      </div>
      ${StickyCta(product)}
    `,
    mount(root, { isRefresh }) {
      let qty = 1;
      const max = maxOrderQty(product);
      const pricing = getPricing(product);
      if (!isRefresh) track('view_item', { currency: 'JPY', value: pricing.final, items: [toItem(product, { price: pricing.final })] });

      const syncQty = () => {
        const box = root.querySelector('[data-detail-qty]');
        if (!box) return;
        box.querySelector('[data-qty-value]').textContent = qty;
        box.querySelector('[data-step="-1"]').disabled = qty <= 1;
        box.querySelector('[data-step="1"]').disabled = qty >= max;
      };

      root.addEventListener('click', (event) => {
        const step = event.target.closest('[data-step]');
        if (step) {
          qty = Math.min(max, Math.max(1, qty + Number(step.dataset.step)));
          syncQty();
          return;
        }
        // ハッシュはルーターが使うので、ページ内の移動はスクロールで行う
        if (event.target.closest('[data-scroll-reason]')) {
          root.querySelector('#reason-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
        const view = event.target.closest('[data-gallery-view]');
        if (view) {
          const index = Number(view.dataset.galleryView);
          renderInto(root.querySelector('[data-gallery-main]'), ProductImage(product, { view: index, className: 'pimg--large' }));
          root.querySelectorAll('[data-gallery-view]').forEach((thumb) => {
            const active = thumb === view;
            thumb.classList.toggle('is-active', active);
            thumb.setAttribute('aria-selected', String(active));
          });
          return;
        }
        if (event.target.closest('[data-add-to-cart]')) {
          const added = addToCart(product.id, qty);
          if (!added) {
            showToast(`購入できる上限（${max}${unitOf(product)}）までカートに入っています`, { action: { href: '#/cart', label: 'カートを見る' } });
            return;
          }
          track('add_to_cart', { method: 'cart', currency: 'JPY', value: pricing.final * added, items: [toItem(product, { price: pricing.final, qty: added })] });
          showToast(`カートに入れました（${added}${unitOf(product)}）`, { action: { href: '#/cart', label: `カートを見る（${cartCount()}点）` } });
          return;
        }
        if (event.target.closest('[data-buy-now]')) {
          track('add_to_cart', { method: 'buy_now', currency: 'JPY', value: pricing.final * qty, items: [toItem(product, { price: pricing.final, qty })] });
          navigate(`/checkout?buy=${product.id}&qty=${qty}`);
          return;
        }
        if (event.target.closest('[data-consult]')) openConsult(product);
      });
    },
  };
}
