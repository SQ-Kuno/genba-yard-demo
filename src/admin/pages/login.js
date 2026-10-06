// 管理者ログイン。会員（購入者）のログインとは別。PoC では運営者（ADMIN）だけがログインできる
import { html } from '../../lib/html.js';
import { adminLogin } from '../../lib/admin-auth.js';
import { navigate } from '../../lib/router.js';
import { ADMIN_ACCOUNTS } from '../../data/admins.js';

// デモの資格情報は、URL に demo=1 を付けたときだけ出す（/admin/#/login?demo=1。README のデモ手順から開く）。
// 会員が /admin/ を開いただけでは入力できないようにする（判定はブラウザの中だけなので、本当の保護ではない）
export function render({ query }) {
  const next = query.get('next');
  const demo = query.get('demo') === '1' ? ADMIN_ACCOUNTS[0] : null;
  return {
    title: 'ログイン',
    view: html`
      <main class="alogin">
        <form class="alogin__box" data-login novalidate>
          <div>
            <p class="aside__logo">GENBA YARD</p>
            <h1 class="alogin__title">運営者向け管理画面</h1>
          </div>
          <p class="alogin__note">商品・出品元・在庫・注文・発送を管理する、マーケットの運営者専用の画面です。会員のIDではログインできません。</p>
          <label class="field">
            <span class="field__label">メールアドレス</span>
            <input class="field__input" type="email" name="loginId" autocomplete="username" required>
          </label>
          <label class="field">
            <span class="field__label">パスワード</span>
            <input class="field__input" type="password" name="password" autocomplete="current-password" required>
          </label>
          <p class="form__error" data-login-error hidden></p>
          <button class="btn btn--primary btn--block" type="submit">ログイン</button>
          ${demo ? html`
            <div class="alogin__demo">
              <p><strong>デモ用の管理者</strong>：${demo.loginId} ／ ${demo.password}</p>
              <button class="link-btn" type="button" data-fill-demo>デモ用の管理者で入力する</button>
            </div>` : ''}
          <p class="alogin__note">デモのため、ログインはブラウザの中だけで判定しています。本番はサーバー側の認証（多要素認証・操作ログ）に置き換えます。</p>
          <a class="link-btn" href="../">購入者画面へ</a>
        </form>
      </main>`,
    mount(root) {
      const form = root.querySelector('[data-login]');
      root.querySelector('[data-fill-demo]')?.addEventListener('click', () => {
        form.loginId.value = demo.loginId;
        form.password.value = demo.password;
        form.querySelector('[type="submit"]').focus();
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const admin = adminLogin(form.loginId.value, form.password.value);
        const error = root.querySelector('[data-login-error]');
        if (!admin) {
          error.hidden = false;
          error.textContent = 'メールアドレスかパスワードが違います。';
          return;
        }
        navigate(next && next.startsWith('/') && next !== '/login' ? next : '/', { replace: true });
      });
    },
  };
}
