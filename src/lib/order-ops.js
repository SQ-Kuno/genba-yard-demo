// 注文の運用（管理画面の操作）。状態の変更・キャンセル（注文全体／発送元の分）・入金確認・発送依頼・発送の登録と訂正。
// どの操作も、いまの注文を読み直して判定する。画面を開いた後に別のタブで注文が変わっていれば止める（古い画面のまま操作させない）。
// 書き込みは1回の保存（在庫の記録も同じ保存）。「誰が・いつ・何から何へ」を注文の履歴に残す。
// actor は操作した人。権限は lib/admin-auth.js の can() で確かめる（ADMIN はすべて。将来の SELLER は自社の発送元の分だけ）
import { updateOrderOps, sellerById, refreshMarket } from './market.js';
import { ORDER_STATUSES, NEXT_STATUSES, fulfillerIds, activeFulfillerIds, orderById, paymentState, statusLabel } from './orders.js';
import { carrierById } from '../data/carriers.js';
import { can } from './admin-auth.js';

export class OrderOpError extends Error {}

const label = (status) => ORDER_STATUSES[status]?.label ?? status;
const sellerName = (id) => sellerById(id)?.name ?? id;
const historyEntry = ({ from, to, note = '', by, now }) => ({ at: now.toISOString(), from, to, note, by });
const BEFORE_SHIPPING = ['received', 'preparing'];

// いまの注文を読み直し、版と権限を確かめる。画面が持っている注文（order.version）と違えば止める
function reload(order, actor, permission, sellerIds = null) {
  refreshMarket();
  const fresh = orderById(order.id);
  if (!fresh) throw new OrderOpError(`注文 ${order.id} が見つかりません。`);
  if (order.version !== undefined && fresh.version !== order.version) {
    throw new OrderOpError('ほかの画面でこの注文が更新されました。画面を開き直し、いまの内容を確かめてから操作してください。');
  }
  if (!can(actor, permission, { sellerIds: sellerIds ?? fulfillerIds(fresh) })) throw new OrderOpError('この注文を操作する権限がありません。');
  return fresh;
}

const shippedFulfillers = (order) => activeFulfillerIds(order).filter((id) => order.shipments[id]?.shippedAt);

// 画面に出す操作の一覧（ボタンの出し分けと、操作の判定を1か所で決める）
const ACTION_LABELS = { delivered: '配送完了にする', completed: '完了にする', returned: '返品を受け付ける' };

export function allowedActions(order, now = new Date()) {
  const payment = paymentState(order, now);
  const statuses = (NEXT_STATUSES[order.status] ?? []).filter((to) => to !== 'cancelled').flatMap((to) => {
    if (to !== 'refunded') return [{ to, label: ACTION_LABELS[to] ?? label(to), needsNote: to === 'returned' }];
    // 請求書払いは振込で返金せず、請求で精算する（締めた後なら次の請求で差し引き、締める前なら請求に載せない）。
    // キャンセルは自動で同じ精算になるので、返品のときだけ操作する
    if (order.paymentId === 'invoice') return order.status === 'returned' ? [{ to, label: '請求で差し引く', needsNote: true }] : [];
    return payment.received ? [{ to, label: '返金済みにする', needsNote: true }] : [];
  });
  const open = BEFORE_SHIPPING.includes(order.status);
  return {
    statuses,
    cancel: open && !shippedFulfillers(order).length,
    cancelPart: open && activeFulfillerIds(order).length > 1,
    confirmPayment: open && !order.paid,
    // キャンセル後に返金の手続きが要るか（受け取った代金がある）
    refundNeeded: payment.received && order.paymentId !== 'invoice',
  };
}

