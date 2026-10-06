import { html, attr } from '../lib/html.js';
import { isPurchasable } from '../lib/status.js';
import { yen, fullDate, dateTime, monthDay } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { productById, shelves } from '../lib/catalog.js';
import { savingsOf } from '../lib/pricing.js';
import { sellerById } from '../lib/market.js';
import { leadText } from '../lib/delivery.js';
import { carrierById } from '../data/carriers.js';
import { getOrders, orderStatus, getQuotes, getInvoices, isQuoteOrderable, documentLabel, receiptAvailable, saleLines, payableAmount } from '../lib/orders.js';
import {
  addToCart, getCart, getFavorites, getAddresses, addAddress, getSavedPaymentIds, getCheckoutDefaults,
  getOwnedBatteries, setOwnedBatteries, logout,
} from '../lib/store.js';
import { track, getEventLog, clearEventLog, FUNNEL_STEPS } from '../lib/analytics.js';
import { categoryById } from '../data/categories.js';
import { BATTERY_PLATFORMS, platformById } from '../data/batteries.js';
import { paymentById } from '../data/members.js';
import { SITE } from '../config/site.js';
import { ProductImage } from '../components/ProductImage.js';
import { ProductGrid } from '../components/ProductGrid.js';
import { SectionHeader } from '../components/Section.js';
import { AddressForm, bindAddressForm } from '../components/AddressForm.js';
import { openReceipt, openQuote, openInvoice } from '../components/Documents.js';
import { openModal } from '../components/Modal.js';
import { showToast } from '../components/Toast.js';
import { EmptyState } from '../components/Common.js';
import { Icon } from '../components/Icon.js';

const TABS = [
  { id: 'overview', label: 'マイページ', icon: 'home' },
  { id: 'orders', label: '購入履歴・注文状況', icon: 'truck' },
  { id: 'favorites', label: 'お気に入り', icon: 'heart', href: '#/favorites' },
  { id: 'quotes', label: '見積履歴', icon: 'doc' },
  { id: 'billing', label: '請求書・領収書', icon: 'receipt' },
  { id: 'addresses', label: '配送先', icon: 'pin' },
  { id: 'payments', label: '支払方法', icon: 'card' },
  { id: 'profile', label: '会員・法人情報', icon: 'building' },
  { id: 'insights', label: 'PoC計測（デモ）', icon: 'compare' },
];

function TabNav(active) {
  return html`
    <nav class="mynav" aria-label="マイページのメニュー">
      ${TABS.map((tab) => html`
        <a class="mynav__item ${tab.id === active ? 'is-active' : ''}" href="${tab.href ?? `#/mypage?tab=${tab.id}`}" ${attr('aria-current', tab.id === active && 'page')}>${Icon(tab.icon)}<span>${tab.label}</span></a>`)}
      <button class="mynav__item mynav__logout" type="button" data-logout>${Icon('logout')}<span>ログアウト</span></button>
    </nav>`;
}

function MemberCard(account) {
  return html`
    <div class="member-card">
      <p class="member-card__label en">GENBA YARD MEMBER</p>
      <p class="member-card__name">${account.name}<small>${account.position}</small></p>
      <p class="member-card__company">${account.company}</p>
      <dl class="member-card__meta">
        <div><dt>会員番号</dt><dd class="en">${account.memberNo}</dd></div>
        <div><dt>${SITE.carrierService}</dt><dd>${account.contract.plan}</dd></div>
        <div><dt>ご契約</dt><dd>${account.contract.since}〜</dd></div>
      </dl>
    </div>`;
}

function StatusSteps(order) {
  const { step, steps, label: current } = orderStatus(order);
  return html`
    <ol class="ostatus" aria-label="注文状況：${current}">
      ${steps.map((label, index) => html`<li class="ostatus__step ${index <= step ? 'is-done' : ''} ${index === step ? 'is-current' : ''}"><span>${label}</span></li>`)}
    </ol>`;
}

function shipLine(order) {
  const status = orderStatus(order);
  if (status.closed) return order.cancelReason ? `${status.label}（${order.cancelReason}）` : status.label;
  if (!status.paid) return `${status.label}（ご入金の確認後に出荷します）`;
  if (status.step >= 2) return status.step === 3 ? '配送完了' : '出品元から発送しました';
  if (order.lead) return `出品元から発送予定（${leadText(order.lead)}）`;
  return `お届け予定 ${monthDay(new Date(order.deliveryDate))}`;
}

