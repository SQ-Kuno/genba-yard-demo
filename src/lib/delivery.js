import { SITE } from '../config/site.js';
import { monthDay } from './format.js';
import { paymentById } from '../data/members.js';

// 郵便番号の先頭で、配送に日数がかかる地域を判定（北海道 0xx・沖縄 90x）。モックの簡易ルール
const REMOTE_POSTAL = /^(0|90)/;

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

// 営業日を足す（土日を除く。祝日・出品元ごとの休業日は PoC では数えない）
export function addBusinessDays(from, days) {
  const date = startOfDay(from);
  let left = days;
  while (left > 0) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0 && date.getDay() !== 6) left -= 1;
  }
  return date;
}

const isBusinessDay = (date) => date.getDay() !== 0 && date.getDay() !== 6;

// 出品元が発送する日。当日発送（0営業日）は、平日の締め時刻までの注文だけ当日、それ以外は次の営業日
function shipDay(now, days) {
  if (days > 0) return addBusinessDays(now, days);
  return isBusinessDay(now) && now.getHours() < SITE.shipping.sameDayCutoffHour ? startOfDay(now) : addBusinessDays(now, 1);
}

// お届け予定日の目安。締め時刻までの注文は翌日、それ以降は翌々日。遠隔地は +1日。
// 出品元の発送目安（lead）がある注文は、最長の営業日で発送してから翌日に届く目安にする。
// 前払い（銀行振込・PayPay）はお支払いの確認後に出荷するため日付を出さない（null）
export function estimateDelivery(now = new Date(), { postal = '', paymentId = null, lead = null } = {}) {
  if (paymentId && !paymentById(paymentId)?.paidOnConfirm) return null;
  const remote = REMOTE_POSTAL.test(postal) ? 1 : 0;
  if (lead) {
    const date = shipDay(now, lead.max);
    date.setDate(date.getDate() + 1 + remote);
    return date;
  }
  const date = startOfDay(now);
  date.setDate(date.getDate() + (now.getHours() < SITE.shipping.sameDayCutoffHour ? 1 : 2) + remote);
  return date;
}

// 発送の期限（管理画面の遅れの判定）。注文日（前払いは入金を確認した日）から、発送目安の最長の営業日まで。
// 発送目安のない注文（標準）は翌営業日
export function shipDeadline(order) {
  const confirmed = [...(order.history ?? [])].reverse().find((entry) => entry.note === '入金を確認');
  const start = new Date(confirmed?.at ?? order.placedAt);
  return shipDay(start, order.lead?.max ?? 1);
}

const isTomorrow = (date, now) => date.getTime() === startOfDay(now).getTime() + 86400000;

// 出品元の発送目安（注文後◯〜◯営業日で発送）。標準（翌日出荷）の商品は null
export function leadOf(products) {
  const leads = products.map((product) => product.shipping).filter((shipping) => shipping?.leadMax != null);
  if (!leads.length) return null;
  return { min: Math.max(...leads.map((lead) => lead.leadMin ?? lead.leadMax)), max: Math.max(...leads.map((lead) => lead.leadMax)) };
}

export const leadText = (lead) => {
  if (lead.max === 0) return `平日${SITE.shipping.sameDayCutoffHour}時までのご注文は当日発送`;
  return lead.min === lead.max ? `注文後${lead.max}営業日で発送` : `注文後${lead.min}〜${lead.max}営業日で発送`;
};

// 一覧・詳細で出す「最短」の表示（配送先・支払方法が決まる前）
export function deliveryLabel(now = new Date()) {
  const date = estimateDelivery(now);
  return `最短 ${isTomorrow(date, now) ? '明日 ' : ''}${monthDay(date)}`;
}

// 購入手続き・注文で出す表示（配送先・支払方法が決まった後）。出品元の発送目安がある注文は、発送目安と届く日の目安を出す
export function deliveryText(now, { postal, paymentId, lead = null }) {
  const date = estimateDelivery(now, { postal, paymentId, lead });
  const remote = REMOTE_POSTAL.test(postal);
  const paidWord = paymentId === 'bank' ? 'ご入金' : 'お支払い';
  if (lead) {
    const span = lead.max === 0 ? '当日' : lead.min === lead.max ? `${lead.max}営業日` : `${lead.min}〜${lead.max}営業日`;
    if (!date) return `${paidWord}の確認後、${span}で発送（出品元から直送）`;
    return `${monthDay(date)}ごろ（${leadText(lead)}・出品元から直送${remote ? '・一部地域のため＋1日' : ''}）`;
  }
  if (!date) return `${paidWord}の確認後、${remote ? '2〜3日' : '1〜2日'}でお届け`;
  return `${monthDay(date)}ごろ${remote ? '（一部地域のため＋1日）' : ''}`;
}

export function cutoffNote(now = new Date()) {
  const hour = SITE.shipping.sameDayCutoffHour;
  return now.getHours() < hour ? `今日${hour}:00までのご注文・本州・四国・九州の場合` : '本州・四国・九州の場合';
}
