import { html } from '../lib/html.js';
import { yen, dateTime } from '../lib/format.js';
import { deliveryText } from '../lib/delivery.js';
import { findOrder, documentLabel, receiptAvailable } from '../lib/orders.js';
import { productById } from '../lib/catalog.js';
import { paymentById } from '../data/members.js';
import { SITE } from '../config/site.js';
import { ProductImage } from '../components/ProductImage.js';
import { Steps, EmptyState } from '../components/Common.js';
import { openReceipt } from '../components/Documents.js';
import { Icon } from '../components/Icon.js';

const NEXT_STEPS = {
  invoice: '月末締めで請求書をお送りします。お支払いは翌月末までです。請求書はマイページからも確認できます。',
  card: 'カードでのお支払いが完了しました（デモのため決済代行の画面は省略しています）。領収書はマイページからいつでも発行できます。',
  paypay: 'PayPay アプリに支払いのお知らせが届きます。30分以内にお支払いください（デモでは届きません）。',
  bank: '下記の口座に、3営業日以内にお振り込みください。入金を確認してから出荷し、領収書もその後に発行できます。',
};

export function render({ params, account }) {
  const order = findOrder(account, params.orderId);
  if (!order) {
    return {
      title: 'ご注文が見つかりません',
      view: html`<div class="container narrow">${EmptyState({ title: 'ご注文が見つかりませんでした', text: '購入履歴からご確認ください。', action: { href: '#/mypage?tab=orders', label: '購入履歴を見る' } })}</div>`,
    };
  }
  const payment = paymentById(order.paymentId);
  return {
    title: 'ご注文ありがとうございました',
    view: html`
      <div class="container narrow complete">
        ${Steps(2, [{ buy_now: '商品', quote: '見積' }[order.via] ?? 'カート', 'ご注文内容の確認', '完了'])}
        <div class="complete__head">
          <span class="complete__icon">${Icon('check')}</span>
          <p class="eyebrow">ORDER COMPLETED</p>
          <h1 class="complete__title">ご注文ありがとうございました。</h1>
          <p class="complete__lead">注文番号 <strong class="num">${order.id}</strong>（${dateTime(new Date(order.placedAt))}）</p>
        </div>
        <dl class="complete__facts">
          <div><dt>お届け予定</dt><dd><strong>${deliveryText(new Date(order.placedAt), { postal: order.address.postal, paymentId: order.paymentId, lead: order.lead ?? null })}</strong><small>目安</small></dd></div>
          <div><dt>お届け先</dt><dd>${order.address.label}<small>${order.address.address}</small></dd></div>
          <div><dt>お支払い</dt><dd>${payment.label}<small>${yen(order.total)}（税込）</small></dd></div>
        </dl>
        <p class="complete__next">${Icon('info')}${NEXT_STEPS[order.paymentId]}</p>
        ${order.paymentId === 'bank' ? html`
          <dl class="bank">
            <div><dt>振込先</dt><dd>${SITE.bankAccount.bank} ${SITE.bankAccount.type} ${SITE.bankAccount.number}（デモ口座）</dd></div>
            <div><dt>口座名義</dt><dd>${SITE.bankAccount.holder}</dd></div>
            <div><dt>振込金額</dt><dd class="num">${yen(order.total)}</dd></div>
          </dl>` : ''}
        <ul class="complete__items">
          ${order.items.map((item) => {
            const product = productById(item.productId);
            // 品名はご注文時点の記録で出す（後から商品の情報が直っても、注文の内容は変わらない）
            return html`
              <li>
                ${product ? ProductImage(product, { className: 'pimg--thumb' }) : html`<span class="pimg pimg--thumb" aria-hidden="true"></span>`}
                <div><p class="en">${item.maker} ${item.model}</p><p>${item.name}</p></div>
                <p class="num">${item.qty} × ${yen(item.price)}</p>
              </li>`;
          })}
        </ul>
        <div class="complete__actions">
          <a class="btn btn--primary btn--lg" href="#/mypage?tab=orders">注文状況・購入履歴を見る</a>
          ${order.paymentId === 'invoice' || receiptAvailable(order) ? html`<button class="btn btn--secondary btn--lg" type="button" data-receipt>${Icon('receipt')}${documentLabel(order)}を表示</button>` : ''}
          <a class="btn btn--ghost btn--lg" href="#/">買い物を続ける</a>
        </div>
        <p class="note">ご注文確認メールを ${account.loginId} に送信しました（デモでは送信されません）。</p>
      </div>
    `,
    mount(root) {
      root.querySelector('[data-receipt]')?.addEventListener('click', () => {
        openReceipt(order, account, documentLabel(order));
      });
    },
  };
}
