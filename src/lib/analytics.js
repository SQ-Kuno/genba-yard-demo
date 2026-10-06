// 計測。イベント名は GA4 の推奨イベントに合わせ、本番では gtag/GTM に流すだけで済むようにする。
// モックでは window.dataLayer に積み、直近のイベントを localStorage に残してマイページで確認できるようにする。
const LOG_KEY = 'genba-yard:events';
const LOG_LIMIT = 300;

globalThis.dataLayer = globalThis.dataLayer || []; // ブラウザでは window.dataLayer

// ログイン中の会員（GA4 の user_id と、Wi-Fi 契約側の指標と突き合わせるための契約プラン）
let user = {};
export const setAnalyticsUser = (account) => {
  user = account ? { user_id: account.memberNo, contract_plan: account.contract.plan } : {};
};

function readLog() {
  try {
    const log = JSON.parse(localStorage.getItem(LOG_KEY));
    return Array.isArray(log) ? log : [];
  } catch (error) {
    console.warn('[analytics] イベントログを読めませんでした。', error);
    return [];
  }
}

export function track(event, params = {}) {
  const entry = { event, ...user, ...params, at: new Date().toISOString() };
  globalThis.dataLayer.push(entry);
  const log = readLog();
  log.push(entry);
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(-LOG_LIMIT)));
  } catch (error) {
    console.warn('[analytics] イベントログを保存できませんでした。', error);
  }
}

export const getEventLog = () => readLog();

export function clearEventLog() {
  try {
    localStorage.removeItem(LOG_KEY);
  } catch (error) {
    console.warn('[analytics] イベントログを消せませんでした。', error);
  }
}

// GA4 の items 配列の形にそろえる
export const toItem = (product, { price, qty = 1, listName } = {}) => ({
  item_id: product.id,
  item_name: `${product.model} ${product.name}`,
  item_brand: product.brandId,
  item_category: product.categoryId,
  item_variant: product.lifecycle,
  affiliation: product.sellerId, // 出品元（出品元別の閲覧・カート追加・購入を後から集計できるように）
  price,
  quantity: qty,
  ...(listName ? { item_list_name: listName } : {}),
});

// 「詳細 → カート/今すぐ購入 → 購入手続き → 注文確定」のファネル
export const FUNNEL_STEPS = [
  { event: 'view_item', label: '商品詳細の閲覧' },
  { event: 'add_to_cart', label: 'カート投入・今すぐ購入' },
  { event: 'begin_checkout', label: '購入手続きの開始' },
  { event: 'purchase', label: '注文確定' },
];
