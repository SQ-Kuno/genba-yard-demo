import { html } from '../lib/html.js';
import { campaignLead, getHeroCampaign, getNextSeasonal, getTimeSaleEnd, getWeekendWindow, seasonalSaleProductIds } from '../lib/campaigns.js';
import { campaignStats, productById, shelves, PREVIOUS_LIFECYCLES } from '../lib/catalog.js';
import { getPricing, priceLabel, referenceNote } from '../lib/pricing.js';
import { withQuery } from '../lib/router.js';
import { runsOnOwnedBattery, ownedBatteryName, isPriceHidden, isPurchasable } from '../lib/status.js';
import { hasAnsweredBattery } from '../lib/store.js';
import { BATTERY_PLATFORMS } from '../data/batteries.js';
import { monthDay, yen } from '../lib/format.js';
import { Countdown } from './Countdown.js';
import { ProductArt } from './ProductArt.js';
import { Icon } from './Icon.js';

const dot = (date) => `${date.getMonth() + 1}.${String(date.getDate()).padStart(2, '0')}`;

function SaleTiles(stats) {
  const weekend = getWeekendWindow();
  return html`
    <ul class="hero-tiles">
      <li>
        <a class="hero-tile" href="#/products?sale=timesale" data-promotion="timesale">
          <span class="hero-tile__label en">TIME SALE</span>
          <span class="hero-tile__title">本日の対象${stats.timeSaleCount}点・23:59まで</span>
          <span class="hero-tile__value">${Countdown(getTimeSaleEnd(), { className: 'countdown--tile' })}</span>
        </a>
      </li>
      <li>
        <a class="hero-tile" href="#/products?limited=1&sort=stock" data-promotion="limited">
          <span class="hero-tile__label en">LIMITED STOCK</span>
          <span class="hero-tile__title">今回の放出分かぎり</span>
          <span class="hero-tile__value">${stats.limitedMinStock ? html`残り<strong class="num">${stats.limitedMinStock}</strong>台から` : '入荷待ち'}</span>
        </a>
      </li>
      <li>
        <a class="hero-tile" href="#/products?sale=secret" data-promotion="secret">
          <span class="hero-tile__label en">SECRET PRICE</span>
          <span class="hero-tile__title">タップで開く会員価格</span>
          <span class="hero-tile__value"><strong class="num">${stats.secretCount}</strong>点 ${Icon('lock')}</span>
        </a>
      </li>
      <li>
        <a class="hero-tile" href="#/products?sale=weekend" data-promotion="weekend">
          <span class="hero-tile__label en">WEEKEND SALE</span>
          <span class="hero-tile__title">毎週土日の価格</span>
          <span class="hero-tile__value">${weekend.isActive
            ? Countdown(weekend.endsAt, { className: 'countdown--tile' })
            : html`${monthDay(weekend.startsAt)} 0:00 START`}</span>
        </a>
      </li>
    </ul>`;
}

// 手持ちのバッテリーを登録している会員には自分向けの入口を、まだ答えていない会員にはその場で1タップの質問を出す。
// 回答は home.js の mount が受け取る
function BatteryEntry() {
  const ownedName = ownedBatteryName();
  if (ownedName) {
    const count = shelves.ownedBatteryModels().length;
    if (!count) return '';
    return html`<a class="hero__owned" href="#${withQuery('/products', { owned: '1', status: PREVIOUS_LIFECYCLES })}" data-promotion="owned">${Icon('battery')}あなたの${ownedName}で動く前モデル <strong class="num">${count}</strong>点${Icon('arrow')}</a>`;
  }
  // 「他メーカーの電池」「使っていない」と答えた会員には、電池を選ばない道具への入口を出す
  if (hasAnsweredBattery()) {
    const count = shelves.batteryFree().length;
    return count ? html`<a class="hero__owned" href="#/products?nobattery=1" data-promotion="battery-free">${Icon('box')}電池のいらない道具 <strong class="num">${count}</strong>点${Icon('arrow')}</a>` : '';
  }
  return html`
    <div class="hero-battery" role="group" aria-labelledby="hero-battery-label">
      <p class="hero-battery__label" id="hero-battery-label">${Icon('battery')}お使いのバッテリーは？ 選ぶと、手持ちで動く道具に印が付きます</p>
      <div class="hero-battery__choices">
        ${BATTERY_PLATFORMS.map((platform) => html`<button class="hero-battery__choice" type="button" data-set-battery="${platform.id}">${platform.name}</button>`)}
        <button class="hero-battery__choice" type="button" data-set-battery="other">他メーカーの電池</button>
        <button class="hero-battery__choice" type="button" data-set-battery="">使っていない</button>
      </div>
    </div>`;
}

