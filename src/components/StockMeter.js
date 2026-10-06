import { html } from '../lib/html.js';
import { stockOf } from '../lib/store.js';
import { lowStockThreshold } from '../lib/status.js';

const UNITS = { sockets: 'セット', vest: '着', stripper: '本' };
export const unitOf = (product) => UNITS[product.kind] ?? '台';

// 残り在庫。実在庫からだけ表示し、放出数がある商品はバーで残り具合を見せる
export function StockMeter(product, { compact = false } = {}) {
  const stock = stockOf(product);
  if (stock === 0) return html`<p class="stock stock--out">完売しました</p>`;
  const showBar = !compact && !product.stockTotalLabel;
  const ratio = Math.max(4, Math.round((stock / product.stockTotal) * 100));
  return html`
    <div class="stock ${stock <= lowStockThreshold() ? 'stock--low' : ''} ${compact ? 'stock--compact' : ''}">
      <p class="stock__text">残り <strong class="num">${stock}</strong>${unitOf(product)}${product.stockTotalLabel ? html`<span class="stock__total">（${product.stockTotalLabel}）</span>` : ''}</p>
      ${showBar ? html`<span class="stock__bar" aria-hidden="true"><span style="width:${ratio}%"></span></span>` : ''}
    </div>`;
}
