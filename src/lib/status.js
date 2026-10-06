import { LIFECYCLES } from '../data/categories.js';
import { platformById } from '../data/batteries.js';
import { getActiveSale } from './campaigns.js';
import { stockOf, getOwnedBatteries, isRevealed } from './store.js';
import { getSettings, saleState } from './market.js';

// 「残りわずか」（購入者画面）・LOW STOCK（管理画面）の基準。管理画面の設定で変えられる
export const lowStockThreshold = () => getSettings().lowStockThreshold;

// 今この商品を購入できるか（販売中・販売期間内・在庫あり）
export const isPurchasable = (product, now = new Date()) => saleState(product, now) === 'on-sale' && stockOf(product) > 0;

// 購入できない理由の表示（販売開始前・販売終了・販売停止）
const CLOSED_BADGES = {
  scheduled: { key: 'scheduled', label: '販売開始前', tone: 'outline' },
  expired: { key: 'ended', label: '販売終了', tone: 'soldout' },
  ended: { key: 'ended', label: '販売終了', tone: 'soldout' },
  suspended: { key: 'suspended', label: '販売停止中', tone: 'soldout' },
};

// 商品のバッジ。詳細ではすべて、カードでは「期間限定・希少性・状態」の3種を1つずつに絞る
// （全商品が会員限定なので、カードに MEMBERS ONLY は出さない）
export function getBadges(product, { forCard = false, now = new Date() } = {}) {
  const stock = stockOf(product);
  const sale = getActiveSale(product.id, now);
  const offer = [];
  const closed = CLOSED_BADGES[saleState(product, now)];
  if (closed) offer.push(closed);
  else if (stock === 0) offer.push({ key: 'soldout', label: 'SOLD OUT', tone: 'soldout' });
  if (sale?.kind === 'timesale') offer.push({ key: 'timesale', label: 'TIME SALE', tone: 'navy', en: true });
  if (sale && sale.kind !== 'timesale') offer.push({ key: sale.kind, label: sale.label, tone: 'navy' });
  if (product.secretPrice) offer.push({ key: 'secret', label: 'SECRET PRICE', tone: 'secret', en: true });
  const scarcity = [];
  if (!closed && stock > 0 && stock <= lowStockThreshold()) scarcity.push({ key: 'low', label: '残りわずか', tone: 'signal' });
  else if (product.tags.includes('limited')) scarcity.push({ key: 'limited', label: '数量限定', tone: 'blue-outline' });
  const state = { key: product.lifecycle, label: LIFECYCLES[product.lifecycle].label, tone: 'outline' };
  if (forCard) return [offer[0], scarcity[0], state].filter(Boolean);
  const members = product.tags.includes('exclusive') ? [{ key: 'members', label: 'MEMBERS ONLY', tone: 'blue', en: true }] : [];
  return [...offer, ...scarcity, state, ...members];
}

// SECRET PRICE を会員がまだ開いていないか
export const isPriceHidden = (product) => Boolean(product.secretPrice) && !isRevealed(product.id);

// 手持ちのバッテリーをそのまま挿して動くか（アダプターが要るものは含めない）
export function runsOnOwnedBattery(product) {
  const { platform, status } = product.support.battery;
  return status === 'compatible' && Boolean(platform) && getOwnedBatteries().includes(platform);
}

// 見出しに差し込む手持ちのバッテリー名（複数あるときは最初の1つ。未登録なら null）
export function ownedBatteryName() {
  const owned = getOwnedBatteries();
  return owned.length ? platformById(owned[0]).shortName : null;
}