// 出品元ごとの発送情報（配送会社・追跡番号・発送日）
function Shipments(order) {
  const shipped = Object.entries(order.shipments).filter(([, shipment]) => shipment?.shippedAt);
  if (!shipped.length) return '';
  return html`
    <ul class="order__shipments">
      ${shipped.map(([fulfillerId, shipment]) => html`
        <li>
          <span class="order__shipments-from">${sellerById(fulfillerId)?.name ?? '出品元'}から発送</span>
          <span>${shipment.carrier === 'other' && shipment.carrierName ? shipment.carrierName : carrierById(shipment.carrier)?.name ?? '配送会社'}　追跡番号 <span class="num">${shipment.trackingNo}</span></span>
          <span>${monthDay(new Date(shipment.shippedAt))} 発送${shipment.deliveredAt ? `・${monthDay(new Date(shipment.deliveredAt))} 配送完了` : ''}</span>
        </li>`)}
    </ul>`;
}

function OrderCard(order) {
  const payment = paymentById(order.paymentId);
  const documents = order.paymentId === 'invoice' || receiptAvailable(order);
  return html`
    <article class="order">
      <header class="order__head">
        <div>
          <p class="order__date">${dateTime(new Date(order.placedAt))}</p>
          <p class="order__id">注文番号 <span class="num">${order.id}</span></p>
        </div>
        <p class="order__total"><span class="num">${yen(payableAmount(order))}</span><small>${payment.label}${order.cancelledAmount ? `・キャンセル ${yen(order.cancelledAmount)} を除く` : ''}</small></p>
      </header>
      ${StatusSteps(order)}
      <p class="order__ship">${Icon('pin')}${order.address.label}　${shipLine(order)}</p>
      ${Shipments(order)}
      <ul class="order__items">
        ${order.items.map((item) => {
          const product = productById(item.productId);
          // 品名はご注文時点の記録で出す（後から商品の情報が直っても、注文の内容は変わらない）
          return html`
            <li class="${item.cancelled ? 'is-cancelled' : ''}">
              ${product ? html`<a href="#/product/${product.id}">${ProductImage(product, { className: 'pimg--thumb' })}</a>` : html`<span class="pimg pimg--thumb" aria-hidden="true"></span>`}
              <div><p class="en">${item.maker} ${item.model}</p><p class="order__item-name">${item.name}</p>${item.cancelled ? html`<p class="order__item-note">この商品はキャンセルしました（${order.cancelledParts[item.fulfillerId]?.reason ?? '出品元の事情'}）</p>` : ''}</div>
              <p class="num">${item.qty} × ${yen(item.price)}</p>
            </li>`;
        })}
      </ul>
      <div class="order__actions">
        <button class="btn btn--secondary btn--sm" type="button" data-reorder="${order.id}">${Icon('refresh')}もう一度買う</button>
        ${documents ? html`<button class="btn btn--ghost btn--sm" type="button" data-receipt="${order.id}">${Icon('receipt')}${documentLabel(order)}</button>` : html`<span class="note">${order.paid ? '領収書はキャンセル・返金した注文には発行しません' : '領収書はご入金の確認後に発行できます'}</span>`}
      </div>
    </article>`;
}

