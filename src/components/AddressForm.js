import { html, raw } from '../lib/html.js';

// 郵便番号→住所の自動入力（モック。本番は郵便番号APIに置き換える【要差し替え】）
const POSTAL_SAMPLES = {
  1350061: '東京都江東区豊洲',
  1350052: '東京都江東区潮見',
  1350063: '東京都江東区有明',
  2100000: '神奈川県川崎市川崎区',
  1000005: '東京都千代田区丸の内',
};

const field = (name, label, attrs, hint = '') => html`
  <div class="field">
    <label class="field__label" for="addr-${name}">${label}</label>
    <input class="field__input" id="addr-${name}" name="${name}" ${raw(attrs)}>
    ${hint ? html`<p class="field__hint">${hint}</p>` : ''}
    <p class="field__error" data-error-for="${name}" hidden></p>
  </div>`;

export function AddressForm({ submitLabel = '追加して選ぶ' } = {}) {
  return html`
    <form class="form address-form" data-address-form novalidate>
      ${field('label', 'お届け先の名前', 'type="text" placeholder="例）現場：南砂 マンション改修" required')}
      ${field('recipient', '受取人', 'type="text" autocomplete="name" placeholder="例）現場代理人 山田 様" required')}
      ${field('postal', '郵便番号（7桁）', 'type="text" inputmode="numeric" autocomplete="postal-code" placeholder="1350061" maxlength="8" required', '入力すると住所の一部を自動で入れます')}
      ${field('address', '住所', 'type="text" autocomplete="street-address" required')}
      ${field('tel', '電話番号', 'type="tel" inputmode="tel" autocomplete="tel" placeholder="090-0000-0000" required')}
      ${field('place', '置き場所・受け取りの注意（任意）', 'type="text" placeholder="例）ゲート横の資材置き場"')}
      <div class="address-form__actions">
        <button class="btn btn--primary" type="submit">${submitLabel}</button>
        <button class="btn btn--ghost" type="button" data-cancel-address>やめる</button>
      </div>
    </form>`;
}

function validate(data) {
  const errors = {};
  ['label', 'recipient', 'address'].forEach((key) => {
    if (!data[key].trim()) errors[key] = '入力してください';
  });
  if (!/^\d{3}-?\d{4}$/.test(data.postal.trim())) errors.postal = '7桁の数字で入力してください';
  if (!/^[\d-]{10,13}$/.test(data.tel.trim())) errors.tel = '電話番号を入力してください（例：090-0000-0000）';
  return errors;
}

function showErrors(form, errors, names) {
  names.forEach((name) => {
    const message = errors[name];
    const element = form.querySelector(`[data-error-for="${name}"]`);
    element.hidden = !message;
    element.textContent = message ?? '';
    form.querySelector(`[name="${name}"]`).setAttribute('aria-invalid', String(Boolean(message)));
  });
}

// 入力中の郵便番号補完、欄を離れたときと送信時の検証。正しければ整形した住所を onValid に渡す
export function bindAddressForm(root, onValid) {
  // 欄を離れた時点で、その欄だけ確かめる（入力途中の欄には出さない）
  root.addEventListener('focusout', (event) => {
    const form = event.target.closest?.('[data-address-form]');
    if (!form || !event.target.name || !event.target.value) return;
    showErrors(form, validate(Object.fromEntries(new FormData(form))), [event.target.name]);
  });

  root.addEventListener('input', (event) => {
    if (event.target.name !== 'postal' || !event.target.closest('[data-address-form]')) return;
    const digits = event.target.value.replace(/\D/g, '');
    const addressInput = event.target.form.querySelector('[name="address"]');
    if (digits.length === 7 && POSTAL_SAMPLES[digits] && !addressInput.value) addressInput.value = POSTAL_SAMPLES[digits];
  });

  root.addEventListener('submit', (event) => {
    if (!event.target.matches('[data-address-form]')) return;
    event.preventDefault();
    const form = event.target;
    const data = Object.fromEntries(new FormData(form));
    const errors = validate(data);
    showErrors(form, errors, [...form.querySelectorAll('[data-error-for]')].map((element) => element.dataset.errorFor));
    if (Object.keys(errors).length) {
      form.querySelector('[aria-invalid="true"]').focus();
      return;
    }
    const postal = data.postal.replace(/\D/g, '');
    onValid({ ...data, postal: `${postal.slice(0, 3)}-${postal.slice(3)}` });
  });
}
