import { html, render as renderInto } from '../lib/html.js';
import { yen } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { productById } from '../lib/catalog.js';
import { summarize, getPricing, unitPriceOf } from '../lib/pricing.js';
import { estimateDelivery, deliveryText, leadOf } from '../lib/delivery.js';
import { getAllOrders, getQuotes, isQuoteOrderable, newNumber } from '../lib/orders.js';
import { saleState } from '../lib/market.js';
import { isPriceHidden } from '../lib/status.js';
import {
  getAddresses, addAddress, getCart, getCheckoutDefaults, hasExpressCheckout, maxOrderQty, placeOrder, setCartQty, stockOf, reveal, syncCartWithStock,
  OrderRejectedError, StoreSaveError,
} from '../lib/store.js';
import { brandById } from '../data/brands.js';
import { track, toItem } from '../lib/analytics.js';
import { PAYMENT_METHODS, paymentById } from '../data/members.js';
import { SITE } from '../config/site.js';
import { CartLine, OrderSummary, StockChangeNotice } from '../components/Cart.js';
import { EmptyState, Steps } from '../components/Common.js';
import { AddressForm, bindAddressForm } from '../components/AddressForm.js';
import { Icon } from '../components/Icon.js';
import { cartLines } from './cart.js';

const CONFIRM_LABEL = '注文を確定する';
const SUBMITTING_LABEL = '注文を確定しています…';

// 注文する行を決める。今すぐ購入（?buy=）・見積から（?quote=）・カート の3通り
function readLines(query, account) {
  const quoteId = query.get('quote');
  if (quoteId) {
    const quote = getQuotes(account).find((item) => item.id === quoteId);
    if (!quote || !isQuoteOrderable(quote)) return { source: 'quote', lines: [], reason: quote?.status === '注文済み' ? 'ordered' : 'unavailable' };
    const lines = quote.items.map((item) => ({ product: productById(item.productId), qty: item.qty, unitPrice: item.price }));
    // 販売停止・販売期間外・下書きになった商品を含む見積は、確定ボタンを出さない
    if (lines.some(({ product }) => !product || saleState(product) !== 'on-sale')) return { source: 'quote', lines: [], reason: 'unavailable-product' };
    // カートから作った見積は、ふだんの購入と同じく1契約の上限の範囲でだけ注文できる
    if (quote.fromCart && lines.some(({ product, qty }) => qty > maxOrderQty(product))) return { source: 'quote', lines: [], reason: 'limit' };
    const orderable = lines.filter(({ product, qty }) => stockOf(product) >= qty);
    return { source: 'quote', quote, lines: orderable.length === lines.length ? orderable : [], reason: 'unavailable' };
  }
  const buyId = query.get('buy');
  if (buyId) {
    const product = productById(buyId);
    const requested = Number(query.get('qty'));
    const qty = Number.isInteger(requested) && requested > 0 ? requested : 1;
    if (!product || stockOf(product) === 0) return { source: 'buy_now', lines: [] };
    if (saleState(product) !== 'on-sale') return { source: 'buy_now', lines: [], reason: 'unavailable-product' };
    if (maxOrderQty(product) === 0) return { source: 'buy_now', lines: [], reason: 'limit' };
    const allowed = Math.min(qty, maxOrderQty(product));
    const reason = allowed < Math.min(qty, stockOf(product)) ? 'limit' : 'stock';
    return { source: 'buy_now', lines: [{ product, qty: allowed }], changes: allowed < qty ? [{ product, from: qty, to: allowed, reason }] : [] };
  }
  const changes = syncCartWithStock().map((change) => ({ ...change, product: productById(change.productId) }));
  return { source: 'cart', lines: cartLines(), changes, reason: changes.some((change) => change.reason === 'unavailable') ? 'unavailable-cart' : undefined };
}

// 購入画面を開いた時点のカートと、いまのカート（別タブの操作を含む）が同じか
const sameAsCart = (lines) => {
  const cart = getCart();
  return cart.length === lines.length && lines.every((line) => cart.some((item) => item.productId === line.product.id && item.qty === line.qty));
};

