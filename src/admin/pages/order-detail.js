// 注文詳細・発送管理。出品者発送なので、発送元（出品元）ごとに発送依頼・発送登録・訂正・キャンセルを行う
import { html, render as renderInto } from '../../lib/html.js';
import { sellerById, productById } from '../../lib/market.js';
import { orderById, ORDER_STATUSES, fulfillerIds, statusLabel } from '../../lib/orders.js';
import { allowedActions, changeStatus, cancelOrder, cancelPart, confirmPayment, recordShippingRequest, registerShipment, checkTrackingNo } from '../../lib/order-ops.js';
import { leadText } from '../../lib/delivery.js';
import { paymentById } from '../../data/members.js';
import { CARRIERS, carrierById } from '../../data/carriers.js';
import { categoryById } from '../../data/categories.js';
import { ADMIN_ACCOUNTS } from '../../data/admins.js';
import { SITE } from '../../config/site.js';
import { openModal } from '../../components/Modal.js';
import { showToast } from '../../components/Toast.js';
import { PageHead, Chip, OrderStatusChip, ShippingChip, PaymentChip, DeadlineChip, deadlineOf, confirmDialog, errorMessage, inputError, yen, shortDateTime, shortDate } from '../ui.js';

const FLOW = ['received', 'preparing', 'shipped', 'delivered', 'completed'];

const pad = (n) => String(n).padStart(2, '0');
const dateInput = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const sellerName = (id) => sellerById(id)?.name ?? id;
const adminName = (id) => ADMIN_ACCOUNTS.find((account) => account.id === id)?.name ?? id;
const carrierName = (shipment) => (shipment.carrier === 'other' && shipment.carrierName ? shipment.carrierName : carrierById(shipment.carrier)?.name ?? shipment.carrier);

// 出品元への発送依頼の控え（PoC は運営者がコピーしてメール等で送る。自動送信はしない）
function requestText(order, fulfillerId) {
  const seller = sellerById(fulfillerId);
  const lines = order.items.filter((item) => item.fulfillerId === fulfillerId && !item.cancelled);
  const { address } = order;
  const deadline = deadlineOf(order);
  const number = `${order.id}-${String(fulfillerIds(order).indexOf(fulfillerId) + 1).padStart(2, '0')}`;
  return [
    `【発送依頼 ${number}】${SITE.name} ご注文 ${order.id}`,
    '',
    `${seller?.name ?? fulfillerId} 御中${seller?.contactName ? `（ご担当：${seller.contactName} 様）` : ''}`,
    `発送元：${seller?.shipFrom.label ?? ''} ${seller?.shipFrom.address ?? ''}`,
    '',
    '■発送の期限',
    deadline ? `${deadline.date.getMonth() + 1}/${deadline.date.getDate()}（${'日月火水木金土'[deadline.date.getDay()]}）までに発送してください${order.lead ? `（${leadText(order.lead)}）` : ''}。` : '入金を確認してからご連絡します。',
    '',
    '■お届け先',
    `〒${address.postal} ${address.address}`,
    `${address.recipient}　TEL ${address.tel}`,
    address.place ? `置き場所・受取の条件：${address.place}` : '',
    '',
    '■商品',
    ...lines.map((item) => {
      const sku = item.sellerSku || productById(item.productId)?.sellerSku;
      return `・${item.model} ${item.name}（JAN ${item.jan || '—'}${sku ? `／貴社コード ${sku}` : ''}）× ${item.qty}`;
    }),
    '',
    '■お願い',
    `送り状の依頼主：${SITE.fulfillment.sender}`,
    `同梱物：${SITE.fulfillment.packing}`,
    `発送後、配送会社・追跡番号（伝票番号）・発送日を ${SITE.fulfillment.replyTo} へご連絡ください（件名に「${number}」）。`,
    `注文日：${shortDate(order.placedAt)}`,
    '',
    SITE.operator,
  ].filter((line, index, all) => !(line === '' && all[index - 1] === '')).join('\n');
}

const mailtoOf = (order, fulfillerId) => {
  const seller = sellerById(fulfillerId);
  const subject = `【発送依頼】${SITE.name} ご注文 ${order.id}`;
  return `mailto:${encodeURIComponent(seller?.email ?? '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(requestText(order, fulfillerId))}`;
};

