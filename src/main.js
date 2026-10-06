import { html, render } from './lib/html.js';
import { route, fallback, start, resolve, navigate, withQuery } from './lib/router.js';
import {
  isLoggedIn, currentAccount, subscribe, onExternalChange, toggleFavorite, reveal, shouldShowCampaignPopup, markCampaignPopupSeen,
} from './lib/store.js';
import { resetAll } from './lib/demo.js';
import { productById } from './lib/catalog.js';
import { onMarketExternalChange } from './lib/market.js';
import { getPricing } from './lib/pricing.js';
import { track, toItem, setAnalyticsUser } from './lib/analytics.js';
import { SITE } from './config/site.js';
import { Header, MobileNav } from './components/Header.js';
import { Footer } from './components/Footer.js';
import { tickCountdowns } from './components/Countdown.js';
import { watchProductPhotos } from './components/ProductImage.js';
import { openSalePopup } from './components/SalePopup.js';
import { openModal, closeModal } from './components/Modal.js';
import { showToast } from './components/Toast.js';
import { EmptyState } from './components/Common.js';
import { bindLogin } from './pages/login.js';
import * as home from './pages/home.js';
import * as products from './pages/products.js';
import * as product from './pages/product.js';
import * as compare from './pages/compare.js';
import * as cart from './pages/cart.js';
import * as checkout from './pages/checkout.js';
import * as complete from './pages/complete.js';
import * as mypage from './pages/mypage.js';
import * as guide from './pages/guide.js';

route('/', home.render);
route('/products', products.render);
route('/product/:id', product.render);
route('/compare/:id', compare.render);
route('/cart', cart.render);
route('/checkout', checkout.render);
route('/complete/:orderId', complete.render);
route('/mypage', mypage.render);
route('/favorites', mypage.renderFavorites);
route('/guide', guide.render);
route('/login', null);
fallback(() => ({
  title: 'ページが見つかりません',
  view: html`<div class="container narrow">${EmptyState({ title: 'ページが見つかりませんでした', text: 'URLが変わったか、掲載が終了した可能性があります。', action: { href: '#/', label: 'トップへ戻る' } })}</div>`,
}));

const loginScreen = document.getElementById('login-screen');
const app = document.getElementById('app');
const main = document.getElementById('main');
let cleanup = null;
let lastPath = null;
let popupTimer = null;
// いま画面に出している会員（別タブで会員が切り替わったかの判定に使う）
let renderedAccountId = null;

function showLogin(next) {
  setAnalyticsUser(null);
  document.documentElement.dataset.auth = 'out';
  loginScreen.hidden = false;
  app.hidden = true;
  document.title = `会員ログイン｜${SITE.name}`;
  bindLogin({
    onLoggedIn: () => navigate(next && next !== '/login' ? next : '/', { replace: true }),
  });
}

function renderChrome(match) {
  render(document.getElementById('site-header'), Header({
    path: match.path,
    searchQuery: match.query.get('q') ?? '',
    isSale: match.path === '/products' && Boolean(match.query.get('sale')),
  }));
  render(document.getElementById('mobile-nav'), MobileNav({ path: match.path, query: match.query }));
}

