// 管理画面で共通に使う部品（メニュー・見出し・状態の表示・入力欄・確認・ファイルの書き出し）
import { html, attr } from '../lib/html.js';
import { yen, dateTime } from '../lib/format.js';
import { saleState, PRODUCTS, SELLERS, MarketSaveError, marketLoadProblem } from '../lib/market.js';
import { stockOf, StoreSaveError } from '../lib/store.js';
import { lowStockThreshold } from '../lib/status.js';
import { ORDER_STATUSES, shippingStatus, getAllOrders, statusLabel, paymentState } from '../lib/orders.js';
import { OrderOpError } from '../lib/order-ops.js';
import { shipDeadline } from '../lib/delivery.js';
import { SELLER_STATUSES } from '../data/sellers.js';
import { ROLES } from '../data/admins.js';
import { openModal } from '../components/Modal.js';

export { yen, dateTime };

const ymd = (date) => `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
export const shortDate = (iso) => (iso ? ymd(new Date(iso)) : '—');
export const shortDateTime = (iso) => (iso ? `${ymd(new Date(iso))} ${String(new Date(iso).getHours()).padStart(2, '0')}:${String(new Date(iso).getMinutes()).padStart(2, '0')}` : '—');

export const Chip = (label, tone = 'neutral') => html`<span class="chip chip--${tone}">${label}</span>`;

// 操作の失敗を画面の文言にする。業務の判断で止めたもの（入力の誤り・状態・保存容量）はその理由を、
// それ以外（プログラムの不具合）はコンソールに記録して、保存されていない可能性を伝える
export function errorMessage(error) {
  if (error instanceof OrderOpError || error instanceof MarketSaveError || error instanceof StoreSaveError || error?.userFacing) return error.message;
  console.error('[admin] 想定外のエラー', error);
  return '想定外のエラーが起きました。操作は保存されていない可能性があります。画面を開き直してから確かめてください。';
}

// 画面で入力の誤りを伝えるエラー（errorMessage でそのまま文言を出す）
export const inputError = (message) => Object.assign(new Error(message), { userFacing: true });

// 管理画面での商品の状況（設定した販売状況＋販売期間＋在庫）
export function productSituation(product, now = new Date()) {
  const state = saleState(product, now);
  if (state === 'draft') return { key: 'draft', label: '下書き', tone: 'neutral' };
  if (state === 'suspended') return { key: 'suspended', label: '販売停止', tone: 'warn' };
  if (state === 'ended') return { key: 'ended', label: '販売終了', tone: 'neutral' };
  if (state === 'scheduled') return { key: 'scheduled', label: '販売開始前', tone: 'blue' };
  if (state === 'expired') return { key: 'expired', label: '販売期間終了', tone: 'neutral' };
  if (stockOf(product) === 0) return { key: 'soldout', label: '在庫切れ', tone: 'ng' };
  return { key: 'on-sale', label: '販売中', tone: 'ok' };
}

export const SITUATION_FILTERS = [
  ['on-sale', '販売中（購入できる）'],
  ['soldout', '在庫切れ'],
  ['scheduled', '販売開始前'],
  ['expired', '販売期間終了'],
  ['draft', '下書き'],
  ['suspended', '販売停止'],
  ['ended', '販売終了'],
];

export const SituationChip = (product) => {
  const situation = productSituation(product);
  return Chip(situation.label, situation.tone);
};

export const isLowStock = (product) => {
  const stock = stockOf(product);
  return stock > 0 && stock <= lowStockThreshold();
};

export const OrderStatusChip = (order) => Chip(statusLabel(order), ORDER_STATUSES[order.status]?.tone ?? 'neutral');

export const PaymentChip = (order) => {
  const state = paymentState(order);
  return Chip(state.label, state.tone);
};

// 発送の期限（遅れの判定）。入金済みで、発送前の注文だけ
export function deadlineOf(order, now = new Date()) {
  if (!order.paid || !['received', 'preparing'].includes(order.status)) return null;
  const date = shipDeadline(order);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return { date, overdue: date < today, today: date.getTime() === today.getTime() };
}

export const DeadlineChip = (order) => {
  const deadline = deadlineOf(order);
  if (!deadline) return '';
  const label = `${deadline.date.getMonth() + 1}/${deadline.date.getDate()}`;
  // 列が狭いタブレットでも収まるよう短く（列名が「発送期限」）
  if (deadline.overdue) return Chip(`超過 ${label}`, 'ng');
  return deadline.today ? Chip(`今日 ${label}`, 'signal') : Chip(`${label}まで`, 'neutral');
};

const SHIPPING_TONES = { unshipped: 'warn', partial: 'warn', shipped: 'ok', delivered: 'ok', none: 'neutral' };
// 発送の状況。キャンセル・返金で発送のない注文は何も出さない（「未発送」の対応待ちに見せない）
export const ShippingChip = (order) => {
  const status = shippingStatus(order);
  return status.key === 'none' ? '' : Chip(status.label, SHIPPING_TONES[status.key]);
};

export const SellerStatusChip = (seller) => Chip(SELLER_STATUSES[seller.status]?.label ?? seller.status, SELLER_STATUSES[seller.status]?.tone ?? 'neutral');

// 「対応待ち」の件数（メニューの数字・ダッシュボード）
export function todoCounts(orders = getAllOrders()) {
  const open = orders.filter((order) => ['received', 'preparing'].includes(order.status));
  return {
    awaitingPayment: open.filter((order) => !order.paid).length,
    toShip: open.filter((order) => order.paid).length,
    overdue: open.filter((order) => deadlineOf(order)?.overdue).length,
    lowStock: PRODUCTS.filter((product) => saleState(product) === 'on-sale' && isLowStock(product)).length,
  };
}

const NAV = [
  { title: '', items: [{ href: '#/', label: 'ダッシュボード', match: /^\/$/ }] },
  { title: '商品', items: [
    { href: '#/products', label: '商品一覧', match: /^\/products(\/(?!new$|import$).*)?$/ },
    { href: '#/products/new', label: '商品登録', match: /^\/products\/new$/ },
    { href: '#/products/import', label: 'CSV一括登録', match: /^\/products\/import$/ },
  ] },
  { title: '出品元', items: [
    { href: '#/sellers', label: '出品元一覧', match: /^\/sellers(\/(?!new$).*)?$/ },
    { href: '#/sellers/new', label: '出品元登録', match: /^\/sellers\/new$/ },
  ] },
  { title: '注文', items: [{ href: '#/orders', label: '注文一覧・発送', match: /^\/orders/, count: 'orders' }] },
  { title: '在庫', items: [{ href: '#/inventory', label: '在庫一覧', match: /^\/inventory/, count: 'lowStock' }] },
  { title: '分析', items: [{ href: '#/analytics', label: '販売分析', match: /^\/analytics/ }] },
  { title: '', items: [{ href: '#/settings', label: '設定', match: /^\/settings/ }] },
];

// メニューの件数（注文は発送待ちと入金待ちの合計。ダッシュボードの「対応待ち」と同じ数）
const navCount = (key, todo) => {
  if (key === 'orders') return { value: todo.toShip + todo.awaitingPayment, label: `発送待ち${todo.toShip}件・入金待ち${todo.awaitingPayment}件` };
  return { value: todo[key], label: `${todo[key]}件` };
};

function LoadProblem() {
  const problem = marketLoadProblem();
  if (!problem) return '';
  return html`<p class="form__error" role="alert">運営データ（商品の変更・注文の運用）を読み込めなかったため、初期状態で表示しています。元のデータは消さずに ${problem.backupKey ?? '（退避できませんでした）'} に退避しました。設定の「デモを最初の状態に戻す」でこの表示を消せます。</p>`;
}

export function Shell({ path, admin, content }) {
  const todo = todoCounts();
  return html`
    <div class="admin">
      <aside class="aside" aria-label="管理メニュー">
        <div class="aside__brand"><span class="aside__logo">GENBA YARD</span><span class="aside__sub">運営者向け管理画面</span></div>
        <nav class="anav">
          ${NAV.map((group) => html`
            <div class="anav__group">
              ${group.title ? html`<p class="anav__title">${group.title}</p>` : ''}
              ${group.items.map((item) => {
                const count = item.count ? navCount(item.count, todo) : null;
                return html`
                <a class="anav__link ${item.match.test(path) ? 'is-active' : ''}" href="${item.href}" ${attr('aria-current', item.match.test(path) && 'page')}>
                  <span>${item.label}</span>${count?.value ? html`<span class="anav__count" title="${count.label}" aria-label="${count.label}">${count.value}</span>` : ''}
                </a>`;
              })}
            </div>`)}
        </nav>
        <div class="aside__foot">
          <span class="aside__user">${admin.name}</span>
          <span>${ROLES[admin.role].label}</span>
          <a class="link-btn" href="../" target="_blank" rel="noopener">購入者画面を開く</a>
          <button class="link-btn" type="button" data-action="admin-logout">ログアウト</button>
        </div>
      </aside>
      <main class="amain" id="admin-main">
        <div class="amain__inner">
          <p class="ademo">デモ環境：データはこのブラウザの中だけに保存されます（購入者画面と共有）。この画面は保護されていないため、実在の取引先・個人の情報や、出品元から受け取った実データは入力しないでください。</p>
          ${LoadProblem()}
          <div class="astale" data-stale hidden role="status"><span>別の画面（購入者画面・別のタブ）でデータが更新されました。入力中の内容は残しています。</span><button class="btn btn--secondary btn--sm" type="button" data-stale-reload>最新を表示</button></div>
          ${content}
        </div>
      </main>
    </div>`;
}

export function PageHead({ title, lead = '', crumbs = [], actions = '' }) {
  return html`
    <header class="ahead">
      <div>
        ${crumbs.length ? html`<p class="ahead__crumb">${crumbs.map((crumb, index) => html`${index ? ' / ' : ''}<a href="${crumb.href}">${crumb.label}</a>`)}</p>` : ''}
        <h1 class="ahead__title">${title}</h1>
        ${lead ? html`<p class="ahead__lead">${lead}</p>` : ''}
      </div>
      ${actions ? html`<div class="ahead__actions">${actions}</div>` : ''}
    </header>`;
}

// 入力欄（ラベル・必須・ヒント・エラー・注意をそろえる）
export function Field({ id, label, required = false, hint = '', error = '', warning = '', wide = false, control }) {
  return html`
    <div class="field ${wide ? 'is-wide' : ''}">
      <label class="field__label" for="${id}">${label}${required ? html`<span class="field__req">必須</span>` : ''}</label>
      ${control}
      ${hint ? html`<p class="field__hint" id="${id}-hint">${hint}</p>` : ''}
      ${error ? html`<p class="field__error" id="${id}-error">${error}</p>` : ''}
      ${!error && warning ? html`<p class="field__warn">${warning}</p>` : ''}
    </div>`;
}

export const Options = (items, selected) => items.map(([value, label]) => html`<option value="${value}" ${String(value) === String(selected) ? 'selected' : ''}>${label}</option>`);

export const sellerOptions = (selected, { all = false, placeholder = '選んでください' } = {}) => html`
  <option value="">${all ? 'すべての出品元' : placeholder}</option>
  ${Options(SELLERS.map((seller) => [seller.id, `${seller.id}　${seller.name}${seller.status === 'active' ? '' : `（${SELLER_STATUSES[seller.status]?.label ?? seller.status}）`}`]), selected)}`;

// 確認ダイアログ（取り消せない操作の前に）。OK なら onConfirm(入力値) を呼ぶ
export function confirmDialog({ title, text, confirmLabel = '実行する', danger = false, input = null, onConfirm }) {
  const { close, panel } = openModal(html`
    <form class="aconfirm" data-confirm-form>
      <h2 class="aconfirm__title">${title}</h2>
      <p class="aconfirm__text">${text}</p>
      ${input ? html`<label class="field"><span class="field__label">${input.label}</span><textarea class="field__input" name="value" rows="3" required>${input.value ?? ''}</textarea></label>` : ''}
      <p class="form__error" data-confirm-error hidden></p>
      <div class="aconfirm__actions">
        <button class="btn btn--ghost" type="button" data-modal-close>やめる</button>
        <button class="btn ${danger ? 'btn--secondary' : 'btn--primary'}" type="submit">${confirmLabel}</button>
      </div>
    </form>`, { label: title });
  panel.querySelector('[data-confirm-form]').addEventListener('submit', (event) => {
    event.preventDefault();
    const value = new FormData(event.target).get('value') ?? '';
    try {
      onConfirm(String(value));
      close();
    } catch (error) {
      const box = panel.querySelector('[data-confirm-error]');
      box.hidden = false;
      box.textContent = errorMessage(error);
    }
  });
}

// 文字列をファイルとして保存させる（CSV の見本・分析用の書き出し）。Excel で文字化けしないよう BOM を付ける
export function downloadText(filename, text, type = 'text/csv') {
  const blob = new Blob(['\uFEFF', text], { type: `${type};charset=utf-8` }); // 先頭の BOM
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