function StatusBlock(order, actions) {
  const status = ORDER_STATUSES[order.status] ?? ORDER_STATUSES.received;
  const payment = paymentById(order.paymentId);
  return html`
    <section class="ablock" aria-labelledby="status-title">
      <h2 class="ablock__title" id="status-title">注文の状況</h2>
      ${status.closed
        ? html`<p>${OrderStatusChip(order)}${order.cancelReason ? html`　<span class="is-muted">理由：${order.cancelReason}</span>` : ''}</p>`
        : html`<ol class="aflow" aria-label="注文の流れ">${FLOW.map((key) => html`<li class="${ORDER_STATUSES[key].flow <= status.flow ? 'is-done' : ''} ${key === order.status ? 'is-current' : ''}">${ORDER_STATUSES[key].label}</li>`)}</ol>`}
      <dl class="adl">
        <dt>支払い</dt><dd>${payment?.label ?? order.paymentId}　${PaymentChip(order)}</dd>
        <dt>発送</dt><dd>${ShippingChip(order) || '—'}　${DeadlineChip(order)}</dd>
        ${order.cancelledAmount ? html`<dt>キャンセルした分</dt><dd>${yen(order.cancelledAmount)}（発送元の分のキャンセル）${actions.refundNeeded ? '・返金の手続きが必要です' : ''}</dd>` : ''}
      </dl>
      <div class="ahead__actions">
        ${actions.confirmPayment ? html`<button class="btn btn--primary btn--sm" type="button" data-confirm-payment>入金を確認した</button>` : ''}
        ${actions.statuses.map((action) => html`<button class="btn btn--secondary btn--sm" type="button" data-status="${action.to}" data-label="${action.label}" ${action.needsNote ? 'data-needs-note' : ''}>${action.label}</button>`)}
        ${actions.cancel ? html`<button class="btn btn--ghost btn--sm" type="button" data-cancel>注文全体をキャンセルする</button>` : ''}
      </div>
      ${['received', 'preparing'].includes(order.status) ? html`<p class="asection__note">発送準備中には「発送依頼の記録」で、発送済には発送元ごとに配送会社・追跡番号を登録すると進みます。</p>` : ''}
    </section>`;
}

function ShipForm(fulfillerId, shipment = null) {
  const today = dateInput(new Date());
  const correcting = Boolean(shipment);
  return html`
    <form class="aship__form" data-ship-form="${fulfillerId}" ${correcting ? 'data-correction' : ''} novalidate>
      <label class="field"><span class="field__label">配送会社</span><select class="field__select" name="carrier" required><option value="">選んでください</option>${CARRIERS.map((carrier) => html`<option value="${carrier.id}" ${shipment?.carrier === carrier.id ? 'selected' : ''}>${carrier.name}</option>`)}</select></label>
      <label class="field"><span class="field__label">配送会社名（その他）</span><input class="field__input" name="carrierName" value="${shipment?.carrierName ?? ''}" autocomplete="off"></label>
      <label class="field"><span class="field__label">追跡番号（複数口は「、」で区切る）</span><input class="field__input" name="trackingNo" value="${shipment?.trackingNo ?? ''}" inputmode="numeric" autocomplete="off" data-tracking></label>
      <label class="field"><span class="field__label">発送日</span><input class="field__input" type="date" name="shippedOn" value="${shipment ? dateInput(new Date(shipment.shippedAt)) : today}" max="${today}"></label>
      ${correcting ? html`<label class="field is-wide"><span class="field__label">訂正の理由（履歴に残ります）</span><input class="field__input" name="reason" autocomplete="off" placeholder="例：追跡番号の1桁違い"></label>` : ''}
      <div class="aship__submit">
        <button class="btn btn--primary btn--sm" type="submit">${correcting ? '訂正を保存' : '発送を登録'}</button>
        ${correcting ? html`<button class="btn btn--ghost btn--sm" type="button" data-correct-cancel>やめる</button>` : ''}
      </div>
      <p class="field__warn" data-tracking-warning></p>
    </form>`;
}

