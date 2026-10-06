// 設定：運用の閾値、権限（ADMIN・将来の SELLER）、役割分離の考え方、デモのデータ
import { html } from '../../lib/html.js';
import { getSettings, saveSettings, SALE_STATUSES, SETTING_RANGES, storedBytes } from '../../lib/market.js';
import { resetAll } from '../../lib/demo.js';
import { readInteger } from '../../lib/product-rules.js';
import { navigate } from '../../lib/router.js';
import { ROLES } from '../../data/admins.js';
import { SITE } from '../../config/site.js';
import { showToast } from '../../components/Toast.js';
import { PageHead, Field, Options, Chip, confirmDialog, errorMessage } from '../ui.js';

const WARN_KB = 4 * 1024; // ブラウザの保存容量（約5MB）に近づいたら知らせる

export function render() {
  const settings = getSettings();
  const kb = Math.round(storedBytes() / 1024);
  return {
    title: '設定',
    view: html`
      ${PageHead({ title: '設定', lead: '運用の基準と、権限・データの考え方。' })}
      <form class="aform" data-settings novalidate>
        <div class="aform__main">
          <section class="aform__section">
            <div><h2 class="aform__section-title">在庫・販売期間の基準</h2><p class="aform__section-note">ダッシュボード・在庫一覧と、購入者画面の「残りわずか」に使います。</p></div>
            <div class="aform__fields">
              ${Field({ id: 'st-low', label: 'LOW STOCK とする在庫数（この数以下）', control: html`<input class="field__input" id="st-low" name="lowStockThreshold" value="${settings.lowStockThreshold}" inputmode="numeric">` })}
              ${Field({ id: 'st-ending', label: '「販売終了が近い」とする日数', control: html`<input class="field__input" id="st-ending" name="endingSoonDays" value="${settings.endingSoonDays}" inputmode="numeric">` })}
              ${Field({ id: 'st-csv', label: 'CSV で登録した商品の最初の販売状況', control: html`<select class="field__select" id="st-csv" name="csvDefaultStatus">${Options(Object.entries(SALE_STATUSES).map(([key, value]) => [key, value.label]), settings.csvDefaultStatus)}</select>` })}
            </div>
          </section>
          <section class="aform__section">
            <div><h2 class="aform__section-title">権限</h2><p class="aform__section-note">PoC では運営者（ADMIN）だけがログインします。出品元（SELLER）は、自社の商品・在庫・注文・発送だけを扱える設計です（注文の操作は、すでに出品元ごとに権限を確かめています）。</p></div>
            <dl class="adl">
              ${Object.entries(ROLES).map(([key, role]) => html`
                <dt>${key}　${role.enabled ? Chip('使用中', 'ok') : Chip('将来', 'neutral')}</dt>
                <dd>${role.label}：${role.permissions.includes('*') ? 'すべての出品元の商品・在庫・注文・発送・分析・設定' : '自社の商品の登録・編集、在庫の更新、注文の確認、発送の登録（SELLER 用の画面を作るまではログインできません）'}</dd>`)}
            </dl>
          </section>
          <section class="aform__section">
            <div><h2 class="aform__section-title">役割の分け方（データの持ち方）</h2><p class="aform__section-note">在庫保有者・発送者・販売者・EC運営者を同じ会社に固定しない作りです。画面では、運用に要る項目（出品元・発送元）だけを出しています。</p></div>
            <dl class="adl">
              <dt>SELLER（出品元）</dt><dd>在庫を持ち、商品を出品する会社。商品の sellerId。</dd>
              <dt>MERCHANT（販売者）</dt><dd>購入者に対する販売業者。商品の merchantId（PoC では出品元と同じ）。</dd>
              <dt>FULFILLMENT（発送者）</dt><dd>購入者へ発送する会社。商品の fulfillerId（商品登録の「発送元」）。注文は発送者ごとに発送を登録する。</dd>
              <dt>PLATFORM（EC運営）</dt><dd>${SITE.operator}（config/site.js）。</dd>
            </dl>
          </section>
          <section class="aform__section">
            <div><h2 class="aform__section-title">デモのデータ</h2><p class="aform__section-note">データはこのブラウザの中（localStorage）に保存しています。本番はサーバー・DB に置き換えます（lib/market.js の読み込み・保存だけを差し替える設計）。</p></div>
            <div class="afieldset">
              <p>このブラウザに保存しているデータ：約 ${kb.toLocaleString()} KB（購入者画面・計測ログ・商品画像を含む。ブラウザの上限は約 5 MB）</p>
              ${kb > WARN_KB ? html`<p class="form__error">保存容量の上限に近づいています。商品画像を減らすか、デモを最初の状態に戻してください（上限を超えると保存できず、注文も確定できません）。</p>` : ''}
              <div class="ahead__actions"><button class="btn btn--ghost btn--sm" type="button" data-reset>デモを最初の状態に戻す</button></div>
              <p class="field__hint">商品・出品元・注文の運用・在庫の記録と、購入者画面の会員データ（カート・注文）をすべて初期状態に戻します。</p>
            </div>
          </section>
        </div>
        <aside class="aform__side">
          <p class="form__error" data-settings-error hidden></p>
          <button class="btn btn--primary btn--block" type="submit">設定を保存する</button>
        </aside>
      </form>`,
    mount(root, { refresh }) {
      root.querySelector('[data-settings]').addEventListener('submit', (event) => {
        event.preventDefault();
        const form = event.target;
        const low = readInteger(form.lowStockThreshold.value, { label: 'LOW STOCK とする在庫数', ...SETTING_RANGES.lowStockThreshold, required: true });
        const ending = readInteger(form.endingSoonDays.value, { label: '「販売終了が近い」とする日数', ...SETTING_RANGES.endingSoonDays, required: true });
        const error = root.querySelector('[data-settings-error]');
        const problem = low.error || ending.error;
        error.hidden = !problem;
        error.textContent = problem;
        if (problem) return;
        try {
          saveSettings({ lowStockThreshold: low.value, endingSoonDays: ending.value, csvDefaultStatus: form.csvDefaultStatus.value });
          showToast('設定を保存しました。');
          refresh();
        } catch (failure) {
          error.hidden = false;
          error.textContent = errorMessage(failure);
        }
      });
      root.querySelector('[data-reset]').addEventListener('click', () => confirmDialog({
        title: 'デモを最初の状態に戻しますか？',
        text: '登録・編集した商品と出品元、注文の運用、在庫の記録、計測ログ、購入者画面の注文・カートがすべて消えます。元に戻せません。',
        confirmLabel: '最初の状態に戻す',
        danger: true,
        onConfirm: () => {
          resetAll();
          showToast('デモを最初の状態に戻しました。');
          navigate('/');
        },
      }));
    },
  };
}
