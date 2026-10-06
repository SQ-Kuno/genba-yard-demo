// 管理画面の利用者と権限。PoC では運営者（ADMIN）だけがログインする。
// 将来、出品元（SELLER）の担当者にアカウントを発行するときは、role: 'SELLER' と sellerId を持たせる。
// 何ができるかは lib/admin-auth.js の can() で、ここの permissions から判定する。
//
// 【デモ用】パスワードを平文で持っているのはモックだから。本番ではサーバー側の認証（ハッシュ化・多要素認証・
// 操作ログ）に置き換える。ブラウザだけで動く今の仕組みでは、管理画面を本当に守ることはできない。
// このファイルに実在の人のアカウント・本番のパスワードを書かないこと（公開物に含まれ、誰でも読める）。

export const ROLES = {
  ADMIN: {
    label: '運営者（マーケットの運営会社）', // 依頼の ADMIN（docs/02-design-admin.md）。公開するデモに取引先の社名を出さない
    enabled: true,
    // '*' はすべての出品元・すべての操作
    permissions: ['*'],
  },
  SELLER: {
    label: '出品元（ホームセンター・メーカー）',
    enabled: false, // PoC では使わない（ログインできない）
    // 自社（sellerId が一致する）の商品・在庫・注文・発送だけを扱える想定
    permissions: ['product:read', 'product:write', 'stock:write', 'order:read', 'shipment:write'],
  },
};

export const ADMIN_ACCOUNTS = [
  {
    id: 'admin-01',
    loginId: 'admin@genba-yard.example',
    password: 'demo-admin-2026', // デモ専用。ソースは誰でも読めるので、変えても保護にはならない
    name: '運営担当（デモ）',
    role: 'ADMIN',
    sellerId: null,
  },
];
