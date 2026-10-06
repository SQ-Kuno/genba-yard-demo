// 運営データ（商品・出品元・注文の運用状況・在庫と価格の記録・設定）の読み書き。
// 画面（購入者向け・管理画面）は、ここの関数と PRODUCTS / SELLERS だけを使う。
// PoC ではブラウザの localStorage に保存している。本番でサーバー・DB に移すときは、このファイルの
// load / persist を API 呼び出しに置き換える（データの形と関数の名前はそのまま使える）。
//
// 商品は「コードに書いた初期データ」に「管理画面での変更・新規登録」を重ねて作る。
// 管理画面は変えた項目だけを保存するので、変えていない項目には初期データの修正が反映される。
import { SEED_PRODUCTS, SEED_LISTINGS, SEED_ADMIN_PRODUCTS } from '../data/products.js';
import { SEED_SELLERS } from '../data/sellers.js';
import { BRANDS } from '../data/brands.js';
import { LIFECYCLES } from '../data/categories.js';

const STORAGE_KEY = 'genba-yard:market:v1';
const DAY = 86400000;

// 出品元にまだ確かめていない項目の表示
export const UNKNOWN = '出品元に確認中';

export const DEFAULT_SETTINGS = {
  lowStockThreshold: 5, // この数以下で LOW STOCK（管理画面）・「残りわずか」（購入者画面）
  endingSoonDays: 14, // 販売終了まで、この日数以内なら「販売終了が近い商品」に出す
  csvDefaultStatus: 'draft', // CSV で一括登録した商品の最初の状態
};

// 設定の範囲（設定画面の検証と、保存データの読み込みで同じ定義を使う）
export const SETTING_RANGES = {
  lowStockThreshold: { min: 0, max: 999 },
  endingSoonDays: { min: 1, max: 365 },
};

// 商品の販売状況（管理画面で設定する）
export const SALE_STATUSES = {
  draft: { label: '下書き', tone: 'neutral', note: '購入者画面に出しません' },
  'on-sale': { label: '販売中', tone: 'ok', note: '販売期間内なら購入できます' },
  suspended: { label: '販売停止', tone: 'warn', note: '購入者画面から外し、購入を止めます' },
  ended: { label: '販売終了', tone: 'neutral', note: '購入者画面には「販売終了」と出し、購入できません' },
};

let persistent = true;
let loadProblem = null; // 保存データを読めなかったとき（管理画面に帯で知らせる）
let lastText = null; // 最後に読んだ・保存した文字列（別のタブの変更を見分ける）

const emptyState = () => ({
  products: {}, // 商品ID → 初期データへの変更、または新規登録の全項目
  sellers: {}, // 出品元ID → 初期データへの変更、または新規登録の全項目
  orderOps: {}, // 注文番号 → 運用（状態・発送・入金確認・キャンセル・履歴・版）
  inventoryLog: [], // 在庫の増減（入荷・調整・キャンセルの戻し）
  priceLog: [], // 価格の変更（後から価格と売れ方を分析するため）
  saleLog: [], // 販売状況・販売期間の変更（同上）
  settings: { ...DEFAULT_SETTINGS },
  seq: { product: 100002, seller: 4 },
});

// ---- 保存データの読み込み（形と型を確かめ、合わない値は捨てる） ----

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const isText = (value) => typeof value === 'string';
const textOrNull = (value) => isText(value) || value === null;
const strings = (value) => list(value).filter(isText);
// 文字・数値・真偽・null だけの浅いオブジェクトにする（入れ子の想定外の値は捨てる）
const flat = (value) => (isObject(value)
  ? Object.fromEntries(Object.entries(value).filter(([, item]) => item === null || ['string', 'number', 'boolean'].includes(typeof item) && (typeof item !== 'number' || Number.isFinite(item))))
  : undefined);
const textMap = (value) => (isObject(value) ? Object.fromEntries(Object.entries(value).filter(([, item]) => textOrNull(item))) : undefined);
const finiteOrNull = (value) => value === null || Number.isFinite(value);

