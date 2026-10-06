import { html } from '../lib/html.js';
import { yen } from '../lib/format.js';
import { campaignLead, getHeroCampaign, getTimeSaleEnd, timeSaleProductIds } from '../lib/campaigns.js';
import { campaignStats, productById } from '../lib/catalog.js';
import { getPricing, referenceNote } from '../lib/pricing.js';
import { stockOf, hasExpressCheckout, hasAnsweredBattery } from '../lib/store.js';
import { ownedBatteryName, isPurchasable } from '../lib/status.js';
import { brandById } from '../data/brands.js';
import { Countdown } from './Countdown.js';
import { ProductImage } from './ProductImage.js';
import { openModal } from './Modal.js';
import { Icon } from './Icon.js';

// ログイン直後に1回だけ出すキャンペーン案内
export function openSalePopup(account) {
  const campaign = getHeroCampaign();
  const stats = campaignStats();
  const items = timeSaleProductIds().map(productById).filter((product) => isPurchasable(product));
  const summary = campaign.endsAt ? stats.seasonal : stats.overall;
  const ratedItems = items.filter((product) => getPricing(product).showRate);
  // 割引率を出すのは下の TIME SALE の商品だけ。その比較元に発売時の価格が含まれるか
  const includesLaunch = ratedItems.some((product) => product.referencePriceType === 'msrp-at-launch');
  const content = html`
    <div class="popup">
      <div class="popup__head">
        <p class="popup__welcome">${account.name} 様、${hasExpressCheckout() ? 'おかえりなさい。' : 'ようこそ。'}</p>
        <p class="popup__eyebrow en">${campaign.endsAt ? campaign.name : 'MEMBERS ONLY'}</p>
        <h2 class="popup__title en">${campaign.title}</h2>
        <p class="popup__lead">${campaignLead(campaign, { batteryName: ownedBatteryName(), answeredWithout: !ownedBatteryName() && hasAnsweredBattery() })}</p>
        ${summary.minPrice ? html`<p class="popup__sub">${campaign.endsAt ? `${campaign.name}価格で 対象${summary.count}点` : '会員価格'}<span class="num">${yen(summary.minPrice)}</span>〜</p>` : ''}
        ${campaign.endsAt ? html`<p class="popup__countdown">SALE終了まで ${Countdown(campaign.endsAt)}</p>` : ''}
      </div>
      <div class="popup__body">
        <div class="popup__timesale-head">
          <p class="popup__timesale-title"><span class="tag tag--navy tag--en">TIME SALE</span>本日のTIME SALE</p>
          <p class="popup__timesale-end">${Icon('clock')}本日23:59まで ${Countdown(getTimeSaleEnd(), { prefix: 'あと ' })}</p>
          <p class="popup__timesale-note">対象は毎日入れ替わります。同じ商品の次の登場は、早くても3日後です。</p>
        </div>
        <ul class="popup__items">
          ${items.map((product) => {
            const pricing = getPricing(product);
            return html`
              <li>
                <a class="popup__item" href="#/product/${product.id}" data-modal-close>
                  ${ProductImage(product, { className: 'pimg--thumb' })}
                  <span class="popup__item-text">
                    <span class="popup__item-brand en">${brandById(product.brandId).name} ${product.model}</span>
                    <span class="popup__item-name">${product.name}</span>
                    <span class="popup__item-price"><span class="num">${yen(pricing.final)}</span>${pricing.showRate ? html`<span class="popup__item-rate num">${pricing.rate}%OFF</span>` : ''}<span class="popup__item-stock">残り${stockOf(product)}</span></span>
                  </span>
                </a>
              </li>`;
          })}
        </ul>
        ${ratedItems.length ? html`<p class="popup__note">割引率は${referenceNote(includesLaunch)}との比較です。</p>` : ''}
        <div class="popup__actions">
          <a class="btn btn--primary btn--block btn--lg" href="#/products?sale=any" data-modal-close>SALE会場を見る</a>
          <button class="btn btn--ghost btn--block" type="button" data-modal-close>閉じてトップを見る</button>
        </div>
      </div>
    </div>`;
  return openModal(content, { label: `${campaign.title} のお知らせ`, className: 'modal--popup' });
}
