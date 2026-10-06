// ログイン画面は index.html に静的に書いてある（公開ページのためJSなしでも読める）。ここでは動きだけ付ける
import { authenticate, login, cartCount } from '../lib/store.js';
import { campaignStats } from '../lib/catalog.js';
import { track, setAnalyticsUser } from '../lib/analytics.js';
import { showToast } from '../components/Toast.js';
import { DEMO_ACCOUNTS } from '../data/members.js';

let bound = false;
let handleLoggedIn = () => {};

function fillTeaser() {
  const stats = campaignStats();
  // 会員価格・割引率はログイン前に出さない（数字は点数だけ）
  const values = { count: String(stats.itemCount), supported: String(stats.supportedDiscontinuedCount), timesale: String(stats.timeSaleCount) };
  document.querySelectorAll('[data-teaser]').forEach((element) => {
    element.textContent = values[element.dataset.teaser];
  });
}

const VIEWS = { form: 'login-id', reset: 'reset-email', first: 'first-tel' };

function showView(name) {
  document.getElementById('login-form-view').hidden = name !== 'form';
  document.getElementById('login-reset-view').hidden = name !== 'reset';
  document.getElementById('login-first-view').hidden = name !== 'first';
  const input = document.getElementById(VIEWS[name]);
  input.scrollIntoView({ block: 'center' });
  input.focus();
}

function setError(element, message) {
  element.hidden = !message;
  element.textContent = message;
}

export function bindLogin({ onLoggedIn }) {
  fillTeaser();
  // 画面を開くたびに移動先が変わるので、送信時は最新の関数を呼ぶ
  handleLoggedIn = onLoggedIn;
  if (bound) return;
  bound = true;

  const form = document.getElementById('login-form');
  const idInput = document.getElementById('login-id');
  const passwordInput = document.getElementById('login-password');
  const error = document.getElementById('login-error');

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!idInput.value.trim() || !passwordInput.value) {
      setError(error, '会員ID（またはメールアドレス）とパスワードを入力してください。');
      (idInput.value.trim() ? passwordInput : idInput).focus();
      return;
    }
    const account = authenticate(idInput.value, passwordInput.value);
    if (!account) {
      setError(error, '会員ID またはパスワードが正しくありません。デモでは下のボタンからログインできます。');
      passwordInput.select();
      return;
    }
    setError(error, '');
    login(account);
    setAnalyticsUser(account);
    track('login', { method: 'member_id', account_type: account.id });
    const count = cartCount();
    if (count) showToast(`カートに商品が残っています（${count}点）`, { action: { href: '#/cart', label: 'カートを見る' }, duration: 6000 });
    passwordInput.value = '';
    handleLoggedIn();
  });

  document.querySelectorAll('[data-demo-login]').forEach((button) => {
    button.addEventListener('click', () => {
      const account = DEMO_ACCOUNTS.find((item) => item.loginId === button.dataset.demoLogin);
      idInput.value = account.loginId;
      passwordInput.value = account.password;
      setError(error, '');
      form.querySelector('[type="submit"]').focus();
    });
  });

  document.querySelector('[data-toggle-password]').addEventListener('click', (event) => {
    const visible = passwordInput.type === 'text';
    passwordInput.type = visible ? 'password' : 'text';
    event.currentTarget.textContent = visible ? '表示' : '隠す';
    event.currentTarget.setAttribute('aria-pressed', String(!visible));
  });

  document.querySelectorAll('[data-login-view]').forEach((button) => {
    button.addEventListener('click', () => showView(button.dataset.loginView));
  });

  document.getElementById('first-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const tel = document.getElementById('first-tel');
    const valid = /^0[789]0-?\d{4}-?\d{4}$/.test(tel.value.trim());
    setError(document.getElementById('first-error'), valid ? '' : '携帯電話番号を入力してください（例：090-0000-0000）。');
    document.getElementById('first-done').hidden = !valid;
    if (!valid) tel.focus();
    else track('sign_up_start', { method: 'sms' });
  });

  document.getElementById('reset-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const email = document.getElementById('reset-email');
    const resetError = document.getElementById('reset-error');
    const done = document.getElementById('reset-done');
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());
    setError(resetError, valid ? '' : 'メールアドレスの形式で入力してください。');
    done.hidden = !valid;
    if (!valid) email.focus();
  });
}