function Overview(account, orders) {
  const active = orders.filter((order) => !orderStatus(order).closed && orderStatus(order).step < 3);
  const invoices = getInvoices(account);
  const current = invoices.find((entry) => entry.status === '締め前（今月分）');
  const owned = getOwnedBatteries();
  const recommended = shelves.recommendedFor(account).slice(0, 4);
  // 会員でいることの価値を数字で見せる（Wi-Fi を続ける理由）。比較元は各商品のメーカー希望小売価格で、比較元を出してよい商品だけ数える
  // キャンセル・返金した注文（発送元の分を含む）と、いまは無い商品は数えない
  const { savings, savingsIncludesLaunch } = savingsOf(orders.flatMap(saleLines).map((item) => ({ ...item, product: productById(item.productId) })).filter((item) => item.product));
  return html`
    <div class="overview">
      ${MemberCard(account)}
      <dl class="stats">
        <div><dt>配送中・準備中の注文</dt><dd class="num">${active.length}<small>件</small></dd></div>
        <div><dt>お気に入り</dt><dd class="num">${getFavorites().length}<small>件</small></dd></div>
        <div><dt>今月の請求（締め前）</dt><dd class="num">${current ? yen(current.total) : '—'}</dd></div>
        ${savings > 0 ? html`<div class="stats__wide"><dt>会員になってからの希望小売価格との差額（累計）${savingsIncludesLaunch ? html`<span class="stats__note">廃番・終売品は発売時の希望小売価格と比べています</span>` : ''}</dt><dd class="num">${yen(savings)}</dd></div>` : ''}
      </dl>
    </div>
    ${active.length ? html`
      <section class="mysection" aria-labelledby="active-title">
        ${SectionHeader({ id: 'active-title', eyebrow: 'IN PROGRESS', title: '進行中の注文', link: { href: '#/mypage?tab=orders', label: '購入履歴をすべて見る' } })}
        ${active.slice(0, 2).map(OrderCard)}
      </section>` : ''}
    <section class="mysection" aria-labelledby="persona-title">
      ${SectionHeader({ id: 'persona-title', eyebrow: 'YOUR PROFILE', title: 'あなたに合わせた表示', lead: '職種・よく購入するカテゴリー・手持ちのバッテリーから、おすすめと「手持ちで動く」表示を出しています。' })}
      <dl class="persona">
        <div><dt>職種</dt><dd>${account.trade}</dd></div>
        <div><dt>よく購入するカテゴリー</dt><dd>${account.favoriteCategoryIds.map((id) => html`<a class="quick__item" href="#/products?cat=${id}">${categoryById(id).name}</a>`)}</dd></div>
        <div><dt>手持ちのバッテリー</dt><dd>${owned.length ? owned.map((id) => platformById(id).name).join('、') : '未登録'} <a class="link-btn" href="#/mypage?tab=profile">変更</a></dd></div>
      </dl>
    </section>
    <section class="mysection" aria-labelledby="myrec-title">
      ${SectionHeader({ id: 'myrec-title', eyebrow: 'FOR YOU', title: 'あなたへのおすすめ' })}
      ${ProductGrid(recommended, { layout: 'rail', listName: 'マイページおすすめ' })}
    </section>`;
}

function Orders(orders) {
  if (!orders.length) {
    return EmptyState({ icon: 'truck', title: 'まだ購入履歴がありません', text: 'はじめての注文は、お届け先が契約情報から入力された状態で始められます。', action: { href: '#/products?sale=any', label: '開催中のSALEを見る' } });
  }
  return html`<div class="orders">${orders.map(OrderCard)}</div>`;
}

function Quotes(account) {
  const quotes = getQuotes(account);
  return html`
    <div class="quote-request">
      <p><strong>まとめ買い・複数現場への配送は、見積もりでご依頼ください。</strong>数量・現場ごとの配送先・納期をまとめて回答します。</p>
      <button class="btn btn--secondary btn--sm" type="button" data-request-quote>${Icon('doc')}見積もりを依頼する</button>
    </div>
    ${quotes.length ? html`
      <ul class="doc-list">
        ${quotes.map((quote) => html`
          <li class="doc-list__item">
            <div>
              <p class="doc-list__title">${quote.title}</p>
              <p class="doc-list__meta">${quote.id}　${fullDate(new Date(quote.createdAt))}　有効期限 ${fullDate(new Date(quote.validUntil))}</p>
            </div>
            <p class="doc-list__amount num">${yen(quote.total)}</p>
            <span class="chip ${isQuoteOrderable(quote) ? 'chip--ok' : 'chip--neutral'}">${quote.status}</span>
            <div class="doc-list__actions">
              <button class="btn btn--ghost btn--sm" type="button" data-quote="${quote.id}">見積書</button>
              ${isQuoteOrderable(quote) ? html`<a class="btn btn--secondary btn--sm" href="#/checkout?quote=${quote.id}">この見積で注文する</a>` : ''}
            </div>
          </li>`)}
      </ul>` : EmptyState({ icon: 'doc', title: '見積履歴はありません', text: '数量の多い注文や、複数の現場への配送はお見積もりで承ります。' })}`;
}

