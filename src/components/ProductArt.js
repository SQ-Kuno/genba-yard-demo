import { raw, escapeHTML } from '../lib/html.js';

// 商品写真が届くまでのイラスト（実在製品の形状・ロゴは写していない）。
// ブランドごとに配色をそろえ、写真に差し替わってもレイアウトが変わらないよう正方形で描く。
const PALETTES = {
  kaname: { body: '#2f333d', body2: '#474c58', accent: '#b4703c', metal: '#c5c9d1', grip: '#1c1f26', line: '#1c1f26' },
  norda: { body: '#fbfbfc', body2: '#e6e9ee', accent: '#5aa7c7', metal: '#c5c9d1', grip: '#2a3040', line: '#2a3040' },
  bansho: { body: '#3a3f4a', body2: '#575d6a', accent: '#2f4a7a', metal: '#c3c8d0', grip: '#1d2028', line: '#1d2028' },
  groundline: { body: '#c4b08a', body2: '#a8936c', accent: '#6b7046', metal: '#c5c9d1', grip: '#25272c', line: '#25272c' },
  // ブランド一覧にないメーカー（管理画面で登録した商品）
  generic: { body: '#d8dbe0', body2: '#c3c7ce', accent: '#5b6474', metal: '#c5c9d1', grip: '#3a3f4a', line: '#3a3f4a' },
};

const shadow = (cx = 200, rx = 130) => `<ellipse cx="${cx}" cy="342" rx="${rx}" ry="9" fill="#02051c" opacity=".08"/>`;

