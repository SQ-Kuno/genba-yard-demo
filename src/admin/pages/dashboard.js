// ダッシュボード：マーケットの状況と、運営者が次に対応すべきこと
import { html } from '../../lib/html.js';
import { PRODUCTS, saleState, getSettings, sellerById } from '../../lib/market.js';
import { stockOf } from '../../lib/store.js';
import { getAllOrders, countsAsSale, payableAmount } from '../../lib/orders.js';
import { PERIODS, periodOf, inPeriod, summarizeSales } from '../../lib/sales.js';
import { PageHead, Chip, OrderStatusChip, ShippingChip, SituationChip, DeadlineChip, deadlineOf, isLowStock, todoCounts, yen, shortDateTime, shortDate } from '../ui.js';

const DAY = 86400000;

function PeriodSwitch(period) {
  return html`
    <nav class="aseg" aria-label="集計の期間">
      ${Object.entries(PERIODS).map(([key, value]) => html`<a href="#/?period=${key}" class="${key === period ? 'is-active' : ''}">${value.label}</a>`)}
    </nav>`;
}

const Metric = ({ label, value, unit = '', sub = '', href = '', alert = false }) => html`
  <div class="metric ${alert ? 'metric--alert' : ''}">
    <span class="metric__label">${label}</span>
    <span class="metric__value">${href ? html`<a href="${href}">${value}</a>` : value}${unit ? html`<small>${unit}</small>` : ''}</span>
    ${sub ? html`<span class="metric__sub">${sub}</span>` : ''}
  </div>`;

const itemsLabel = (order) => {
  const first = order.items[0];
  return `${first.model ?? first.productId}${order.items.length > 1 ? ` ほか${order.items.length - 1}点` : ''}`;
};

