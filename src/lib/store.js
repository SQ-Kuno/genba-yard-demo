// モック用の状態保存。バックエンドの代わりに localStorage へ保存し、
// ブラウザを閉じてもカート・お気に入り・注文が残るようにする。
import { DEMO_ACCOUNTS, paymentById } from '../data/members.js';
import { PRODUCTS, saleState, isLineCancelled, registerReferencedProductIds, refreshMarket } from './market.js';
import { platformById } from '../data/batteries.js';
import { SITE } from '../config/site.js';

const STORAGE_KEY = 'genba-yard:v1';
const listeners = new Set();
let persistent = true;

// 売れた数は保存せず、確定した注文（キャンセル分を除く）から毎回数える。
// キャンセルは管理画面の運用データ（market の orderOps）に1回の保存で記録するので、在庫と注文の状態が食い違わない
const emptyState = () => ({
  session: null, // { accountId, loggedInAt }
  accounts: {}, // accountId → 会員ごとの可変データ
});

const productById = (id) => PRODUCTS.find((product) => product.id === id);
const isCount = (value) => Number.isInteger(value) && value > 0;
const list = (value) => (Array.isArray(value) ? value : []);
const isItem = (item) => Boolean(item) && productById(item.productId) && isCount(item.qty);
// 確定した注文の行は、商品が見つからなくても捨てない（確定時の品名・価格を持っているため）
const isOrderLine = (item) => Boolean(item) && typeof item.productId === 'string' && isCount(item.qty) && Number.isInteger(item.price) && item.price >= 0;

// 1契約で買える同一商品の数（今回の放出分の累計。数量限定品は少なめ）
export const orderLimitOf = (product) => (product.tags.includes('limited') ? SITE.orderLimit.limited : SITE.orderLimit.default);
const accountById = (id) => DEMO_ACCOUNTS.find((account) => account.id === id);

function seedAccountState(account) {
  return {
    cart: [],
    favorites: [...account.seed.favoriteIds],
    ownedBatteries: [...account.seed.ownedBatteries],
    batteryAnswered: account.seed.ownedBatteries.length > 0,
    savedPaymentIds: [...account.seed.savedPaymentIds],
    lastPaymentId: account.seed.lastPaymentId,
    lastAddressId: account.seed.lastAddressId,
    addedAddresses: [],
    orders: [],
    quotes: [], // カートから作った見積（見積履歴に出す）
    revealed: [],
    popupSeenAt: null,
  };
}

// 保存データは商品・会員データの差し替えや古い形式で食い違うことがある。
// 知らない会員・商品・支払方法・バッテリー規格の参照を落とし、足りない項目は初期値で補ってから使う
function sanitize(saved) {
  const state = { ...emptyState(), ...saved };
  if (state.session && !accountById(state.session.accountId)) state.session = null;
  const accounts = {};
  const dropped = {}; // 外した件数（データの差し替えで履歴が消えたときの手がかりとしてログに残す）
  Object.entries(state.accounts ?? {}).forEach(([id, data]) => {
    const account = accountById(id);
    if (!account) {
      dropped.accounts = (dropped.accounts ?? 0) + 1;
      return;
    }
    const merged = { ...seedAccountState(account), ...data };
    // 同じ商品の行は1行にまとめ、1契約の上限で丸める
    merged.cart = list(merged.cart).filter(isItem)
      .reduce((lines, line) => {
        const same = lines.find((item) => item.productId === line.productId);
        if (same) same.qty += line.qty;
        else lines.push({ ...line });
        return lines;
      }, [])
      .map((line) => ({ ...line, qty: Math.min(line.qty, orderLimitOf(productById(line.productId))) }));
    merged.favorites = list(merged.favorites).filter(productById);
    merged.revealed = list(merged.revealed).filter(productById);
    merged.ownedBatteries = list(merged.ownedBatteries).filter(platformById);
    merged.savedPaymentIds = list(merged.savedPaymentIds).filter(paymentById);
    merged.addedAddresses = list(merged.addedAddresses).filter((address) => typeof address?.id === 'string' && typeof address.postal === 'string');
    merged.quotes = list(merged.quotes)
      .filter((quote) => typeof quote?.id === 'string' && !Number.isNaN(Date.parse(quote.validUntil)))
      .map((quote) => ({ ...quote, items: list(quote.items).filter((item) => isItem(item) && isCount(item.price)) }))
      .filter((quote) => quote.items.length);
    if (!paymentById(merged.lastPaymentId)) merged.lastPaymentId = null;
    // 形の壊れた行・支払方法が分からない注文は捨てる。商品が見つからない行は残す（確定時の記録で表示する）
    merged.orders = list(merged.orders)
      .filter((order) => order && typeof order.id === 'string' && paymentById(order.paymentId) && typeof order.address?.postal === 'string' && !Number.isNaN(Date.parse(order.placedAt)))
      .map((order) => ({
        ...order,
        paid: order.paid ?? Boolean(paymentById(order.paymentId).paidOnConfirm), // 支払状況を持つ前の形式
        items: list(order.items).filter(isOrderLine),
      }))
      .filter((order) => order.items.length);
    ['cart', 'favorites', 'orders', 'quotes', 'addedAddresses'].forEach((key) => {
      const lost = list(data?.[key]).length - merged[key].length;
      if (lost > 0) dropped[key] = (dropped[key] ?? 0) + lost;
    });
    accounts[id] = merged;
  });
  if (Object.keys(dropped).length) console.warn('[store] 保存データの一部を外しました（商品・会員データの差し替えや古い形式のため）。', dropped);
  state.accounts = accounts;
  delete state.sold; // 売れた数を保存していた前の形式
  return state;
}

