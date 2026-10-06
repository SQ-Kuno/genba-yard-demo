// 注文・見積・請求書の組み立て。注文は3つの出どころを同じ形にそろえて扱う:
//   ・デモ会員の過去の注文（data/history.js の SEED_ORDERS。日付は「何日前」）
//   ・ほかの会員の過去の注文（SEED_MEMBER_ORDERS。管理画面の一覧・分析用）
//   ・このデモで確定した注文（lib/store.js。会員ごとに保存）
// その上に、管理画面での運用（状態・発送・入金確認・キャンセル・履歴。lib/market.js の orderOps）を重ねる。
// 購入者のマイページと管理画面は、どちらもここの関数で同じ注文を見る。
import { SEED_ORDERS, SEED_QUOTES, SEED_MEMBERS, SEED_MEMBER_ORDERS } from '../data/history.js';
import { SEED_PRODUCTS, SEED_LISTINGS } from '../data/products.js';
import { DEMO_ACCOUNTS, paymentById } from '../data/members.js';
import { brandById } from '../data/brands.js';
import { allPlacedOrders, placedOrdersOf, getSavedQuotes } from './store.js';
import { getOrderOps, productById, sellerById } from './market.js';
import { shippingFee } from './pricing.js';
import { daysAgo } from './format.js';

// 注文の状態。flow は通常の流れ、closed はキャンセル・返品・返金（流れから外れる）
export const ORDER_STATUSES = {
  received: { label: '注文受付', tone: 'blue', flow: 0 },
  preparing: { label: '発送準備中', tone: 'warn', flow: 1 },
  shipped: { label: '発送済', tone: 'ok', flow: 2 },
  delivered: { label: '配送完了', tone: 'ok', flow: 3 },
  completed: { label: '完了', tone: 'neutral', flow: 4 },
  cancelled: { label: 'キャンセル', tone: 'ng', closed: true },
  returned: { label: '返品受付', tone: 'ng', closed: true },
  refunded: { label: '返金済み', tone: 'ng', closed: true },
};

// 運営者が次に選べる状態。「発送準備中」は発送依頼の記録から、「発送済」は発送の登録（配送会社・追跡番号）からだけ進める
export const NEXT_STATUSES = {
  received: ['cancelled'],
  preparing: ['cancelled'],
  shipped: ['delivered', 'returned'],
  delivered: ['completed', 'returned'],
  completed: ['returned'],
  returned: ['refunded'],
  cancelled: ['refunded'],
  refunded: [],
};

// 状態の表示名。請求書払いの返品は、返金ではなく請求で精算する（「請求で差し引き」）
export const statusLabel = (order) => (order.status === 'refunded' && order.settlement === 'credit'
  ? '返品・請求で差し引き'
  : Object.hasOwn(ORDER_STATUSES, order.status) ? ORDER_STATUSES[order.status].label : order.status);

const atTen = (date) => {
  const copy = new Date(date);
  copy.setHours(10, 12, 0, 0);
  return copy;
};

const SEED_PRODUCT_MAP = new Map(SEED_PRODUCTS.map((product) => [product.id, product]));

// 表示用の項目（品名・型番など）は、確定時に記録していない古い形式に限り、いまの商品から補う
function displayOf(item) {
  const product = productById(item.productId);
  return {
    model: item.model ?? product?.model ?? item.productId,
    name: item.name ?? product?.name ?? '',
    maker: item.maker ?? (product ? brandById(product.brandId)?.name ?? product.maker : ''),
    jan: item.jan ?? product?.jan ?? '',
  };
}

// このデモで確定した注文の行。帰属（出品元・発送者・カテゴリー・比較元）は確定時の記録を使う
// （確定時の記録がない管理画面より前の形式だけ、いまの商品から補う）
function placedLineOf(item) {
  const product = productById(item.productId);
  return {
    ...item,
    ...displayOf(item),
    referencePrice: item.referencePrice ?? product?.referencePrice ?? null,
    referencePriceType: item.referencePriceType ?? product?.referencePriceType ?? null,
    saleKind: item.saleKind ?? null,
    sellerId: item.sellerId ?? product?.sellerId ?? null,
    merchantId: item.merchantId ?? product?.merchantId ?? null,
    fulfillerId: item.fulfillerId ?? product?.fulfillerId ?? null,
    categoryId: item.categoryId ?? product?.categoryId ?? null,
  };
}