function AddressSummary(address) {
  return html`
    <div class="address">
      <p class="address__label">${address.label}${address.fromContract ? html`<span class="chip chip--ok">契約情報から自動入力</span>` : ''}</p>
      <p>${address.recipient}</p>
      <p>〒${address.postal} ${address.address}</p>
      <p class="address__meta">TEL ${address.tel}${address.place ? html`　置き場所：${address.place}` : ''}</p>
    </div>`;
}

const selectedAddress = (state) => getAddresses().find((address) => address.id === state.addressId);
// 出品元の発送目安（注文後◯〜◯営業日）がある商品を含むときは、発送目安と届く日の目安を出す
const deliveryFor = (state, now = new Date()) => deliveryText(now, { postal: selectedAddress(state).postal, paymentId: state.paymentId, lead: leadOf(state.lines.map((line) => line.product)) });

function AddressSection(state) {
  const addresses = getAddresses();
  return html`
    <section class="panel" aria-labelledby="ship-title">
      <header class="panel__head">
        <h2 class="panel__title" id="ship-title"><span class="panel__num num">1</span>お届け先</h2>
        ${state.editingAddress ? '' : html`<button class="link-btn" type="button" data-edit="address">変更</button>`}
      </header>
      ${state.editingAddress
        ? html`
          <fieldset class="options">
            <legend class="visually-hidden">お届け先を選ぶ</legend>
            ${addresses.map((address) => html`
              <label class="option">
                <input type="radio" name="address" value="${address.id}" ${address.id === state.addressId ? 'checked' : ''}>
                <span class="option__body">${AddressSummary(address)}</span>
              </label>`)}
          </fieldset>
          ${state.addingAddress ? AddressForm() : html`<button class="btn btn--ghost btn--sm" type="button" data-add-address>${Icon('plus')}新しいお届け先（現場など）を追加</button>`}
          <button class="btn btn--secondary btn--block panel__done" type="button" data-done="address">このお届け先にする</button>`
        : AddressSummary(selectedAddress(state))}
      <p class="panel__delivery">${Icon('truck')}<span>お届け予定 <strong>${deliveryFor(state)}</strong><small>${leadOf(state.lines.map((line) => line.product))
        ? '（目安。出品元の営業日（土日を除く）で数えます。祝日・地域により前後します）'
        : `（目安。${SITE.shipping.sameDayCutoffHour}:00までのご注文は翌日お届け・北海道・沖縄は＋1日）`}</small></span></p>
    </section>`;
}

function PaymentSection(state) {
  const selected = state.paymentId ? paymentById(state.paymentId) : null;
  const showOptions = state.editingPayment || !selected;
  return html`
    <section class="panel ${state.paymentError ? 'has-error' : ''}" aria-labelledby="pay-title" data-payment-section>
      <header class="panel__head">
        <h2 class="panel__title" id="pay-title"><span class="panel__num num">2</span>お支払い方法</h2>
        ${showOptions ? '' : html`<button class="link-btn" type="button" data-edit="payment">変更</button>`}
      </header>
      ${showOptions
        ? html`
          <fieldset class="options options--payment">
            <legend class="visually-hidden">お支払い方法を選ぶ</legend>
            ${PAYMENT_METHODS.map((method) => html`
              <label class="option option--payment">
                <input type="radio" name="payment" value="${method.id}" ${method.id === state.paymentId ? 'checked' : ''}>
                <span class="option__body">
                  <span class="option__title">${method.label}</span>
                  <span class="option__detail">${method.detail}</span>
                </span>
              </label>`)}
          </fieldset>
          ${state.paymentError ? html`<p class="field__error" role="alert">お支払い方法を選んでください。</p>` : ''}`
        : html`<div class="pay-summary"><p class="pay-summary__title">${selected.label}</p><p class="pay-summary__detail">${selected.detail}</p></div>`}
      ${selected ? html`<p class="note panel__note">${Icon('info')}${selected.note}</p>` : ''}
    </section>`;
}

function ReceiptSection(account) {
  return html`
    <section class="panel" aria-labelledby="receipt-title">
      <header class="panel__head">
        <h2 class="panel__title" id="receipt-title"><span class="panel__num num">3</span>領収書・請求書</h2>
      </header>
      <p>宛名 <strong>${account.corporate.receiptName}</strong>　適格請求書（インボイス）として発行し、マイページからいつでもダウンロードできます（前払いはご入金の確認後）。</p>
    </section>`;
}