// 配送完了・完了・返品受付・返金済み（キャンセルは cancelOrder、発送準備中は発送依頼、発送済は発送の登録で進める）
export function changeStatus(order, to, { actor, note = '', now = new Date() } = {}) {
  if (to === 'cancelled') return cancelOrder(order, { actor, reason: note, now });
  const fresh = reload(order, actor, 'order:write');
  const action = allowedActions(fresh, now).statuses.find((item) => item.to === to);
  if (!action) {
    if (to === 'refunded' && NEXT_STATUSES[fresh.status]?.includes(to)) {
      throw new OrderOpError(fresh.paymentId === 'invoice'
        ? '請求書払いの請求前のキャンセルは、請求書に載らないため返金は不要です。'
        : '代金を受け取る前の注文は返金ではなく、キャンセルで閉じてください。');
    }
    throw new OrderOpError(`「${statusLabel(fresh)}」の注文は「${label(to)}」にできません。`);
  }
  if (action.needsNote && !note.trim()) throw new OrderOpError('理由・内容を入力してください。');
  const settlement = to === 'refunded' ? (fresh.paymentId === 'invoice' ? 'credit' : 'refund') : null;
  updateOrderOps(fresh.id, (ops) => {
    ops.status = to;
    if (settlement) ops.settlement = settlement;
    if (to === 'delivered') {
      activeFulfillerIds(fresh).forEach((id) => {
        const shipment = fresh.shipments[id];
        if (shipment && !shipment.deliveredAt) ops.shipments[id] = { ...shipment, deliveredAt: now.toISOString() };
      });
    }
    ops.history.push(historyEntry({ from: fresh.status, to, note: settlement === 'credit' ? `請求で差し引き：${note}` : note, by: actor.id, now }));
  }, { now });
  return to;
}

// キャンセル（注文全体）：発送前だけ。このデモで確定した注文は在庫が戻る（売れた数は注文から数えるため）。在庫の記録も同じ保存で書く
export function cancelOrder(order, { actor, reason = '', now = new Date() } = {}) {
  const fresh = reload(order, actor, 'order:write');
  if (!BEFORE_SHIPPING.includes(fresh.status)) throw new OrderOpError('発送後の注文はキャンセルできません。返品として受け付けてください。');
  if (shippedFulfillers(fresh).length) {
    throw new OrderOpError('一部の出品元が発送済みのため、注文全体はキャンセルできません。発送前の出品元の分だけキャンセルするか、返品として受け付けてください。');
  }
  if (!reason.trim()) throw new OrderOpError('キャンセルの理由を入力してください。');
  updateOrderOps(fresh.id, (ops, log) => {
    ops.status = 'cancelled';
    ops.cancelReason = reason;
    ops.cancelledAt = now.toISOString();
    ops.history.push(historyEntry({ from: fresh.status, to: 'cancelled', note: reason, by: actor.id, now }));
    if (fresh.origin === 'placed') {
      fresh.items.filter((item) => !item.cancelled).forEach((item) => log({ productId: item.productId, delta: item.qty, reason: 'キャンセルによる戻し', orderId: fresh.id, by: actor.id }));
    }
  }, { now });
  return 'cancelled';
}

// 発送元の分だけキャンセルする（出品元の欠品など）。残りの発送元がすべて発送済みなら、注文は「発送済」になる
export function cancelPart(order, fulfillerId, { actor, reason = '', now = new Date() } = {}) {
  const fresh = reload(order, actor, 'order:write', [fulfillerId]);
  if (!BEFORE_SHIPPING.includes(fresh.status)) throw new OrderOpError('発送後の注文はキャンセルできません。返品として受け付けてください。');
  const active = activeFulfillerIds(fresh);
  if (!active.includes(fulfillerId)) throw new OrderOpError('この発送元の分はキャンセル済みか、この注文の発送元ではありません。');
  if (active.length === 1) return cancelOrder(fresh, { actor, reason, now });
  if (fresh.shipments[fulfillerId]?.shippedAt) throw new OrderOpError('この出品元は発送済みのため、キャンセルできません。返品として受け付けてください。');
  if (!reason.trim()) throw new OrderOpError('キャンセルの理由を入力してください。');
  const rest = active.filter((id) => id !== fulfillerId);
  const to = rest.every((id) => fresh.shipments[id]?.shippedAt) ? 'shipped' : fresh.status;
  updateOrderOps(fresh.id, (ops, log) => {
    ops.cancelledParts = { ...ops.cancelledParts, [fulfillerId]: { reason, at: now.toISOString(), by: actor.id } };
    ops.status = to;
    ops.history.push(historyEntry({ from: fresh.status, to, note: `${sellerName(fulfillerId)} の分をキャンセル：${reason}`, by: actor.id, now }));
    if (fresh.origin === 'placed') {
      fresh.items.filter((item) => item.fulfillerId === fulfillerId).forEach((item) => log({ productId: item.productId, delta: item.qty, reason: 'キャンセルによる戻し（発送元の分）', orderId: fresh.id, by: actor.id }));
    }
  }, { now });
  return to;
}

