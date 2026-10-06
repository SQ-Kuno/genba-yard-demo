// 出品元（SELLER）の一覧と登録・編集。PoC では運営者が登録し、SELLER 自身はログインしない
import { html, render as renderInto } from '../../lib/html.js';
import { navigate } from '../../lib/router.js';
import { PRODUCTS, SELLERS, sellerById, saveSeller } from '../../lib/market.js';
import { getAllOrders } from '../../lib/orders.js';
import { salesBySeller } from '../../lib/sales.js';
import { readInteger, MAX_LEAD_DAYS } from '../../lib/product-rules.js';
import { SELLER_KINDS, SELLER_STATUSES } from '../../data/sellers.js';
import { showToast } from '../../components/Toast.js';
import { PageHead, Field, Options, SellerStatusChip, errorMessage, yen } from '../ui.js';

const leadLabel = (lead) => (lead ? `注文後${lead.leadMin}〜${lead.leadMax}営業日` : '未設定');

export function renderList() {
  const sales = new Map(salesBySeller(getAllOrders(), PRODUCTS).map((row) => [row.key, row]));
  return {
    title: '出品元一覧',
    view: html`
      ${PageHead({
        title: '出品元一覧',
        lead: '商品を出品するホームセンター・メーカーなど（SELLER）。商品はどれか1つの出品元に属し、出品元から購入者へ直接発送します。',
        actions: html`<a class="btn btn--primary btn--sm" href="#/sellers/new">出品元を登録</a>`,
      })}
      <div class="atable-wrap">
        <table class="atable atable--stack">
          <thead><tr><th>会社名・ID</th><th>担当者・連絡先</th><th>発送元・発送目安</th><th class="is-num">商品数</th><th class="is-num">売上（全期間）・消化率</th><th>ステータス</th></tr></thead>
          <tbody>
            ${SELLERS.map((seller) => {
              const row = sales.get(seller.id);
              return html`
              <tr>
                <td class="atable__main-cell"><div class="atable__main"><a href="#/sellers/${seller.id}">${seller.name}</a><span class="atable__sub">${seller.id}・${SELLER_KINDS[seller.kind] ?? seller.kind}</span></div></td>
                <td data-label="担当者"><div class="atable__main"><span>${seller.contactName || '—'}</span><span class="atable__sub">${seller.email || '—'}</span><span class="atable__sub">${seller.tel}</span></div></td>
                <td data-label="発送元"><div class="atable__main"><span>${seller.shipFrom.label || '未登録'}</span><span class="atable__sub">${leadLabel(seller.defaultLead)}</span></div></td>
                <td class="is-num" data-label="商品数"><a class="text-link" href="#/products?seller=${seller.id}">${PRODUCTS.filter((product) => product.sellerId === seller.id).length}</a></td>
                <td class="is-num is-nowrap" data-label="売上">${yen(row?.revenue ?? 0)}<div class="atable__sub">${row?.sellThrough == null ? '消化率 —' : `消化率 ${row.sellThrough}%`}</div></td>
                <td data-label="ステータス">${SellerStatusChip(seller)}</td>
              </tr>`;
            })}
          </tbody>
        </table>
      </div>
      <p class="asection__note">消化率＝売れた数 ÷（売れた数＋いまの販売可能数）。将来は出品元ごとに担当者アカウントを発行し、自社の商品登録・在庫更新・注文確認・発送登録を任せられる設計です（PoC では運営者が一括で操作）。</p>`,
  };
}

// 役割（在庫・販売・発送）はデータに持つが、PoC の画面では出さない（すべて出品元）。docs/02-design-admin.md §4
const emptySeller = () => ({
  name: '', kind: 'retailer', contactName: '', email: '', tel: '', status: 'active', note: '',
  shipFrom: { label: '', postal: '', address: '', tel: '' },
  returnTo: { label: '', postal: '', address: '', tel: '' },
  roles: { holdsStock: true, sells: true, ships: true },
  defaultLead: null,
});

const SELLER_LIMITS = { name: 60, contactName: 40, note: 1000 };