// 初期データの注文の行。帰属は初期データ（変わらない）から引く。管理画面で商品の出品元を変えても過去の注文は動かない
function seedLineOf(item) {
  const seed = SEED_PRODUCT_MAP.get(item.productId);
  const sellerId = SEED_LISTINGS[item.productId]?.sellerId ?? null;
  return {
    ...item,
    ...displayOf({ ...item, model: item.model ?? seed?.model, name: item.name ?? seed?.name }),
    referencePrice: seed?.referencePrice ?? null,
    referencePriceType: seed?.referencePriceType ?? null,
    saleKind: item.saleKind ?? null,
    sellerId,
    merchantId: sellerId,
    fulfillerId: sellerId,
    categoryId: seed?.categoryId ?? null,
  };
}

// 注文に含まれる発送者（出品者発送なので、発送者ごとに別々に届く）
export const fulfillerIds = (order) => [...new Set(order.items.map((item) => item.fulfillerId).filter(Boolean))];
// キャンセルしていない発送者（発送の状況・「発送済」への切り替えはこちらで数える）
export const activeFulfillerIds = (order) => fulfillerIds(order).filter((id) => !order.cancelledParts?.[id]);

const buyerOfAccount = (account) => ({
  id: account.id,
  memberNo: account.memberNo,
  company: account.company,
  name: account.name,
  trade: account.trade,
  plan: account.contract.plan,
  email: account.loginId,
  tel: account.corporate.tel,
});

const buyerOfMember = (member) => ({ id: member.id, memberNo: member.memberNo, company: member.company, name: member.name, trade: member.trade, plan: member.plan, email: '', tel: member.address.tel });

function fromSeed(seed, buyer, address, now) {
  const placedAt = seed.hoursAgo != null ? new Date(now.getTime() - seed.hoursAgo * 3600000) : atTen(daysAgo(seed.daysAgo, now));
  const items = seed.items.map(seedLineOf);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const shipping = shippingFee(subtotal);
  const deliveryDate = new Date(placedAt);
  deliveryDate.setDate(deliveryDate.getDate() + 1);
  const shipments = {};
  if (seed.shipment) {
    const { carrier, trackingNo, shippedDaysAgo, deliveredDaysAgo } = seed.shipment;
    fulfillerIds({ items }).forEach((id) => {
      shipments[id] = {
        carrier,
        trackingNo,
        shippedAt: atTen(daysAgo(shippedDaysAgo, now)).toISOString(),
        deliveredAt: deliveredDaysAgo != null ? atTen(daysAgo(deliveredDaysAgo, now)).toISOString() : null,
      };
    });
  }
  return {
    id: seed.id,
    placedAt: placedAt.toISOString(),
    items,
    subtotal,
    shipping,
    total: subtotal + shipping,
    paymentId: seed.paymentId,
    paid: seed.paid ?? true,
    address,
    deliveryDate: deliveryDate.toISOString(),
    via: 'cart',
    status: seed.status ?? 'completed',
    shipments,
    cancelReason: seed.cancelReason ?? null,
    history: [],
    requests: [],
    origin: 'seed',
    accountId: buyer.id,
    buyer,
  };
}

function fromPlaced(order, account) {
  return {
    ...order,
    items: order.items.map(placedLineOf),
    status: order.cancelled ? 'cancelled' : 'received',
    shipments: {},
    history: [],
    requests: [],
    origin: 'placed',
    accountId: account.id,
    buyer: buyerOfAccount(account),
  };
}