let lastText = null; // 最後に読んだ・保存した文字列（別のタブの変更を見分ける）

function load() {
  let text;
  try {
    text = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    persistent = false;
    console.warn('[store] localStorage が使えないため、状態はこのタブの中だけで保持します。', error);
    return emptyState();
  }
  return parse(text);
}

function parse(text) {
  lastText = text;
  if (!text) return emptyState();
  try {
    return sanitize(JSON.parse(text));
  } catch (error) {
    // 壊れた保存データは別のキーへ退避してから初期状態で始める（黙って消さない）
    const backupKey = `${STORAGE_KEY}:broken-${Date.now()}`;
    try {
      localStorage.setItem(backupKey, text);
    } catch {
      // 退避できなくても、画面が開けることを優先する
    }
    console.error(`[store] 保存データを読めなかったため、初期状態で始めます。元のデータは ${backupKey} に退避しました。`, error);
    return emptyState();
  }
}

let state = load();

// 保存に失敗したとき（容量不足など）。注文の確定ではこれを投げ、確定しない
export class StoreSaveError extends Error {}

function write(next) {
  if (!persistent) return;
  const text = JSON.stringify(next);
  try {
    localStorage.setItem(STORAGE_KEY, text);
  } catch (error) {
    throw new StoreSaveError('ブラウザの保存容量が足りないため保存できませんでした。', { cause: error });
  }
  lastText = text;
}

// 別のタブが保存した後、まだ読み直していなければ読み直す（注文の確定の直前に、最新の在庫・購入数で判定する）
function refreshStore() {
  if (!persistent) return;
  let text;
  try {
    text = localStorage.getItem(STORAGE_KEY);
  } catch {
    return;
  }
  if (text !== lastText) state = parse(text);
}

// カート・お気に入りなどの保存。失敗しても画面の操作は続け、次の操作でもう一度保存する
function save() {
  try {
    write(state);
  } catch (error) {
    console.warn('[store] 保存に失敗しました（次の操作でもう一度保存します）。', error);
  }
  listeners.forEach((listener) => listener(state));
}

// 失敗してはいけない変更（注文の確定）。複製に変更 → 保存 → 成功したときだけ差し替える
function commit(mutate) {
  const next = JSON.parse(JSON.stringify(state));
  const result = mutate(next);
  write(next);
  state = next;
  listeners.forEach((listener) => listener(state));
  return result;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// 別のタブ・ウィンドウで状態が変わったら読み直す（古い状態で上書きしないため）
export function onExternalChange(callback) {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    state = load();
    callback();
  });
}

// ---- 会員・セッション ----

function accountState(accountId = state.session?.accountId, target = state) {
  if (!accountId) throw new Error('ログインしていません');
  target.accounts[accountId] ??= seedAccountState(accountById(accountId));
  return target.accounts[accountId];
}

export const isLoggedIn = () => Boolean(state.session);

export const currentAccount = () => (state.session ? accountById(state.session.accountId) ?? null : null);

export function authenticate(loginId, password) {
  const id = loginId.trim().toLowerCase();
  return DEMO_ACCOUNTS.find(
    (account) => (account.loginId === id || account.memberNo.toLowerCase() === id) && account.password === password,
  ) ?? null;
}

export function login(account) {
  state.session = { accountId: account.id, loggedInAt: new Date().toISOString() };
  accountState(account.id);
  save();
}

export function logout() {
  state.session = null;
  save();
}

// ログインごとに1回だけキャンペーンを出す
export function shouldShowCampaignPopup() {
  return accountState().popupSeenAt !== state.session.loggedInAt;
}

