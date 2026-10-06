import { html, render as renderInto } from '../lib/html.js';
import { SITE } from '../config/site.js';
import { readFilters, filterProducts, sortProducts, SORTS, PRICE_RANGES, SALE_FILTERS, DISCONTINUED_WITH_SUPPORT_HREF } from '../lib/catalog.js';
import { withQuery } from '../lib/router.js';
import { track, toItem } from '../lib/analytics.js';
import { getPricing } from '../lib/pricing.js';
import { categoryById, LIFECYCLES } from '../data/categories.js';
import { brandById } from '../data/brands.js';
import { ProductGrid } from '../components/ProductGrid.js';
import { FilterPanel } from '../components/FilterPanel.js';
import { Breadcrumb, EmptyState } from '../components/Common.js';
import { POPULAR_KEYWORDS } from '../components/Header.js';
import { Icon } from '../components/Icon.js';

const saleLabel = (id) => SALE_FILTERS.find((item) => item.id === id).label;

function pageHeading(filters) {
  if (filters.q) return { eyebrow: 'SEARCH', title: `「${filters.q}」の検索結果` };
  if (filters.sale) return { eyebrow: 'SALE', title: saleLabel(filters.sale) };
  if (filters.categories.length === 1) return { eyebrow: 'CATEGORY', title: categoryById(filters.categories[0]).name };
  if (filters.brands.length === 1) return { eyebrow: 'BRAND', title: brandById(filters.brands[0]).name };
  if (filters.sort === 'new') return { eyebrow: 'NEW ARRIVALS', title: '新着' };
  return { eyebrow: 'ALL ITEMS', title: 'すべての商品' };
}

// 現在の条件をチップで見せ、1タップで外せるようにする
function activeChips(filters) {
  const chips = [];
  if (filters.q) chips.push({ key: 'q', value: filters.q, label: `キーワード：${filters.q}` });
  if (filters.sale) chips.push({ key: 'sale', value: filters.sale, label: saleLabel(filters.sale) });
  filters.lifecycles.forEach((value) => chips.push({ key: 'status', value, label: LIFECYCLES[value].label }));
  filters.categories.forEach((value) => chips.push({ key: 'cat', value, label: categoryById(value).name }));
  filters.brands.forEach((value) => chips.push({ key: 'brand', value, label: brandById(value).name }));
  if (filters.price) chips.push({ key: 'price', value: filters.price, label: PRICE_RANGES.find((r) => r.id === filters.price).label });
  filters.years.forEach((value) => chips.push({ key: 'year', value: String(value), label: `${value}年発売` }));
  if (filters.supportActive) chips.push({ key: 'support', value: '1', label: 'メーカーサポート継続中' });
  if (filters.batteryCompatible) chips.push({ key: 'battery', value: '1', label: '現行品とバッテリー互換' });
  if (filters.batteryFree) chips.push({ key: 'nobattery', value: '1', label: '電池のいらない道具' });
  if (filters.ownedBattery) chips.push({ key: 'owned', value: '1', label: '手持ちのバッテリーで動く' });
  if (filters.inStock) chips.push({ key: 'stock', value: '1', label: '在庫あり' });
  if (filters.limited) chips.push({ key: 'limited', value: '1', label: '数量限定・残りわずか' });
  return chips;
}

const QUICK = [
  { href: DISCONTINUED_WITH_SUPPORT_HREF, label: '廃番・終売 × サポート継続中' },
  { href: '#/products?owned=1', label: '手持ちのバッテリーで動く' },
  { href: '#/products?sale=timesale', label: '本日のTIME SALE' },
  { href: '#/products?battery=1&stock=1', label: 'バッテリー互換あり・在庫あり' },
];

function Results(filters) {
  const products = sortProducts(filterProducts(filters), filters.sort);
  const chips = activeChips(filters);
  return {
    count: products.length,
    view: html`
      ${chips.length ? html`
        <div class="chips" aria-label="選択中の条件">
          ${chips.map((chip) => html`<button class="chip chip--removable" type="button" data-remove-filter="${chip.key}" data-value="${chip.value}" aria-label="${chip.label} を外す">${chip.label}${Icon('close')}</button>`)}
          <a class="link-btn" href="#/products">すべて解除</a>
        </div>` : ''}
      ${products.length
        ? ProductGrid(products, { listName: pageHeading(filters).title })
        : EmptyState({
            title: '条件に合う商品が見つかりませんでした',
            text: '条件を減らすか、キーワードを短くしてみてください。型番の一部（例：ID-180 → 180）でも探せます。',
            action: { href: '#/products', label: 'すべての商品を見る' },
          })}
    `,
    products,
  };
}

