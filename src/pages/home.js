import { html } from '../lib/html.js';
import { yen } from '../lib/format.js';
import { shelves, productCount, DISCONTINUED_WITH_SUPPORT_HREF, PREVIOUS_MODELS_HREF } from '../lib/catalog.js';
import { getTimeSaleEnd } from '../lib/campaigns.js';
import { setOwnedBatteries } from '../lib/store.js';
import { ownedBatteryName } from '../lib/status.js';
import { summarize } from '../lib/pricing.js';
import { CATEGORIES, categoryById } from '../data/categories.js';
import { BRANDS } from '../data/brands.js';
import { platformById } from '../data/batteries.js';
import { SaleBanner } from '../components/SaleBanner.js';
import { SectionHeader } from '../components/Section.js';
import { ProductGrid } from '../components/ProductGrid.js';
import { Countdown } from '../components/Countdown.js';
import { Icon } from '../components/Icon.js';
import { track } from '../lib/analytics.js';
import { cartLines } from './cart.js';

function CartReminder() {
  const lines = cartLines();
  if (!lines.length) return '';
  const summary = summarize(lines);
  return html`
    <aside class="reminder container" aria-label="カートの状態">
      <p class="reminder__text">${Icon('cart')}<span><strong>カートに商品が残っています</strong>（${summary.count}点・${yen(summary.total)}）</span></p>
      <a class="btn btn--primary btn--sm" href="#/cart">カートを見る</a>
    </aside>`;
}

// この売り場の約束（出どころ・条件の開示）
function MarketPromise() {
  const items = [
    ['01', '国内正規流通品だけ', 'メーカー・正規販売店から直接引き取った品のみ。並行輸入品・中古・互換バッテリーは扱いません。'],
    ['02', '新品・未使用だけ', '製造時期まで表示します。開封済みや展示品は扱いません。'],
    ['03', '条件をすべて開示', 'メーカーサポート・修理・部品・バッテリー互換と、この価格の理由を商品ごとに書いています。'],
  ];
  return html`
    <section class="promise" aria-labelledby="promise-title">
      <div class="container promise__inner">
        <h2 class="promise__title" id="promise-title"><span class="en">OUR PROMISE</span>出どころを言える道具だけ。</h2>
        <ol class="promise__list">
          ${items.map(([num, title, text]) => html`<li><span class="promise__num num">${num}</span><div><p class="promise__item-title">${title}</p><p class="promise__item-text">${text}</p></div></li>`)}
        </ol>
      </div>
    </section>`;
}

function TimeSaleShelf() {
  return html`
    <section class="shelf container" aria-labelledby="timesale-title">
      ${SectionHeader({
        id: 'timesale-title',
        eyebrow: 'TIME SALE',
        title: '本日のTIME SALE',
        lead: '毎日0:00に対象が入れ替わります。同じ商品の次の登場は、早くても3日後です。',
        link: { href: '#/products?sale=timesale', label: 'TIME SALE の商品を見る' },
      })}
      <div class="timesale">
        <div class="timesale__panel">
          <p class="timesale__label">本日23:59まで</p>
          ${Countdown(getTimeSaleEnd(), { className: 'countdown--xl' })}
          <p class="timesale__note">${Icon('clock')}明日 0:00 に次の2点に入れ替わります。残りの数は実際の在庫です。</p>
        </div>
        ${ProductGrid(shelves.timeSale(), { layout: 'duo', listName: '本日のTIME SALE' })}
      </div>
    </section>`;
}

const Shelf = ({ id, eyebrow, title, lead, products, link, layout = 'rail', aside = '', ranked = false }) => html`
  <section class="shelf container" aria-labelledby="${id}">
    ${SectionHeader({ id, eyebrow, title, lead, link, aside })}
    ${ProductGrid(products, { layout, listName: title, ranked })}
  </section>`;

