// 商品の検索・絞り込み・並べ替え。条件はURLのクエリと1対1で対応させ、共有やブラウザの戻るで再現できるようにする
import { productById, listedProducts } from './market.js';
import { SITE } from '../config/site.js';
import { brandById } from '../data/brands.js';
import { categoryById, LIFECYCLES } from '../data/categories.js';
import { getActiveSale, getActiveSeasonal, timeSaleProductIds, weekendSaleProductIds, seasonalSaleProductIds } from './campaigns.js';
import { getPricing, discountRate } from './pricing.js';
import { withQuery } from './router.js';
import { stockOf } from './store.js';
import { runsOnOwnedBattery, lowStockThreshold, isPurchasable } from './status.js';

export { productById };
// 購入者画面に出している商品（下書き・販売停止を除く）の件数
export const productCount = (key, value) => listedProducts().filter((product) => product[key] === value).length;

export const PREVIOUS_LIFECYCLES = ['previous', 'model-change'];
export const PREVIOUS_MODELS_HREF = `#${withQuery('/products', { status: PREVIOUS_LIFECYCLES })}`;
export const DISCONTINUED_LIFECYCLES = ['discontinued', 'sales-ended', 'out-of-print'];
// このマーケットならではの探し方「廃番・終売・絶版だけど、メーカーサポートは継続中」
export const DISCONTINUED_WITH_SUPPORT_HREF = `#${withQuery('/products', { status: DISCONTINUED_LIFECYCLES, support: '1' })}`;

export const SALE_FILTERS = [
  { id: 'any', label: '開催中のSALE' },
  { id: 'seasonal', label: '季節のSALE（期間限定）' },
  { id: 'timesale', label: '本日のTIME SALE' },
  { id: 'weekend', label: '週末限定SALE' },
  { id: 'secret', label: 'SECRET PRICE' },
];

export const PRICE_RANGES = [
  { id: 'u5k', label: '5,000円未満', min: 0, max: 4999 },
  { id: '5k-20k', label: '5,000〜20,000円', min: 5000, max: 20000 },
  { id: '20k-50k', label: '20,000〜50,000円', min: 20001, max: 50000 },
  { id: 'o50k', label: '50,000円以上', min: 50001, max: Infinity },
];

export const SORTS = [
  { id: 'recommended', label: 'おすすめ順' },
  { id: 'new', label: '新着順' },
  { id: 'rate', label: '割引率の高い順' },
  { id: 'price-asc', label: '価格の安い順' },
  { id: 'price-desc', label: '価格の高い順' },
  { id: 'stock', label: '残りの少ない順' },
];

export const releaseYears = () => [...new Set(listedProducts().filter((product) => product.releaseDate).map((product) => Number(product.releaseDate.slice(0, 4))))].sort();

const known = (value, list) => (list.some((item) => item.id === value) ? value : '');

// クエリ → 絞り込み条件。URL は手で書き換えられるので、知らない値は捨てる
export function readFilters(query) {
  const years = releaseYears();
  return {
    q: (query.get('q') ?? '').trim().slice(0, 100),
    categories: query.getAll('cat').filter(categoryById),
    brands: query.getAll('brand').filter(brandById),
    lifecycles: query.getAll('status').filter((value) => Object.hasOwn(LIFECYCLES, value) && LIFECYCLES[value].filterLabel),
    years: query.getAll('year').map(Number).filter((year) => years.includes(year)),
    price: known(query.get('price'), PRICE_RANGES),
    sale: known(query.get('sale'), SALE_FILTERS),
    inStock: query.get('stock') === '1',
    supportActive: query.get('support') === '1',
    batteryCompatible: query.get('battery') === '1',
    batteryFree: query.get('nobattery') === '1',
    ownedBattery: query.get('owned') === '1',
    limited: query.get('limited') === '1',
    sort: known(query.get('sort'), SORTS.filter((sort) => sort.id !== 'rate' || SITE.pricing.showRateAgainstLaunchMsrp)) || 'recommended',
  };
}

const normalize = (text) => text.normalize('NFKC').toLowerCase().replace(/[\s・\-ー]/g, '');

function searchableText(product) {
  const brand = brandById(product.brandId);
  return normalize([
    product.name,
    product.model,
    brand.name,
    brand.nameKana,
    categoryById(product.categoryId).name,
    LIFECYCLES[product.lifecycle].label,
    product.keywords.join(' '),
  ].join(' '));
}

// 「開催中のSALE」は今まさに期間限定価格が付いている商品だけ（SECRET PRICE は別の入口）
function matchesSale(product, sale) {
  if (sale === 'timesale') return timeSaleProductIds().includes(product.id);
  if (sale === 'weekend') return weekendSaleProductIds().includes(product.id);
  if (sale === 'secret') return Boolean(product.secretPrice);
  if (sale === 'seasonal') return seasonalSaleProductIds().includes(product.id);
  if (sale === 'any') return Boolean(getActiveSale(product.id));
  return true;
}

