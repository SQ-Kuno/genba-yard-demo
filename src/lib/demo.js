// デモを最初の状態に戻す（購入者画面の会員データ・管理画面の運営データ・計測ログをまとめて）。
// 購入者画面（マイページの「デモを最初に戻す」）と管理画面（設定）の両方からここを呼ぶ
import { resetStore } from './store.js';
import { resetMarket } from './market.js';
import { clearEventLog } from './analytics.js';

export function resetAll() {
  clearEventLog();
  resetStore();
  resetMarket();
}