function ItemsSection(state, { source, quote }) {
  const editable = source !== 'quote';
  return html`
    <section class="panel" aria-labelledby="items-title">
      <header class="panel__head">
        <h2 class="panel__title" id="items-title"><span class="panel__num num">4</span>ご注文商品</h2>
        ${source === 'cart' ? html`<a class="link-btn" href="#/cart">カートで変更</a>` : ''}
      </header>
      ${quote ? html`<p class="note">見積 ${quote.id}（${quote.title}）の数量でご注文になります。単価は見積単価と本日の価格の安い方です。</p>` : ''}
      <ul class="lines lines--checkout">${state.lines.map((line) => CartLine(line.product, line.qty, { scope: 'checkout', editable, unitPrice: line.unitPrice ?? null }))}</ul>
    </section>`;
}

// 最終確認画面で示す条件（数量・価格・支払時期・引渡時期・キャンセル）
function Terms(state) {
  const payment = state.paymentId ? paymentById(state.paymentId) : null;
  return html`
    <div class="terms">
      <p class="terms__title">ご注文の条件</p>
      <ul>
        <li>お支払い時期：${payment ? payment.detail : 'お支払い方法により異なります'}</li>
        <li>お届け時期：${deliveryFor(state)}（在庫品・国内配送・目安）</li>
        <li>TIME SALE・期間限定の価格は、終了時刻までに確定したご注文に適用されます。</li>
        <li>ご注文確定後のキャンセルは出荷前まで承ります。お客様都合の返品は未開封・到着後${SITE.returnDays}日以内、初期不良は到着後${SITE.initialDefectDays}日以内に交換します。</li>
        <li>同一商品は1契約で今回の放出分の累計${SITE.orderLimit.default}点まで（数量限定品は${SITE.orderLimit.limited}点）。転売目的と判断したご注文はお取り消しすることがあります。</li>
      </ul>
      <a class="link-btn" href="#/guide?s=returns">返品・キャンセルの詳細</a>
    </div>`;
}

const ConfirmButton = (submitting) => html`<button class="btn btn--primary btn--lg btn--block" type="button" data-confirm ${submitting ? 'disabled' : ''}>${submitting ? SUBMITTING_LABEL : CONFIRM_LABEL}</button>`;

