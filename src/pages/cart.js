import { html } from '../lib/html.js';
import { isPurchasable } from '../lib/status.js';
import { yen } from '../lib/format.js';
import { productById } from '../lib/catalog.js';
import { summarize, getPricing } from '../lib/pricing.js';
import { getCart, setCartQty, removeFromCart, hasExpressCheckout, getFavorites, syncCartWithStock, saveQuote } from '../lib/store.js';
import { track, toItem } from '../lib/analytics.js';
import { getQuotes, newNumber } from '../lib/orders.js';
import { CartLine, OrderSummary, StockChangeNotice } from '../components/Cart.js';
import { openQuote } from '../components/Documents.js';
import { ProductGrid } from '../components/ProductGrid.js';
import { SectionHeader } from '../components/Section.js';
import { Breadcrumb, EmptyState, Steps } from '../components/Common.js';
import { Icon } from '../components/Icon.js';
import { showToast } from '../components/Toast.js';
import { SITE } from '../config/site.js';

export const cartLines = () => getCart().map((line) => ({ product: productById(line.productId), qty: line.qty }));

export function render({ account }) {
  // 他の会員の購入などで在庫が減っていたら、ここで数量を合わせて知らせる
  const changes = syncCartWithStock().map((change) => ({ ...change, product: productById(change.productId) }));
  const lines = cartLines();
  if (!lines.length) {
    const favorites = getFavorites().map(productById).filter((product) => product && isPurchasable(product));
    return {
      title: 'カート',
      view: html`
        ${Breadcrumb([{ label: 'カート' }])}
        <div class="container narrow">
          ${changes.length ? html`<p class="form__error" role="alert">カートの商品が完売したため、カートから外しました。</p>` : ''}
          ${EmptyState({ icon: 'cart', title: 'カートは空です', text: 'TIME SALE や数量限定の商品は、なくなり次第終了します。', action: { href: '#/products?sale=any', label: '開催中のSALEを見る' } })}
          ${favorites.length ? html`
            <section class="shelf" aria-labelledby="cart-fav-title">
              ${SectionHeader({ id: 'cart-fav-title', eyebrow: 'FAVORITES', title: 'お気に入りの商品' })}
              ${ProductGrid(favorites, { layout: 'rail', listName: 'カート内おすすめ' })}
            </section>` : ''}
        </div>`,
    };
  }

  const summary = summarize(lines);
  const express = hasExpressCheckout();
  const cta = html`
    <a class="btn btn--primary btn--lg btn--block" href="#/checkout">${express ? 'ご注文内容の確認へ' : '購入手続きへ'}${Icon('arrow')}</a>
    <p class="summary__express">${express
      ? '登録済みのお届け先・お支払い方法で、次の画面で確定できます。'
      : 'お届け先は契約情報から入力済みです。次の画面で支払い方法を選ぶだけです。'}</p>`;

  return {
    title: 'カート',
    bodyClass: 'has-sticky-cta',
    view: html`
      ${Breadcrumb([{ label: 'カート' }])}
      <div class="container">
        ${Steps(0, ['カート', express ? 'ご注文内容の確認' : '購入手続き', '完了'])}
        <h1 class="page-heading">カート<span class="page-heading__count num">${summary.count}点</span></h1>
      </div>
      <div class="container checkout-layout">
        <div class="checkout-layout__main">
          ${StockChangeNotice(changes)}
          <ul class="lines">${lines.map(({ product, qty }) => CartLine(product, qty))}</ul>
          <button class="btn btn--ghost btn--sm cart__quote" type="button" data-cart-quote>${Icon('doc')}この内容で見積書を作成（社内の稟議用）</button>
          <p class="note cart__quote-note">見積は会員価格で作成し、${SITE.quoteValidDays}日間有効です。SALE中の商品は、ご注文時に安い方の価格でご購入いただけます。</p>
          <p class="note cart__note">${Icon('info')}数量限定・TIME SALE の商品は、ご注文の確定時点で在庫を確保します。カートに入れただけでは確保されません。</p>
          <p class="note">カートの中身は、ログアウトしたりブラウザを閉じたりしても保存されます。</p>
        </div>
        <aside class="checkout-layout__side" aria-label="ご注文金額">
          ${OrderSummary(summary, { cta })}
        </aside>
      </div>
      <div class="sticky-cta sticky-cta--always">
        <div class="sticky-cta__price">
          <span class="sticky-cta__label">合計（税込・${summary.count}点）</span>
          <span class="sticky-cta__value num">${yen(summary.total)}</span>
        </div>
        <a class="btn btn--primary" href="#/checkout">${express ? '確認へ進む' : '購入手続きへ'}</a>
      </div>
    `,
    mount(root, { refresh, isRefresh }) {
      if (!isRefresh) track('view_cart', { currency: 'JPY', value: summary.total, items: lines.map(({ product, qty }) => toItem(product, { price: getPricing(product).final, qty })) });
      root.addEventListener('click', (event) => {
        const stepper = event.target.closest('[data-action="qty-inc"], [data-action="qty-dec"]');
        if (stepper) {
          const { productId } = stepper.closest('[data-qty-scope]').dataset;
          const line = getCart().find((item) => item.productId === productId);
          setCartQty(productId, line.qty + (stepper.dataset.action === 'qty-inc' ? 1 : -1));
          refresh();
          return;
        }
        if (event.target.closest('[data-cart-quote]')) {
          // 見積単価は期限の短い SALE 価格ではなく会員価格（稟議の後に価格が変わらないように）。
          // 注文時に SALE 中なら安い方を適用する（pricing.js の unitPriceOf）
          const now = new Date();
          const validUntil = new Date(now);
          validUntil.setDate(validUntil.getDate() + SITE.quoteValidDays);
          validUntil.setHours(23, 59, 59, 0); // 見積書には日付だけ出すので、その日の終わりまで有効にする
          const items = lines.map(({ product, qty }) => ({ productId: product.id, qty, price: product.memberPrice }));
          const quote = {
            id: newNumber('Q', new Set(getQuotes(account).map((item) => item.id)), now),
            title: 'カートの商品（会員価格・送料別）',
            status: '発行済み',
            fromCart: true, // カートの内容から作った見積（購入上限の対象。注文したらカートの同じ商品を外す）
            createdAt: now.toISOString(),
            validUntil: validUntil.toISOString(),
            items,
            total: items.reduce((sum, item) => sum + item.price * item.qty, 0),
          };
          saveQuote(quote);
          openQuote(quote, account);
          showToast('見積書を作成し、マイページの見積履歴に保存しました。');
          track('generate_quote', { value: quote.total });
          return;
        }
        const remove = event.target.closest('[data-action="remove-line"]');
        if (remove) {
          const product = productById(remove.dataset.productId);
          removeFromCart(product.id);
          track('remove_from_cart', { items: [toItem(product, { price: getPricing(product).final })] });
          refresh();
        }
      });
    },
  };
}