export function markCampaignPopupSeen() {
  accountState().popupSeenAt = state.session.loggedInAt;
  save();
}

// ---- 在庫 ----

// 注文の行がキャンセル済みか（注文全体、または発送元の分。order.cancelled は管理画面より前の形式）
const lineCancelled = (order, item) => Boolean(order.cancelled)
  || isLineCancelled(order.id, item.fulfillerId ?? productById(item.productId)?.fulfillerId);

const activeLines = (orders) => orders.flatMap((order) => order.items.filter((item) => !lineCancelled(order, item)));

const sumQty = (lines, productId) => lines.reduce((sum, item) => sum + (item.productId === productId ? item.qty : 0), 0);

// このデモで売れた数（すべての会員の確定した注文から、キャンセル分を除いて数える）
export const soldOf = (productId) => sumQty(activeLines(Object.values(state.accounts).flatMap((account) => account.orders)), productId);

export function stockOf(product) {
  return Math.max(0, product.stock - soldOf(product.id));
}

// この会員がこのデモで買った数（担当者が回答した見積からの注文＝まとめ買いと、キャンセルした分は数えない）
export const purchasedQty = (productId) => sumQty(activeLines(accountState().orders.filter((order) => !order.limitExempt)), productId);

// カート・今すぐ購入で選べる数量の上限（在庫と、1契約の上限から購入済みを引いた数の小さい方）。
// 販売期間外・販売停止・販売終了の商品は 0（購入できない）
export const maxOrderQty = (product) => (saleState(product) === 'on-sale'
  ? Math.max(0, Math.min(stockOf(product), orderLimitOf(product) - purchasedQty(product.id)))
  : 0);

// ---- カート ----

export const getCart = () => accountState().cart;
// ヘッダーのカートの数。販売停止・在庫切れなどで買えなくなった分は数えない（カートを開くと外れる）
export const cartCount = () => (state.session ? getCart().reduce((sum, line) => sum + Math.min(line.qty, maxOrderQty(productById(line.productId))), 0) : 0);

// 在庫と1契約の上限を超える数量は入れない。今回の操作で実際に増えた数を返す（0 なら入らなかった）
export function addToCart(productId, qty = 1) {
  const account = accountState();
  const max = maxOrderQty(productById(productId));
  const line = account.cart.find((item) => item.productId === productId);
  const before = line?.qty ?? 0;
  const next = Math.min(max, before + qty);
  if (next <= 0) {
    account.cart = account.cart.filter((item) => item.productId !== productId);
  } else if (line) {
    line.qty = next;
  } else {
    account.cart.push({ productId, qty: next, addedAt: new Date().toISOString() });
  }
  save();
  return Math.max(0, next - before);
}

// 在庫が減ったとき・別のタブで購入したときにカートを合わせる（買えない行は外し、超える数は上限に）。変えた行を返す
export function syncCartWithStock() {
  const account = accountState();
  const changes = [];
  account.cart = account.cart.filter((line) => {
    const product = productById(line.productId);
    const max = maxOrderQty(product);
    if (line.qty <= max) return true;
    let reason = max < stockOf(product) ? 'limit' : 'stock';
    if (saleState(product) !== 'on-sale') reason = 'unavailable';
    changes.push({ productId: line.productId, from: line.qty, to: max, reason });
    line.qty = max;
    return max > 0;
  });
  if (changes.length) save();
  return changes;
}

// 在庫が0になった商品は行ごと外す
export function setCartQty(productId, qty) {
  const account = accountState();
  const line = account.cart.find((item) => item.productId === productId);
  if (!line) return;
  const max = maxOrderQty(productById(productId));
  if (max === 0) account.cart = account.cart.filter((item) => item !== line);
  else line.qty = Math.max(1, Math.min(max, qty));
  save();
}

export function removeFromCart(productId) {
  const account = accountState();
  account.cart = account.cart.filter((item) => item.productId !== productId);
  save();
}

// ---- お気に入り ----

export const getFavorites = () => accountState().favorites;
export const isFavorite = (productId) => getFavorites().includes(productId);

export function toggleFavorite(productId) {
  const account = accountState();
  const added = !account.favorites.includes(productId);
  account.favorites = added
    ? [productId, ...account.favorites]
    : account.favorites.filter((id) => id !== productId);
  save();
  return added;
}

// ---- SECRET PRICE ----

export const isRevealed = (productId) => accountState().revealed.includes(productId);

export function reveal(productId) {
  const account = accountState();
  if (!account.revealed.includes(productId)) account.revealed.push(productId);
  save();
}

// ---- 手持ちバッテリー ----

