import { html } from '../lib/html.js';
import { CATEGORIES, LIFECYCLES } from '../data/categories.js';
import { BRANDS } from '../data/brands.js';
import { PRICE_RANGES, SALE_FILTERS, releaseYears, productCount } from '../lib/catalog.js';
import { getOwnedBatteries } from '../lib/store.js';

const Check = ({ name, value, label, checked, count = null }) => html`
  <label class="check">
    <input type="checkbox" name="${name}" value="${value}" ${checked ? 'checked' : ''}>
    <span>${label}</span>${count !== null ? html`<span class="check__count num">${count}</span>` : ''}
  </label>`;

const Group = (title, body, { open = true } = {}) => html`
  <details class="filter-group" ${open ? 'open' : ''}>
    <summary class="filter-group__title">${title}</summary>
    <div class="filter-group__body">${body}</div>
  </details>`;

// 絞り込み条件はそのままURLのクエリになる（name=クエリのキー）
export function FilterPanel(filters) {
  const hasOwned = getOwnedBatteries().length > 0;
  return html`
    <form class="filters" data-filter-form aria-label="絞り込み">
      ${Group('このマーケットならでは', html`
        ${Check({ name: 'support', value: '1', label: 'メーカーサポート継続中', checked: filters.supportActive })}
        ${Check({ name: 'battery', value: '1', label: '現行品とバッテリー互換あり', checked: filters.batteryCompatible })}
        ${hasOwned ? Check({ name: 'owned', value: '1', label: '手持ちのバッテリーで動く', checked: filters.ownedBattery }) : ''}
        ${Check({ name: 'nobattery', value: '1', label: '電池のいらない道具（乾電池式・手工具など）', checked: filters.batteryFree })}
        ${Check({ name: 'stock', value: '1', label: '在庫あり', checked: filters.inStock })}
        ${Check({ name: 'limited', value: '1', label: '数量限定・残りわずか', checked: filters.limited })}
      `)}
      ${Group('SALE', html`
        ${[{ id: '', label: '指定なし' }, ...SALE_FILTERS].map((option) => html`
          <label class="check check--radio">
            <input type="radio" name="sale" value="${option.id}" ${filters.sale === option.id ? 'checked' : ''}>
            <span>${option.label}</span>
          </label>`)}
      `)}
      ${Group('商品の状態', Object.entries(LIFECYCLES).filter(([, lifecycle]) => lifecycle.filterLabel).map(([key, lifecycle]) =>
        Check({ name: 'status', value: key, label: lifecycle.filterLabel, checked: filters.lifecycles.includes(key), count: productCount('lifecycle', key) })))}
      ${Group('カテゴリー', CATEGORIES.map((category) =>
        Check({ name: 'cat', value: category.id, label: category.name, checked: filters.categories.includes(category.id), count: productCount('categoryId', category.id) })))}
      ${Group('メーカー', BRANDS.map((brand) =>
        Check({ name: 'brand', value: brand.id, label: brand.name, checked: filters.brands.includes(brand.id), count: productCount('brandId', brand.id) })))}
      ${Group('価格（税込）', html`
        ${[{ id: '', label: '指定なし' }, ...PRICE_RANGES].map((range) => html`
          <label class="check check--radio">
            <input type="radio" name="price" value="${range.id}" ${filters.price === range.id ? 'checked' : ''}>
            <span>${range.label}</span>
          </label>`)}
      `)}
      ${Group('発売年', html`<div class="filter-years">${releaseYears().map((year) =>
        Check({ name: 'year', value: String(year), label: `${year}年`, checked: filters.years.includes(year) }))}</div>`)}
    </form>`;
}
