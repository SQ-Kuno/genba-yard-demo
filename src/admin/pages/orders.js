// 注文一覧（絞り込み）。行の注文番号から、注文詳細・発送管理へ
import { html } from '../../lib/html.js';
import { navigate, withQuery } from '../../lib/router.js';
import { sellerById } from '../../lib/market.js';
import { getAllOrders, ORDER_STATUSES, shippingStatus, payableAmount } from '../../lib/orders.js';
import { PageHead, Options, sellerOptions, OrderStatusChip, ShippingChip, DeadlineChip, deadlineOf, Chip, yen, shortDateTime } from '../ui.js';

const SHIPPING_FILTERS = [['unshipped', '未発送'], ['overdue', '発送期限を過ぎた注文'], ['partial', '一部発送'], ['shipped', '発送済'], ['delivered', '配送完了']];

function readFilters(query) {
  return {
    q: (query.get('q') ?? '').trim(),
    status: ORDER_STATUSES[query.get('status')] ? query.get('status') : '',
    shipping: SHIPPING_FILTERS.some(([key]) => key === query.get('shipping')) ? query.get('shipping') : '',
    seller: query.get('seller') ?? '',
    payment: query.get('payment') === 'unpaid' ? 'unpaid' : '',
  };
}

export function filterOrders(orders, filters) {
  const words = filters.q.toLowerCase().split(/\s+/).filter(Boolean);
  return orders.filter((order) => {
    const text = `${order.id} ${order.buyer.company} ${order.buyer.name} ${order.buyer.memberNo} ${order.items.map((item) => `${item.model ?? ''} ${item.name ?? ''} ${item.productId}`).join(' ')}`.toLowerCase();
    // 「未発送」は発送前の注文（キャンセル・返品などは含めない）
    const shipping = shippingStatus(order).key;
    return words.every((word) => text.includes(word))
      && (!filters.status || order.status === filters.status)
      && (!filters.shipping || ({
        unshipped: () => shipping === 'unshipped' && ['received', 'preparing'].includes(order.status),
        overdue: () => Boolean(deadlineOf(order)?.overdue),
      }[filters.shipping]?.() ?? shipping === filters.shipping))
      && (!filters.seller || order.items.some((item) => item.sellerId === filters.seller))
      && (!filters.payment || !order.paid);
  });
}

const productNames = (order) => order.items.map((item) => html`<span class="is-nowrap">${item.model}${item.cancelled ? '（取消）' : ''}</span>`);
const sellerNames = (order) => [...new Set(order.items.map((item) => sellerById(item.sellerId)?.name ?? item.sellerId))].join('、');

export function render({ query }) {
  const filters = readFilters(query);
  const all = getAllOrders();
  const orders = filterOrders(all, filters);
  return {
    title: '注文一覧',
    view: html`
      ${PageHead({ title: '注文一覧・発送', lead: '購入者の注文を確かめ、出品元へ発送を依頼し、発送の情報（配送会社・追跡番号・発送日）を登録します。' })}
      <details class="afilters" ${filters.q || filters.status || filters.shipping || filters.seller || filters.payment ? 'open' : ''} data-filters-box>
        <summary class="afilters__summary">絞り込み${filters.q || filters.status || filters.shipping || filters.seller || filters.payment ? '（条件あり）' : ''}</summary>
        <form class="atoolbar" data-filters role="search" aria-label="注文の絞り込み">
        <label class="field atoolbar__q"><span class="field__label">注文番号・会社名・会員番号・型番</span><input class="field__input" type="search" name="q" value="${filters.q}"></label>
        <label class="field"><span class="field__label">注文ステータス</span><select class="field__select" name="status"><option value="">すべて</option>${Options(Object.entries(ORDER_STATUSES).map(([key, value]) => [key, value.label]), filters.status)}</select></label>
        <label class="field"><span class="field__label">発送ステータス</span><select class="field__select" name="shipping"><option value="">すべて</option>${Options(SHIPPING_FILTERS, filters.shipping)}</select></label>
        <label class="field"><span class="field__label">出品元</span><select class="field__select" name="seller">${sellerOptions(filters.seller, { all: true })}</select></label>
        <label class="field"><span class="field__label">支払い</span><select class="field__select" name="payment"><option value="">すべて</option>${Options([['unpaid', '入金待ちのみ']], filters.payment)}</select></label>
        <div class="atoolbar__actions"><button class="btn btn--secondary btn--sm" type="submit">絞り込む</button><a class="btn btn--ghost btn--sm" href="#/orders">条件を消す</a></div>
      </form>
      </details>
      <p class="aresult" aria-live="polite">${orders.length}件 ／ 全${all.length}件</p>
      <div class="atable-wrap">
        <table class="atable atable--stack">
          <thead><tr><th>注文番号・注文日時</th><th>購入者</th><th>商品</th><th class="is-num">購入金額</th><th>出品元</th><th>注文・発送の状況</th><th>発送期限</th></tr></thead>
          <tbody>
            ${orders.length ? orders.map((order) => html`
              <tr>
                <td class="atable__main-cell is-nowrap"><div class="atable__main"><a href="#/orders/${order.id}">${order.id}</a><span class="atable__sub">${shortDateTime(order.placedAt)}</span>${order.paid ? '' : html`<span>${Chip('入金待ち', 'signal')}</span>`}</div></td>
                <td data-label="購入者"><div class="atable__main"><span>${order.buyer.company}</span><span class="atable__sub">${order.buyer.memberNo}</span></div></td>
                <td data-label="商品"><div class="atable__models">${productNames(order)}</div></td>
                <td class="is-num" data-label="購入金額">${yen(payableAmount(order))}<div class="atable__sub">${order.items.filter((item) => !item.cancelled).reduce((sum, item) => sum + item.qty, 0)}点${order.cancelledAmount ? '・一部取消' : ''}</div></td>
                <td data-label="出品元">${sellerNames(order)}</td>
                <td data-label="状況"><div class="atable__chips">${OrderStatusChip(order)}${ShippingChip(order)}</div></td>
                <td data-label="発送期限">${DeadlineChip(order) || html`<span class="is-muted">—</span>`}</td>
              </tr>`) : html`<tr><td class="atable__empty" colspan="7">条件に合う注文はありません。</td></tr>`}
          </tbody>
        </table>
      </div>`,
    mount(root) {
      const form = root.querySelector('[data-filters]');
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        navigate(withQuery('/orders', Object.fromEntries([...new FormData(form).entries()].filter(([, value]) => value))));
      });
      form.querySelectorAll('select').forEach((select) => select.addEventListener('change', () => form.requestSubmit()));
    },
  };
}