// 右の絵：会員に合うSALE対象（期間外は前モデル）。説明の価格がSALEの価格と食い違わないよう、
// その日に TIME SALE などの別の価格が付いていない商品を先に選ぶ
function featuredProduct(isSale, answeredWithout) {
  const pool = (isSale ? seasonalSaleProductIds().map(productById) : shelves.previousModels()).filter((product) => isPurchasable(product) && !isPriceHidden(product));
  const fits = answeredWithout ? (product) => product.support.battery.status === 'na' : runsOnOwnedBattery;
  const plain = (product) => (isSale ? getPricing(product).sale?.kind === 'seasonal' : !getPricing(product).sale);
  return pool.find((product) => fits(product) && plain(product)) ?? pool.find(plain) ?? pool[0] ?? shelves.popular()[0];
}

export function SaleBanner() {
  const campaign = getHeroCampaign();
  const next = getNextSeasonal();
  const stats = campaignStats();
  const isSale = Boolean(campaign.endsAt);
  const summary = isSale ? stats.seasonal : stats.overall;
  const batteryName = ownedBatteryName();
  const answeredWithout = !batteryName && hasAnsweredBattery();
  const featured = featuredProduct(isSale, answeredWithout);
  const featuredPricing = getPricing(featured);
  return html`
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero__inner container">
        <div class="hero__text">
          <p class="hero__eyebrow"><span class="en">${campaign.title}</span>${isSale ? html`<span>${campaign.name}　${dot(campaign.startsAt)} — ${dot(campaign.endsAt)}</span>` : html`<span>いつでも会員価格</span>`}</p>
          <h1 class="hero__title" id="hero-title">${campaignLead(campaign, { batteryName, answeredWithout })}</h1>
          ${summary.minPrice ? html`<p class="hero__sub">${isSale ? `対象${summary.count}点` : '会員価格'}<span class="num">${yen(summary.minPrice)}</span>〜</p>` : ''}
          ${isSale ? html`<p class="hero__countdown"><span class="hero__countdown-label">SALE終了まで</span>${Countdown(campaign.endsAt)}</p>` : ''}
          <div class="hero__actions">
            <a class="btn btn--primary btn--lg" href="#/products?sale=${isSale ? 'seasonal' : 'any'}" data-promotion="seasonal">${isSale ? 'SALE会場へ' : '開催中のSALEを見る'}${Icon('arrow')}</a>
            ${BatteryEntry()}
          </div>
          ${next ? html`<p class="hero__next"><span class="en">NEXT</span>${next.name}　${dot(next.startsAt)} START</p>` : ''}
          ${summary.maxRate > 0 ? html`<p class="hero__note">${isSale ? `${campaign.name}の対象` : '掲載商品'}のうち最大${summary.maxRate}%OFF（${summary.maxRateCount}点）。割引率は${referenceNote(summary.includesLaunch)}との比較です。</p>` : ''}
        </div>
        <div class="hero__visual" aria-hidden="true">
          <svg class="hero__gate" viewBox="0 0 400 400"><path d="M40 400V40h320v360" fill="none" stroke="currentColor" stroke-width="2"/><path d="M120 400V120h160v280" fill="none" stroke="currentColor" stroke-width="2"/></svg>
          <div class="hero__art">${ProductArt(featured)}</div>
          <p class="hero__art-caption"><span class="en">${featured.model}</span>${priceLabel(featuredPricing)} ${yen(featuredPricing.final)}</p>
        </div>
      </div>
      <div class="container">${SaleTiles(stats)}</div>
    </section>`;
}