// 管理画面での運用を重ねる。キャンセルした発送元の行には cancelled を付け、その分の金額を cancelledAmount に持つ
function withOps(order) {
  const ops = getOrderOps(order.id);
  const cancelledParts = ops?.cancelledParts ?? {};
  const items = order.items.map((item) => (cancelledParts[item.fulfillerId] ? { ...item, cancelled: true } : item));
  const partial = items.filter((item) => item.cancelled).reduce((sum, item) => sum + item.price * item.qty, 0);
  return {
    ...order,
    items,
    status: Object.hasOwn(ORDER_STATUSES, ops?.status ?? '') ? ops.status : order.status,
    paid: ops?.paid ?? order.paid,
    shipments: { ...order.shipments, ...ops?.shipments },
    history: [...order.history, ...(ops?.history ?? [])],
    cancelReason: ops?.cancelReason ?? order.cancelReason ?? null,
    cancelledAt: ops?.cancelledAt ?? null,
    cancelledParts,
    cancelledAmount: partial,
    settlement: ops?.settlement ?? null,
    requests: ops?.requests ?? order.requests,
    version: ops?.version ?? 0,
  };
}

const byNewest = (a, b) => new Date(b.placedAt) - new Date(a.placedAt);
const accountOf = (id) => DEMO_ACCOUNTS.find((account) => account.id === id);

// 会員本人の注文（マイページ）
export function getOrders(account, now = new Date()) {
  const seeds = (SEED_ORDERS[account.id] ?? []).map((seed) => fromSeed(seed, buyerOfAccount(account), account.addresses.find((address) => address.id === seed.addressId), now));
  const placed = placedOrdersOf(account.id).map((order) => fromPlaced(order, account));
  return [...placed, ...seeds].map(withOps).sort(byNewest);
}

export const findOrder = (account, id) => getOrders(account).find((order) => order.id === id);

// すべての会員の注文（管理画面）
export function getAllOrders(now = new Date()) {
  const demoSeeds = DEMO_ACCOUNTS.flatMap((account) => (SEED_ORDERS[account.id] ?? [])
    .map((seed) => fromSeed(seed, buyerOfAccount(account), account.addresses.find((address) => address.id === seed.addressId), now)));
  const memberSeeds = SEED_MEMBER_ORDERS.map((seed) => {
    const member = SEED_MEMBERS.find((item) => item.id === seed.memberId);
    return fromSeed(seed, buyerOfMember(member), member.address, now);
  });
  const placed = allPlacedOrders().map((order) => fromPlaced(order, accountOf(order.accountId)));
  return [...placed, ...demoSeeds, ...memberSeeds].map(withOps).sort(byNewest);
}

export const orderById = (id) => getAllOrders().find((order) => order.id === id) ?? null;

// 注文・見積の番号（例：GY-123456）。時刻の下6桁を使い、すでにある番号と重なったら1つずつずらす
export function newNumber(prefix, takenIds, now = new Date()) {
  const format = (n) => `${prefix}-${String(n).padStart(6, '0')}`;
  let n = Number(String(now.getTime()).slice(-6));
  while (takenIds.has(format(n))) n = (n + 1) % 1000000;
  return format(n);
}

// 納品書（請求書払い）・領収書（それ以外）
export const documentLabel = (order) => (order.paymentId === 'invoice' ? '納品書' : '領収書');

// ---- 支払い ----

const monthIndex = (date) => date.getFullYear() * 12 + date.getMonth();

// 請求書払いの月の状況（月末締め・翌月末払い）。今月＝締め前、先月＝請求済み（入金待ち）、それより前＝入金済み
function invoiceMonthState(placedAt, now) {
  const diff = monthIndex(now) - monthIndex(new Date(placedAt));
  if (diff <= 0) return 'open';
  return diff === 1 ? 'billed' : 'paid';
}

