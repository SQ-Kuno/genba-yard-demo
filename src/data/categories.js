export const CATEGORIES = [
  { id: 'power', name: '電動工具', icon: 'drill' },
  { id: 'battery', name: 'バッテリー・充電器', icon: 'battery' },
  { id: 'measure', name: '測定工具', icon: 'ruler' },
  { id: 'electric', name: '電設用品', icon: 'bolt' },
  { id: 'hand', name: '手工具', icon: 'wrench' },
  { id: 'storage', name: '工具収納', icon: 'box' },
  { id: 'site', name: '現場用品', icon: 'lamp' },
  { id: 'safety', name: '安全用品', icon: 'shield' },
  { id: 'work', name: '作業用品', icon: 'vest' },
];

export const categoryById = (id) => CATEGORIES.find((category) => category.id === id);

// 商品の状態。フィルターとバッジの表示名はここで一元管理する
export const LIFECYCLES = {
  current: { label: '現行品', filterLabel: '現行品（限定放出）', description: 'メーカーが現在も製造・販売しているモデル' },
  previous: { label: '型落ち', filterLabel: '型落ち', description: '後継モデルが発売され、旧モデルになった商品' },
  'model-change': { label: 'モデルチェンジ', filterLabel: 'モデルチェンジ', description: '仕様の一部が変わった新型に切り替わった商品' },
  discontinued: { label: '廃番', filterLabel: '廃番', description: 'メーカーが製造を終了した商品。カラー廃番を含む' },
  'sales-ended': { label: '終売', filterLabel: '終売', description: 'メーカーの出荷が終了し、流通在庫のみの商品' },
  'out-of-print': { label: '絶版', filterLabel: '絶版', description: '限定生産などで再生産の予定がない商品' },
  // 出品元にまだ確かめていない（管理画面・CSV で登録した直後）。この区分のままでは販売中にできない。絞り込みには出さない
  unknown: { label: '区分 確認中', filterLabel: null, description: '出品元に確認中です' },
};

// 修理・部品・サポートの表示。記号だけでなく必ず言葉を添える
export const SUPPORT_LABELS = {
  maker: {
    active: { label: '継続中', tone: 'ok' },
    ending: { label: '終了予定', tone: 'warn' },
    ended: { label: '終了', tone: 'ng' },
    unknown: { label: '確認中', tone: 'neutral' },
  },
  repair: {
    yes: { label: '○ 対応', tone: 'ok' },
    limited: { label: '△ 一部対応', tone: 'warn' },
    no: { label: '× 対応なし', tone: 'ng' },
    na: { label: '— 対象外', tone: 'neutral' },
    unknown: { label: '確認中', tone: 'neutral' },
  },
  parts: {
    supplied: { label: '供給中', tone: 'ok' },
    partial: { label: '一部供給', tone: 'warn' },
    ended: { label: '終了', tone: 'ng' },
    na: { label: '— 対象外', tone: 'neutral' },
    unknown: { label: '確認中', tone: 'neutral' },
  },
  compat: {
    compatible: { label: '現行品と共通', tone: 'ok' },
    partial: { label: '一部共通', tone: 'warn' },
    none: { label: '互換なし', tone: 'ng' },
    na: { label: '— 対象外', tone: 'neutral' },
    unknown: { label: '確認中', tone: 'neutral' },
  },
};