export function render({ query, account }) {
  const { source, quote, lines, changes = [], reason } = readLines(query, account);
  if (!lines.length) {
    return {
      title: 'ご注文手続き',
      view: html`<div class="container narrow">${EmptyState({
        icon: 'cart',
        title: 'ご注文できる商品がありません',
        text: {
          ordered: 'この見積はご注文済みです。注文状況は購入履歴でご確認いただけます。',
          unavailable: 'この見積は有効期限が切れたか、在庫が足りなくなりました。担当者にお問い合わせください。',
          limit: '1契約で購入できる上限を超えるため、ご注文できません（購入済みの数を含みます）。まとめ買いは見積でご相談ください。',
          'unavailable-cart': 'カートの商品が販売期間外になったか、販売を停止したため、ご注文いただけません。',
          'unavailable-product': source === 'quote'
            ? 'この見積には、販売期間外か販売を停止した商品が含まれるため、ご注文いただけません。担当者にお問い合わせください。'
            : 'この商品は販売期間外か、販売を停止しているため、ご注文いただけません。',
        }[reason] ?? 'カートが空か、選んだ商品が完売しました。',
        action: { href: source === 'quote' ? '#/mypage?tab=quotes' : '#/products', label: source === 'quote' ? '見積履歴へ' : '商品を探す' },
      })}</div>`,
    };
  }
  // 購入画面では価格を必ず見せる（SECRET PRICE はここで開いた扱いにする）
  lines.filter(({ product }) => isPriceHidden(product)).forEach(({ product }) => reveal(product.id));

  const express = hasExpressCheckout();
  const defaults = getCheckoutDefaults();
  const addresses = getAddresses();
  const state = {
    lines,
    addressId: addresses.some((address) => address.id === defaults.addressId) ? defaults.addressId : addresses[0].id,
    paymentId: defaults.paymentId,
    editingAddress: false,
    addingAddress: false,
    editingPayment: false,
    paymentError: false,
    notice: '',
    submitting: false,
    shown: null, // 画面に出している合計とお届け予定（確定時に変わっていないか確かめる）
  };
  // 合計が同じでも単価が入れ替わることがあるので、行ごとの単価も比べる
  const snapshot = (now = new Date()) => ({
    total: summarize(state.lines, now).total,
    units: state.lines.map((line) => unitPriceOf(line, now)).join(),
    delivery: deliveryFor(state, now),
  });
  state.shown = snapshot();
  const stepLabels = source === 'cart' ? ['カート', express ? 'ご注文内容の確認' : '購入手続き', '完了'] : [source === 'quote' ? '見積' : '商品', 'ご注文内容の確認', '完了'];

  const mainView = () => html`
    ${StockChangeNotice(changes)}
    ${state.notice ? html`<p class="form__error" role="alert">${state.notice}</p>` : ''}
    ${express ? html`<p class="express-note">${Icon('check')}前回と同じお届け先・お支払い方法を入れています。内容を確かめて確定するだけです。</p>` : ''}
    ${AddressSection(state)}
    ${PaymentSection(state)}
    ${ReceiptSection(account)}
    ${ItemsSection(state, { source, quote })}
  `;
  const sideView = () => html`${OrderSummary(summarize(state.lines), { cta: html`${ConfirmButton(state.submitting)}${Terms(state)}` })}`;

  return {
    title: express ? 'ご注文内容の確認' : '購入手続き',
    bodyClass: 'has-sticky-cta is-checkout',
    view: html`
      <div class="container">
        ${Steps(1, stepLabels)}
        <h1 class="page-heading">${express ? 'ご注文内容の確認' : '購入手続き'}</h1>
      </div>
      <div class="container checkout-layout">
        <div class="checkout-layout__main" data-checkout-main>${mainView()}</div>
        <aside class="checkout-layout__side" aria-label="ご注文金額" data-checkout-side>${sideView()}</aside>
      </div>
      <div class="sticky-cta sticky-cta--always sticky-cta--checkout">
        <div class="sticky-cta__price">
          <span class="sticky-cta__label">お支払い合計（税込）</span>
          <span class="sticky-cta__value num" data-sticky-total>${yen(state.shown.total)}</span>
        </div>
        <button class="btn btn--primary" type="button" data-confirm>${CONFIRM_LABEL}</button>
      </div>
    `,
    mount(root) {
      const main = root.querySelector('[data-checkout-main]');
      const side = root.querySelector('[data-checkout-side]');
      let confirmTimer = null;
      const update = () => {
        const fresh = snapshot();
        // 日付をまたいだ後の操作で単価が変わったら、黙って描き直さずに知らせる
        if (fresh.units !== state.shown.units && !state.notice) state.notice = '日付が変わったため、価格が更新されました。内容をご確認ください。';
        state.shown = fresh;
        renderInto(main, mainView());
        renderInto(side, sideView());
        root.querySelector('[data-sticky-total]').textContent = yen(state.shown.total);
        const sticky = root.querySelector('.sticky-cta [data-confirm]');
        sticky.disabled = state.submitting;
        sticky.textContent = state.submitting ? SUBMITTING_LABEL : CONFIRM_LABEL;
      };

      track('begin_checkout', { method: source, express, currency: 'JPY', value: state.shown.total, items: state.lines.map((line) => toItem(line.product, { price: unitPriceOf(line), qty: line.qty })) });

      root.addEventListener('change', (event) => {
        if (state.submitting) return;
        if (event.target.name === 'address') {
          state.addressId = event.target.value;
          track('add_shipping_info', { shipping_tier: 'standard', address_id: event.target.value });
          update();
          root.querySelector(`[name="address"][value="${state.addressId}"]`)?.focus();
        }
        if (event.target.name === 'payment') {
          state.paymentId = event.target.value;
          state.paymentError = false;
          state.editingPayment = true;
          track('add_payment_info', { payment_type: event.target.value });
          update();
          root.querySelector(`[name="payment"][value="${state.paymentId}"]`)?.focus();
        }
      });

      bindAddressForm(root, (address) => {
        if (state.submitting) return; // 確定処理中にお届け先をすり替えない
        state.addressId = addAddress(address);
        state.addingAddress = false;
        update();
      });

      root.addEventListener('click', (event) => {
        // 確定処理中は内容を変えさせない（二重確定・数量のすり替えを防ぐ）
        if (state.submitting) return;
        const edit = event.target.closest('[data-edit]');
        if (edit) {
          if (edit.dataset.edit === 'address') state.editingAddress = true;
          if (edit.dataset.edit === 'payment') state.editingPayment = true;
          update();
          return;
        }
        if (event.target.closest('[data-done="address"]')) {
          state.editingAddress = false;
          update();
          return;
        }
        if (event.target.closest('[data-add-address]')) {
          state.addingAddress = true;
          update();
          root.querySelector('#addr-label')?.focus();
          return;
        }
        if (event.target.closest('[data-cancel-address]')) {
          state.addingAddress = false;
          update();
          return;
        }
        const stepper = event.target.closest('[data-action="qty-inc"], [data-action="qty-dec"]');
        if (stepper) {
          const { productId } = stepper.closest('[data-qty-scope]').dataset;
          const line = state.lines.find((item) => item.product.id === productId);
          line.qty = Math.max(1, Math.min(maxOrderQty(line.product), line.qty + (stepper.dataset.action === 'qty-inc' ? 1 : -1)));
          if (source === 'cart') setCartQty(productId, line.qty);
          update();
          return;
        }
        if (event.target.closest('[data-confirm]')) submitOrder();
      });

      function stop(message) {
        state.notice = message;
        state.submitting = false;
        update();
        main.scrollIntoView({ behavior: 'smooth' });
      }

      function submitOrder() {
        if (!paymentById(state.paymentId)) {
          state.paymentError = true;
          update();
          root.querySelector('[data-payment-section]').scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        // 別のタブで同じカートを確定した・カートを変えた場合は、二重に確定しない
        if (source === 'cart' && !sameAsCart(state.lines)) {
          state.lines = cartLines();
          stop(state.lines.length
            ? '別の画面でカートの内容が変わりました。内容をご確認のうえ、もう一度「注文を確定する」を押してください。'
            : '別の画面でご注文が確定したか、カートが空になりました。購入履歴をご確認ください。');
          return;
        }
        if (quote && !getQuotes(account).some((item) => item.id === quote.id && isQuoteOrderable(item))) {
          stop('この見積はご注文済みか、有効期限が切れています。見積履歴をご確認ください。');
          return;
        }
        // 画面を開いた後に、管理画面で価格・販売状況が変わっていないか。いまの商品で確かめ直す
        state.lines = state.lines.map((line) => ({ ...line, product: productById(line.product.id) ?? { ...line.product, saleStatus: 'ended' } }));
        const closed = state.lines.find(({ product }) => saleState(product) !== 'on-sale');
        if (closed) {
          stop(`${closed.product.model} は販売期間外になったか、販売を停止したため、ご注文いただけません。`);
          return;
        }
        const short = state.lines.find(({ product, qty }) => stockOf(product) < qty);
        if (short) {
          stop(`${short.product.model} の在庫が足りなくなりました（残り${stockOf(short.product)}）。数量を変えてください。`);
          return;
        }
        // 日付や締め時刻をまたいで価格・お届け予定が変わったら、確定せずに見直してもらう
        const now = new Date();
        const fresh = snapshot(now);
        if (fresh.total !== state.shown.total || fresh.units !== state.shown.units || fresh.delivery !== state.shown.delivery) {
          stop('価格またはお届け予定が更新されました（価格の訂正・日付や締め時刻の変わり目など）。内容をご確認のうえ、もう一度「注文を確定する」を押してください。');
          return;
        }
        state.notice = '';
        state.submitting = true;
        update();
        const summary = summarize(state.lines, now);
        const address = selectedAddress(state);
        const order = {
          id: newNumber('GY', new Set(getAllOrders().map((item) => item.id)), now),
          placedAt: now.toISOString(),
          items: state.lines.map((line) => {
            const pricing = getPricing(line.product, now);
            const price = unitPriceOf(line, now);
            // 後から「どの商品が・どの価格で・どの出品元から」売れたかを分析できるよう、確定時点の値を残す
            return {
              productId: line.product.id,
              qty: line.qty,
              price,
              saleKind: line.unitPrice === price ? 'quote' : pricing.sale?.kind ?? null,
              name: line.product.name,
              model: line.product.model,
              maker: brandById(line.product.brandId)?.name ?? line.product.maker,
              sellerSku: line.product.sellerSku ?? '',
              jan: line.product.jan,
              categoryId: line.product.categoryId,
              referencePrice: line.product.referencePrice,
              referencePriceType: line.product.referencePriceType,
              sellerId: line.product.sellerId,
              merchantId: line.product.merchantId,
              fulfillerId: line.product.fulfillerId,
            };
          }),
          subtotal: summary.subtotal,
          shipping: summary.shipping,
          total: summary.total,
          paymentId: state.paymentId,
          paid: Boolean(paymentById(state.paymentId).paidOnConfirm),
          address,
          deliveryDate: estimateDelivery(now, { postal: address.postal, paymentId: state.paymentId, lead: leadOf(state.lines.map((line) => line.product)) })?.toISOString() ?? null,
          lead: leadOf(state.lines.map((line) => line.product)),
          via: source,
          limitExempt: source === 'quote' && !quote.fromCart, // 担当者が回答した見積（まとめ買い）だけ上限の対象外
          quoteId: quote?.id ?? null,
          express,
        };
        // 決済処理の代わりに少し待ってから確定する（モック）。画面を離れたら取り消す
        confirmTimer = setTimeout(() => {
          // 待っている間に別のタブで確定・変更されていたら、ここでも止める（二重確定を防ぐ）
          if (source === 'cart' && !sameAsCart(state.lines)) {
            state.lines = cartLines();
            stop('別の画面でご注文が確定したか、カートの内容が変わりました。購入履歴とカートをご確認ください。');
            return;
          }
          if (quote && !getQuotes(account).some((item) => item.id === quote.id && isQuoteOrderable(item))) {
            stop('この見積はご注文済みか、有効期限が切れています。見積履歴をご確認ください。');
            return;
          }
          try {
            // 確定の直前に、各行の単価がいまの価格と同じかも確かめる（見積は見積単価とその日の価格の安い方）
            const priceOf = (item) => {
              const line = state.lines.find((entry) => entry.product.id === item.productId);
              const product = productById(item.productId);
              return product && line ? unitPriceOf({ ...line, product }, now) : null;
            };
            placeOrder(order, { clearCart: source === 'cart' || Boolean(quote?.fromCart), priceOf });
          } catch (error) {
            console.warn('[checkout] 注文を確定できませんでした。', error);
            const messages = {
              closed: '販売期間外になったか、販売を停止した商品があるため、ご注文を確定できませんでした。',
              short: '在庫が足りなくなったため、ご注文を確定できませんでした。数量をご確認ください。',
              limit: '1契約で購入できる上限を超えるため、ご注文を確定できませんでした（別の画面でのご注文を含みます）。',
              price: '価格が更新されたため、ご注文を確定できませんでした。内容をご確認のうえ、もう一度「注文を確定する」を押してください。',
            };
            if (error instanceof StoreSaveError) stop('ブラウザの保存容量が足りないため、ご注文を確定できませんでした（ご注文は受け付けていません）。');
            else stop(error instanceof OrderRejectedError ? messages[error.kind] ?? 'ご注文を確定できませんでした。内容をご確認ください。' : 'ご注文を確定できませんでした。時間をおいてもう一度お試しください。');
            return;
          }
          track('purchase', {
            transaction_id: order.id,
            currency: 'JPY',
            value: order.total,
            shipping: order.shipping,
            payment_type: order.paymentId,
            method: order.via,
            express,
            items: order.items.map((item) => toItem(productById(item.productId), { price: item.price, qty: item.qty })),
          });
          navigate(`/complete/${order.id}`, { replace: true });
        }, 700);
      }

      return () => clearTimeout(confirmTimer);
    },
  };
}
