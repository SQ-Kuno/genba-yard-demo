// 管理画面のログインと権限。会員（購入者）のログインとは別に持ち、会員としてログインしていても管理画面には入れない。
// 【モックの限界】ブラウザだけで判定しているため、開発者ツールを使えば回避できる。本番はサーバー側で認証・認可する。
import { ADMIN_ACCOUNTS, ROLES } from '../data/admins.js';

const SESSION_KEY = 'genba-yard:admin-session';
const SESSION_HOURS = 8;
// この管理画面に入れる役割。SELLER 用の画面（一覧を自社の分だけに絞る）を作るまでは ADMIN だけ。
// SELLER を有効にするときは、各画面の一覧を can() で絞ってから、ここに 'SELLER' を足す
const PANEL_ROLES = ['ADMIN'];
const allowed = (account) => Boolean(account) && PANEL_ROLES.includes(account.role) && Boolean(ROLES[account.role]?.enabled);

function readSession() {
  try {
    const session = JSON.parse(globalThis.localStorage?.getItem(SESSION_KEY) ?? 'null');
    return session && typeof session.adminId === 'string' ? session : null;
  } catch {
    return null;
  }
}

function writeSession(session) {
  try {
    if (session) globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify(session));
    else globalThis.localStorage?.removeItem(SESSION_KEY);
  } catch (error) {
    console.warn('[admin-auth] ログイン状態を保存できませんでした。', error);
  }
}

// ログイン中の管理者（期限切れ・使えない役割なら null）
// 期限が読めない・過ぎている・同じ時刻のセッションは失効として扱う（読めないときに入れてしまわない）
export function currentAdmin(now = new Date()) {
  const session = readSession();
  const expires = Date.parse(session?.expiresAt);
  if (!(expires > now.getTime())) return null;
  const account = ADMIN_ACCOUNTS.find((item) => item.id === session.adminId);
  return allowed(account) ? account : null;
}

export function adminLogin(loginId, password, now = new Date()) {
  const account = ADMIN_ACCOUNTS.find((item) => item.loginId === String(loginId).trim().toLowerCase() && item.password === password);
  if (!allowed(account)) return null;
  writeSession({ adminId: account.id, loggedInAt: now.toISOString(), expiresAt: new Date(now.getTime() + SESSION_HOURS * 3600000).toISOString() });
  return account;
}

export function adminLogout() {
  writeSession(null);
}

// 権限の判定。ADMIN はすべて。SELLER は、resource の出品元（sellerId、または sellerIds のすべて）が自社のときだけ。
// どの出品元のものか分からないもの（sellerId のない注文など）は、SELLER には扱わせない
export function can(user, permission, resource = null) {
  if (!user) return false;
  const role = ROLES[user.role];
  if (!role?.enabled) return false;
  if (role.permissions.includes('*')) return true;
  if (!role.permissions.includes(permission)) return false;
  const owners = resource?.sellerIds ?? (resource?.sellerId ? [resource.sellerId] : []);
  return owners.length > 0 && owners.every((id) => id === user.sellerId);
}