function Billing(account, orders) {
  const invoices = getInvoices(account);
  const receipts = orders.filter((order) => order.paymentId !== 'invoice');
  return html`
    <section class="mysection" aria-labelledby="invoice-title">
      ${SectionHeader({ id: 'invoice-title', eyebrow: 'INVOICE', title: '請求書（請求書払い）', lead: '月末締め・翌月末払い。適格請求書として発行します。' })}
      ${invoices.length ? html`
        <ul class="doc-list">
          ${invoices.map((entry) => html`
            <li class="doc-list__item">
              <div>
                <p class="doc-list__title">${entry.year}年${entry.monthNumber}月分（${entry.orders.length}件${entry.deductions.length ? `・差し引き${entry.deductions.length}件` : ''}）</p>
                <p class="doc-list__meta">お支払い期限 ${fullDate(entry.due)}</p>
              </div>
              <p class="doc-list__amount num">${yen(entry.total)}</p>
              <span class="chip ${entry.status === '支払済み' ? 'chip--ok' : entry.status === '未払い' ? 'chip--warn' : 'chip--neutral'}">${entry.status}</span>
              <div class="doc-list__actions"><button class="btn btn--ghost btn--sm" type="button" data-invoice="${entry.month}">請求書</button></div>
            </li>`)}
        </ul>` : html`<p class="note">請求書払いのご注文はありません。</p>`}
    </section>
    <section class="mysection" aria-labelledby="receipt-title">
      ${SectionHeader({ id: 'receipt-title', eyebrow: 'RECEIPT', title: '領収書', lead: 'クレジットカード・PayPay・銀行振込のご注文。宛名入りで何度でも発行できます。' })}
      ${receipts.length ? html`
        <ul class="doc-list">
          ${receipts.map((order) => html`
            <li class="doc-list__item">
              <div><p class="doc-list__title">注文 ${order.id}</p><p class="doc-list__meta">${fullDate(new Date(order.placedAt))}　${paymentById(order.paymentId).label}</p></div>
              <p class="doc-list__amount num">${yen(payableAmount(order))}</p>
              ${receiptAvailable(order)
                ? html`<span class="chip chip--ok">発行できます</span>
                  <div class="doc-list__actions"><button class="btn btn--ghost btn--sm" type="button" data-receipt="${order.id}">領収書</button></div>`
                : html`<span class="chip chip--warn">${orderStatus(order).label}</span><div class="doc-list__actions"><span class="note">${order.paid ? 'キャンセル・返金のため発行しません' : 'ご入金の確認後に発行'}</span></div>`}
            </li>`)}
        </ul>` : html`<p class="note">対象のご注文はありません。</p>`}
    </section>`;
}

function Addresses(adding) {
  const defaults = getCheckoutDefaults();
  return html`
    <p class="mylead">現場ごとにお届け先を登録しておくと、購入手続きで選ぶだけで現場へ直送できます。</p>
    <ul class="address-list">
      ${getAddresses().map((address) => html`
        <li class="address-card">
          <p class="address__label">${address.label}${address.id === defaults.addressId ? html`<span class="chip chip--ok">前回のお届け先</span>` : ''}${address.fromContract ? html`<span class="chip chip--neutral">契約情報</span>` : ''}</p>
          <p>${address.recipient}</p>
          <p>〒${address.postal} ${address.address}</p>
          <p class="address__meta">TEL ${address.tel}${address.place ? `　置き場所：${address.place}` : ''}</p>
        </li>`)}
    </ul>
    ${adding ? AddressForm({ submitLabel: '登録する' }) : html`<button class="btn btn--secondary" type="button" data-add-address>${Icon('plus')}お届け先（現場）を追加</button>`}`;
}

function Payments() {
  const saved = getSavedPaymentIds().map(paymentById);
  const defaults = getCheckoutDefaults();
  return html`
    <p class="mylead">購入手続きでは、前回使ったお支払い方法が最初から選ばれます。</p>
    ${saved.length ? html`
      <ul class="pay-list">
        ${saved.map((method) => html`
          <li class="pay-list__item">
            <p class="pay-list__title">${method.label}${method.id === defaults.paymentId ? html`<span class="chip chip--ok">前回のお支払い方法</span>` : ''}</p>
            <p class="pay-list__detail">${method.id === 'card' ? SITE.demoCardLabel : method.detail}</p>
          </li>`)}
      </ul>` : EmptyState({ icon: 'card', title: '登録済みのお支払い方法はありません', text: '最初のご注文で選んだ方法が、次回から自動で選ばれます。' })}
    <p class="note">カード情報は決済代行会社が保管し、このサイトには保存しません。請求書払いの与信審査は本番で実施します（デモでは省略）。</p>`;
}

