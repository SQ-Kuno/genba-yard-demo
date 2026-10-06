// 販売の集計（管理画面のダッシュボード・販売分析）。注文行には確定時点の価格・出品元・カテゴリーが残っているので、
// 商品・出品元・カテゴリー・会員の職種・価格帯のどれでも後から集計できる。
// 売上は「商品代金（税込・送料を除く）」。キャンセル・返金済みの注文と、キャンセルした発送元の行は数えない（件数は別に出す）。
import { countsAsSale, saleLines, statusLabel } from './orders.js';
import { productById, sellerById, getPriceLog, getSaleLog, SALE_STATUSES } from './market.js';
import { stockOf } from './store.js';
import { REFERENCE_LABELS } from './pricing.js';
import { jstParts } from './product-rules.js';
import { categoryById, LIFECYCLES } from '../data/categories.js';
import { paymentById } from '../data/members.js';

const DAY = 86400000;

// 期間。直近の日数と、暦月（出品元への月次報告・精算の元データ）
export const PERIODS = {
  '7d': { label: '直近7日', days: 7 },
  '30d': { label: '直近30日', days: 30 },
  'this-month': { label: '今月', month: 0 },
  'last-month': { label: '先月', month: -1 },
  all: { label: '全期間', days: null },
};

export const periodOf = (value) => (Object.hasOwn(PERIODS, value ?? '') ? value : '30d');

export function inPeriod(order, period, now = new Date()) {
  const { days, month } = PERIODS[period];
  const placed = new Date(order.placedAt);
  if (month !== undefined) {
    const target = new Date(now.getFullYear(), now.getMonth() + month, 1);
    return placed.getFullYear() === target.getFullYear() && placed.getMonth() === target.getMonth();
  }
  return days === null || now - placed <= days * DAY;
}

// 出品元で絞る（行の出品元）。注文の金額・送料は出品元ごとに分けられないので、絞ったときは行の金額だけで数える
export const forSeller = (orders, sellerId) => (sellerId
  ? orders.map((order) => ({ ...order, items: order.items.filter((item) => item.sellerId === sellerId) })).filter((order) => order.items.length)
  : orders);

const lineRevenue = (item) => item.price * item.qty;

export function summarizeSales(orders) {
  const sales = orders.filter((order) => saleLines(order).length);
  const lines = sales.flatMap(saleLines);
  const revenue = lines.reduce((sum, item) => sum + lineRevenue(item), 0);
  return {
    orders: sales.length,
    revenue,
    units: lines.reduce((sum, item) => sum + item.qty, 0),
    shipping: sales.reduce((sum, order) => sum + order.shipping, 0),
    average: sales.length ? Math.round(revenue / sales.length) : 0,
    buyers: new Set(sales.map((order) => order.buyer?.id ?? order.accountId)).size, // 購入した会員の数（重複を除く）
    cancelled: orders.filter((order) => !countsAsSale(order)).length,
  };
}

// 注文行を key ごとにまとめる（販売点数・売上・注文数）。売れた点数の多い順
function groupLines(orders, keyOf, labelOf) {
  const groups = new Map();
  orders.forEach((order) => {
    saleLines(order).forEach((item) => {
      const key = keyOf(item, order) ?? '（不明）';
      const group = groups.get(key) ?? { key, label: labelOf(key, item, order), units: 0, revenue: 0, orderIds: new Set() };
      group.units += item.qty;
      group.revenue += lineRevenue(item);
      group.orderIds.add(order.id);
      groups.set(key, group);
    });
  });
  return [...groups.values()]
    .map(({ orderIds, ...group }) => ({ ...group, orders: orderIds.size }))
    .sort((a, b) => b.units - a.units || b.revenue - a.revenue);
}

export const salesByProduct = (orders) => groupLines(orders, (item) => item.productId, (key, item) => `${item.model ?? key}　${item.name ?? ''}`);
// 出品元別には消化率（売れた数 ÷（売れた数＋いまの販売可能数））も出す。在庫処分のマーケットで出品元が最初に見る数字
export const salesBySeller = (orders, products = []) => groupLines(orders, (item) => item.sellerId, (key) => sellerById(key)?.name ?? key).map((row) => {
  const left = products.filter((product) => product.sellerId === row.key).reduce((sum, product) => sum + stockOf(product), 0);
  return { ...row, sellThrough: row.units + left ? Math.round((row.units / (row.units + left)) * 100) : null };
});
export const salesByCategory = (orders) => groupLines(orders, (item) => item.categoryId, (key) => categoryById(key)?.name ?? key);
export const salesByTrade = (orders) => groupLines(orders, (item, order) => order.buyer?.trade, (key) => key);

// 割引率の帯（比較元に対する会員の支払額）。「どの価格で売れるか」を見る
const RATE_BANDS = [[0, 20, '〜19%'], [20, 40, '20〜39%'], [40, 50, '40〜49%'], [50, 60, '50〜59%'], [60, 101, '60%〜']];
export const salesByRateBand = (orders) => groupLines(orders, (item) => {
  if (!item.referencePrice) return '比較元なし';
  const rate = Math.floor((1 - item.price / item.referencePrice) * 100);
  return RATE_BANDS.find(([min, max]) => rate >= min && rate < max)?.[2] ?? '比較元なし';
}, (key) => key).sort((a, b) => a.key.localeCompare(b.key, 'ja'));