const PRODUCT_TEXT = ['name', 'maker', 'model', 'jan', 'categoryId', 'lifecycle', 'kind', 'description', 'sellerId', 'merchantId', 'fulfillerId',
  'sellerSku', 'saleStatus', 'referencePriceType', 'source', 'createdAt', 'updatedAt', 'releaseDate', 'productionEnd', 'salesEnd', 'brandId'];
const PRODUCT_NULLABLE_TEXT = ['saleStart', 'saleEnd', 'releaseDate', 'productionEnd', 'salesEnd'];
const PRODUCT_NUMBERS = ['referencePrice', 'memberPrice', 'stock', 'stockTotal'];
const PRODUCT_LISTS = ['images', 'tags', 'highlights', 'inBox', 'keywords'];

function cleanProduct(record) {
  const out = {};
  PRODUCT_TEXT.forEach((key) => { if (isText(record[key])) out[key] = record[key]; });
  PRODUCT_NULLABLE_TEXT.forEach((key) => { if (record[key] === null) out[key] = null; });
  PRODUCT_NUMBERS.forEach((key) => { if (Number.isFinite(record[key])) out[key] = record[key]; });
  PRODUCT_LISTS.forEach((key) => { if (Array.isArray(record[key])) out[key] = strings(record[key]); });
  if (Array.isArray(record.specs)) out.specs = record.specs.filter((pair) => Array.isArray(pair) && pair.length === 2 && pair.every(isText));
  if (isObject(record.shipping)) {
    const { fee = null, leadMin = null, leadMax = null } = record.shipping;
    if (finiteOrNull(fee) && finiteOrNull(leadMin) && finiteOrNull(leadMax)) out.shipping = { fee, leadMin, leadMax };
  }
  ['priceReason', 'provenance'].forEach((key) => { if (isObject(record[key])) out[key] = textMap(record[key]); });
  if (isObject(record.support)) {
    out.support = { ...textMap(record.support) };
    ['consumables', 'battery'].forEach((key) => { if (isObject(record.support[key])) out.support[key] = textMap(record.support[key]); });
  }
  if (isObject(record.importSource)) {
    const source = flat(record.importSource);
    out.importSource = { ...source, header: strings(record.importSource.header), cells: strings(record.importSource.cells) };
  }
  return out;
}

function cleanSeller(record) {
  const out = {};
  ['name', 'kind', 'contactName', 'email', 'tel', 'status', 'note', 'createdAt'].forEach((key) => { if (isText(record[key])) out[key] = record[key]; });
  ['shipFrom', 'returnTo'].forEach((key) => { if (isObject(record[key])) out[key] = textMap(record[key]); });
  if (isObject(record.roles)) out.roles = Object.fromEntries(Object.entries(record.roles).filter(([, value]) => typeof value === 'boolean'));
  if (Array.isArray(record.accountIds)) out.accountIds = strings(record.accountIds);
  if (isObject(record.defaultLead) && Number.isInteger(record.defaultLead.leadMin) && Number.isInteger(record.defaultLead.leadMax)) {
    out.defaultLead = { leadMin: record.defaultLead.leadMin, leadMax: record.defaultLead.leadMax };
  }
  return out;
}

const cleanShipment = (shipment) => (isObject(shipment) && isText(shipment.carrier) && isText(shipment.trackingNo) && isText(shipment.shippedAt)
  ? { ...flat(shipment), deliveredAt: isText(shipment.deliveredAt) ? shipment.deliveredAt : null }
  : null);

function cleanOrderOps(record) {
  const out = { history: list(record.history).map(flat).filter(Boolean), requests: list(record.requests).map(flat).filter(Boolean), shipments: {}, cancelledParts: {} };
  ['status', 'cancelReason', 'cancelledAt'].forEach((key) => { if (isText(record[key])) out[key] = record[key]; });
  if (typeof record.paid === 'boolean') out.paid = record.paid;
  out.version = Number.isInteger(record.version) ? record.version : 0;
  if (isObject(record.shipments)) {
    Object.entries(record.shipments).forEach(([id, shipment]) => {
      const clean = cleanShipment(shipment);
      if (clean) out.shipments[id] = clean;
    });
  }
  if (isObject(record.cancelledParts)) {
    Object.entries(record.cancelledParts).forEach(([id, part]) => { if (isObject(part)) out.cancelledParts[id] = flat(part); });
  }
  return out;
}