// 銀行振込・PayPay の入金を確認した（ここから発送できる）
export function confirmPayment(order, { actor, now = new Date() } = {}) {
  const fresh = reload(order, actor, 'order:write');
  if (fresh.paid) return;
  if (!BEFORE_SHIPPING.includes(fresh.status)) throw new OrderOpError(`「${statusLabel(fresh)}」の注文は入金を確認できません。`);
  updateOrderOps(fresh.id, (ops) => {
    ops.paid = true;
    ops.history.push(historyEntry({ from: fresh.status, to: fresh.status, note: '入金を確認', by: actor.id, now }));
  }, { now });
}

// 出品元へ発送を依頼した（PoC では依頼内容の控えを残すだけ。メールなどの自動送信はしない）。注文受付なら発送準備中へ
export function recordShippingRequest(order, fulfillerId, { actor, now = new Date() } = {}) {
  const fresh = reload(order, actor, 'shipment:write', [fulfillerId]);
  if (!fresh.paid) throw new OrderOpError('入金を確認してから発送を依頼してください。');
  if (!BEFORE_SHIPPING.includes(fresh.status)) throw new OrderOpError(`「${statusLabel(fresh)}」の注文には発送を依頼できません。`);
  if (!activeFulfillerIds(fresh).includes(fulfillerId)) throw new OrderOpError('この注文の発送元ではないか、キャンセル済みです。');
  if (fresh.shipments[fulfillerId]?.shippedAt) throw new OrderOpError('この出品元は発送済みです。');
  updateOrderOps(fresh.id, (ops) => {
    ops.requests = [...ops.requests, { fulfillerId, at: now.toISOString(), by: actor.id }];
    ops.status = 'preparing';
    ops.history.push(historyEntry({ from: fresh.status, to: 'preparing', note: `${sellerName(fulfillerId)} へ発送を依頼`, by: actor.id, now }));
  }, { now });
}

// 追跡番号（複数口なら「、」やカンマ・空白で区切る）を読み取って確かめる。
// { numbers, error（登録できない）, warning（桁数が目安と違う。登録はできる） }
export function checkTrackingNo(carrierId, trackingNo, carrierName = '') {
  const carrier = carrierById(carrierId);
  if (!carrier) return { numbers: [], error: '配送会社を選んでください。', warning: '' };
  if (carrier.id === 'other' && !String(carrierName).trim()) return { numbers: [], error: '配送会社名を入力してください。', warning: '' };
  const numbers = String(trackingNo ?? '').split(/[,、\s]+/).map((value) => value.trim()).filter(Boolean);
  if (!numbers.length) return { numbers, error: '追跡番号を入力してください。', warning: '' };
  if (carrier.digits === null) return { numbers, error: '', warning: '' };
  const warnings = [];
  for (const value of numbers) {
    // 日本郵便の国際郵便（例：AA123456789JP）
    if (carrier.id === 'japanpost' && /^[A-Z]{2}\d{9}[A-Z]{2}$/i.test(value)) continue;
    if (!/^[0-9-]+$/.test(value)) return { numbers, error: '追跡番号は数字とハイフンで入力してください（複数口は「、」で区切る）。', warning: '' };
    const digits = value.replace(/-/g, '').length;
    if (!carrier.digits.includes(digits)) warnings.push(`${value}（${digits}桁）`);
  }
  return { numbers, error: '', warning: warnings.length ? `${carrier.name}の追跡番号はふつう${carrier.digits.join('・')}桁です：${warnings.join('、')}。番号を確かめてください。` : '' };
}

