import { html, render as renderInto } from '../lib/html.js';
import { yen, yearMonth } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { productById } from '../lib/catalog.js';
import { getPricing, priceLabel } from '../lib/pricing.js';
import { addToCart, stockOf, cartCount, maxOrderQty } from '../lib/store.js';
import { isPriceHidden } from '../lib/status.js';
import { track, toItem } from '../lib/analytics.js';
import { brandById } from '../data/brands.js';
import { comparisonFor, ComparisonTable, ChangeLists, UseCaseVerdict } from '../components/ProductComparison.js';
import { ProductImage } from '../components/ProductImage.js';
import { ModelArt } from '../components/ProductArt.js';
import { Breadcrumb, EmptyState } from '../components/Common.js';
import { SectionHeader } from '../components/Section.js';
import { showToast } from '../components/Toast.js';
import { Icon } from '../components/Icon.js';
import { unitOf } from '../components/StockMeter.js';
import { SITE } from '../config/site.js';

function ModelHeads(product, comparison) {
  const brand = brandById(product.brandId);
  const pricing = getPricing(product);
  const hidden = isPriceHidden(product);
  return html`
    <div class="compare-heads">
      <div class="compare-head compare-head--old">
        <p class="compare-head__role"><span class="tag tag--navy">旧モデル・このマーケットで購入できます</span></p>
        ${ProductImage(product, { className: 'pimg--compare' })}
        <p class="compare-head__brand en">${brand.name}</p>
        <p class="compare-head__model en">${product.model}</p>
        <p class="compare-head__date">${yearMonth(product.releaseDate)} 発売</p>
        <p class="compare-head__price"><span class="num">${hidden ? 'SECRET PRICE' : yen(pricing.final)}</span><small>${priceLabel(pricing)}（税込）</small></p>
        ${stockOf(product) > 0 && !hidden ? html`
          <div class="compare-head__actions">
            <button class="btn btn--primary btn--sm" type="button" data-buy-now>今すぐ購入</button>
            <button class="btn btn--secondary btn--sm" type="button" data-add-to-cart>カートに入れる</button>
          </div>` : ''}
      </div>
      <div class="compare-head">
        <p class="compare-head__role"><span class="tag tag--outline">現行モデル・参考（取り扱いなし）</span></p>
        <figure class="pimg pimg--compare"><div class="pimg__placeholder">${ModelArt(comparison.current)}</div></figure>
        <p class="compare-head__brand en">${brand.name}</p>
        <p class="compare-head__model en">${comparison.current.model}</p>
        <p class="compare-head__date">${yearMonth(comparison.current.releaseDate)} 発売</p>
        <p class="compare-head__note">このマーケットでは取り扱っていません。価格・在庫はお近くの販売店でご確認ください。</p>
      </div>
    </div>`;
}

