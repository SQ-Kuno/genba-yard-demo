import { html, attr } from '../lib/html.js';
import { SITE } from '../config/site.js';
import { CATEGORIES } from '../data/categories.js';
import { BRANDS } from '../data/brands.js';
import { productCount, DISCONTINUED_WITH_SUPPORT_HREF } from '../lib/catalog.js';
import { cartCount, getFavorites, currentAccount } from '../lib/store.js';
import { Logo } from './Logo.js';
import { Icon } from './Icon.js';

export const POPULAR_KEYWORDS = ['インパクト', '墨出し器', 'バッテリー', '丸ノコ', 'クランプメーター', '廃番'];

export function SearchForm({ query = '', id = 'header-search' } = {}) {
  return html`
    <form class="search" role="search" data-search-form>
      <label class="visually-hidden" for="${id}">商品を検索</label>
      <span class="search__icon">${Icon('search')}</span>
      <input class="search__input" id="${id}" name="q" type="search" value="${query}" placeholder="型番・商品名・ブランドで検索" autocomplete="off" enterkeyhint="search">
      <button class="search__submit" type="submit">検索</button>
    </form>`;
}

function CategoryMenu() {
  return html`
    <div class="catmenu" id="category-menu" hidden>
      <div class="catmenu__inner container">
        <div>
          <p class="catmenu__title en">CATEGORY</p>
          <ul class="catmenu__list">
            ${CATEGORIES.map((category) => html`
              <li><a href="#/products?cat=${category.id}">${Icon(category.icon)}<span>${category.name}</span><span class="catmenu__count num">${productCount('categoryId', category.id)}</span></a></li>`)}
          </ul>
        </div>
        <div>
          <p class="catmenu__title en">BRAND</p>
          <ul class="catmenu__brands">
            ${BRANDS.map((brand) => html`<li><a href="#/products?brand=${brand.id}"><span class="en">${brand.name}</span><span>${brand.genres.join('・')}</span></a></li>`)}
          </ul>
          <p class="catmenu__title en">QUICK</p>
          <ul class="catmenu__quick">
            <li><a href="${DISCONTINUED_WITH_SUPPORT_HREF}">廃番・終売 × メーカーサポート継続中</a></li>
            <li><a href="#/products?owned=1">手持ちのバッテリーで動く道具</a></li>
            <li><a href="#/products?sale=any">開催中のSALE・SECRET PRICE</a></li>
          </ul>
        </div>
      </div>
    </div>`;
}

export function Header({ path = '/', searchQuery = '', isSale = false } = {}) {
  const account = currentAccount();
  const count = cartCount();
  const favorites = getFavorites().length;
  const isActive = (target) => (path === target ? 'is-active' : '');
  return html`
    <div class="memberbar">
      <div class="memberbar__inner container">
        <p class="memberbar__service"><span class="tag tag--blue tag--en">MEMBERS ONLY</span><span class="memberbar__text">${SITE.eligibility}マーケット</span></p>
        <p class="memberbar__account">${account.company}　${account.name} 様<span class="memberbar__no en">${account.memberNo}</span><button class="memberbar__demo" type="button" data-action="demo-reset" title="デモを最初の状態に戻す">デモ環境</button></p>
      </div>
    </div>
    <div class="header">
      <div class="header__inner container">
        ${Logo()}
        <button class="header__cat" type="button" data-action="toggle-category-menu" aria-expanded="false" aria-controls="category-menu">
          ${Icon('grid')}<span>カテゴリー</span>${Icon('chevronDown')}
        </button>
        <div class="header__search">${SearchForm({ query: searchQuery })}</div>
        <nav class="header__nav" aria-label="特集">
          <a class="header__navlink ${isSale ? 'is-active' : ''}" href="#/products?sale=any">SALE</a>
          <a class="header__navlink" href="#/products?sort=new">新着</a>
        </nav>
        <div class="header__icons">
          <a class="header__icon ${isActive('/favorites')}" href="#/favorites" aria-label="お気に入り（${favorites}件）">
            ${Icon('heart')}<span class="header__icon-label">お気に入り</span>
            ${favorites ? html`<span class="badge-count num">${favorites}</span>` : ''}
          </a>
          <a class="header__icon ${isActive('/mypage')}" href="#/mypage" aria-label="マイページ">
            ${Icon('user')}<span class="header__icon-label">マイページ</span>
          </a>
          <a class="header__icon header__icon--cart ${isActive('/cart')}" href="#/cart" aria-label="カート（${count}点）">
            ${Icon('cart')}<span class="header__icon-label">カート</span>
            ${count ? html`<span class="badge-count num" data-cart-count>${count}</span>` : ''}
          </a>
        </div>
      </div>
      <div class="header__mobile-search container">${SearchForm({ query: searchQuery, id: 'header-search-sp' })}</div>
      ${CategoryMenu()}
    </div>`;
}

export function MobileNav({ path = '/', query } = {}) {
  const isSale = path === '/products' && query?.get('sale');
  const item = (href, icon, label, match) => html`
    <a class="mobile-nav__item ${match ? 'is-active' : ''}" href="${href}" ${attr('aria-current', match && 'page')}>${Icon(icon)}<span>${label}</span></a>`;
  return html`
    ${item('#/', 'home', 'ホーム', path === '/')}
    ${item('#/products', 'search', 'さがす', path === '/products' && !isSale)}
    ${item('#/products?sale=any', 'tag', 'SALE', Boolean(isSale))}
    ${item('#/favorites', 'heart', 'お気に入り', path === '/favorites')}
    ${item('#/mypage', 'user', 'マイページ', path.startsWith('/mypage'))}
  `;
}