function readShippedOn(shippedOn, order, now) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(shippedOn ?? ''))) throw new OrderOpError('発送日を入力してください。');
  const shippedAt = new Date(`${shippedOn}T12:00:00`);
  if (Number.isNaN(shippedAt.getTime())) throw new OrderOpError('発送日を入力してください。');
  const today = new Date(now);
  today.setHours(23, 59, 59, 999);
  const placedDay = new Date(order.placedAt);
  placedDay.setHours(0, 0, 0, 0);
  if (shippedAt > today) throw new OrderOpError('発送日に未来の日付は入れられません。');
  if (shippedAt < placedDay) throw new OrderOpError('発送日が注文日より前になっています。');
  return shippedAt;
}

const carrierLabel = (shipment) => (shipment.carrier === 'other' && shipment.carrierName ? shipment.carrierName : carrierById(shipment.carrier)?.name ?? shipment.carrier);

// 発送の登録（発送者ごと）。キャンセルしていない発送者がすべて登録したら注文を「発送済」にする。
// correction: { reason } を渡すと、登録済みの発送情報の訂正（注文の状態は変えず、履歴に旧 → 新を残す）
export function registerShipment(order, fulfillerId, { carrier, carrierName = '', trackingNo, shippedOn }, { actor, now = new Date(), correction = null } = {}) {
  const fresh = reload(order, actor, 'shipment:write', [fulfillerId]);
  if (!fresh.paid) throw new OrderOpError('入金を確認してから発送を登録してください。');
  if (!activeFulfillerIds(fresh).includes(fulfillerId)) throw new OrderOpError('この注文の発送元ではないか、キャンセル済みです。');
  const existing = fresh.shipments[fulfillerId];
  if (correction) {
    if (!existing?.shippedAt) throw new OrderOpError('この発送元はまだ発送を登録していません。');
    if (['cancelled', 'refunded'].includes(fresh.status)) throw new OrderOpError(`「${statusLabel(fresh)}」の注文の発送情報は直せません。`);
    if (!String(correction.reason ?? '').trim()) throw new OrderOpError('訂正の理由を入力してください。');
  } else {
    if (existing?.shippedAt) throw new OrderOpError('この発送元は発送を登録済みです。直すときは「発送情報を直す」から操作してください。');
    if (!BEFORE_SHIPPING.includes(fresh.status)) throw new OrderOpError(`「${statusLabel(fresh)}」の注文には発送を登録できません。`);
  }
  const { numbers, error } = checkTrackingNo(carrier, trackingNo, carrierName);
  if (error) throw new OrderOpError(error);
  const shippedAt = readShippedOn(shippedOn, fresh, now);
  const dayOf = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  if (correction && existing.deliveredAt && dayOf(shippedAt) > dayOf(new Date(existing.deliveredAt))) throw new OrderOpError('発送日が配送完了の日より後になっています。');
  const shipment = {
    carrier,
    ...(carrier === 'other' ? { carrierName: String(carrierName).trim() } : {}),
    trackingNo: numbers.join('、'),
    shippedAt: shippedAt.toISOString(),
    deliveredAt: correction ? existing.deliveredAt ?? null : null,
    by: actor.id,
  };
  const rest = activeFulfillerIds(fresh).filter((id) => id !== fulfillerId);
  const to = correction ? fresh.status : rest.every((id) => fresh.shipments[id]?.shippedAt) ? 'shipped' : 'preparing';
  const day = (iso) => `${new Date(iso).getMonth() + 1}/${new Date(iso).getDate()}`;
  const note = correction
    ? `${sellerName(fulfillerId)} の発送情報を訂正（${carrierLabel(existing)} ${existing.trackingNo}・${day(existing.shippedAt)}発送 → ${carrierLabel(shipment)} ${shipment.trackingNo}・${day(shipment.shippedAt)}発送）：${correction.reason}`
    : `${sellerName(fulfillerId)} 発送（${carrierLabel(shipment)} ${shipment.trackingNo}）`;
  updateOrderOps(fresh.id, (ops) => {
    ops.shipments[fulfillerId] = shipment;
    ops.status = to;
    ops.history.push(historyEntry({ from: fresh.status, to, note, by: actor.id, now }));
  }, { now });
  return to;
}