// 支払いの状況（注文の状態とは別の軸）。order.paid は「発送してよいか」
// （前払いは入金を確認済み・カードは決済済み・請求書払いは確定時に与信済み）。received は「代金を受け取っているか」
export function paymentState(order, now = new Date()) {
  if (order.paymentId === 'invoice') {
    const month = invoiceMonthState(order.placedAt, now);
    if (month === 'paid') return { key: 'invoice-paid', label: '請求書払い・入金済み', tone: 'ok', received: true };
    if (month === 'billed') return { key: 'invoice-billed', label: '請求書払い・請求済み（入金待ち）', tone: 'blue', received: false };
    return { key: 'invoice-open', label: '請求書払い・月末締め前（未請求）', tone: 'neutral', received: false };
  }
  if (!order.paid) return { key: 'awaiting', label: paymentById(order.paymentId)?.waitingLabel ?? '支払い待ち', tone: 'signal', received: false };
  return { key: 'paid', label: order.paymentId === 'card' ? 'カード決済済み' : '入金済み', tone: 'ok', received: true };
}

const BUYER_STEPS = ['注文受付', '発送準備中', '発送済', '配送完了'];

// 購入者に見せる注文の状況。前払い（銀行振込・PayPay）は入金を確認するまで「入金待ち」
export function orderStatus(order) {
  const status = ORDER_STATUSES[order.status] ?? ORDER_STATUSES.received;
  if (status.closed) return { step: 0, label: statusLabel(order), steps: [statusLabel(order)], paid: order.paid, closed: true };
  if (!order.paid) {
    const label = paymentById(order.paymentId).waitingLabel;
    return { step: 0, label, steps: [label, ...BUYER_STEPS.slice(1)], paid: false, closed: false };
  }
  const step = Math.min(3, status.flow);
  return { step, label: BUYER_STEPS[step], steps: BUYER_STEPS, paid: true, closed: false };
}

// いまの支払い額（発送元の分をキャンセルした金額を除く）。マイページ・帳票・管理画面の一覧で同じ値を出す
export const payableAmount = (order) => order.total - (order.cancelledAmount ?? 0);

// 領収書を出せるか（代金を受け取っていて、キャンセル・返金していない注文だけ）
export const receiptAvailable = (order) => order.paymentId !== 'invoice' && order.paid && !['cancelled', 'refunded'].includes(order.status);

// 発送の状況（管理画面の一覧）。出品元ごとに発送するので「一部発送」がありうる。キャンセルした発送元は数えない
export function shippingStatus(order) {
  const ids = activeFulfillerIds(order);
  const shipped = ids.filter((id) => order.shipments[id]?.shippedAt);
  const delivered = ids.filter((id) => order.shipments[id]?.deliveredAt);
  if (!shipped.length) return ORDER_STATUSES[order.status]?.closed ? { key: 'none', label: '—' } : { key: 'unshipped', label: '未発送' };
  if (shipped.length < ids.length) return { key: 'partial', label: `一部発送（${shipped.length}/${ids.length}）` };
  if (delivered.length === ids.length) return { key: 'delivered', label: '配送完了' };
  return { key: 'shipped', label: '発送済' };
}

// 売上に数える注文か（キャンセル・返金は数えない。返品受付は返金までは数える）。行の単位では item.cancelled も見る
export const countsAsSale = (order) => !['cancelled', 'refunded'].includes(order.status);
export const saleLines = (order) => (countsAsSale(order) ? order.items.filter((item) => !item.cancelled) : []);

// ---- 見積・請求書 ----

// 回答済み（担当者が回答）・発行済み（カートから作成）で有効期限内の見積だけ、見積から注文できる
export const isQuoteOrderable = (quote, now = new Date()) => ['回答済み', '発行済み'].includes(quote.status) && new Date(quote.validUntil) >= now;

// カートから作った見積（保存分）と、担当者が回答した見積（シード）。注文に使った見積は「注文済み」にする
export function getQuotes(account, now = new Date()) {
  const ordered = new Set(placedOrdersOf(account.id).map((order) => order.quoteId).filter(Boolean));
  const seeds = (SEED_QUOTES[account.id] ?? []).map((quote) => {
    const createdAt = atTen(daysAgo(quote.daysAgo));
    const validUntil = new Date(createdAt);
    validUntil.setDate(validUntil.getDate() + quote.validDays);
    return {
      ...quote,
      createdAt: createdAt.toISOString(),
      validUntil: validUntil.toISOString(),
      total: quote.items.reduce((sum, item) => sum + item.price * item.qty, 0),
    };
  });
  return [...getSavedQuotes(account.id), ...seeds].map((quote) => {
    if (ordered.has(quote.id)) return { ...quote, status: '注文済み' };
    if (quote.status === '発行済み' && new Date(quote.validUntil) < now) return { ...quote, status: '期限切れ' };
    return quote;
  });
}