function Profile(account) {
  const owned = getOwnedBatteries();
  return html`
    <section class="mysection" aria-labelledby="battery-title">
      ${SectionHeader({ id: 'battery-title', eyebrow: 'MY BATTERY', title: '手持ちのバッテリー', lead: '登録すると、一覧と商品ページに「手持ちで動く」が表示され、絞り込みにも使えます。' })}
      <form class="battery-form" data-battery-form>
        ${BATTERY_PLATFORMS.map((platform) => html`
          <label class="check check--card">
            <input type="checkbox" name="platform" value="${platform.id}" ${owned.includes(platform.id) ? 'checked' : ''}>
            <span><strong>${platform.name}</strong><small>${platform.batteries.join('／')}</small></span>
          </label>`)}
        <button class="btn btn--primary" type="submit">保存する</button>
      </form>
    </section>
    <section class="mysection" aria-labelledby="member-title">
      ${SectionHeader({ id: 'member-title', eyebrow: 'MEMBER', title: '会員情報' })}
      <dl class="info-list">
        <div><dt>お名前</dt><dd>${account.name}（${account.position}）</dd></div>
        <div><dt>会員番号</dt><dd class="en">${account.memberNo}</dd></div>
        <div><dt>ログインID（メール）</dt><dd>${account.loginId}</dd></div>
        <div><dt>職種</dt><dd>${account.trade}</dd></div>
        <div><dt>${SITE.carrierService}</dt><dd>${account.contract.plan}／契約番号 ${account.contract.contractNo}（${account.contract.since}〜）</dd></div>
      </dl>
    </section>
    <section class="mysection" aria-labelledby="corp-title">
      ${SectionHeader({ id: 'corp-title', eyebrow: 'COMPANY', title: '法人情報' })}
      <dl class="info-list">
        <div><dt>名称</dt><dd>${account.corporate.name}</dd></div>
        <div><dt>代表者</dt><dd>${account.corporate.representative}</dd></div>
        <div><dt>所在地</dt><dd>${account.corporate.address}</dd></div>
        <div><dt>電話</dt><dd>${account.corporate.tel}</dd></div>
        <div><dt>請求先担当</dt><dd>${account.corporate.billingContact}</dd></div>
        <div><dt>締め・支払</dt><dd>${account.corporate.terms}</dd></div>
        <div><dt>領収書・請求書の宛名</dt><dd>${account.corporate.receiptName}</dd></div>
      </dl>
      <p class="note">担当者ごとの購入管理（メンバー招待・承認フロー）は今後追加予定です。</p>
    </section>`;
}

