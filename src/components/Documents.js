import { html } from '../lib/html.js';
import { yen, fullDate } from '../lib/format.js';
import { includedTax } from '../lib/pricing.js';
import { productById } from '../lib/catalog.js';
import { payableAmount } from '../lib/orders.js';
import { brandById } from '../data/brands.js';
import { paymentById } from '../data/members.js';
import { SITE } from '../config/site.js';
import { openModal } from './Modal.js';
import { Icon } from './Icon.js';

function openDocument(content, label) {
  const { panel } = openModal(content, { label, className: 'modal--doc' });
  panel.querySelector('[data-print]').addEventListener('click', () => window.print());
}

// 品名。注文はご注文時点の記録（item.maker・model・name）で出し、後から商品の情報が直っても帳票は変わらない。
// 記録のない見積だけ、いまの商品から作る
const itemName = (item) => {
  const product = productById(item.productId);
  const maker = item.maker ?? (product ? brandById(product.brandId).name : '');
  return [maker, item.model ?? product?.model ?? item.productId, item.name ?? product?.name ?? ''].filter(Boolean).join(' ');
};

// 適格請求書の記載事項: 発行者と登録番号／取引年月日／取引内容／税率ごとの合計と税率／消費税額／宛名
function DocumentBody({ kind, number, date, account, rows, total, extra = '' }) {
  return html`
    <article class="doc">
      <header class="doc__head">
        <p class="doc__kind">${kind}</p>
        <dl class="doc__meta">
          <div><dt>番号</dt><dd class="num">${number}</dd></div>
          <div><dt>発行日</dt><dd>${fullDate(date)}</dd></div>
        </dl>
      </header>
      <p class="doc__to"><strong>${account.corporate.receiptName}</strong> 御中</p>
      <p class="doc__total">合計金額（税込）<strong class="num">${yen(total)}</strong></p>
      <table class="doc__table">
        <thead><tr><th scope="col">品名</th><th scope="col">数量</th><th scope="col">単価（税込）</th><th scope="col">金額（税込）</th></tr></thead>
        <tbody>
          ${rows.map((row) => html`<tr><td>${row.name}</td><td class="num">${row.qty}</td><td class="num">${yen(row.price)}</td><td class="num">${yen(row.price * row.qty)}</td></tr>`)}
        </tbody>
      </table>
      <dl class="doc__tax">
        <div><dt>10%対象（税込）</dt><dd class="num">${yen(total)}</dd></div>
        <div><dt>うち消費税（10%）</dt><dd class="num">${yen(includedTax(total))}</dd></div>
      </dl>
      ${extra}
      <footer class="doc__issuer">
        <p>${SITE.operator}</p>
        <p>登録番号 ${SITE.invoiceRegistrationNo}</p>
        <p class="doc__demo">※デモ環境で作成した見本です。実際の取引には使えません。</p>
      </footer>
    </article>`;
}

const PrintActions = () => html`
  <div class="doc-actions">
    <button class="btn btn--secondary" type="button" data-print>${Icon('doc')}印刷・PDFで保存</button>
  </div>`;

// 帳票の行。items を渡さなければ、出品元の分をキャンセルした行を除いた、いまの行（領収書・納品書）
const orderRows = (order, items = order.items.filter((item) => !item.cancelled)) => [
  ...items.map((item) => ({ name: itemName(item), qty: item.qty, price: item.price })),
  ...(order.shipping ? [{ name: '送料', qty: 1, price: order.shipping }] : []),
];

export function openReceipt(order, account, kind = '領収書') {
  openDocument(html`
    ${DocumentBody({
      kind: `${kind}（適格請求書）`,
      number: order.id,
      date: new Date(order.placedAt),
      account,
      rows: orderRows(order),
      total: payableAmount(order),
      extra: html`<p class="doc__note">取引年月日：${fullDate(new Date(order.placedAt))}　お支払い方法：${paymentById(order.paymentId).label}　${kind === '領収書' ? '上記正に受領いたしました。' : '代金は月末締めの請求書でご請求します。'}</p>`,
    })}
    ${PrintActions()}`, kind);
}

export function openQuote(quote, account) {
  openDocument(html`
    ${DocumentBody({
      kind: '御見積書',
      number: quote.id,
      date: new Date(quote.createdAt),
      account,
      rows: quote.items.map((item) => ({ name: itemName({ productId: item.productId }), qty: item.qty, price: item.price })),
      total: quote.total,
      extra: html`<p class="doc__note">件名：${quote.title}　有効期限：${fullDate(new Date(quote.validUntil))}　送料：${yen(SITE.shipping.fee)}（${yen(SITE.shipping.freeThreshold)}以上のご注文は無料）。在庫は取り置いていません（見積時点のものです）。ご注文時にSALE中の商品は、見積単価とその日の価格の安い方でご購入いただけます。</p>`,
    })}
    ${PrintActions()}`, '見積書');
}

export function openInvoice(entry, account) {
  // 締めた月の請求書は、締めた時点の行のまま（締めた後のキャンセル・返品は、閉じた月の請求で差し引く）
  const rows = [
    ...entry.orders.flatMap(({ order, items }) => orderRows(order, items).map((row) => ({ ...row, name: `${order.id}　${row.name}` }))),
    ...entry.deductions.map(({ order, amount, label }) => ({ name: `${order.id}　${label}`, qty: 1, price: -amount })),
  ];
  openDocument(html`
    ${DocumentBody({
      kind: '請求書（適格請求書）',
      number: `INV-${entry.month.replace('-', '')}`,
      date: new Date(entry.year, entry.monthNumber, 0),
      account,
      rows,
      total: entry.total,
      extra: html`<p class="doc__note">対象期間：${entry.year}年${entry.monthNumber}月1日〜末日　お支払い期限：${fullDate(entry.due)}　お振込先は請求書送付メールに記載しています。</p>`,
    })}
    ${PrintActions()}`, '請求書');
}