export const getOwnedBatteries = () => accountState().ownedBatteries;
// 「どちらも使っていない」と答えた会員には、もう聞かない
export const hasAnsweredBattery = () => accountState().batteryAnswered;

export function setOwnedBatteries(platformIds) {
  const account = accountState();
  account.ownedBatteries = [...platformIds];
  account.batteryAnswered = true;
  save();
}

// ---- 配送先・支払方法 ----

export function getAddresses() {
  return [...currentAccount().addresses, ...accountState().addedAddresses];
}

export function addAddress(address) {
  const id = `added-${Date.now()}`;
  accountState().addedAddresses.push({ ...address, id });
  save();
  return id;
}

export const getSavedPaymentIds = () => accountState().savedPaymentIds;

export const getCheckoutDefaults = () => {
  const account = accountState();
  return { paymentId: account.lastPaymentId, addressId: account.lastAddressId };
};

// 2回目以降の購入は「確認して確定するだけ」にできるかどうか
export function hasExpressCheckout() {
  const account = accountState();
  return Boolean(account.lastPaymentId && account.lastAddressId);
}

// ---- 注文 ----

export const getPlacedOrders = () => accountState().orders;
// 指定した会員の確定した注文（管理画面・マイページで会員を指定して引く）
export const placedOrdersOf = (accountId) => state.accounts[accountId]?.orders ?? [];

export const getSavedQuotes = (accountId = state.session?.accountId) => state.accounts[accountId]?.quotes ?? [];

export function saveQuote(quote) {
  accountState().quotes.unshift(quote);
  save();
}

// 注文を確定できなかった理由（画面で言い分けるため kind を持つ）
export class OrderRejectedError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // payment / qty / closed / short / limit / price
  }
}

// 支払方法・数量・販売状況・在庫・1契約の上限・単価を満たさない注文は確定しない（画面側の確認をすり抜けた場合の最後の砦）。
// priceOf(item) を渡すと、各行の単価がいまの価格と同じかも確かめる。保存できなければ StoreSaveError（確定しない）
export function placeOrder(order, { clearCart, priceOf = null }) {
  refreshStore();
  refreshMarket();
  const reject = (kind, message) => { throw new OrderRejectedError(kind, message); };
  if (!paymentById(order.paymentId)) reject('payment', `支払方法が不正です: ${order.paymentId}`);
  const invalid = order.items.find((item) => !isCount(item.qty));
  if (invalid) reject('qty', `数量が不正です: ${invalid.productId}`);
  // 同じ商品の行が複数あっても、商品ごとの合計で在庫と上限を判定する
  const qtyOf = (productId) => sumQty(order.items, productId);
  const closed = order.items.find((item) => !productById(item.productId) || saleState(productById(item.productId)) !== 'on-sale');
  if (closed) reject('closed', `販売期間外または販売停止中です: ${closed.productId}`);
  const short = order.items.find((item) => stockOf(productById(item.productId)) < qtyOf(item.productId));
  if (short) reject('short', `在庫が足りません: ${short.productId}`);
  // 担当者が回答した見積（まとめ買い）は数量を確認済みなので、1契約の上限をかけない
  const over = !order.limitExempt && order.items.find((item) => purchasedQty(item.productId) + qtyOf(item.productId) > orderLimitOf(productById(item.productId)));
  if (over) reject('limit', `1契約の上限を超えています: ${over.productId}`);
  const changed = priceOf && order.items.find((item) => priceOf(item) !== item.price);
  if (changed) reject('price', `価格が変わりました: ${changed.productId}`);
  commit((next) => {
    const account = accountState(state.session?.accountId, next);
    account.orders.unshift(order);
    if (clearCart) {
      const ordered = new Set(order.items.map((item) => item.productId));
      account.cart = account.cart.filter((line) => !ordered.has(line.productId));
    }
    account.lastPaymentId = order.paymentId;
    account.lastAddressId = order.address.id;
    if (!account.savedPaymentIds.includes(order.paymentId)) account.savedPaymentIds.push(order.paymentId);
  });
}

// ---- 管理画面から使う ----

// すべての会員がこのブラウザで確定した注文（会員IDつき）
export const allPlacedOrders = () => Object.entries(state.accounts)
  .flatMap(([accountId, account]) => account.orders.map((order) => ({ ...order, accountId })));

// 会員の注文に出てくる商品ID（運営データが消えても、同じIDを別の商品に使い回さないため）
registerReferencedProductIds(() => allPlacedOrders().flatMap((order) => order.items.map((item) => item.productId)));

// 会員・注文・カートを最初の状態に戻す（運営データ・計測ログと合わせて lib/demo.js の resetAll から呼ぶ）
export function resetStore() {
  state = emptyState();
  save();
}