// isRefresh: 同じ画面の描き直し（数量変更など）。閲覧系の計測を二重に送らない
function renderPage({ keepScroll = false, isRefresh = false } = {}) {
  const match = resolve();
  // ログアウト・デモのリセットで未ログインになったときも、前の画面のタイマーやモーダルを残さない
  closeModal();
  clearTimeout(popupTimer);
  cleanup?.();
  cleanup = null;

  if (!isLoggedIn()) {
    if (match.path !== '/login') {
      const next = location.hash.replace(/^#/, '') || '/';
      history.replaceState(null, '', `#${withQuery('/login', { next })}`);
      showLogin(next);
    } else {
      showLogin(match.query.get('next'));
    }
    return;
  }
  if (match.path === '/login') {
    navigate('/', { replace: true });
    return;
  }

  renderedAccountId = currentAccount().id;
  document.documentElement.dataset.auth = 'in';
  loginScreen.hidden = true;
  app.hidden = false;

  try {
    showPage(match, { keepScroll, isRefresh });
  } catch (error) {
    // 想定外のデータで描画に失敗しても白画面にせず、戻り道とリセットを出す
    console.error('[render] 画面を表示できませんでした。', error);
    track('exception', { description: String(error), page_path: match.path, fatal: false });
    document.body.className = '';
    render(main, html`<div class="container narrow">${EmptyState({ title: 'この画面を表示できませんでした', text: 'デモの保存データが古い可能性があります。トップに戻るか、デモを最初の状態に戻してください。', action: { href: '#/', label: 'トップへ戻る' } })}<p class="error-actions"><button class="btn btn--ghost" type="button" data-action="demo-reset">デモを最初の状態に戻す</button></p></div>`);
  }
}

function showPage(match, { keepScroll, isRefresh }) {
  const account = currentAccount();
  setAnalyticsUser(account);
  const scrollY = window.scrollY;
  const page = match.page({ params: match.params, query: match.query, account });
  document.title = `${page.title}｜${SITE.name}`;
  document.body.className = page.bodyClass ?? '';
  renderChrome(match);
  // 画面ごとに入れ物を作り直す。各画面が付けたイベントは入れ物ごと捨てられ、次の画面に残らない
  const pageRoot = document.createElement('div');
  pageRoot.className = 'page';
  main.replaceChildren(pageRoot);
  render(pageRoot, page.view);
  render(document.getElementById('site-footer'), Footer());
  cleanup = page.mount?.(pageRoot, { refresh: () => renderPage({ keepScroll: true, isRefresh: true }), isRefresh }) ?? null;
  tickCountdowns();

  if (keepScroll) window.scrollTo(0, scrollY);
  else if (match.path !== lastPath) window.scrollTo(0, 0);
  lastPath = match.path;

  if (!isRefresh) track('page_view', { page_path: match.path, page_title: page.title });

  // 裏のタブ（別タブの変更で描き直したとき）では出さず、見ているタブで出す
  if (match.path === '/' && document.visibilityState === 'visible' && shouldShowCampaignPopup()) {
    markCampaignPopupSeen();
    popupTimer = setTimeout(() => {
      openSalePopup(account);
      track('view_promotion', { promotion_id: 'login_popup' });
    }, 350);
  }
}

// リハーサルで在庫や注文が変わっても、いつでも最初の状態に戻せるようにする
function openDemoReset() {
  const { panel, close } = openModal(html`
    <div class="consult-modal">
      <p class="eyebrow">DEMO</p>
      <h2 class="consult-modal__title">デモを最初の状態に戻す</h2>
      <p>在庫・注文・カート・お気に入り・手持ちバッテリーの登録・計測ログを消して、ログイン画面に戻ります。提案の前のリハーサル後に使ってください。</p>
      <div class="address-form__actions">
        <button class="btn btn--primary" type="button" data-confirm-reset>最初の状態に戻す</button>
        <button class="btn btn--ghost" type="button" data-modal-close>やめる</button>
      </div>
    </div>`, { label: 'デモを最初の状態に戻す' });
  panel.querySelector('[data-confirm-reset]').addEventListener('click', () => {
    close();
    resetAll();
    navigate('/login');
  });
}

function syncFavoriteButtons(productId, active) {
  document.querySelectorAll(`[data-action="toggle-favorite"][data-product-id="${productId}"]`).forEach((button) => {
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', active ? 'お気に入りから外す' : 'お気に入りに追加');
    const label = button.querySelector('span');
    if (label) label.textContent = active ? 'お気に入り済み' : 'お気に入り';
  });
}

// カード・詳細など、どの画面にもある操作はまとめてここで受ける
document.addEventListener('click', (event) => {
  const target = event.target;

  const fav = target.closest('[data-action="toggle-favorite"]');
  if (fav) {
    const item = productById(fav.dataset.productId);
    const added = toggleFavorite(item.id);
    if (added) track('add_to_wishlist', { items: [toItem(item, { price: getPricing(item).final })] });
    showToast(added ? 'お気に入りに追加しました' : 'お気に入りから外しました', added ? { action: { href: '#/favorites', label: 'お気に入りを見る' } } : {});
    if (resolve().path === '/favorites') renderPage({ keepScroll: true, isRefresh: true });
    else syncFavoriteButtons(item.id, added);
    return;
  }

  const secret = target.closest('[data-action="reveal-secret"]');
  if (secret) {
    reveal(secret.dataset.productId);
    track('reveal_secret_price', { item_id: secret.dataset.productId });
    renderPage({ keepScroll: true, isRefresh: true });
    return;
  }

  const categoryToggle = target.closest('[data-action="toggle-category-menu"]');
  const menu = document.getElementById('category-menu');
  if (categoryToggle) {
    const open = menu.hidden;
    menu.hidden = !open;
    categoryToggle.setAttribute('aria-expanded', String(open));
    return;
  }
  if (menu && !menu.hidden && !target.closest('#category-menu')) {
    menu.hidden = true;
    document.querySelector('[data-action="toggle-category-menu"]')?.setAttribute('aria-expanded', 'false');
  }

  if (target.closest('[data-action="demo-reset"]')) {
    openDemoReset();
    return;
  }

  const promotion = target.closest('[data-promotion]');
  if (promotion) track('select_promotion', { promotion_id: promotion.dataset.promotion });

  const productLink = target.closest('.card__link');
  if (productLink) track('select_item', { item_list_name: productLink.dataset.listName, item_id: productLink.getAttribute('href').split('/').pop() });
});

document.addEventListener('submit', (event) => {
  if (!event.target.matches('[data-search-form]')) return;
  event.preventDefault();
  const keyword = new FormData(event.target).get('q').trim();
  event.target.querySelector('input').blur();
  navigate(withQuery('/products', { q: keyword }));
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    const menu = document.getElementById('category-menu');
    if (menu && !menu.hidden) menu.hidden = true;
  }
});

// カート・お気に入りの数が変わったらヘッダーだけ描き直す（入力中のときは邪魔しない）
subscribe(() => {
  if (!isLoggedIn() || app.hidden) return;
  const active = document.activeElement;
  if (active?.matches('input') && active.closest('#site-header')) return;
  renderChrome(resolve());
});

// 別のタブで注文・お気に入りなどが変わったら読み直す。購入手続き中は入力を消さないよう画面はそのまま
// （カートの食い違いは確定時に確かめる）。ただし別の会員に切り替わった・ログアウトした場合は画面ごと描き直す
onExternalChange(() => {
  const sameMember = isLoggedIn() && currentAccount().id === renderedAccountId;
  if (resolve().path === '/checkout' && sameMember) renderChrome(resolve());
  else renderPage({ keepScroll: true, isRefresh: true });
});

// 管理画面（別タブ）で商品・価格・在庫・販売状況が変わったら描き直す。購入手続き中は入力を消さず、確定時に確かめる
onMarketExternalChange(() => {
  if (!isLoggedIn()) return;
  if (resolve().path === '/checkout') renderChrome(resolve());
  else renderPage({ keepScroll: true, isRefresh: true });
});

watchProductPhotos();
// TIME SALE などが終了したら価格を描き直す（購入手続き中は確定時に確かめる）
setInterval(() => {
  if (tickCountdowns() && isLoggedIn() && resolve().path !== '/checkout') renderPage({ keepScroll: true, isRefresh: true });
}, 1000);
start(() => renderPage());