// フォームの状態 → URL のクエリ
function paramsFromForm(form, filters) {
  const data = new FormData(form);
  return {
    q: filters.q,
    sort: filters.sort === 'recommended' ? '' : filters.sort,
    sale: data.get('sale') ?? '',
    price: data.get('price') ?? '',
    status: data.getAll('status'),
    cat: data.getAll('cat'),
    brand: data.getAll('brand'),
    year: data.getAll('year'),
    support: data.get('support'),
    battery: data.get('battery'),
    nobattery: data.get('nobattery'),
    owned: data.get('owned'),
    stock: data.get('stock'),
    limited: data.get('limited'),
  };
}

export function render({ query }) {
  const filters = readFilters(query);
  const heading = pageHeading(filters);
  const results = Results(filters);
  return {
    title: heading.title,
    view: html`
      ${Breadcrumb([{ label: heading.title }])}
      <header class="page-title container">
        <p class="eyebrow">${heading.eyebrow}</p>
        <h1 class="page-title__title">${heading.title}</h1>
      </header>
      <div class="listing container">
        <aside class="listing__filters" id="filter-drawer" aria-label="絞り込み条件">
          <div class="drawer-head">
            <p class="drawer-head__title">絞り込み</p>
            <button class="icon-btn" type="button" data-close-filters aria-label="絞り込みを閉じる">${Icon('close')}</button>
          </div>
          <div class="listing__filters-body">${FilterPanel(filters)}</div>
          <div class="drawer-foot">
            <a class="btn btn--ghost" href="#/products">クリア</a>
            <button class="btn btn--primary" type="button" data-close-filters><span data-result-count>${results.count}</span>件を表示</button>
          </div>
        </aside>
        <div class="listing__main">
          <div class="quick" aria-label="よく使われる探し方">
            ${QUICK.map((item) => html`<a class="quick__item" href="${item.href}">${item.label}</a>`)}
          </div>
          <div class="toolbar">
            <p class="toolbar__count"><strong class="num" data-result-count>${results.count}</strong>件</p>
            <button class="btn btn--ghost btn--sm toolbar__filter" type="button" data-open-filters aria-controls="filter-drawer">${Icon('filter')}絞り込み</button>
            <label class="toolbar__sort">
              <span class="visually-hidden">並び替え</span>
              <select class="field__select" data-sort>
                ${SORTS.filter((sort) => sort.id !== 'rate' || SITE.pricing.showRateAgainstLaunchMsrp).map((sort) => html`<option value="${sort.id}" ${filters.sort === sort.id ? 'selected' : ''}>${sort.label}</option>`)}
              </select>
            </label>
          </div>
          <div data-results>${results.view}</div>
          ${filters.q && !results.count ? html`
            <div class="keywords">
              <p class="keywords__title">よく検索されるキーワード</p>
              ${POPULAR_KEYWORDS.map((word) => html`<a class="quick__item" href="#/products?q=${encodeURIComponent(word)}">${word}</a>`)}
            </div>` : ''}
        </div>
      </div>
      <div class="drawer-backdrop" data-close-filters></div>
    `,
    mount(root, { isRefresh }) {
      let current = filters;
      const form = root.querySelector('[data-filter-form]');
      const drawer = root.querySelector('#filter-drawer');

      if (filters.q && !isRefresh) track('search', { search_term: filters.q, results: results.count });
      if (!isRefresh) track('view_item_list', { item_list_name: heading.title, items: results.products.slice(0, 20).map((p) => toItem(p, { price: getPricing(p).final })) });

      const apply = (params) => {
        const path = withQuery('/products', params);
        history.replaceState(null, '', `#${path}`);
        current = readFilters(new URLSearchParams(path.split('?')[1] ?? ''));
        const next = Results(current);
        renderInto(root.querySelector('[data-results]'), next.view);
        root.querySelectorAll('[data-result-count]').forEach((element) => { element.textContent = next.count; });
      };

      form.addEventListener('change', () => apply(paramsFromForm(form, current)));
      root.querySelector('[data-sort]').addEventListener('change', (event) => {
        current = { ...current, sort: event.target.value };
        apply(paramsFromForm(form, current));
      });

      root.addEventListener('click', (event) => {
        const chip = event.target.closest('[data-remove-filter]');
        if (chip) {
          const { removeFilter: key, value } = chip.dataset;
          if (key === 'q') {
            // 見出しも変わるので画面ごと描き直す
            location.hash = `#${withQuery('/products', { ...paramsFromForm(form, current), q: '' })}`;
            return;
          }
          form.querySelectorAll(`[name="${key}"]`).forEach((input) => {
            if (input.value === value) input.checked = false;
            if (input.type === 'radio' && input.value === '') input.checked = true;
          });
          apply(paramsFromForm(form, current));
          return;
        }
        if (event.target.closest('[data-open-filters]')) {
          drawer.classList.add('is-open');
          document.body.classList.add('has-drawer');
        }
        if (event.target.closest('[data-close-filters]')) {
          drawer.classList.remove('is-open');
          document.body.classList.remove('has-drawer');
        }
      });

      return () => document.body.classList.remove('has-drawer');
    },
  };
}