const cleanEntries = (value, clean) => (isObject(value)
  ? Object.fromEntries(Object.entries(value).filter(([, record]) => isObject(record)).map(([id, record]) => [id, clean(record)]))
  : {});

function sanitize(saved) {
  const state = emptyState();
  if (!isObject(saved)) return state;
  state.products = cleanEntries(saved.products, cleanProduct);
  state.sellers = cleanEntries(saved.sellers, cleanSeller);
  state.orderOps = cleanEntries(saved.orderOps, cleanOrderOps);
  ['inventoryLog', 'priceLog', 'saleLog'].forEach((key) => { state[key] = list(saved[key]).map(flat).filter((entry) => entry && isText(entry.productId)); });
  if (isObject(saved.settings)) {
    const settings = { ...DEFAULT_SETTINGS };
    Object.entries(SETTING_RANGES).forEach(([key, { min, max }]) => {
      const value = saved.settings[key];
      if (Number.isInteger(value) && value >= min && value <= max) settings[key] = value;
    });
    if (SALE_STATUSES[saved.settings.csvDefaultStatus]) settings.csvDefaultStatus = saved.settings.csvDefaultStatus;
    state.settings = settings;
  }
  if (isObject(saved.seq)) {
    ['product', 'seller'].forEach((key) => { if (Number.isInteger(saved.seq[key])) state.seq[key] = saved.seq[key]; });
  }
  return state;
}

// 読めなかった保存データは消さずに別のキーへ退避し、管理画面で知らせる（黙って初期化しない）
function quarantine(text, error, now = new Date()) {
  const backupKey = `${STORAGE_KEY}:broken-${now.getTime()}`;
  try {
    globalThis.localStorage?.setItem(backupKey, text);
  } catch {
    // 退避できなくても、読めないデータで画面が止まらないことを優先する
  }
  loadProblem = { at: now.toISOString(), backupKey, message: String(error?.message ?? error) };
  console.error(`[market] 運営データを読めなかったため、初期状態で表示しています。元のデータは ${backupKey} に退避しました。`, error);
}

function parse(text) {
  lastText = text;
  if (!text) return emptyState();
  try {
    return sanitize(JSON.parse(text));
  } catch (error) {
    quarantine(text, error);
    return emptyState();
  }
}

function load() {
  try {
    return parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? null);
  } catch (error) {
    persistent = false;
    console.warn('[market] localStorage が使えないため、運営データはこのタブの中だけで保持します。', error);
    return emptyState();
  }
}

export const marketLoadProblem = () => loadProblem;

let state = load();

// ---- 商品・出品元の組み立て ----

// 実際に使う一覧。同じ配列を書き換えるので、import した側はいつも最新を見る
export const PRODUCTS = [];
export const SELLERS = [];

export const productById = (id) => PRODUCTS.find((product) => product.id === id);
export const sellerById = (id) => SELLERS.find((seller) => seller.id === id) ?? null;

const endOfDay = (date) => {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
};

function normalizeSeller(raw, now) {
  return {
    kind: 'retailer',
    contactName: '',
    email: '',
    tel: '',
    shipFrom: { label: '', postal: '', address: '', tel: '' },
    returnTo: { label: '', postal: '', address: '', tel: '' },
    status: 'active',
    roles: { holdsStock: true, sells: true, ships: true },
    accountIds: [],
    note: '',
    defaultLead: null,
    ...raw,
    createdAt: raw.createdAt ?? new Date(now.getTime() - (raw.createdDaysAgo ?? 0) * DAY).toISOString(),
  };
}

