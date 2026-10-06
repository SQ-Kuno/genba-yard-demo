// 運営者向け管理画面の入口。購入者向けEC（../index.html）とは別のページで、管理者ログインが必須。
// 画面は src/admin/pages/ の render() が返す { title, view, mount } で組み立てる（購入者側と同じ作り）。
import { route, fallback, start, resolve, navigate } from '../lib/router.js';
import { html, render } from '../lib/html.js';
import { currentAdmin, adminLogout } from '../lib/admin-auth.js';
import { onMarketExternalChange } from '../lib/market.js';
import { onExternalChange } from '../lib/store.js';
import { resetAll } from '../lib/demo.js';
import { closeModal } from '../components/Modal.js';
import { showToast } from '../components/Toast.js';
import { Shell } from './ui.js';
import * as login from './pages/login.js';
import * as dashboard from './pages/dashboard.js';
import * as products from './pages/products.js';
import * as productForm from './pages/product-form.js';
import * as productImport from './pages/import.js';
import * as sellers from './pages/sellers.js';
import * as orders from './pages/orders.js';
import * as orderDetail from './pages/order-detail.js';
import * as inventory from './pages/inventory.js';
import * as analytics from './pages/analytics.js';
import * as settings from './pages/settings.js';

route('/', dashboard.render);
route('/products', products.render);
route('/products/new', productForm.render);
route('/products/import', productImport.render);
route('/products/:id', productForm.render);
route('/sellers', sellers.renderList);
route('/sellers/new', sellers.renderForm);
route('/sellers/:id', sellers.renderForm);
route('/orders', orders.render);
route('/orders/:id', orderDetail.render);
route('/inventory', inventory.render);
route('/analytics', analytics.render);
route('/settings', settings.render);
route('/login', login.render);
fallback(() => ({
  title: '見つかりません',
  view: html`<p class="atable__empty">この画面は見つかりませんでした。<a class="text-link" href="#/">ダッシュボードへ</a></p>`,
}));

const root = document.getElementById('admin-root');
let cleanup = null;
let lastPath = null;
let dirty = false; // 画面のフォームに保存前の入力があるか（別のタブの変更で描き直して消さないため）

// 外枠ごと描けなかったとき（保存データの想定外の値など）。設定画面に行けなくても初期化できるようにする
const Broken = (error) => html`
  <main class="alogin">
    <div class="alogin__box">
      <h1 class="alogin__title">管理画面を表示できませんでした</h1>
      <p class="form__error">${error.message}</p>
      <p class="alogin__note">このブラウザに保存しているデモのデータが壊れている可能性があります。初期状態に戻すと開けます（購入者画面の注文・カートも消えます）。</p>
      <button class="btn btn--primary btn--block" type="button" data-broken-reset>デモを最初の状態に戻す</button>
    </div>
  </main>`;

// isRefresh：同じ画面の描き直し（保存後・別タブの変更）。スクロール位置を保つ
function renderPage({ isRefresh = false } = {}) {
  const match = resolve();
  closeModal();
  cleanup?.();
  cleanup = null;
  const admin = currentAdmin();
  if (!admin && match.path !== '/login') {
    navigate(`/login?next=${encodeURIComponent(match.path)}`, { replace: true });
    return;
  }
  if (admin && match.path === '/login') {
    navigate('/', { replace: true });
    return;
  }
  const scrollY = window.scrollY;
  dirty = false;
  let page;
  try {
    page = match.page({ params: match.params, query: match.query, admin, refresh: () => renderPage({ isRefresh: true }) });
  } catch (error) {
    console.error('[admin] 画面を表示できませんでした。', error);
    page = { title: 'エラー', view: html`<p class="form__error">この画面を表示できませんでした（${error.message}）。設定画面からデモを初期化すると戻ることがあります。</p>` };
  }
  document.title = `${page.title}｜GENBA YARD 管理画面`;
  // 画面ごとに入れ物を作り直し、前の画面のイベントを残さない
  const container = document.createElement('div');
  container.className = 'apage';
  try {
    render(container, match.path === '/login' ? page.view : Shell({ path: match.path, admin, content: page.view }));
  } catch (error) {
    console.error('[admin] 管理画面の外枠を表示できませんでした。', error);
    render(container, Broken(error));
    root.replaceChildren(container);
    container.querySelector('[data-broken-reset]').addEventListener('click', () => {
      resetAll();
      location.reload();
    });
    return;
  }
  root.replaceChildren(container);
  let result;
  try {
    result = page.mount?.(container, { refresh: () => renderPage({ isRefresh: true }), isRefresh });
  } catch (error) {
    console.error('[admin] 画面の操作を準備できませんでした。', error);
    showToast('この画面の一部の操作を準備できませんでした。画面を開き直してください。');
  }
  if (typeof result === 'function') cleanup = result;
  // 絞り込み欄は、PC・タブレットでは常に開く（スマホは条件がなければ閉じて、一覧を先に見せる）
  if (!window.matchMedia('(max-width: 639px)').matches) container.querySelectorAll('details.afilters').forEach((box) => { box.open = true; });
  if (isRefresh || match.path === lastPath) window.scrollTo(0, scrollY);
  else window.scrollTo(0, 0);
  lastPath = match.path;
}

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-action="admin-logout"]')) {
    adminLogout();
    navigate('/login');
    return;
  }
  if (event.target.closest('[data-stale-reload]')) renderPage({ isRefresh: true });
});

// ログインの期限が切れた後に、開いたままの画面で操作させない（ボタン・送信の前に確かめる）
const guardSession = (event) => {
  if (resolve().path === '/login' || currentAdmin()) return;
  if (event.type === 'click' && !event.target.closest('button, a, input[type="submit"]')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  showToast('ログインの期限が切れました。もう一度ログインしてください。');
  renderPage();
};
document.addEventListener('click', guardSession, true);
document.addEventListener('submit', guardSession, true);

// 入力を始めたフォームがあれば、別のタブの変更で描き直さない（保存前の入力を消さない）
document.addEventListener('input', (event) => {
  if (event.target.closest('form') && !event.target.closest('[data-filters]')) dirty = true;
});

// 購入者画面（別タブ）で注文が入った・在庫が変わったら描き直す。入力中・未保存の入力があれば帯で知らせるだけにする
const refreshIfIdle = () => {
  const active = document.activeElement;
  const typing = active?.matches('input, textarea, select') && active.closest('form');
  if (dirty || typing || document.querySelector('.modal')) {
    const banner = root.querySelector('[data-stale]');
    if (banner) banner.hidden = false;
    return;
  }
  renderPage({ isRefresh: true });
};
onExternalChange(refreshIfIdle);
onMarketExternalChange(refreshIfIdle);
window.addEventListener('storage', (event) => {
  if (event.key === 'genba-yard:admin-session') renderPage();
});

start(() => renderPage());