function ShipmentCard(order, fulfillerId, actions, correcting) {
  const seller = sellerById(fulfillerId);
  const shipment = order.shipments[fulfillerId];
  const lines = order.items.filter((item) => item.fulfillerId === fulfillerId);
  const requested = order.requests.filter((request) => request.fulfillerId === fulfillerId).at(-1);
  const cancelled = order.cancelledParts[fulfillerId];
  const open = ['received', 'preparing'].includes(order.status);
  const canShip = order.paid && open && !shipment?.shippedAt && !cancelled;
  let chip = Chip('未発送', 'warn');
  if (cancelled) chip = Chip('キャンセル済み', 'ng');
  else if (shipment?.shippedAt) chip = Chip(shipment.deliveredAt ? '配送完了' : '発送済', 'ok');
  else if (requested) chip = Chip(`発送依頼済み（${shortDateTime(requested.at)}）`, 'blue');
  return html`
    <div class="aship ${cancelled ? 'is-cancelled' : ''}">
      <div class="aship__head">
        <div>
          <p class="aship__title">発送元：${seller?.name ?? fulfillerId}</p>
          <p class="atable__sub">${seller?.shipFrom.label ?? ''}　${seller?.shipFrom.address ?? ''}　${seller?.shipFrom.tel ? `TEL ${seller.shipFrom.tel}` : ''}</p>
        </div>
        <div>${chip}</div>
      </div>
      <ul class="ahistory">${lines.map((item) => html`<li><span>× ${item.qty}</span><span>${item.model}　${item.name}${item.sellerSku ? html`<span class="is-muted">（貴社コード ${item.sellerSku}）</span>` : ''}</span></li>`)}</ul>
      ${cancelled ? html`<p class="asection__note">この発送元の分はキャンセルしました（${shortDateTime(cancelled.at)}・${cancelled.reason}）。</p>` : ''}
      ${shipment?.shippedAt && !correcting ? html`
        <dl class="adl">
          <dt>配送会社</dt><dd>${carrierName(shipment)}</dd>
          <dt>追跡番号</dt><dd class="num">${shipment.trackingNo}</dd>
          <dt>発送日</dt><dd>${shortDate(shipment.shippedAt)}${shipment.deliveredAt ? `　（配送完了 ${shortDate(shipment.deliveredAt)}）` : ''}</dd>
        </dl>
        ${!ORDER_STATUSES[order.status]?.closed || order.status === 'returned' ? html`<div class="ahead__actions"><button class="btn btn--ghost btn--sm" type="button" data-correct="${fulfillerId}">発送情報を直す</button></div>` : ''}` : ''}
      ${shipment?.shippedAt && correcting ? ShipForm(fulfillerId, shipment) : ''}
      ${open && !cancelled && !shipment?.shippedAt ? html`
        <div class="ahead__actions">
          ${canShip ? html`<button class="btn btn--secondary btn--sm" type="button" data-request="${fulfillerId}">発送依頼の控えを見る</button>` : ''}
          ${actions.cancelPart ? html`<button class="btn btn--ghost btn--sm" type="button" data-cancel-part="${fulfillerId}">この発送元の分をキャンセル</button>` : ''}
        </div>` : ''}
      ${canShip ? ShipForm(fulfillerId) : !order.paid && open && !cancelled ? html`<p class="asection__note">入金を確認してから、発送を依頼・登録できます。</p>` : ''}
    </div>`;
}