function validateSeller(seller, leadErrors) {
  const errors = { ...leadErrors };
  if (!seller.name.trim()) errors.name = '会社名を入力してください。';
  Object.entries(SELLER_LIMITS).forEach(([key, max]) => {
    if (seller[key].length > max) errors[key] = `${max}文字までにしてください。`;
  });
  if (seller.defaultLead && seller.defaultLead.leadMin > seller.defaultLead.leadMax) errors.lead = '発送目安は短い方を先に入力してください。';
  if (seller.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(seller.email)) errors.email = 'メールアドレスの形が正しくありません。';
  if (seller.tel && !/^[0-9-]{10,13}$/.test(seller.tel)) errors.tel = '電話番号は数字とハイフンで入力してください。';
  ['shipFrom', 'returnTo'].forEach((key) => {
    if (seller[key].postal && !/^\d{3}-?\d{4}$/.test(seller[key].postal)) errors[`${key}.postal`] = '郵便番号は「123-4567」の形で入力してください。';
  });
  if (seller.roles.ships && !seller.shipFrom.address.trim()) errors['shipFrom.address'] = '発送する出品元は、発送元の住所を入力してください。';
  return errors;
}

const Place = (key, label, place, errors) => html`
  <fieldset class="afieldset is-wide">
    <legend class="field__label">${label}</legend>
    <div class="aform__fields">
      ${Field({ id: `${key}-label`, label: '名称', control: html`<input class="field__input" id="${key}-label" name="${key}.label" value="${place.label}">` })}
      ${Field({ id: `${key}-tel`, label: '電話番号', control: html`<input class="field__input" id="${key}-tel" name="${key}.tel" value="${place.tel}" inputmode="tel">` })}
      ${Field({ id: `${key}-postal`, label: '郵便番号', error: errors[`${key}.postal`], control: html`<input class="field__input" id="${key}-postal" name="${key}.postal" value="${place.postal}" inputmode="numeric">` })}
      ${Field({ id: `${key}-address`, label: '住所', error: errors[`${key}.address`], control: html`<input class="field__input" id="${key}-address" name="${key}.address" value="${place.address}">` })}
    </div>
  </fieldset>`;