export function filterProducts(filters, products = listedProducts()) {
  const words = filters.q ? filters.q.split(/\s+/).map(normalize).filter(Boolean) : [];
  const range = PRICE_RANGES.find((item) => item.id === filters.price);

  return products.filter((product) => {
    const text = searchableText(product);
    const price = getPricing(product).final;
    return (
      words.every((word) => text.includes(word)) &&
      (!filters.categories.length || filters.categories.includes(product.categoryId)) &&
      (!filters.brands.length || filters.brands.includes(product.brandId)) &&
      (!filters.lifecycles.length || filters.lifecycles.includes(product.lifecycle)) &&
      (!filters.years.length || (product.releaseDate && filters.years.includes(Number(product.releaseDate.slice(0, 4))))) &&
      (!range || (price >= range.min && price <= range.max)) &&
      matchesSale(product, filters.sale) &&
      (!filters.inStock || isPurchasable(product)) &&
      (!filters.supportActive || product.support.maker === 'active') &&
      (!filters.batteryCompatible || product.support.battery.status === 'compatible') &&
      (!filters.batteryFree || product.support.battery.status === 'na') &&
      (!filters.ownedBattery || runsOnOwnedBattery(product)) &&
      (!filters.limited || product.tags.includes('limited') || stockOf(product) <= lowStockThreshold())
    );
  });
}

export function sortProducts(products, sort) {
  const list = [...products];
  // 完売・販売終了・販売開始前は末尾に
  const soldOutLast = (a, b) => Number(!isPurchasable(a)) - Number(!isPurchasable(b));
  const comparators = {
    recommended: (a, b) => b.popularity - a.popularity,
    new: (a, b) => a.listedDaysAgo - b.listedDaysAgo,
    rate: (a, b) => getPricing(b).rate - getPricing(a).rate,
    'price-asc': (a, b) => getPricing(a).final - getPricing(b).final,
    'price-desc': (a, b) => getPricing(b).final - getPricing(a).final,
    stock: (a, b) => stockOf(a) - stockOf(b),
  };
  return list.sort((a, b) => soldOutLast(a, b) || (comparators[sort] ?? comparators.recommended)(a, b));
}

// トップページの各棚
export const shelves = {
  timeSale: () => timeSaleProductIds().map(productById).filter(isPurchasable),
  ownedBatteryModels: () => listedProducts().filter((product) => runsOnOwnedBattery(product) && PREVIOUS_LIFECYCLES.includes(product.lifecycle) && isPurchasable(product)),
  limited: () => listedProducts().filter((product) => product.tags.includes('limited') && isPurchasable(product))
    .sort((a, b) => stockOf(a) - stockOf(b)),
  newArrivals: () => listedProducts().sort((a, b) => a.listedDaysAgo - b.listedDaysAgo).slice(0, 8),
  // 手持ちのバッテリーで動くものを先に並べる
  previousModels: () => listedProducts().filter((product) => PREVIOUS_LIFECYCLES.includes(product.lifecycle))
    .sort((a, b) => Number(runsOnOwnedBattery(b)) - Number(runsOnOwnedBattery(a))),
  discontinued: () => listedProducts().filter((product) => DISCONTINUED_LIFECYCLES.includes(product.lifecycle)),
  // 乾電池式・手工具など、充電式バッテリーを使わない道具（他メーカーの電池を使う会員の入口）
  batteryFree: () => listedProducts().filter((product) => product.support.battery.status === 'na' && isPurchasable(product)),
  popular: () => listedProducts().filter((product) => isPurchasable(product)).sort((a, b) => b.popularity - a.popularity).slice(0, 4),
  recommendedFor: (account) => listedProducts()
    .filter((product) => account.favoriteCategoryIds.includes(product.categoryId) && isPurchasable(product))
    .sort((a, b) => b.popularity - a.popularity),
};

// キャンペーン訴求に出す数字。見出しは「対象◯点・¥◯〜」の金額で、「最大◯%OFF」は注記の大きさで添える。
// 割引率は実際の価格から計算し、比較元を出してよい商品（showRate）だけで数える。priceOf で価格の種類を絞れる
function rateSummary(products, now, priceOf = (product) => getPricing(product, now).final) {
  const rated = products.filter((product) => getPricing(product, now).showRate);
  const rates = rated.map((product) => discountRate(product.referencePrice, priceOf(product)));
  const maxRate = rates.length ? Math.max(...rates) : 0;
  return {
    count: products.length,
    minPrice: products.length ? Math.min(...products.map((product) => priceOf(product))) : null,
    maxRate,
    maxRateCount: rates.filter((rate) => rate === maxRate).length,
    includesLaunch: rated.some((product, index) => rates[index] === maxRate && product.referencePriceType === 'msrp-at-launch'),
  };
}

export function campaignStats(now = new Date()) {
  const available = listedProducts().filter((product) => isPurchasable(product));
  const seasonal = available.filter((product) => seasonalSaleProductIds(now).includes(product.id));
  const seasonalPrices = getActiveSeasonal(now)?.items ?? {};
  const limited = shelves.limited();
  return {
    itemCount: listedProducts().length,
    // 季節SALEの期間外は「会員価格 ¥◯〜」と出すので、TIME SALE などの価格ではなく会員価格で数える
    overall: rateSummary(available, now, (product) => product.memberPrice),
    // 季節SALEの数字は季節SALEの価格だけで出す（同じ日の TIME SALE 価格を混ぜない）
    seasonal: rateSummary(seasonal, now, (product) => seasonalPrices[product.id]),
    supportedDiscontinuedCount: listedProducts().filter((product) => DISCONTINUED_LIFECYCLES.includes(product.lifecycle) && product.support.maker === 'active').length,
    timeSaleCount: timeSaleProductIds(now).length,
    limitedMinStock: limited.length ? Math.min(...limited.map(stockOf)) : null,
    secretCount: listedProducts().filter((product) => product.secretPrice).length,
  };
}