const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const endOfMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

// 注文を閉じた（キャンセル・返金した）日時。履歴が無い初期データは、注文した月のうちに閉じたものとして扱う
function closedAtOf(order) {
  if (!ORDER_STATUSES[order.status]?.closed || order.status === 'returned') return null;
  const entry = [...order.history].reverse().find((item) => ['cancelled', 'refunded'].includes(item.to));
  return entry ? new Date(entry.at) : new Date(order.placedAt);
}

// 請求書払いの注文を月ごとに締める（月末締め・翌月末払い）。締めた月の請求書は後から変えない:
//  ・締める前に閉じた注文・キャンセルした発送元の分は、その月の請求に載せない
//  ・締めた後に閉じた注文・キャンセルした発送元の分は、締めた月の請求に残し、閉じた月の請求で差し引く（deductions）
// orders は { order, items（その月に請求した行）, amount }、deductions は { order, amount, label }
export function getInvoices(account, now = new Date()) {
  const byMonth = new Map();
  const entryOf = (date) => {
    const key = monthKey(date);
    const entry = byMonth.get(key) ?? { month: key, orders: [], deductions: [], total: 0 };
    byMonth.set(key, entry);
    return entry;
  };
  const lineAmount = (items) => items.reduce((sum, item) => sum + item.price * item.qty, 0);
  getOrders(account, now)
    .filter((order) => order.paymentId === 'invoice')
    .forEach((order) => {
      const placed = new Date(order.placedAt);
      const closing = endOfMonth(placed);
      const closedAt = closedAtOf(order);
      if (closedAt && closedAt <= closing) return; // 締める前に閉じた注文は請求しない
      const partAt = (item) => (item.cancelled ? new Date(order.cancelledParts[item.fulfillerId]?.at ?? order.placedAt) : null);
      const billed = order.items.filter((item) => !partAt(item) || partAt(item) > closing);
      const amount = order.total - lineAmount(order.items.filter((item) => !billed.includes(item)));
      const entry = entryOf(placed);
      entry.orders.push({ order, items: billed, amount });
      entry.total += amount;
      const credit = (date, value, label) => {
        const target = entryOf(date);
        target.deductions.push({ order, amount: value, label });
        target.total -= value;
      };
      // 締めた後に発送元の分をキャンセル：その分を、キャンセルした月に差し引く
      let remaining = amount;
      const later = Object.entries(order.cancelledParts).filter(([, part]) => new Date(part.at) > closing);
      later.forEach(([fulfillerId, part]) => {
        const value = lineAmount(order.items.filter((item) => item.fulfillerId === fulfillerId));
        remaining -= value;
        credit(new Date(part.at), value, `${sellerById(fulfillerId)?.name ?? fulfillerId}の分のキャンセルによる差し引き`);
      });
      // 締めた後に注文を閉じた（キャンセル・返品）：残りの額を、閉じた月に差し引く
      if (closedAt) credit(closedAt, remaining, order.status === 'cancelled' ? 'キャンセルによる差し引き' : '返品による差し引き');
    });
  const thisMonth = monthIndex(now);
  return [...byMonth.values()]
    .sort((a, b) => b.month.localeCompare(a.month))
    .map((entry) => {
      const [year, month] = entry.month.split('-').map(Number);
      const index = year * 12 + (month - 1);
      const due = new Date(year, month + 1, 0); // 翌月末
      let status = '支払済み';
      if (index === thisMonth) status = '締め前（今月分）';
      else if (index === thisMonth - 1) status = '未払い';
      return { ...entry, year, monthNumber: month, due, status };
    });
}
