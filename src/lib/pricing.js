import { getActiveSale } from './campaigns.js';
import { SITE } from '../config/site.js';

// 割引率は切り捨て（表示が実際の割引を上回らないように）
export const discountRate = (reference, price) => Math.floor((1 - price / reference) * 100);

// 比較の基準は「同じ商品の価格」だけにする（後継機の価格とは比べない）。商品ごとに種類を持ち、画面にそのまま書く。
// 「参考価格」という呼び方は基準があいまいになるため使わない
export const REFERENCE_LABELS = {
  msrp: { label: 'メーカー希望小売価格', short: '希望小売価格', note: 'メーカーがカタログで公表している希望小売価格（税込換算）' },
  'msrp-at-launch': { label: '発売時のメーカー希望小売価格', short: '発売時希望小売価格', note: '発売時にメーカーがカタログで公表した希望小売価格（税込換算）' },
  'store-regular': { label: '当マーケットの通常価格', short: '通常価格', note: '当マーケットで通常販売している価格（税込）' },
  // 出品元から比較元の根拠をまだ受け取っていない。購入者画面には比較の価格も割引率も出さない
  unconfirmed: { label: '種類を確認中', short: '確認中', note: '' },
};

// 割引率を出してよい比較元か（発売時の価格・自店の通常価格は、専門家の確認までスイッチで止められる）
const RATE_ALLOWED = {
  msrp: () => true,
  'msrp-at-launch': () => SITE.pricing.showRateAgainstLaunchMsrp,
  'store-regular': () => SITE.pricing.showRateAgainstStoreRegular,
  unconfirmed: () => false,
};

export function getPricing(product, now = new Date()) {
  const sale = getActiveSale(product.id, now);
  const final = sale ? sale.price : product.memberPrice;
  const reference = REFERENCE_LABELS[product.referencePriceType] ?? REFERENCE_LABELS.unconfirmed;
  return {
    reference: product.referencePrice,
    referenceLabel: reference.label,
    referenceShort: reference.short,
    referenceNote: reference.note,
    member: product.memberPrice,
    sale,
    final,
    rate: discountRate(product.referencePrice, final),
    showRate: product.referencePrice > final && (RATE_ALLOWED[product.referencePriceType] ?? RATE_ALLOWED.unconfirmed)(),
  };
}

// 割引率・差額の注記。廃番・終売品の比較元は発売時の価格なので、含まれるときはそう書く
export const referenceNote = (includesLaunch) => (includesLaunch
  ? '各商品のメーカー希望小売価格（廃番・終売品は発売時の価格。税込換算）'
  : '各商品のメーカー希望小売価格（税込換算）');

// 価格の呼び名（「TIME SALE価格」「会員限定SALE価格」「会員価格」）
export const priceLabel = (pricing) => (pricing.sale ? `${pricing.sale.label}価格` : '会員価格');

export const shippingFee = (subtotal) => (subtotal === 0 || subtotal >= SITE.shipping.freeThreshold ? 0 : SITE.shipping.fee);

// 税込価格に含まれる消費税（10%）。領収書の記載用
export const includedTax = (amount) => Math.floor((amount * 10) / 110);

// 1行の単価。見積からの注文は、見積単価とその日の価格の安い方を使う（見積を出した後に SALE が始まっても損をさせない）
export const unitPriceOf = (line, now = new Date()) => {
  const current = getPricing(line.product, now).final;
  return line.unitPrice ? Math.min(line.unitPrice, current) : current;
};

// 希望小売価格との差（カートの集計・マイページの累計で共通）。比較元を出してよい商品（showRate）だけで数え、
// 発売時の価格が比較元に含まれるかも返す。items は { product, price, qty }
export function savingsOf(items, now = new Date()) {
  const compared = items.filter((item) => getPricing(item.product, now).showRate);
  return {
    savings: compared.reduce((sum, item) => sum + (item.product.referencePrice - item.price) * item.qty, 0),
    savingsIncludesLaunch: compared.some((item) => item.product.referencePriceType === 'msrp-at-launch'),
    savingsIncludesStore: compared.some((item) => item.product.referencePriceType === 'store-regular'),
    savingsPartial: compared.length < items.length, // 比較元を出さない商品を除いて数えた
  };
}

// 送料：標準送料（全国一律・一定額以上で無料）の商品と、個別送料の商品（大型品など。1行ごとに個別送料）を分けて数える
export function shippingFor(priced) {
  const standard = priced.filter((item) => item.product.shipping?.fee == null);
  const standardSubtotal = standard.reduce((sum, item) => sum + item.price * item.qty, 0);
  const individual = priced.reduce((sum, item) => sum + (item.product.shipping?.fee ?? 0), 0);
  return { shipping: shippingFee(standardSubtotal) + individual, standardSubtotal, individual };
}

export function summarize(lines, now = new Date()) {
  const priced = lines.map((line) => ({ product: line.product, qty: line.qty, price: unitPriceOf(line, now) }));
  const subtotal = priced.reduce((sum, item) => sum + item.price * item.qty, 0);
  const { shipping, standardSubtotal, individual } = shippingFor(priced);
  return {
    subtotal,
    shipping,
    total: subtotal + shipping,
    ...savingsOf(priced, now),
    standardSubtotal,
    individualShipping: individual,
    count: lines.reduce((sum, line) => sum + line.qty, 0),
  };
}
