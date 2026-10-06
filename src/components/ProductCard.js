import { html } from '../lib/html.js';
import { brandById } from '../data/brands.js';
import { isFavorite } from '../lib/store.js';
import { getActiveSale } from '../lib/campaigns.js';
import { runsOnOwnedBattery, isPurchasable } from '../lib/status.js';
import { platformById } from '../data/batteries.js';
import { deliveryLabel, leadOf, leadText } from '../lib/delivery.js';
import { getPricing } from '../lib/pricing.js';
import { SITE } from '../config/site.js';
import { ProductImage } from './ProductImage.js';
import { StatusBadges } from './StatusBadge.js';
import { PriceDisplay } from './PriceDisplay.js';
import { StockMeter } from './StockMeter.js';
import { Countdown } from './Countdown.js';
import { Icon } from './Icon.js';

export function FavoriteButton(product, { withLabel = false } = {}) {
  const active = isFavorite(product.id);
  return html`
    <button class="fav ${active ? 'is-active' : ''} ${withLabel ? 'fav--label' : ''}" type="button" data-action="toggle-favorite" data-product-id="${product.id}" aria-pressed="${active}" aria-label="${active ? 'お気に入りから外す' : 'お気に入りに追加'}">
      ${Icon('heart')}${withLabel ? html`<span>${active ? 'お気に入り済み' : 'お気に入り'}</span>` : ''}
    </button>`;
}

export function ProductCard(product, { listName = '', rank = null } = {}) {
  const brand = brandById(product.brandId);
  const sale = getActiveSale(product.id);
  const soldOut = !isPurchasable(product);
  const lead = leadOf([product]);
  const owned = runsOnOwnedBattery(product);
  return html`
    <article class="card ${soldOut ? 'is-soldout' : ''}">
      <div class="card__media">
        ${ProductImage(product)}
        ${rank ? html`<span class="card__rank num">${rank}</span>` : ''}
      </div>
      <div class="card__body">
        ${StatusBadges(product, { forCard: true })}
        <p class="card__brand en">${brand.name}</p>
        <h3 class="card__name"><a class="card__link" href="#/product/${product.id}" data-list-name="${listName}">${product.name}</a></h3>
        <p class="card__model en">${product.model}</p>
        ${PriceDisplay(product)}
        <div class="card__meta">
          ${StockMeter(product, { compact: true })}
          ${sale ? html`<p class="card__timer">${Icon('clock')}${Countdown(sale.endsAt, { prefix: 'あと ' })}</p>` : ''}
        </div>
        ${owned ? html`<p class="card__owned">${Icon('battery')}手持ちの${platformById(product.support.battery.platform).shortName}で動く</p>` : ''}
        ${soldOut ? '' : html`<p class="card__delivery">${Icon('truck')}${lead ? leadText(lead) : `${deliveryLabel()} お届け`}・${product.shipping.fee != null ? `送料${product.shipping.fee}円` : getPricing(product).final >= SITE.shipping.freeThreshold ? '送料無料' : `送料${SITE.shipping.fee}円`}</p>`}
      </div>
      ${FavoriteButton(product)}
    </article>`;
}