const DRAWINGS = {
  // 種類を決めていない商品（管理画面・CSV で登録した直後など）。段ボール箱に品名ラベル
  generic: (p) => `
    ${shadow(200, 120)}
    <path d="M96 150l104-38 104 38v150l-104 38-104-38z" fill="#d9c3a0"/>
    <path d="M200 188l104-38v150l-104 38z" fill="#c9b089"/>
    <path d="M96 150l104 38 104-38" fill="none" stroke="#b89d74" stroke-width="4" stroke-linejoin="round"/>
    <path d="M148 131l104 38" stroke="#e6d5b8" stroke-width="16"/>
    <path d="M114 196l66 24v42l-66-24z" fill="#fff"/>
    <path d="M122 210l42 15" stroke="${p.accent}" stroke-width="6" stroke-linecap="round"/>
    <path d="M122 224l30 11" stroke="${p.body2}" stroke-width="5" stroke-linecap="round"/>`,

  impact: (p) => `
    ${shadow(195, 110)}
    <rect x="140" y="268" width="132" height="60" rx="11" fill="${p.grip}"/>
    <rect x="148" y="277" width="116" height="9" rx="3" fill="${p.accent}"/>
    <rect x="232" y="298" width="26" height="6" rx="2" fill="${p.metal}" opacity=".6"/>
    <path d="M174 178h64l-6 94h-50z" fill="${p.body}"/>
    <path d="M182 196h48l-5 66h-38z" fill="${p.grip}"/>
    <rect x="156" y="190" width="20" height="34" rx="8" fill="${p.grip}"/>
    <rect x="118" y="110" width="194" height="80" rx="32" fill="${p.body}"/>
    <rect x="292" y="118" width="34" height="64" rx="14" fill="${p.accent}"/>
    <path d="M246 128v46M258 128v46M270 128v46" stroke="${p.body2}" stroke-width="5" stroke-linecap="round"/>
    <rect x="150" y="145" width="62" height="7" rx="3.5" fill="${p.body2}"/>
    <rect x="78" y="122" width="52" height="56" rx="11" fill="${p.accent}"/>
    <rect x="48" y="133" width="34" height="34" rx="6" fill="${p.metal}"/>
    <rect x="18" y="145" width="32" height="10" rx="2" fill="${p.metal}"/>`,

  drill: (p) => `
    ${shadow(200, 115)}
    <rect x="146" y="268" width="132" height="60" rx="11" fill="${p.grip}"/>
    <rect x="154" y="277" width="116" height="9" rx="3" fill="${p.accent}"/>
    <path d="M180 178h64l-6 94h-50z" fill="${p.body}"/>
    <path d="M188 196h48l-5 66h-38z" fill="${p.grip}"/>
    <rect x="162" y="190" width="20" height="34" rx="8" fill="${p.grip}"/>
    <rect x="124" y="112" width="196" height="78" rx="30" fill="${p.body}"/>
    <rect x="300" y="120" width="30" height="62" rx="12" fill="${p.body2}"/>
    <rect x="232" y="104" width="44" height="12" rx="4" fill="${p.accent}"/>
    <rect x="100" y="114" width="30" height="74" rx="8" fill="${p.accent}"/>
    <path d="M100 126 46 136v30l54 10z" fill="${p.metal}"/>
    <path d="M60 134v34M72 132v38M84 130v42" stroke="#9aa0aa" stroke-width="3"/>
    <rect x="20" y="146" width="28" height="10" rx="2" fill="${p.metal}"/>`,

  saw: (p) => `
    ${shadow(205, 140)}
    <path d="M143 276a95 95 0 0 0 114 0z" fill="${p.metal}"/>
    <path d="M143 276a95 95 0 0 0 114 0" fill="none" stroke="#8d939d" stroke-width="5" stroke-dasharray="4 6"/>
    <rect x="58" y="262" width="292" height="16" rx="4" fill="${p.metal}"/>
    <path d="M96 264a104 104 0 0 1 208 0z" fill="${p.body}"/>
    <circle cx="200" cy="206" r="40" fill="${p.body2}"/>
    <circle cx="200" cy="206" r="15" fill="${p.accent}"/>
    <path d="M236 122c18-44 92-46 102 8" fill="none" stroke="${p.grip}" stroke-width="26" stroke-linecap="round"/>
    <rect x="296" y="172" width="78" height="46" rx="9" fill="${p.grip}"/>
    <rect x="304" y="180" width="62" height="8" rx="3" fill="${p.accent}"/>
    <circle cx="118" cy="196" r="15" fill="${p.grip}"/>
    <rect x="70" y="248" width="44" height="12" rx="3" fill="${p.accent}"/>`,

  grinder: (p) => `
    ${shadow(205, 150)}
    <rect x="114" y="88" width="18" height="62" rx="8" fill="${p.grip}"/>
    <rect x="150" y="162" width="196" height="58" rx="27" fill="${p.body}"/>
    <rect x="206" y="152" width="64" height="12" rx="4" fill="${p.accent}"/>
    <path d="M286 174v34M298 174v34M310 174v34" stroke="${p.body2}" stroke-width="5" stroke-linecap="round"/>
    <rect x="336" y="160" width="46" height="70" rx="9" fill="${p.grip}"/>
    <rect x="342" y="168" width="34" height="8" rx="3" fill="${p.accent}"/>
    <rect x="94" y="146" width="68" height="76" rx="12" fill="${p.metal}"/>
    <rect x="118" y="220" width="22" height="16" fill="#9aa0aa"/>
    <path d="M52 238q77-40 154 0z" fill="${p.grip}"/>
    <rect x="52" y="236" width="154" height="12" rx="6" fill="${p.body2}"/>`,

  battery: (p) => `
    ${shadow(200, 130)}
    <rect x="118" y="138" width="164" height="40" rx="9" fill="${p.body}"/>
    <rect x="176" y="146" width="48" height="20" rx="3" fill="${p.body2}"/>
    <rect x="86" y="168" width="228" height="128" rx="17" fill="${p.grip}"/>
    <rect x="86" y="168" width="228" height="32" rx="15" fill="${p.body}"/>
    <rect x="86" y="248" width="228" height="11" fill="${p.accent}"/>
    <text x="108" y="232" fill="#ffffff" font-family="Archivo, Arial, sans-serif" font-size="25" font-weight="700" letter-spacing="1">18V 5.0Ah</text>
    <rect x="236" y="181" width="11" height="7" rx="1.5" fill="${p.metal}"/>
    <rect x="251" y="181" width="11" height="7" rx="1.5" fill="${p.metal}"/>
    <rect x="266" y="181" width="11" height="7" rx="1.5" fill="${p.metal}"/>
    <rect x="281" y="181" width="11" height="7" rx="1.5" fill="${p.metal}" opacity=".35"/>
    <rect x="102" y="178" width="34" height="12" rx="4" fill="${p.accent}"/>`,

  charger: (p) => `
    ${shadow(195, 150)}
    <path d="M330 284c40 0 42 52-6 56H232" fill="none" stroke="${p.grip}" stroke-width="7" stroke-linecap="round"/>
    <path d="M60 304h280l-16-92H76z" fill="${p.body}"/>
    <rect x="78" y="194" width="244" height="26" rx="9" fill="${p.grip}"/>
    <rect x="138" y="170" width="124" height="28" rx="7" fill="${p.body2}"/>
    <rect x="152" y="178" width="96" height="6" rx="3" fill="${p.grip}"/>
    <path d="M100 246h120M100 262h120M100 278h120" stroke="${p.body2}" stroke-width="5" stroke-linecap="round"/>
    <circle cx="282" cy="252" r="8" fill="${p.accent}"/>
    <circle cx="282" cy="276" r="5" fill="${p.metal}"/>`,

  laser: (p) => `
    <path d="M0 126h400M200 0v64M200 326v74" stroke="#2fb36a" stroke-width="3" opacity=".55"/>
    ${shadow(200, 95)}
    <path d="M122 322h156l-18-30H140z" fill="${p.grip}"/>
    <rect x="128" y="318" width="20" height="16" rx="3" fill="${p.grip}"/>
    <rect x="252" y="318" width="20" height="16" rx="3" fill="${p.grip}"/>
    <rect x="148" y="190" width="104" height="104" rx="14" fill="${p.body}" stroke="${p.line}" stroke-width="3"/>
    <path d="M138 192v-62a62 62 0 0 1 124 0v62z" fill="${p.body}" stroke="${p.line}" stroke-width="3"/>
    <rect x="166" y="108" width="68" height="34" rx="7" fill="${p.accent}"/>
    <rect x="144" y="118" width="12" height="22" rx="3" fill="${p.accent}" opacity=".7"/>
    <rect x="244" y="118" width="12" height="22" rx="3" fill="${p.accent}" opacity=".7"/>
    <rect x="176" y="62" width="48" height="16" rx="6" fill="${p.grip}"/>
    <rect x="168" y="214" width="64" height="30" rx="5" fill="${p.body2}"/>
    <circle cx="180" cy="266" r="7" fill="${p.grip}"/>
    <circle cx="200" cy="266" r="7" fill="${p.grip}"/>
    <circle cx="220" cy="266" r="7" fill="${p.accent}"/>`,

  meter: (p) => `
    <path d="M214 74 246 0" stroke="#d64545" stroke-width="2.5" opacity=".7"/>
    ${shadow(200, 70)}
    <g transform="rotate(-8 200 200)">
      <rect x="150" y="76" width="100" height="250" rx="22" fill="${p.body}" stroke="${p.line}" stroke-width="3"/>
      <rect x="150" y="288" width="100" height="38" rx="16" fill="${p.grip}"/>
      <rect x="166" y="98" width="68" height="70" rx="7" fill="${p.grip}"/>
      <text x="175" y="142" fill="#bfe4f2" font-family="Archivo, Arial, sans-serif" font-size="19" font-weight="700">12.48</text>
      <circle cx="200" cy="206" r="18" fill="${p.accent}"/>
      <circle cx="174" cy="246" r="8" fill="${p.body2}" stroke="${p.line}" stroke-width="2"/>
      <circle cx="200" cy="246" r="8" fill="${p.body2}" stroke="${p.line}" stroke-width="2"/>
      <circle cx="226" cy="246" r="8" fill="${p.body2}" stroke="${p.line}" stroke-width="2"/>
    </g>`,

  clamp: (p) => `
    ${shadow(200, 80)}
    <circle cx="200" cy="114" r="52" fill="none" stroke="${p.grip}" stroke-width="22"/>
    <rect x="193" y="52" width="14" height="22" fill="#f4f4f2"/>
    <rect x="114" y="184" width="24" height="44" rx="7" fill="${p.accent}"/>
    <rect x="138" y="166" width="124" height="176" rx="22" fill="${p.body}" stroke="${p.line}" stroke-width="3"/>
    <rect x="156" y="186" width="88" height="52" rx="6" fill="${p.grip}"/>
    <text x="166" y="221" fill="#bfe4f2" font-family="Archivo, Arial, sans-serif" font-size="22" font-weight="700">230.4</text>
    <circle cx="200" cy="284" r="30" fill="${p.body2}" stroke="${p.line}" stroke-width="3"/>
    <path d="M200 284 214 262" stroke="${p.accent}" stroke-width="6" stroke-linecap="round"/>
    <circle cx="170" cy="326" r="6" fill="${p.grip}"/>
    <circle cx="200" cy="326" r="6" fill="#d64545"/>
    <circle cx="230" cy="326" r="6" fill="${p.grip}"/>`,

  sockets: (p) => `
    ${shadow(200, 160)}
    <rect x="48" y="104" width="304" height="212" rx="12" fill="${p.body}"/>
    <rect x="64" y="120" width="272" height="180" rx="7" fill="${p.grip}"/>
    ${[8, 9, 10, 11, 12, 13, 14, 15].map((r, i) => `<circle cx="${90 + i * 31}" cy="156" r="${r}" fill="${p.metal}"/><circle cx="${90 + i * 31}" cy="156" r="${r * 0.45}" fill="#7d838e"/>`).join('')}
    ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<rect x="${82 + i * 36}" y="186" width="${16 + i}" height="52" rx="5" fill="${p.metal}"/>`).join('')}
    <circle cx="98" cy="268" r="19" fill="${p.metal}"/>
    <rect x="98" y="260" width="150" height="16" rx="8" fill="${p.metal}"/>
    <rect x="200" y="258" width="74" height="20" rx="10" fill="${p.accent}"/>
    <rect x="290" y="252" width="34" height="32" rx="3" fill="${p.accent}"/>
    <text x="294" y="274" fill="#e6ebf5" font-family="Archivo, Arial, sans-serif" font-size="13" font-weight="800">60TH</text>`,

  stripper: (p) => `
    ${shadow(200, 70)}
    <path d="M186 186 144 336l28 6 34-150z" fill="${p.accent}"/>
    <path d="M214 186 256 336l-28 6-34-150z" fill="${p.accent}"/>
    <path d="M150 312 174 316M250 312 226 316" stroke="${p.grip}" stroke-width="5" stroke-linecap="round"/>
    <path d="M174 62h52l6 140h-64z" fill="${p.metal}"/>
    <path d="M200 62v140" stroke="#8d939d" stroke-width="3"/>
    <circle cx="174" cy="96" r="5" fill="#f4f4f2"/><circle cx="174" cy="118" r="6" fill="#f4f4f2"/><circle cx="174" cy="142" r="7" fill="#f4f4f2"/>
    <circle cx="226" cy="96" r="5" fill="#f4f4f2"/><circle cx="226" cy="118" r="6" fill="#f4f4f2"/><circle cx="226" cy="142" r="7" fill="#f4f4f2"/>
    <circle cx="200" cy="194" r="11" fill="${p.grip}"/>`,

  toolbox: (p) => `
    ${shadow(200, 150)}
    <path d="M150 122V92h100v30" fill="none" stroke="${p.metal}" stroke-width="11"/>
    <path d="M60 174h280l-14-54H74z" fill="${p.body2}"/>
    <rect x="68" y="172" width="264" height="142" rx="6" fill="${p.body}"/>
    <rect x="84" y="216" width="232" height="40" rx="3" fill="${p.body2}"/>
    <rect x="84" y="264" width="232" height="40" rx="3" fill="${p.body2}"/>
    <rect x="172" y="232" width="56" height="8" rx="4" fill="${p.metal}"/>
    <rect x="172" y="280" width="56" height="8" rx="4" fill="${p.metal}"/>
    <rect x="92" y="164" width="22" height="20" rx="3" fill="${p.accent}"/>
    <rect x="286" y="164" width="22" height="20" rx="3" fill="${p.accent}"/>`,

  light: (p) => `
    <path d="M110 120 20 60M110 200 20 260M290 120 380 60M290 200 380 260" stroke="#e9c46a" stroke-width="2" opacity=".35"/>
    ${shadow(200, 120)}
    <path d="M118 332 168 232M282 332 232 232" stroke="${p.grip}" stroke-width="13" stroke-linecap="round"/>
    <rect x="96" y="326" width="208" height="12" rx="6" fill="${p.grip}"/>
    <rect x="160" y="60" width="80" height="20" rx="10" fill="${p.grip}"/>
    <rect x="94" y="78" width="212" height="164" rx="15" fill="${p.body}"/>
    <rect x="112" y="96" width="176" height="128" rx="8" fill="#fbf7ea"/>
    ${[0, 1, 2, 3].map((row) => [0, 1, 2, 3, 4, 5].map((col) => `<circle cx="${134 + col * 27}" cy="${118 + row * 28}" r="8" fill="#f3e3a8"/>`).join('')).join('')}
    <rect x="272" y="244" width="40" height="40" rx="7" fill="${p.grip}"/>`,

  harness: (p) => `
    ${shadow(215, 130)}
    <path d="M200 64c40-6 96 30 112 112" fill="none" stroke="${p.grip}" stroke-width="7" stroke-linecap="round"/>
    <circle cx="316" cy="196" r="30" fill="${p.grip}"/>
    <circle cx="316" cy="196" r="11" fill="${p.body}"/>
    <path d="M304 222 292 292M328 222 340 292" stroke="${p.grip}" stroke-width="6" stroke-linecap="round"/>
    <path d="M280 292h24v18c0 14-24 14-24 0zM328 292h24v18c0 14-24 14-24 0z" fill="none" stroke="${p.metal}" stroke-width="6"/>
    <path d="M174 76 160 150l10 100M226 76l14 74-10 100" fill="none" stroke="${p.accent}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="184" y="62" width="32" height="26" rx="5" fill="${p.accent}"/>
    <path d="M187 58a13 13 0 1 1 26 0" fill="none" stroke="${p.metal}" stroke-width="7"/>
    <path d="M154 150h92" stroke="${p.accent}" stroke-width="12" stroke-linecap="round"/>
    <rect x="186" y="139" width="28" height="22" rx="4" fill="${p.metal}"/>
    <path d="M170 250q30 34 60 0" fill="none" stroke="${p.accent}" stroke-width="14" stroke-linecap="round"/>
    <path d="M170 250 160 282M230 250l10 32" stroke="${p.accent}" stroke-width="13" stroke-linecap="round"/>
    <rect x="128" y="282" width="62" height="38" rx="18" fill="none" stroke="${p.accent}" stroke-width="12"/>
    <rect x="210" y="282" width="62" height="38" rx="18" fill="none" stroke="${p.accent}" stroke-width="12"/>
    <rect x="150" y="276" width="18" height="14" rx="3" fill="${p.metal}"/>
    <rect x="232" y="276" width="18" height="14" rx="3" fill="${p.metal}"/>`,

  vest: (p) => `
    ${shadow(200, 110)}
    <path d="M142 72 172 62c8 34 48 34 56 0l30 10 32 44-10 216-74 6-6-170-6 170-74-6-10-216z" fill="${p.grip}"/>
    <path d="M200 112v226" stroke="#3a3d44" stroke-width="3"/>
    <rect x="132" y="218" width="50" height="46" rx="10" fill="none" stroke="${p.body}" stroke-width="3" stroke-dasharray="7 5"/>
    <rect x="218" y="218" width="50" height="46" rx="10" fill="none" stroke="${p.body}" stroke-width="3" stroke-dasharray="7 5"/>
    <rect x="232" y="132" width="26" height="14" rx="4" fill="${p.body}"/>
    <path d="M172 62c8 20 48 20 56 0" fill="none" stroke="${p.body}" stroke-width="5"/>`,

  cleaner: (p) => `
    ${shadow(205, 150)}
    <g transform="rotate(-24 200 210)">
      <rect x="14" y="196" width="46" height="34" rx="7" fill="${p.grip}"/>
      <rect x="54" y="204" width="156" height="17" rx="8" fill="${p.metal}"/>
      <rect x="200" y="182" width="148" height="52" rx="24" fill="${p.body}"/>
      <rect x="202" y="186" width="56" height="44" rx="18" fill="#dfe3ea"/>
      <rect x="272" y="196" width="40" height="10" rx="4" fill="${p.accent}"/>
      <path d="M320 232c4 30 4 48-6 64" fill="none" stroke="${p.grip}" stroke-width="18" stroke-linecap="round"/>
      <rect x="290" y="290" width="58" height="40" rx="8" fill="${p.grip}"/>
    </g>`,
};

// データ検査用（商品の kind・ブランドに絵柄があるか）
export const ART_KINDS = Object.keys(DRAWINGS);
export const ART_BRANDS = Object.keys(PALETTES);

export function ProductArt(product) {
  // 保存データ由来の値（__proto__ など）で落ちないよう、自前のキーだけ引く
  const palette = Object.hasOwn(PALETTES, product.brandId) ? PALETTES[product.brandId] : PALETTES.generic;
  const draw = Object.hasOwn(DRAWINGS, product.kind) ? DRAWINGS[product.kind] : DRAWINGS.generic;
  return raw(
    `<svg class="product-art" viewBox="0 0 400 400" role="img" aria-label="${escapeHTML(product.model)} のイラスト（写真は準備中）">${draw(palette)}</svg>`,
  );
}

// 現行モデル（比較用）。同じ形でもアクセント色を変えて、旧モデルと見分けられるようにする
const CURRENT_ACCENTS = { kaname: '#d9a86c', norda: '#2f86c8', bansho: '#5b7fbf', groundline: '#8a9156' };

export function ModelArt({ brandId, kind, model }) {
  const palette = { ...PALETTES[brandId], accent: CURRENT_ACCENTS[brandId] };
  return raw(
    `<svg class="product-art" viewBox="0 0 400 400" role="img" aria-label="${escapeHTML(model)} のイラスト（現行モデル）">${DRAWINGS[kind](palette)}</svg>`,
  );
}