export function render({ params, query }) {
  const product = productById(params.id);
  const comparison = product && comparisonFor(product);
  if (!comparison) {
    return {
      title: '比較できません',
      view: html`<div class="container">${EmptyState({ title: 'この商品には比較データがありません', text: '商品詳細ページで、サポート状況と特別価格の理由をご確認ください。', action: { href: product ? `#/product/${product.id}` : '#/products', label: '商品ページへ戻る' } })}</div>`,
    };
  }
  const brand = brandById(product.brandId);
  const selected = query.get('use') ?? comparison.useCases[0].id;
  const soldOut = stockOf(product) === 0;
  const hidden = isPriceHidden(product);
  return {
    title: `${product.model} と ${comparison.current.model} の比較`,
    bodyClass: 'has-sticky-cta',
    view: html`
      ${Breadcrumb([{ label: product.model, href: `#/product/${product.id}` }, { label: '現行モデルとの比較' }])}
      <header class="page-title container">
        <p class="eyebrow">OLD vs NEW</p>
        <h1 class="page-title__title">${brand.name} ${product.model} と ${comparison.current.model} を比べる</h1>
        <p class="page-title__lead">「自分の仕事なら旧モデルで十分か」を、使い方から判断できるようにまとめました。</p>
      </header>
      <div class="container compare">
        ${ModelHeads(product, comparison)}
        <section class="detail-section" aria-labelledby="verdict-title">
          ${SectionHeader({ id: 'verdict-title', eyebrow: 'YOUR USE', title: '使い方で選ぶ' })}
          <div data-verdict-root>${UseCaseVerdict(product, comparison, selected)}</div>
        </section>
        <section class="detail-section" aria-labelledby="changes-title">
          ${SectionHeader({ id: 'changes-title', eyebrow: 'WHAT CHANGED', title: '変わった点・変わらない点' })}
          ${ChangeLists(comparison)}
        </section>
        <section class="detail-section" aria-labelledby="table-title">
          ${SectionHeader({ id: 'table-title', eyebrow: 'SPEC BY SPEC', title: '項目ごとの比較', lead: '発売年・主要性能・重量・サイズ・バッテリー互換・修理・部品・サポート・価格を並べています。' })}
          ${ComparisonTable(product, comparison)}
          <p class="note compare__note">${SITE.pricing.showSuccessorMsrp
            ? '価格は、旧モデルが当マーケットの会員価格、現行モデルがメーカー希望小売価格（参考）です。両者は別の商品のため、割引率としては表示していません。'
            : '価格は、旧モデルの当マーケットの会員価格だけを載せています。現行モデルはこのマーケットでは取り扱っていないため、価格を並べていません。'}</p>
        </section>
      </div>
      ${soldOut ? '' : html`
        <div class="sticky-cta sticky-cta--always" aria-label="購入">
          <div class="sticky-cta__price">
            <span class="sticky-cta__label">${product.model}</span>
            <span class="sticky-cta__value num">${hidden ? '—' : yen(getPricing(product).final)}</span>
          </div>
          <button class="btn btn--secondary" type="button" data-add-to-cart ${hidden ? 'disabled' : ''} aria-label="カートに入れる">${Icon('cart')}<span class="sticky-cta__cart-label">カート</span></button>
          <button class="btn btn--primary" type="button" data-buy-now ${hidden ? 'disabled' : ''}>旧モデルを今すぐ購入</button>
        </div>`}
    `,
    mount(root, { isRefresh }) {
      const pricing = getPricing(product);
      if (!isRefresh) track('view_comparison', { item_id: product.id, current_model: comparison.current.model });
      root.addEventListener('change', (event) => {
        if (!event.target.matches('[data-use-case]')) return;
        renderInto(root.querySelector('[data-verdict-root]'), UseCaseVerdict(product, comparison, event.target.value));
        root.querySelector(`[data-use-case][value="${event.target.value}"]`)?.focus();
        track('select_use_case', { item_id: product.id, use_case: event.target.value });
      });
      root.addEventListener('click', (event) => {
        if (event.target.closest('[data-add-to-cart]')) {
          if (!addToCart(product.id, 1)) {
            showToast(`購入できる上限（${maxOrderQty(product)}${unitOf(product)}）までカートに入っています`, { action: { href: '#/cart', label: 'カートを見る' } });
            return;
          }
          track('add_to_cart', { method: 'cart', source: 'comparison', currency: 'JPY', value: pricing.final, items: [toItem(product, { price: pricing.final })] });
          showToast(`${product.model} をカートに入れました`, { action: { href: '#/cart', label: `カートを見る（${cartCount()}点）` } });
        }
        if (event.target.closest('[data-buy-now]')) {
          track('add_to_cart', { method: 'buy_now', source: 'comparison', currency: 'JPY', value: pricing.final, items: [toItem(product, { price: pricing.final })] });
          navigate(`/checkout?buy=${product.id}&qty=1`);
        }
      });
    },
  };
}