export function render({ params, admin }) {
  const order = orderById(params.id);
  if (!order) return { title: '注文が見つかりません', view: html`${PageHead({ title: '注文が見つかりません', crumbs: [{ href: '#/orders', label: '注文一覧' }] })}<p>注文番号「${params.id}」はありません。</p>` };
  const { buyer, address } = order;
  const fulfillers = fulfillerIds(order);
  const actions = allowedActions(order);
  return {
    title: `注文 ${order.id}`,
    view: html`
      ${PageHead({ title: `注文 ${order.id}`, crumbs: [{ href: '#/orders', label: '注文一覧' }], lead: html`${shortDateTime(order.placedAt)} 注文　${OrderStatusChip(order)}　${order.origin === 'seed' ? '（デモの初期データ）' : ''}` })}
      <div>
        ${StatusBlock(order, actions)}
        <section class="ablock" aria-labelledby="ship-title">
          <h2 class="ablock__title" id="ship-title">発送（出品元ごと：${fulfillers.length}か所）</h2>
          <p class="asection__note">出品者発送：商品は出品元から購入者へ直接届きます。出品元へ発送を依頼し、発送されたら配送会社・追跡番号・発送日を登録します（購入者のマイページに表示されます）。</p>
          <div data-shipments>${fulfillers.map((id) => ShipmentCard(order, id, actions, false))}</div>
        </section>
        <div class="agrid-2">
          <section class="ablock" aria-labelledby="buyer-title">
            <h2 class="ablock__title" id="buyer-title">購入者</h2>
            <dl class="adl">
              <dt>会社名</dt><dd>${buyer.company}</dd>
              <dt>氏名</dt><dd>${buyer.name}</dd>
              <dt>会員番号</dt><dd>${buyer.memberNo}</dd>
              <dt>職種</dt><dd>${buyer.trade}</dd>
              <dt>契約プラン</dt><dd>${buyer.plan}</dd>
              <dt>連絡先</dt><dd>${[buyer.email, buyer.tel].filter(Boolean).join('　')}</dd>
            </dl>
          </section>
          <section class="ablock" aria-labelledby="address-title">
            <h2 class="ablock__title" id="address-title">配送先</h2>
            <dl class="adl">
              <dt>名称</dt><dd>${address.label}</dd>
              <dt>宛名</dt><dd>${address.recipient}</dd>
              <dt>住所</dt><dd>〒${address.postal}　${address.address}</dd>
              <dt>電話</dt><dd>${address.tel}</dd>
              ${address.place ? html`<dt>受取の条件</dt><dd>${address.place}</dd>` : ''}
            </dl>
          </section>
        </div>
        <section class="ablock" aria-labelledby="items-title">
          <h2 class="ablock__title" id="items-title">商品・金額（注文時点の記録）</h2>
          <div class="atable-wrap">
            <table class="atable atable--stack">
              <thead><tr><th>商品・JAN</th><th>カテゴリー</th><th>出品元（発送元）</th><th class="is-num">単価</th><th class="is-num">数量</th><th class="is-num">小計</th></tr></thead>
              <tbody>
                ${order.items.map((item) => {
                  const product = productById(item.productId);
                  return html`
                    <tr class="${item.cancelled ? 'arow--cancelled' : ''}">
                      <td class="atable__main-cell atable__name-cell"><div class="atable__main">${product ? html`<a href="#/products/${product.id}">${item.model}</a>` : html`<span>${item.model}</span>`}<span class="atable__sub">${item.name}${item.cancelled ? '（キャンセル）' : ''}</span><span class="atable__sub">JAN ${item.jan || '—'}</span></div></td>
                      <td data-label="カテゴリー">${categoryById(item.categoryId)?.name ?? '—'}</td>
                      <td data-label="出品元">${sellerName(item.sellerId) ?? '—'}${item.fulfillerId && item.fulfillerId !== item.sellerId ? html`<div class="atable__sub">発送：${sellerName(item.fulfillerId)}</div>` : ''}</td>
                      <td class="is-num" data-label="単価">${yen(item.price)}${item.saleKind && item.saleKind !== 'quote' ? html`<div class="atable__sub">${item.saleKind === 'timesale' ? 'TIME SALE' : item.saleKind === 'weekend' ? '週末限定' : '季節SALE'}</div>` : ''}</td>
                      <td class="is-num" data-label="数量">${item.qty}</td>
                      <td class="is-num" data-label="小計">${yen(item.price * item.qty)}</td>
                    </tr>`;
                })}
              </tbody>
            </table>
          </div>
          <dl class="adl">
            <dt>商品の小計</dt><dd class="num">${yen(order.subtotal)}</dd>
            <dt>送料</dt><dd class="num">${order.shipping ? yen(order.shipping) : '無料'}</dd>
            <dt>お支払い合計</dt><dd class="num"><strong>${yen(order.total)}</strong>（税込）${order.cancelledAmount ? `　うちキャンセル ${yen(order.cancelledAmount)}` : ''}</dd>
            <dt>購入の経路</dt><dd>${{ cart: 'カート', buy_now: '今すぐ購入', quote: '見積から' }[order.via] ?? order.via}${order.quoteId ? `（見積 ${order.quoteId}）` : ''}</dd>
          </dl>
        </section>
        <section class="ablock" aria-labelledby="history-title">
          <h2 class="ablock__title" id="history-title">履歴</h2>
          <ul class="ahistory">
            <li><time>${shortDateTime(order.placedAt)}</time><span>注文を受け付け（${buyer.company}）</span></li>
            ${order.history.map((entry) => html`<li><time>${shortDateTime(entry.at)}</time><span>${entry.from !== entry.to ? `${ORDER_STATUSES[entry.from]?.label ?? entry.from} → ${ORDER_STATUSES[entry.to]?.label ?? entry.to}　` : ''}${entry.note}${entry.by ? html`　<span class="is-muted">（${adminName(entry.by)}）</span>` : ''}</span></li>`)}
            ${order.origin === 'seed' && !order.history.length ? html`<li><time>—</time><span class="is-muted">デモの初期データ（これまでの操作履歴はありません）</span></li>` : ''}
          </ul>
        </section>
      </div>`,
    mount(root, { refresh }) {
      const options = { actor: admin };
      // どの操作も、この画面を開いた時点の注文（版つき）を渡す。別のタブで変わっていれば order-ops が止める
      const run = (action, message) => {
        try {
          const result = action();
          showToast(typeof message === 'function' ? message(result) : message);
          refresh();
        } catch (error) {
          showToast(errorMessage(error));
        }
      };
      const shipments = root.querySelector('[data-shipments]');
      // 「発送情報を直す」：その発送元のカードだけ入力欄に切り替える（保存するまで注文は変えない）
      const redrawShipments = (correctingId = null) => {
        renderInto(shipments, html`${fulfillers.map((id) => ShipmentCard(order, id, actions, id === correctingId))}`);
      };
      root.addEventListener('click', (event) => {
        if (event.target.closest('[data-confirm-payment]')) {
          confirmDialog({ title: '入金を確認しましたか？', text: `${order.id}（${yen(order.total)}）の入金を確認済みにします。発送の依頼・登録ができるようになります。`, confirmLabel: '入金を確認した', onConfirm: () => run(() => confirmPayment(order, options), '入金を確認済みにしました。') });
          return;
        }
        const statusButton = event.target.closest('[data-status]');
        if (statusButton) {
          const to = statusButton.dataset.status;
          const needsNote = statusButton.hasAttribute('data-needs-note');
          const actionLabel = statusButton.dataset.label;
          confirmDialog({
            title: `「${actionLabel}」でよいですか？`,
            text: needsNote ? '理由・内容を記録します（例：初期不良のため返品を受付）。' : `${order.id} を「${ORDER_STATUSES[to].label}」にします。`,
            confirmLabel: actionLabel,
            input: needsNote ? { label: '理由・内容' } : null,
            onConfirm: (note) => {
              if (needsNote && !note.trim()) throw inputError('理由・内容を入力してください。');
              changeStatus(order, to, { ...options, note });
              showToast(`「${statusLabel(orderById(order.id))}」にしました。`);
              refresh();
            },
          });
          return;
        }
        if (event.target.closest('[data-cancel]')) {
          confirmDialog({
            title: '注文全体をキャンセルしますか？',
            text: `${order.id} をキャンセルします。在庫は自動で戻ります。${actions.refundNeeded ? '代金を受け取っているため、返金の手続きも必要です（返金後に「返金済みにする」を押してください）。' : ''}`,
            confirmLabel: 'キャンセルする',
            danger: true,
            input: { label: 'キャンセルの理由（購入者のマイページにも表示されます）' },
            onConfirm: (reason) => {
              cancelOrder(order, { ...options, reason });
              showToast('注文をキャンセルし、在庫を戻しました。');
              refresh();
            },
          });
          return;
        }
        const partButton = event.target.closest('[data-cancel-part]');
        if (partButton) {
          const fulfillerId = partButton.dataset.cancelPart;
          confirmDialog({
            title: `${sellerName(fulfillerId)} の分をキャンセルしますか？`,
            text: `この発送元の商品だけをキャンセルし、在庫を戻します。ほかの発送元の分はそのまま発送します。${actions.refundNeeded ? 'キャンセルした分の返金の手続きが必要です。' : ''}`,
            confirmLabel: 'この発送元の分をキャンセル',
            danger: true,
            input: { label: 'キャンセルの理由（例：出品元の在庫切れ。購入者のマイページにも表示されます）' },
            onConfirm: (reason) => {
              cancelPart(order, fulfillerId, { ...options, reason });
              showToast(`${sellerName(fulfillerId)} の分をキャンセルし、在庫を戻しました。`);
              refresh();
            },
          });
          return;
        }
        const correct = event.target.closest('[data-correct]');
        if (correct) {
          redrawShipments(correct.dataset.correct);
          return;
        }
        if (event.target.closest('[data-correct-cancel]')) {
          redrawShipments();
          return;
        }
        const request = event.target.closest('[data-request]');
        if (request) {
          const fulfillerId = request.dataset.request;
          const { close, panel } = openModal(html`
            <div class="aconfirm">
              <h2 class="aconfirm__title">発送依頼の控え（${sellerName(fulfillerId)}）</h2>
              <p class="aconfirm__text">内容を確かめて、出品元へメール等で送ってください（この画面からは送信しません）。送ったら「依頼したことを記録」を押すと、注文が「発送準備中」になります。【要確認】の行は運用ルールが決まったら差し替えます。</p>
              <textarea class="arequest" readonly data-request-text>${requestText(order, fulfillerId)}</textarea>
              <div class="aconfirm__actions">
                <a class="btn btn--ghost" href="${mailtoOf(order, fulfillerId)}">メールソフトで開く</a>
                <button class="btn btn--ghost" type="button" data-copy>コピーする</button>
                <button class="btn btn--primary" type="button" data-record>依頼したことを記録</button>
              </div>
            </div>`, { label: '発送依頼の控え' });
          panel.querySelector('[data-copy]').addEventListener('click', async () => {
            const text = panel.querySelector('[data-request-text]');
            try {
              await navigator.clipboard.writeText(text.value);
              showToast('コピーしました。');
            } catch {
              text.select();
              showToast('文字を選択しました。Ctrl＋C（⌘＋C）でコピーしてください。');
            }
          });
          panel.querySelector('[data-record]').addEventListener('click', () => {
            close();
            run(() => recordShippingRequest(order, fulfillerId, options), '発送依頼を記録しました。');
          });
        }
      });
      const showWarning = (form) => {
        const { warning } = checkTrackingNo(form.carrier.value, form.trackingNo.value, form.carrierName.value);
        form.querySelector('[data-tracking-warning]').textContent = form.trackingNo.value ? warning : '';
      };
      root.addEventListener('input', (event) => {
        const form = event.target.closest('[data-ship-form]');
        if (form) showWarning(form);
      });
      root.addEventListener('change', (event) => {
        const form = event.target.closest('[data-ship-form]');
        if (form && event.target.name === 'carrier') showWarning(form);
      });
      root.addEventListener('submit', (event) => {
        const form = event.target.closest('[data-ship-form]');
        if (!form) return;
        event.preventDefault();
        const fulfillerId = form.dataset.shipForm;
        const correction = form.hasAttribute('data-correction') ? { reason: form.reason.value } : null;
        const values = { carrier: form.carrier.value, carrierName: form.carrierName.value, trackingNo: form.trackingNo.value, shippedOn: form.shippedOn.value };
        run(() => registerShipment(order, fulfillerId, values, { ...options, correction }), (to) => {
          if (correction) return '発送情報を訂正しました（履歴に旧と新の番号を残しました）。購入者のマイページも新しい番号になります。';
          return to === 'shipped' ? '発送を登録し、注文を「発送済」にしました。購入者のマイページに追跡番号が出ます。' : 'この発送元の発送を登録しました（ほかの発送元はまだ未発送です）。';
        });
      });
    },
  };
}