function Categories() {
  return html`
    <section class="shelf container" aria-labelledby="category-title">
      ${SectionHeader({ id: 'category-title', eyebrow: 'CATEGORY', title: 'カテゴリーから探す' })}
      <ul class="category-grid">
        ${CATEGORIES.map((category) => html`
          <li><a class="category-tile" href="#/products?cat=${category.id}">${Icon(category.icon)}<span class="category-tile__name">${category.name}</span><span class="category-tile__count num">${productCount('categoryId', category.id)}点</span></a></li>`)}
      </ul>
      <ul class="brand-strip">
        ${BRANDS.map((brand) => html`
          <li><a class="brand-strip__item" href="#/products?brand=${brand.id}">
            <span class="brand-strip__name en">${brand.name}</span>
            <span class="brand-strip__tagline">${brand.tagline}</span>
            <span class="brand-strip__genres">${brand.genres.join('・')}</span>
          </a></li>`)}
      </ul>
    </section>`;
}

export function render({ account }) {
  const ownedName = ownedBatteryName();
  const recommended = shelves.recommendedFor(account);
  return {
    title: 'トップ',
    view: html`
      ${CartReminder()}
      ${SaleBanner()}
      ${MarketPromise()}
      ${TimeSaleShelf()}
      ${Shelf({
        id: 'limited-title',
        eyebrow: 'LIMITED STOCK',
        title: '数量限定',
        lead: '今回の放出分がなくなり次第、終了します。再入荷はありません。',
        products: shelves.limited(),
        link: { href: '#/products?limited=1&sort=stock', label: '数量限定をすべて見る' },
      })}
      ${Shelf({
        id: 'new-title',
        eyebrow: 'NEW ARRIVALS',
        title: '新着',
        lead: 'メーカー・販売店から新しく届いた放出品。',
        products: shelves.newArrivals(),
        link: { href: '#/products?sort=new', label: '新着をすべて見る' },
      })}
      ${Shelf({
        id: 'previous-title',
        eyebrow: 'PREVIOUS MODELS',
        title: ownedName ? `手持ちの${ownedName}で動く、一つ前の名機` : '型落ち・モデルチェンジ ― 一つ前の名機',
        lead: ownedName ? `型落ち・モデルチェンジ品のうち、手持ちの${ownedName}バッテリーで動くものから並べています。現行モデルとの比較も見られます。` : '現行モデルとの違いを、使い方ごとに比べて選べます。',
        products: shelves.previousModels(),
        link: { href: PREVIOUS_MODELS_HREF, label: '型落ち・モデルチェンジをすべて見る' },
      })}
      ${Shelf({
        id: 'discontinued-title',
        eyebrow: 'DISCONTINUED',
        title: '廃番・終売モデル',
        lead: '製造が終わっても、メーカーサポートが続くものがほとんどです。',
        products: shelves.discontinued(),
        link: { href: DISCONTINUED_WITH_SUPPORT_HREF, label: 'サポート継続中のものだけ見る' },
      })}
      ${Shelf({
        id: 'popular-title',
        eyebrow: 'RANKING',
        title: '人気の商品',
        lead: '会員のお気に入り登録と閲覧の多い順です。',
        products: shelves.popular(),
        ranked: true,
      })}
      ${Categories()}
      ${Shelf({
        id: 'recommend-title',
        eyebrow: 'FOR YOU',
        title: `${account.trade}のあなたへのおすすめ`,
        lead: `よく見るカテゴリー（${account.favoriteCategoryIds.map((id) => categoryById(id).name).join('・')}）から選んでいます。`,
        products: recommended,
        link: { href: '#/mypage', label: '職種・手持ちバッテリーを設定する' },
      })}
    `,
    mount(root, { refresh }) {
      root.addEventListener('click', (event) => {
        const choice = event.target.closest('[data-set-battery]');
        if (!choice) return;
        // 「他メーカーの電池」は手持ち扱いにしない（このマーケットの規格ではない）が、PoC の仕入れ判断に使うので計測する
        const id = choice.dataset.setBattery;
        setOwnedBatteries(platformById(id) ? [id] : []);
        track('set_owned_battery', { platform: id || 'none' });
        refresh();
      });
    },
  };
}