// PoC で測る指標を、このブラウザで操作したイベントから集計して見せる
function Insights() {
  const log = getEventLog();
  const count = (event, predicate = () => true) => log.filter((entry) => entry.event === event && predicate(entry)).length;
  const funnel = FUNNEL_STEPS.map((step) => ({ ...step, value: count(step.event) }));
  const rate = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  const buyNow = count('add_to_cart', (entry) => entry.method === 'buy_now');
  const adds = count('add_to_cart');
  const begins = count('begin_checkout');
  const purchases = count('purchase');
  const revenue = log.filter((entry) => entry.event === 'purchase').reduce((sum, entry) => sum + entry.value, 0);
  const maxValue = Math.max(1, ...funnel.map((step) => step.value));
  return html`
    <p class="mylead">このブラウザでの操作を、本番の計測（GA4 の推奨イベント名）と同じ形で記録しています。各イベントには会員番号と契約プランが付き、PoC では Wi-Fi 契約側の数字と突き合わせて集計します。</p>
    <section class="mysection" aria-labelledby="hypothesis-title">
      ${SectionHeader({ id: 'hypothesis-title', eyebrow: 'POC DESIGN', title: 'PoC で確かめること', lead: '目標（仮）は README の試算（月次ログイン率20%・購入率2%で、注文月30件に約3,750契約）。ほかは参加する契約者数と告知経路が決まり次第、開始前に設定します。' })}
      <table class="event-table poc-table">
        <thead><tr><th scope="col">仮説</th><th scope="col">指標</th><th scope="col">目標（仮）</th><th scope="col">判定の時期</th></tr></thead>
        <tbody>
          <tr><td>契約者がマーケットを使う</td><td>契約者の月次ログイン率・再訪率（login）</td><td>月次ログイン率 20%</td><td>開始1か月後</td></tr>
          <tr><td>型落ち・廃番でも安心して買える</td><td>詳細→カート投入率・購入画面の離脱率（view_item → add_to_cart → begin_checkout → purchase）</td><td>訪問あたり購入率 2%</td><td>開始1か月後</td></tr>
          <tr><td>購入までが早い</td><td>今すぐ購入の利用率・2回目以降の確認画面での確定率（method / express）</td><td>開始前に設定</td><td>開始1か月後</td></tr>
          <tr><td>会員特典が Wi-Fi を続ける理由になる</td><td>利用者と非利用者の解約率の差・特典を見て申し込んだ率（契約側データ）</td><td>開始前に設定</td><td>開始3か月後</td></tr>
          <tr><td>出品側の在庫が動く</td><td>放出分の消化率・消化までの日数・返品率（出品元ごと）</td><td>出品元と合意</td><td>放出ごと</td></tr>
        </tbody>
      </table>
    </section>
    <section class="mysection" aria-labelledby="funnel-title">
      ${SectionHeader({ id: 'funnel-title', eyebrow: 'FUNNEL', title: '商品詳細 → カート → 購入手続き → 注文確定' })}
      <ol class="funnel">
        ${funnel.map((step, index) => html`
          <li class="funnel__step">
            <span class="funnel__label">${step.label}<code>${step.event}</code></span>
            <span class="funnel__bar"><span style="width:${Math.round((step.value / maxValue) * 100)}%"></span></span>
            <span class="funnel__value num">${step.value}</span>
            <span class="funnel__rate num">${index ? rate(step.value, funnel[index - 1].value) : ''}</span>
          </li>`)}
      </ol>
    </section>
    <dl class="kpis">
      <div><dt>今すぐ購入の利用率</dt><dd class="num">${rate(buyNow, adds)}</dd></div>
      <div><dt>購入画面の離脱率</dt><dd class="num">${begins ? `${Math.round((1 - purchases / begins) * 100)}%` : '—'}</dd></div>
      <div><dt>購入単価</dt><dd class="num">${purchases ? yen(Math.round(revenue / purchases)) : '—'}</dd></div>
      <div><dt>ログイン</dt><dd class="num">${count('login')}</dd></div>
      <div><dt>検索</dt><dd class="num">${count('search')}</dd></div>
      <div><dt>お気に入り登録</dt><dd class="num">${count('add_to_wishlist')}</dd></div>
      <div><dt>SALE訴求のクリック</dt><dd class="num">${count('select_promotion')}</dd></div>
      <div><dt>現行モデルとの比較</dt><dd class="num">${count('view_comparison')}</dd></div>
    </dl>
    <section class="mysection" aria-labelledby="events-title">
      ${SectionHeader({ id: 'events-title', eyebrow: 'EVENT LOG', title: '直近のイベント' })}
      ${log.length ? html`
        <table class="event-table">
          <thead><tr><th scope="col">時刻</th><th scope="col">イベント</th><th scope="col">内容</th></tr></thead>
          <tbody>
            ${log.slice(-15).reverse().map((entry) => html`<tr><td class="num">${dateTime(new Date(entry.at))}</td><td><code>${entry.event}</code></td><td>${entry.items?.[0]?.item_name ?? entry.search_term ?? entry.method ?? entry.promotion_id ?? ''}</td></tr>`)}
          </tbody>
        </table>` : html`<p class="note">まだイベントがありません。</p>`}
      <div class="insights__actions">
        <button class="btn btn--ghost btn--sm" type="button" data-clear-log>計測ログを消去</button>
        <button class="btn btn--ghost btn--sm" type="button" data-action="demo-reset">デモを最初の状態に戻す</button>
      </div>
    </section>`;
}