// 管理画面・CSV で登録した商品にも、購入者画面が使う項目をすべてそろえる。
// 出品元が申告していないこと（区分・状態・流通・比較元の種類）は「確認中」で埋め、断定する値では埋めない
function normalizeProduct(raw, now) {
  const listing = SEED_LISTINGS[raw.id] ?? {};
  const brand = BRANDS.find((item) => item.id === raw.brandId)
    ?? BRANDS.find((item) => item.name.toLowerCase() === String(raw.maker ?? '').trim().toLowerCase());
  const maker = String(raw.maker ?? brand?.name ?? '').trim();
  const sellerId = raw.sellerId ?? listing.sellerId ?? null;
  const seller = sellerById(sellerId);
  const createdAt = raw.createdAt
    ?? new Date(now.getTime() - (raw.createdDaysAgo ?? raw.listedDaysAgo ?? 0) * DAY).toISOString();
  const saleEnd = raw.saleEnd !== undefined
    ? raw.saleEnd
    : listing.saleEndInDays != null ? endOfDay(new Date(now.getTime() + listing.saleEndInDays * DAY)).toISOString() : null;
  return {
    keywords: [],
    releaseDate: null,
    productionEnd: null,
    salesEnd: null,
    lifecycle: 'unknown',
    kind: 'generic',
    tags: [],
    popularity: 0,
    description: '',
    highlights: [],
    specs: [],
    inBox: [],
    successorId: null,
    compatibleIds: [],
    referencePriceType: 'unconfirmed',
    ...raw,
    maker,
    brandId: brand?.id ?? `maker:${maker || 'メーカー未登録'}`,
    stockTotal: raw.stockTotal ?? raw.stock,
    listedDaysAgo: raw.listedDaysAgo ?? Math.max(0, Math.floor((now - new Date(createdAt)) / DAY)),
    support: {
      until: null,
      untilLabel: '',
      maker: 'unknown',
      makerNote: UNKNOWN,
      repair: 'unknown',
      repairNote: UNKNOWN,
      parts: 'unknown',
      partsNote: UNKNOWN,
      warranty: UNKNOWN,
      ...raw.support,
      consumables: { status: 'unknown', note: UNKNOWN, ...raw.support?.consumables },
      battery: { status: 'unknown', platform: null, note: UNKNOWN, ...raw.support?.battery },
    },
    provenance: { source: seller ? `${seller.name}の在庫` : '出品元の在庫', channel: UNKNOWN, condition: UNKNOWN, lot: null, pse: null, ...raw.provenance },
    priceReason: raw.priceReason ?? { label: '会員限定価格', headline: `${seller?.name ?? '出品元'}から、会員限定の価格で提供されている商品です`, body: '' },
    // 出品情報。在庫を持つ出品元（seller）・販売者（merchant）・発送者（fulfiller）を分けて持つ。PoC では同じ会社
    sellerId,
    merchantId: raw.merchantId ?? sellerId,
    fulfillerId: raw.fulfillerId ?? sellerId,
    jan: raw.jan ?? listing.jan ?? '',
    saleStatus: SALE_STATUSES[raw.saleStatus] ? raw.saleStatus : 'on-sale',
    saleStart: raw.saleStart ?? null,
    saleEnd,
    // 送料：fee が null なら標準（全国一律・一定額以上は無料）、数値なら個別送料。lead は出荷までの営業日数（null は翌日出荷の標準）
    shipping: { fee: null, leadMin: null, leadMax: null, ...raw.shipping },
    source: raw.source ?? 'seed',
    createdAt,
    updatedAt: raw.updatedAt ?? createdAt,
  };
}

const SEED_PRODUCT_IDS = new Set([...SEED_PRODUCTS, ...SEED_ADMIN_PRODUCTS].map((product) => product.id));
export const isSeedProduct = (id) => SEED_PRODUCT_IDS.has(id);

function build(source, now) {
  const sellers = new Map(SEED_SELLERS.map((seller) => [seller.id, seller]));
  Object.entries(source.sellers).forEach(([id, record]) => sellers.set(id, { ...(sellers.get(id) ?? {}), ...record, id }));
  SELLERS.splice(0, SELLERS.length, ...[...sellers.values()].map((seller) => normalizeSeller(seller, now)));

  const products = new Map([...SEED_PRODUCTS, ...SEED_ADMIN_PRODUCTS].map((product) => [product.id, product]));
  Object.entries(source.products).forEach(([id, record]) => products.set(id, { ...(products.get(id) ?? {}), ...record, id }));
  PRODUCTS.splice(0, PRODUCTS.length, ...[...products.values()].map((product) => normalizeProduct(product, now)));
}