export function renderForm({ params }) {
  const existing = params.id ? sellerById(params.id) : null;
  if (params.id && !existing) return { title: '出品元が見つかりません', view: html`${PageHead({ title: '出品元が見つかりません', crumbs: [{ href: '#/sellers', label: '出品元一覧' }] })}` };
  const title = existing ? `出品元の編集：${existing.name}` : '出品元の登録';
  return {
    title,
    view: html`${PageHead({ title, crumbs: [{ href: '#/sellers', label: '出品元一覧' }], lead: existing ? `seller_id：${existing.id}（登録 ${new Date(existing.createdAt).toLocaleDateString('ja-JP')}）` : 'seller_id は登録時に自動で付きます（例：S004）。' })}<div data-form-root></div>`,
    mount(root, { refresh }) {
      const seller = structuredClone(existing ?? emptySeller());
      let errors = {};
      let notice = '';
      const formRoot = root.querySelector('[data-form-root]');
      const draw = () => renderInto(formRoot, html`
        <form class="aform" novalidate data-seller-form>
          <div class="aform__main">
            <section class="aform__section">
              <div><h2 class="aform__section-title">会社・担当者</h2></div>
              <div class="aform__fields">
                ${Field({ id: 's-name', label: '会社名', required: true, wide: true, error: errors.name, control: html`<input class="field__input" id="s-name" name="name" value="${seller.name}" maxlength="${SELLER_LIMITS.name}">` })}
                ${Field({ id: 's-kind', label: '種別', control: html`<select class="field__select" id="s-kind" name="kind">${Options(Object.entries(SELLER_KINDS), seller.kind)}</select>` })}
                ${Field({ id: 's-contact', label: '担当者名', error: errors.contactName, control: html`<input class="field__input" id="s-contact" name="contactName" value="${seller.contactName}" maxlength="${SELLER_LIMITS.contactName}">` })}
                ${Field({ id: 's-email', label: 'メールアドレス', error: errors.email, control: html`<input class="field__input" id="s-email" type="email" name="email" value="${seller.email}">` })}
                ${Field({ id: 's-tel', label: '電話番号', error: errors.tel, control: html`<input class="field__input" id="s-tel" name="tel" value="${seller.tel}" inputmode="tel">` })}
              </div>
            </section>
            <section class="aform__section">
              <div><h2 class="aform__section-title">発送元・返品先</h2><p class="aform__section-note">注文詳細の「発送元」と、発送依頼の控えに出します。</p></div>
              <div class="aform__fields">
                ${Place('shipFrom', '発送元', seller.shipFrom, errors)}
                <fieldset class="afieldset is-wide">
                  <legend class="field__label">既定の発送目安</legend>
                  <div class="aradios"><span>注文後</span>
                    <input class="field__input aform__days" name="leadMin" value="${seller.defaultLead?.leadMin ?? ''}" inputmode="numeric" aria-label="最短の営業日数">〜
                    <input class="field__input aform__days" name="leadMax" value="${seller.defaultLead?.leadMax ?? ''}" inputmode="numeric" aria-label="最長の営業日数"><span>営業日で発送</span></div>
                  <p class="field__hint">新規の商品・CSV で発送目安を空欄にしたときに使います（当日発送は 0）。</p>
                  ${errors.lead ? html`<p class="field__error">${errors.lead}</p>` : ''}
                </fieldset>
                ${Place('returnTo', '返品先', seller.returnTo, errors)}
              </div>
            </section>
            <section class="aform__section">
              <div><h2 class="aform__section-title">メモ</h2></div>
              <div class="aform__fields">${Field({ id: 's-note', label: '運営メモ（社内のみ）', wide: true, error: errors.note, control: html`<textarea class="field__input" id="s-note" name="note" rows="3" maxlength="${SELLER_LIMITS.note}">${seller.note}</textarea>` })}</div>
            </section>
          </div>
          <aside class="aform__side">
            ${Object.keys(errors).length ? html`<div class="aform__errors" role="alert">${Object.keys(errors).length}件の項目を直してください</div>` : ''}
            ${notice ? html`<p class="form__error" role="alert">${notice}</p>` : ''}
            <fieldset class="afieldset">
              <legend class="aform__side-title">ステータス</legend>
              ${Object.entries(SELLER_STATUSES).map(([key, status]) => html`<label class="aradio"><input type="radio" name="status" value="${key}" ${seller.status === key ? 'checked' : ''}>${status.label}</label>`)}
              <p class="field__hint">一時停止・取引終了にすると、この出品元の商品は購入者画面から外れ、購入できなくなります（商品の販売状況はそのまま残し、取引中に戻すと再び出ます）。</p>
            </fieldset>
            <button class="btn btn--primary btn--block" type="submit">${existing ? '変更を保存する' : '登録する'}</button>
            <a class="btn btn--ghost btn--block" href="#/sellers">一覧へ戻る</a>
          </aside>
        </form>`);
      draw();
      formRoot.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(event.target);
        ['name', 'kind', 'contactName', 'email', 'tel', 'status', 'note'].forEach((key) => { seller[key] = String(data.get(key) ?? '').trim(); });
        ['shipFrom', 'returnTo'].forEach((place) => ['label', 'postal', 'address', 'tel'].forEach((key) => { seller[place][key] = String(data.get(`${place}.${key}`) ?? '').trim(); }));
        const leadErrors = {};
        const read = (key, label) => {
          const { value, error } = readInteger(data.get(key), { label, max: MAX_LEAD_DAYS });
          if (error) leadErrors.lead = error;
          return value;
        };
        const leadMin = read('leadMin', '発送目安（最短）');
        const leadMax = read('leadMax', '発送目安（最長）');
        if ((leadMin === null) !== (leadMax === null) && !leadErrors.lead) leadErrors.lead = '発送目安は最短と最長の両方を入力してください（使わないときは両方空欄）。';
        seller.defaultLead = leadMin !== null && leadMax !== null ? { leadMin, leadMax } : null;
        errors = validateSeller(seller, leadErrors);
        notice = '';
        if (Object.keys(errors).length) {
          draw();
          return;
        }
        try {
          const id = saveSeller({ ...seller, id: existing?.id });
          showToast(existing ? '変更を保存しました。' : `出品元を登録しました（${id}）。`);
          if (existing) refresh();
          else navigate(`/sellers/${id}`);
        } catch (error) {
          notice = errorMessage(error);
          draw();
        }
      });
    },
  };
}