export function render({ query, account }) {
  // お気に入りは別の画面（#/favorites）。?tab=favorites で開かれても同じ画面を出す（ほかの知らない tab は概要）
  if (query.get('tab') === 'favorites') return renderFavorites({ query, account });
  const tab = TABS.some((item) => item.id === query.get('tab') && !item.href) ? query.get('tab') : 'overview';
  const orders = getOrders(account);
  const adding = query.get('add') === '1';
  const views = {
    overview: () => Overview(account, orders),
    orders: () => Orders(orders),
    quotes: () => Quotes(account),
    billing: () => Billing(account, orders),
    addresses: () => Addresses(adding),
    payments: () => Payments(),
    profile: () => Profile(account),
    insights: () => Insights(),
  };
  const current = TABS.find((item) => item.id === tab);
  return {
    title: current.label,
    view: html`
      <div class="container mypage">
        ${TabNav(tab)}
        <div class="mypage__main">
          <header class="mypage__head">
            <p class="eyebrow">MY PAGE</p>
            <h1 class="page-heading">${current.label}</h1>
          </header>
          ${views[tab]()}
        </div>
      </div>`,
    mount(root, { refresh }) {
      const orderById = (id) => orders.find((order) => order.id === id);
      bindAddressForm(root, (address) => {
        addAddress(address);
        showToast('お届け先を登録しました');
        navigate('/mypage?tab=addresses');
      });
      root.addEventListener('submit', (event) => {
        if (!event.target.matches('[data-battery-form]')) return;
        event.preventDefault();
        setOwnedBatteries(new FormData(event.target).getAll('platform'));
        showToast('手持ちのバッテリーを保存しました');
        refresh();
      });
      root.addEventListener('click', (event) => {
        const target = event.target;
        if (target.closest('[data-logout]')) {
          logout();
          navigate('/login');
          return;
        }
        const reorder = target.closest('[data-reorder]');
        if (reorder) {
          const order = orderById(reorder.dataset.reorder);
          // 在庫と1契約の上限の範囲で入れる。入れた後のカートが前回の数量に届かない商品は知らせる
          order.items.forEach((item) => addToCart(item.productId, item.qty));
          const inCart = (id) => getCart().find((line) => line.productId === id)?.qty ?? 0;
          const short = order.items.filter((item) => inCart(item.productId) < item.qty).map((item) => productById(item.productId).model);
          track('reorder', { transaction_id: order.id });
          if (short.length) showToast(`${short.join('、')} は在庫または1契約の上限のため、前回より少ない数量（または0）でカートに入れました`);
          navigate('/cart');
          return;
        }
        const receipt = target.closest('[data-receipt]');
        if (receipt) {
          const order = orderById(receipt.dataset.receipt);
          openReceipt(order, account, documentLabel(order));
          return;
        }
        const quote = target.closest('[data-quote]');
        if (quote) {
          openQuote(getQuotes(account).find((item) => item.id === quote.dataset.quote), account);
          return;
        }
        if (target.closest('[data-request-quote]')) {
          openModal(html`
            <div class="consult-modal">
              <p class="eyebrow">QUOTATION</p>
              <h2 class="consult-modal__title">見積もりを依頼する</h2>
              <p>カートの中身、または必要な数量・現場ごとの配送先をお知らせください。担当者が1営業日以内にお見積もりをお送りします。</p>
              <button class="btn btn--primary btn--block" type="button" disabled>依頼フォームへ（デモでは送信しません）</button>
            </div>`, { label: '見積もりを依頼する' });
          return;
        }
        const invoice = target.closest('[data-invoice]');
        if (invoice) {
          openInvoice(getInvoices(account).find((entry) => entry.month === invoice.dataset.invoice), account);
          return;
        }
        if (target.closest('[data-add-address]')) {
          navigate('/mypage?tab=addresses&add=1');
          return;
        }
        if (target.closest('[data-cancel-address]')) {
          navigate('/mypage?tab=addresses');
          return;
        }
        if (target.closest('[data-clear-log]')) {
          clearEventLog();
          refresh();
          return;
        }
      });
    },
  };
}

// お気に入り（マイページのメニューからも開く独立ページ）
export function renderFavorites() {
  const favorites = getFavorites().map(productById).filter(Boolean);
  const available = favorites.filter((product) => isPurchasable(product));
  return {
    title: 'お気に入り',
    view: html`
      <div class="container">
        <header class="page-title">
          <p class="eyebrow">FAVORITES</p>
          <h1 class="page-title__title">お気に入り<span class="page-heading__count num">${favorites.length}件</span></h1>
          <p class="page-title__lead">数量限定の商品は、在庫がなくなると購入できなくなります。</p>
        </header>
        ${favorites.length
          ? html`${ProductGrid(favorites, { listName: 'お気に入り' })}
              ${available.length ? '' : html`<p class="note">お気に入りの商品はすべて完売しました。</p>`}`
          : EmptyState({ icon: 'heart', title: 'お気に入りはまだありません', text: '商品のハートを押すと、ここに集まります。値下がりや残りわずかを見逃さないために使ってください。', action: { href: '#/products', label: '商品を探す' } })}
      </div>`,
  };
}