// 想定外のデータで組み立てに失敗しても、購入者画面・管理画面が開けるよう初期データだけで組み直す
function rebuild(now = new Date()) {
  try {
    build(state, now);
  } catch (error) {
    quarantine(JSON.stringify(state), error, now);
    state = emptyState();
    build(state, now);
  }
}

rebuild();

// ---- 保存 ----

// 保存に失敗したとき（容量不足など）に、画面で理由を出せるようにする
export class MarketSaveError extends Error {}

function persist(next) {
  if (!persistent) return;
  const text = JSON.stringify(next);
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, text);
  } catch (error) {
    throw new MarketSaveError('ブラウザの保存容量が足りないため保存できませんでした。商品画像の枚数や大きさを減らしてください。', { cause: error });
  }
  lastText = text;
}

// 別のタブが保存した後、まだ読み直していなければ読み直す（古いデータで上書きしない・古いデータで判定しない）
export function refreshMarket() {
  if (!persistent) return;
  let text;
  try {
    text = globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return;
  }
  if (text === lastText) return;
  state = parse(text);
  rebuild();
}

// 変更はすべてここを通す。最新を読み直し、複製に変更 → 保存 → 成功したときだけ差し替えるので、失敗しても画面とデータが食い違わない
function commit(mutate) {
  refreshMarket();
  const next = JSON.parse(JSON.stringify(state));
  const result = mutate(next);
  persist(next);
  state = next;
  rebuild();
  return result;
}

// 別のタブ（管理画面⇄購入者画面）で変わったら読み直す
export function onMarketExternalChange(callback) {
  if (typeof window === 'undefined') return;
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    state = load();
    rebuild();
    callback();
  });
}

// ---- 販売状況・販売期間 ----

// 出品元が取引中か（一時停止・取引終了の出品元の商品は売らない）
export const sellerActive = (product) => (sellerById(product.sellerId)?.status ?? 'active') === 'active';

// 購入者から見た状態。購入できるのは 'on-sale' のときだけ
export function saleState(product, now = new Date()) {
  if (product.saleStatus !== 'on-sale') return product.saleStatus;
  if (!sellerActive(product)) return 'suspended';
  if (product.saleStart && now < new Date(product.saleStart)) return 'scheduled';
  if (product.saleEnd && now > new Date(product.saleEnd)) return 'expired';
  return 'on-sale';
}

// 購入者画面に出すか（下書き・販売停止・取引中でない出品元の商品は出さない。販売終了・販売開始前は「購入できない」と出す）
export const isListed = (product) => !['draft', 'suspended'].includes(product.saleStatus) && sellerActive(product);

export const listedProducts = () => PRODUCTS.filter(isListed);

// ---- 商品 ----

// 販売中にする前にそろっていなければならない項目（出品元が申告していない内容を、購入者画面で断定しないため）
export function publishBlockers(product) {
  const missing = [];
  if (!LIFECYCLES[product.lifecycle] || product.lifecycle === 'unknown') missing.push('商品の区分');
  const known = (value) => Boolean(String(value ?? '').trim()) && value !== UNKNOWN;
  if (!known(product.provenance?.condition)) missing.push('状態');
  if (!known(product.provenance?.channel)) missing.push('流通');
  if (product.source !== 'seed' && product.shipping?.leadMax == null) missing.push('発送目安');
  return missing;
}

const PRODUCT_FIELDS = [
  'name', 'maker', 'model', 'jan', 'categoryId', 'lifecycle', 'kind', 'description', 'images',
  'referencePrice', 'referencePriceType', 'memberPrice', 'stock', 'stockTotal',
  'sellerId', 'merchantId', 'fulfillerId', 'sellerSku', 'saleStatus', 'saleStart', 'saleEnd', 'shipping',
  'priceReason', 'support', 'provenance', 'releaseDate', 'productionEnd', 'specs', 'highlights', 'inBox', 'keywords', 'tags', 'importSource',
];
const PRICE_FIELDS = ['referencePrice', 'referencePriceType', 'memberPrice'];
const SALE_FIELDS = ['saleStatus', 'saleStart', 'saleEnd'];

const pick = (input, fields = PRODUCT_FIELDS) => Object.fromEntries(fields.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]));

