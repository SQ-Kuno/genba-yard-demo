import { html } from '../lib/html.js';
import { ProductCard } from './ProductCard.js';

// layout: 'grid' は一覧用。'rail' はスマホで横スクロール・PCでは4列の棚
export function ProductGrid(products, { layout = 'grid', listName = '', ranked = false } = {}) {
  return html`
    <div class="pgrid pgrid--${layout}" data-list="${listName}">
      ${products.map((product, index) => ProductCard(product, { listName, rank: ranked ? index + 1 : null }))}
    </div>`;
}