export function render({ query }) {
  const period = periodOf(query.get('period'));
  const now = new Date();
  const orders = getAllOrders(now);
  const inRange = orders.filter((order) => inPeriod(order, period, now));
  const sales = summarizeSales(inRange);
  const settings = getSettings();
  const todo = todoCounts(orders);

  const onSale = PRODUCTS.filter((product) => saleState(product, now) === 'on-sale');
  const soldOut = onSale.filter((product) => stockOf(product) === 0);
  const unshipped = orders.filter((order) => ['received', 'preparing'].includes(order.status));
  const shipped = inRange.filter((order) => ['shipped', 'delivered', 'completed'].includes(order.status));
  const lowStock = onSale.filter(isLowStock).sort((a, b) => stockOf(a) - stockOf(b));
  const endingSoon = PRODUCTS
    .filter((product) => product.saleEnd && ['on-sale', 'scheduled'].includes(saleState(product, now)))
    .filter((product) => new Date(product.saleEnd) - now <= settings.endingSoonDays * DAY)
    .sort((a, b) => new Date(a.saleEnd) - new Date(b.saleEnd));
  const daysLeft = (product) => Math.max(0, Math.ceil((new Date(product.saleEnd) - now) / DAY));
  // 対応待ちは、発送期限の近い順（期限を過ぎたものが先頭）。入金待ちは期限がないので後ろ
  const actionable = [...unshipped]
    .sort((a, b) => (deadlineOf(a, now)?.date ?? Infinity) - (deadlineOf(b, now)?.date ?? Infinity) || new Date(a.placedAt) - new Date(b.placedAt))
    .slice(0, 8);
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return {
    title: 'ダッシュボード',
    view: html`
      ${PageHead({ title: 'ダッシュボード', lead: `今日の対応と、マーケットの状況（${time} 時点の集計）。期間を切り替えると、注文・売上の数字が変わります。`, actions: PeriodSwitch(period) })}

      <section class="asection" aria-labelledby="metrics-title">
        <div class="asection__head"><h2 class="asection__title" id="metrics-title">マーケットの状況</h2><span class="asection__note">商品の数・未発送の注文は現在の値、注文数・発送済・売上・販売点数は${PERIODS[period].label}（キャンセル・返金を除く）</span></div>
        <div class="metrics">
          ${Metric({ label: '登録商品数', value: PRODUCTS.length, unit: '点', sub: `下書き ${PRODUCTS.filter((product) => product.saleStatus === 'draft').length}点を含む`, href: '#/products' })}
          ${Metric({ label: '販売中の商品', value: onSale.length - soldOut.length, unit: '点', sub: '販売期間内・在庫あり', href: '#/products?situation=on-sale' })}
          ${Metric({ label: '在庫切れの商品', value: soldOut.length, unit: '点', sub: '購入者画面は SOLD OUT', href: '#/products?situation=soldout', alert: soldOut.length > 0 })}
          ${Metric({ label: '注文数', value: sales.orders, unit: '件', sub: sales.cancelled ? `ほかにキャンセル・返金 ${sales.cancelled}件` : '', href: '#/orders' })}
          ${Metric({ label: '未発送の注文', value: unshipped.length, unit: '件', sub: `入金待ち ${todo.awaitingPayment}件・期限超過 ${todo.overdue}件`, href: '#/orders?shipping=unshipped', alert: unshipped.length > 0 })}
          ${Metric({ label: '発送済の注文', value: shipped.length, unit: '件', sub: '発送済・配送完了・完了' })}
          ${Metric({ label: '売上金額', value: yen(sales.revenue), sub: '商品代金（税込・送料を除く）', href: `#/analytics?period=${period}` })}
          ${Metric({ label: '販売点数', value: sales.units, unit: '点', href: `#/analytics?period=${period}` })}
        </div>
      </section>

      <section class="asection" aria-labelledby="todo-title">
        <div class="asection__head">
          <h2 class="asection__title" id="todo-title">発送・入金の対応待ち（${unshipped.length}件）</h2>
          <a class="link-btn" href="#/orders?shipping=unshipped">すべて見る</a>
        </div>
        <div class="atable-wrap">
          <table class="atable atable--stack">
            <thead><tr><th>注文番号・注文日時</th><th>購入者</th><th>商品</th><th>出品元（発送元）</th><th class="is-num">金額</th><th>次の対応</th><th>発送期限</th></tr></thead>
            <tbody>
              ${actionable.length ? actionable.map((order) => html`
                <tr>
                  <td class="atable__main-cell is-nowrap"><div class="atable__main"><a href="#/orders/${order.id}">${order.id}</a><span class="atable__sub">${shortDateTime(order.placedAt)}</span></div></td>
                  <td data-label="購入者">${order.buyer.company}</td>
                  <td data-label="商品"><span class="is-nowrap">${itemsLabel(order)}</span></td>
                  <td data-label="出品元">${[...new Set(order.items.map((item) => sellerById(item.fulfillerId)?.name ?? item.fulfillerId))].join('、')}</td>
                  <td class="is-num" data-label="金額">${yen(payableAmount(order))}</td>
                  <td data-label="次の対応">${!order.paid ? Chip('入金の確認', 'signal') : order.status === 'received' ? Chip('出品元へ発送依頼', 'blue') : Chip('発送の登録', 'blue')}</td>
                  <td data-label="発送期限">${DeadlineChip(order) || html`<span class="is-muted">入金後</span>`}</td>
                </tr>`) : html`<tr><td class="atable__empty" colspan="7">対応待ちの注文はありません。</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>

      <div class="agrid-2">
        <section class="asection" aria-labelledby="low-title">
          <div class="asection__head">
            <h2 class="asection__title" id="low-title">在庫残りわずか（LOW STOCK：${settings.lowStockThreshold}以下）</h2>
            <a class="link-btn" href="#/inventory?filter=low">在庫一覧へ</a>
          </div>
          <div class="atable-wrap">
            <table class="atable">
              <thead><tr><th>商品</th><th>出品元</th><th class="is-num">販売可能</th></tr></thead>
              <tbody>
                ${lowStock.length ? lowStock.slice(0, 6).map((product) => html`
                  <tr>
                    <td><div class="atable__main"><a href="#/products/${product.id}">${product.model}</a><span class="atable__sub">${product.name}</span></div></td>
                    <td>${sellerById(product.sellerId)?.name ?? '—'}</td>
                    <td class="is-num">${Chip(`${stockOf(product)}`, 'signal')}</td>
                  </tr>`) : html`<tr><td class="atable__empty" colspan="3">在庫残りわずかの商品はありません。</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>

        <section class="asection" aria-labelledby="ending-title">
          <div class="asection__head">
            <h2 class="asection__title" id="ending-title">販売終了が近い商品（${settings.endingSoonDays}日以内）</h2>
            <a class="link-btn" href="#/products?sort=ending">商品一覧へ</a>
          </div>
          <div class="atable-wrap">
            <table class="atable">
              <thead><tr><th>商品</th><th>販売終了</th><th class="is-num">販売可能</th></tr></thead>
              <tbody>
                ${endingSoon.length ? endingSoon.slice(0, 6).map((product) => html`
                  <tr>
                    <td><div class="atable__main"><a href="#/products/${product.id}">${product.model}</a><span class="atable__sub">${product.name}</span></div></td>
                    <td class="is-nowrap">${shortDate(product.saleEnd)} ${Chip(`あと${daysLeft(product)}日`, daysLeft(product) <= 7 ? 'signal' : 'neutral')}</td>
                    <td class="is-num">${stockOf(product)}</td>
                  </tr>`) : html`<tr><td class="atable__empty" colspan="3">${settings.endingSoonDays}日以内に販売が終わる商品はありません。</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section class="asection" aria-labelledby="recent-title">
        <div class="asection__head">
          <h2 class="asection__title" id="recent-title">最近の注文</h2>
          <a class="link-btn" href="#/orders">注文一覧へ</a>
        </div>
        <div class="atable-wrap">
          <table class="atable atable--stack">
            <thead><tr><th>注文番号・注文日時</th><th>購入者</th><th>商品</th><th class="is-num">金額</th><th>注文・発送の状況</th></tr></thead>
            <tbody>
              ${orders.slice(0, 8).map((order) => html`
                <tr>
                  <td class="atable__main-cell is-nowrap"><div class="atable__main"><a href="#/orders/${order.id}">${order.id}</a><span class="atable__sub">${shortDateTime(order.placedAt)}</span></div></td>
                  <td data-label="購入者">${order.buyer.company}</td>
                  <td data-label="商品"><span class="is-nowrap">${itemsLabel(order)}</span></td>
                  <td class="is-num" data-label="金額">${countsAsSale(order) ? yen(payableAmount(order)) : html`<s>${yen(order.total)}</s>`}</td>
                  <td data-label="状況"><div class="atable__chips">${OrderStatusChip(order)}${ShippingChip(order)}</div></td>
                </tr>`)}
            </tbody>
          </table>
        </div>
      </section>

      ${soldOut.length ? html`
        <section class="asection" aria-labelledby="soldout-title">
          <div class="asection__head"><h2 class="asection__title" id="soldout-title">在庫切れで販売中のままの商品</h2><span class="asection__note">購入者画面では SOLD OUT と表示しています。追加の入荷があれば在庫を更新、なければ販売終了にします。</span></div>
          <ul class="ahistory">${soldOut.map((product) => html`<li><span>${SituationChip(product)}</span><a class="text-link" href="#/products/${product.id}">${product.model}　${product.name}</a></li>`)}</ul>
        </section>` : ''}
    `,
  };
}