// 価格・販売状況・販売期間を変えたら記録する（後から「いくらで・いつ売っていたか」を分析するため）
function logChanges(next, id, before, fields, { at, by }) {
  const after = { ...before, ...fields };
  if (!before || PRICE_FIELDS.some((key) => key in fields && fields[key] !== before[key])) {
    next.priceLog.push({ at, productId: id, referencePrice: after.referencePrice, referencePriceType: after.referencePriceType, memberPrice: after.memberPrice, by });
  }
  if (!before || SALE_FIELDS.some((key) => key in fields && fields[key] !== before[key])) {
    next.saleLog.push({ at, productId: id, saleStatus: after.saleStatus, saleStart: after.saleStart ?? null, saleEnd: after.saleEnd ?? null, by });
  }
}

function nextId(next, kind, format, taken) {
  let n = next.seq[kind];
  while (taken(format(n))) n += 1;
  next.seq[kind] = n + 1;
  return format(n);
}

// 会員の注文などに残っている商品ID（運営データが消えても、同じIDを別の商品に使い回さない）
let referencedProductIds = () => [];
export const registerReferencedProductIds = (provider) => { referencedProductIds = provider; };

function newProductId(next) {
  const taken = new Set([...SEED_PRODUCT_IDS, ...Object.keys(next.products), ...referencedProductIds()]);
  return nextId(next, 'product', (n) => `p${n}`, (id) => taken.has(id));
}

function createIn(next, input, { at, by, source }) {
  const id = newProductId(next);
  const fields = pick(input);
  next.products[id] = { ...fields, stockTotal: fields.stock, source, createdAt: at, updatedAt: at };
  logChanges(next, id, null, fields, { at, by });
  next.inventoryLog.push({ at, productId: id, delta: fields.stock, reason: source === 'csv' ? 'CSV一括登録' : '新規登録', by });
  return id;
}

// 在庫の変更は「画面に出していた販売可能数からの増減」で反映する。開いている間に売れた分を消さないため
function adjustIn(next, id, { shown, to, reason, by, at, orderId = null }) {
  const delta = to - shown;
  if (!delta) return 0;
  const current = next.products[id]?.stock ?? productById(id).stock;
  next.products[id] = { ...(next.products[id] ?? {}), stock: Math.max(0, current + delta), updatedAt: at };
  next.inventoryLog.push({ at, productId: id, delta, reason, by, ...(orderId ? { orderId } : {}) });
  return delta;
}

function updateIn(next, id, changes, { at, by, stockChange }) {
  const before = productById(id);
  if (!before) throw new Error(`商品 ${id} は登録されていません。`);
  const fields = pick(changes, PRODUCT_FIELDS.filter((key) => key !== 'stock' && key !== 'stockTotal'));
  if (Object.keys(fields).length) {
    next.products[id] = { ...(next.products[id] ?? {}), ...fields, updatedAt: at };
    logChanges(next, id, before, fields, { at, by });
  }
  if (stockChange) adjustIn(next, id, { ...stockChange, by, at });
}

// 新規登録（id なし）・変更（id あり）。入力の検証は lib/product-rules.js で済ませてから呼ぶ。
// 変更では、渡した項目だけを書き換える（画面は変えた項目だけを渡す）。在庫は stockChange { shown, to, reason } で増減として渡す
export function saveProduct(input, { by = 'admin', source = 'admin', now = new Date(), stockChange = null } = {}) {
  const at = now.toISOString();
  return commit((next) => {
    if (input.id) {
      updateIn(next, input.id, input, { at, by, stockChange });
      return input.id;
    }
    return createIn(next, input, { at, by, source });
  });
}

// CSV の取り込み：新規登録と、既存の商品の更新（在庫・価格・販売期間）を1回の保存で行う。1件でも保存できなければ全体を取り消す
export function importProducts({ creates = [], updates = [] }, { by = 'admin', now = new Date() } = {}) {
  const at = now.toISOString();
  return commit((next) => ({
    created: creates.map((input) => createIn(next, input, { at, by, source: 'csv' })),
    updated: updates.map(({ id, changes, stockChange }) => {
      updateIn(next, id, changes, { at, by, stockChange: stockChange && { ...stockChange, reason: 'CSVで更新' } });
      return id;
    }),
  }));
}

