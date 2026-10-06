// 販売分析：どの商品が・どの出品元／カテゴリーで・どの層に・どの価格で売れたか。
// 注文明細は CSV で書き出して、表計算や BI で後から分析できる
import { html, attr } from '../../lib/html.js';
import { navigate, withQuery } from '../../lib/router.js';
import { PRODUCTS, productById, sellerById } from '../../lib/market.js';
import { getAllOrders } from '../../lib/orders.js';
import { getEventLog } from '../../lib/analytics.js';
import { toCsv } from '../../lib/csv.js';
import {
  PERIODS, periodOf, inPeriod, forSeller, summarizeSales, salesByProduct, salesBySeller, salesByCategory, salesByTrade, salesByRateBand, funnelByProduct,
  SALES_EXPORT_HEADER, salesExportRows, CHANGE_EXPORT_HEADER, changeExportRows,
} from '../../lib/sales.js';
import { PageHead, sellerOptions, downloadText, yen } from '../ui.js';

function RankTable({ id, title, note = '', rows, keyLabel, limit = 10, extra = null }) {
  const max = Math.max(1, ...rows.map((row) => row.units));
  return html`
    <section class="asection" aria-labelledby="${id}">
      <div class="asection__head"><h2 class="asection__title" id="${id}">${title}</h2>${note ? html`<span class="asection__note">${note}</span>` : ''}</div>
      <div class="atable-wrap">
        <table class="atable">
          <thead><tr><th>${keyLabel}</th><th class="is-num">販売点数</th><th aria-hidden="true"></th><th class="is-num">売上</th><th class="is-num">注文数</th>${extra ? html`<th class="is-num">${extra.label}</th>` : ''}</tr></thead>
          <tbody>
            ${rows.length ? rows.slice(0, limit).map((row) => html`
              <tr>
                <td>${row.label}</td>
                <td class="is-num">${row.units}</td>
                <td aria-hidden="true"><div class="abar"><span style="width:${Math.round((row.units / max) * 100)}%"></span></div></td>
                <td class="is-num">${yen(row.revenue)}</td>
                <td class="is-num">${row.orders}</td>
                ${extra ? html`<td class="is-num">${extra.value(row)}</td>` : ''}
              </tr>`) : html`<tr><td class="atable__empty" colspan="${extra ? 6 : 5}">この期間の販売はありません。</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>`;
}

export function render({ query }) {
  const period = periodOf(query.get('period'));
  const seller = sellerById(query.get('seller')) ? query.get('seller') : '';
  const now = new Date();
  // 出品元で絞ったときは、その出品元の行だけで数える（月次報告・精算の元データ）
  const orders = forSeller(getAllOrders(now).filter((order) => inPeriod(order, period, now)), seller);
  const summary = summarizeSales(orders);
  const funnel = funnelByProduct(getEventLog());
  const link = (changes) => `#${withQuery('/analytics', { period, seller, ...changes })}`;
  return {
    title: '販売分析',
    view: html`
      ${PageHead({
        title: '販売分析',
        lead: '売上は商品代金（税込・送料を除く）。キャンセル・返金済みの注文と、キャンセルした発送元の分は含めません。',
        actions: html`
          <nav class="aseg" aria-label="集計の期間">${Object.entries(PERIODS).map(([key, value]) => html`<a href="${link({ period: key })}" class="${key === period ? 'is-active' : ''}" ${attr('aria-current', key === period && 'true')}>${value.label}</a>`)}</nav>
          <label class="field aseller"><span class="visually-hidden">出品元で絞る</span><select class="field__select" data-seller>${sellerOptions(seller, { all: true })}</select></label>`,
      })}
      <div class="ahead__actions aexport">
        <button class="btn btn--secondary btn--sm" type="button" data-export>注文明細をCSVで書き出す（${PERIODS[period].label}${seller ? `・${sellerById(seller).name}` : ''}）</button>
        <button class="btn btn--ghost btn--sm" type="button" data-export-changes>商品の変更履歴をCSVで書き出す</button>
      </div>
      <div class="metrics">
        <div class="metric"><span class="metric__label">売上</span><span class="metric__value">${yen(summary.revenue)}</span><span class="metric__sub">${seller ? '出品元の行の商品代金' : `送料 ${yen(summary.shipping)} は含めない`}</span></div>
        <div class="metric"><span class="metric__label">販売点数</span><span class="metric__value">${summary.units}<small>点</small></span></div>
        <div class="metric"><span class="metric__label">注文数</span><span class="metric__value">${summary.orders}<small>件</small></span><span class="metric__sub">1件あたり ${yen(summary.average)}</span></div>
        <div class="metric"><span class="metric__label">購入した会員</span><span class="metric__value">${summary.buyers}<small>人</small></span><span class="metric__sub">キャンセル・返金 ${summary.cancelled}件</span></div>
      </div>
      ${RankTable({ id: 'by-product', title: '商品別', keyLabel: '商品', rows: salesByProduct(orders) })}
      ${RankTable({ id: 'by-seller', title: '出品元別', note: '消化率＝売れた数 ÷（売れた数＋いまの販売可能数）', keyLabel: '出品元', rows: salesBySeller(orders, PRODUCTS), extra: { label: '消化率', value: (row) => (row.sellThrough == null ? '—' : `${row.sellThrough}%`) } })}
      <div class="agrid-2">
        ${RankTable({ id: 'by-category', title: 'カテゴリー別', keyLabel: 'カテゴリー', rows: salesByCategory(orders) })}
        ${RankTable({ id: 'by-trade', title: '会員の職種別（ユーザー層）', keyLabel: '職種', rows: salesByTrade(orders) })}
        ${RankTable({ id: 'by-rate', title: '割引率の帯別（どの価格で売れたか）', note: '比較元の価格に対する販売単価', keyLabel: '割引率', rows: salesByRateBand(orders), limit: 6 })}
      </div>
      <section class="asection" aria-labelledby="funnel-title">
        <div class="asection__head">
          <h2 class="asection__title" id="funnel-title">商品ごとの閲覧 → カート追加 → 購入（計測ログ）</h2>
          <span class="asection__note">このブラウザで記録したイベント（GA4 の推奨イベント名）から集計。購入率＝購入の回数 ÷ 詳細の閲覧。本番は全会員分を GA4・DB で集計します。期間・出品元の切り替えは対象外。</span>
        </div>
        <div class="atable-wrap">
          <table class="atable">
            <thead><tr><th>商品</th><th class="is-num">詳細の閲覧</th><th class="is-num">カート追加</th><th class="is-num">購入（回・点）</th><th class="is-num">購入率</th></tr></thead>
            <tbody>
              ${funnel.length ? funnel.slice(0, 12).map((row) => html`
                <tr>
                  <td>${productById(row.productId) ? `${productById(row.productId).model}　${productById(row.productId).name}` : row.productId}</td>
                  <td class="is-num">${row.views}</td>
                  <td class="is-num">${row.carts}</td>
                  <td class="is-num">${row.purchases}回・${row.units}点</td>
                  <td class="is-num">${row.rate === null ? '—' : `${row.rate}%`}</td>
                </tr>`) : html`<tr><td class="atable__empty" colspan="5">まだ計測ログがありません。購入者画面で商品を見たり、カートに入れたりすると記録されます。</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>`,
    mount(root) {
      const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      root.querySelector('[data-seller]').addEventListener('change', (event) => navigate(withQuery('/analytics', { period, seller: event.target.value })));
      root.querySelector('[data-export]').addEventListener('click', () => {
        downloadText(`genba-yard-sales-${period}${seller ? `-${seller}` : ''}-${stamp}.csv`, toCsv([SALES_EXPORT_HEADER, ...salesExportRows(orders)]));
      });
      root.querySelector('[data-export-changes]').addEventListener('click', () => {
        downloadText(`genba-yard-product-changes-${stamp}.csv`, toCsv([CHANGE_EXPORT_HEADER, ...changeExportRows()]));
      });
    },
  };
}