// 商品ごとの「閲覧 → カート追加 → 購入」（このブラウザの計測ログから。本番は GA4・DB の同じイベントで集計する）。
// 購入率は「購入の回数 ÷ 閲覧の回数」（点数で割ると、1回に10点買うと1000%になるため）
export function funnelByProduct(events) {
  const rows = new Map();
  const row = (id) => {
    if (!rows.has(id)) rows.set(id, { productId: id, views: 0, carts: 0, purchases: 0, units: 0 });
    return rows.get(id);
  };
  events.forEach((entry) => {
    (entry.items ?? []).forEach((item) => {
      if (!item?.item_id) return;
      if (entry.event === 'view_item') row(item.item_id).views += 1;
      if (entry.event === 'add_to_cart') row(item.item_id).carts += 1;
      if (entry.event === 'purchase') {
        row(item.item_id).purchases += 1;
        row(item.item_id).units += item.quantity ?? 1;
      }
    });
  });
  return [...rows.values()]
    .map((item) => ({ ...item, rate: item.views ? Math.min(100, Math.round((item.purchases / item.views) * 100)) : null }))
    .sort((a, b) => b.views - a.views);
}

// 日本時間の「2026/10/06 10:12」（表計算ソフトで時差なく読める形）
const jstText = (iso) => {
  if (!iso) return '';
  const { y, m, d, hh, mm } = jstParts(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${y}/${pad(m)}/${pad(d)} ${pad(hh)}:${pad(mm)}`;
};

// 分析用の書き出し（注文行ごと）。後から表計算・BI で「どの商品が・どの価格で・どの層に」売れたかを見る
export const SALES_EXPORT_HEADER = ['注文番号', '注文日時', '状態', '行の状態', '支払方法', '購入の経路', '会員番号', '会社名', '職種', '契約プラン', '配送先の都道府県',
  '商品ID', 'JAN', 'メーカー', '型番', '商品名', '商品の区分', 'カテゴリー', '出品元ID', '出品元', '発送元ID', '比較元の種類', '比較元の価格', '販売単価', '数量', '小計', '価格の種類'];

const VIA_LABELS = { cart: 'カート', buy_now: '今すぐ購入', quote: '見積から' };
const prefectureOf = (address) => /^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/.exec(String(address?.address ?? '').replace(/^【デモ】/, ''))?.[1] ?? '';

export function salesExportRows(orders) {
  return orders.flatMap((order) => order.items.map((item) => {
    const product = productById(item.productId);
    return [
      order.id,
      jstText(order.placedAt),
      statusLabel(order),
      item.cancelled ? 'キャンセル（発送元の分）' : '',
      paymentById(order.paymentId)?.label ?? order.paymentId,
      VIA_LABELS[order.via] ?? order.via ?? '',
      order.buyer?.memberNo ?? '',
      order.buyer?.company ?? '',
      order.buyer?.trade ?? '',
      order.buyer?.plan ?? '',
      prefectureOf(order.address),
      item.productId,
      item.jan ?? '',
      item.maker ?? '',
      item.model ?? '',
      item.name ?? '',
      LIFECYCLES[product?.lifecycle]?.label ?? '',
      categoryById(item.categoryId)?.name ?? '',
      item.sellerId ?? '',
      sellerById(item.sellerId)?.name ?? '',
      item.fulfillerId ?? '',
      REFERENCE_LABELS[item.referencePriceType]?.label ?? '',
      item.referencePrice ?? '',
      item.price,
      item.qty,
      lineRevenue(item),
      { quote: '見積単価', timesale: 'TIME SALE', weekend: '週末限定SALE', seasonal: '季節SALE' }[item.saleKind] ?? '会員価格',
    ];
  }));
}

// 商品の変更履歴（価格・販売状況・販売期間）の書き出し。価格を変えたときの売れ方の変化を後から見る
export const CHANGE_EXPORT_HEADER = ['日時', '商品ID', '型番', '変更の種類', '通常価格', '通常価格の種類', '会員価格', '販売状況', '販売開始', '販売終了', '操作した人'];

export function changeExportRows() {
  const model = (id) => productById(id)?.model ?? '';
  const prices = getPriceLog().map((entry) => [entry.at, entry.productId, model(entry.productId), '価格', entry.referencePrice ?? '', REFERENCE_LABELS[entry.referencePriceType]?.label ?? '', entry.memberPrice ?? '', '', '', '', entry.by ?? '']);
  const sales = getSaleLog().map((entry) => [entry.at, entry.productId, model(entry.productId), '販売状況・期間', '', '', '', SALE_STATUSES[entry.saleStatus]?.label ?? '', jstText(entry.saleStart), jstText(entry.saleEnd), entry.by ?? '']);
  return [...prices, ...sales].sort((a, b) => a[0].localeCompare(b[0])).map(([at, ...rest]) => [jstText(at), ...rest]);
}