export const saveProducts = (inputs, options = {}) => importProducts({ creates: inputs }, options).created;

// 販売状況をまとめて変える（商品一覧の一括操作）。販売中にするのは、区分・状態・流通・発送目安がそろった商品だけ。
// 変えた商品IDを返す（入力が足りずに変えなかった商品は含めない）
export function setSaleStatus(ids, saleStatus, { by = 'admin', now = new Date() } = {}) {
  if (!SALE_STATUSES[saleStatus]) throw new Error(`販売状況が正しくありません: ${saleStatus}`);
  const at = now.toISOString();
  const targets = ids.filter((id) => productById(id) && (saleStatus !== 'on-sale' || !publishBlockers(productById(id)).length));
  commit((next) => targets.forEach((id) => updateIn(next, id, { saleStatus }, { at, by })));
  return targets;
}

// 在庫一覧から在庫を直す。shown は画面に出していた販売可能数、to は入力した販売可能数
export function adjustStock(id, { shown, to, reason, by = 'admin', now = new Date() }) {
  if (!productById(id)) throw new Error(`商品 ${id} は登録されていません。`);
  return commit((next) => adjustIn(next, id, { shown, to, reason, by, at: now.toISOString() }));
}

// ---- 出品元 ----

const SELLER_FIELDS = ['name', 'kind', 'contactName', 'email', 'tel', 'shipFrom', 'returnTo', 'status', 'roles', 'note', 'defaultLead'];

export function saveSeller(input, { now = new Date() } = {}) {
  return commit((next) => {
    const fields = Object.fromEntries(SELLER_FIELDS.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]));
    let { id } = input;
    if (id && sellerById(id)) {
      next.sellers[id] = { ...(next.sellers[id] ?? {}), ...fields };
    } else {
      const taken = new Set([...SEED_SELLERS.map((seller) => seller.id), ...Object.keys(next.sellers)]);
      id = nextId(next, 'seller', (n) => `S${String(n).padStart(3, '0')}`, (value) => taken.has(value));
      next.sellers[id] = { ...fields, createdAt: now.toISOString() };
    }
    return id;
  });
}

// ---- 注文の運用（状態・発送・入金確認・キャンセル・履歴） ----

const emptyOps = () => ({ history: [], requests: [], shipments: {}, cancelledParts: {}, version: 0 });

export const getOrderOps = (orderId) => state.orderOps[orderId] ?? null;

// mutate(ops, log) で運用データを書き換える。版（version）を1つ進め、在庫の記録も同じ保存で書ける（log(entry)）
export function updateOrderOps(orderId, mutate, { now = new Date() } = {}) {
  return commit((next) => {
    const ops = { ...emptyOps(), ...next.orderOps[orderId] };
    const log = (entry) => next.inventoryLog.push({ at: now.toISOString(), ...entry });
    const result = mutate(ops, log);
    ops.version += 1;
    next.orderOps[orderId] = ops;
    return result;
  });
}

// 注文の行がキャンセル済みか（注文全体、またはその発送元の分）。在庫・購入上限・売上の計算で使う
export function isLineCancelled(orderId, fulfillerId) {
  const ops = state.orderOps[orderId];
  return Boolean(ops?.cancelledAt || (fulfillerId && ops?.cancelledParts?.[fulfillerId]));
}

// ---- 記録 ----

export const getInventoryLog = () => state.inventoryLog;
export const getPriceLog = () => state.priceLog;
export const getSaleLog = () => state.saleLog;

// ---- 設定 ----

export const getSettings = () => state.settings;

export function saveSettings(fields) {
  commit((next) => {
    next.settings = { ...next.settings, ...fields };
  });
}

// ---- デモ ----

export function resetMarket() {
  commit((next) => {
    Object.keys(next).forEach((key) => delete next[key]);
    Object.assign(next, emptyState());
  });
  loadProblem = null;
}

// このアプリが保存しているデータの大きさ（購入者画面・管理画面・計測ログの合計。商品画像もここに入る）
export function storedBytes() {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return 0;
    let total = 0;
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key?.startsWith('genba-yard:')) total += (key.length + (storage.getItem(key) ?? '').length) * 2;
    }
    return total;
  } catch {
    return 0;
  }
}
