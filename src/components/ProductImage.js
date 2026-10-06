import { html, attr } from '../lib/html.js';
import { brandById } from '../data/brands.js';
import { ProductArt } from './ProductArt.js';

// 画像の置き場所はこのファイルの位置から決める（購入者画面 / と管理画面 /admin/ のどちらから開いても同じ場所）
const IMAGE_DIR = new URL('../../public/products/', import.meta.url).href;

// 1枚目 <id>.jpg、2枚目以降 <id>-2.jpg, <id>-3.jpg。管理画面で登録した画像（product.images）があればそちらを優先
export function imageFiles(product) {
  return product.images?.length ? product.images : [`${product.id}.jpg`, `${product.id}-2.jpg`, `${product.id}-3.jpg`];
}

// 管理画面で登録した画像（JPEG・PNG・WebP のデータ）はそのまま、ファイル名は画像フォルダから。
// それ以外（外部の URL・画像でないデータ）は使わない（会員の閲覧を外部に知らせる画像などを出さないため）。
// 本番は、許可した画像の置き場所（画像ストレージ）の URL だけを通す
const SAFE_DATA = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const SAFE_FILE = /^[\w.-]+\.(jpe?g|png|webp)$/i;
export const imageSrc = (file) => {
  if (SAFE_DATA.test(file)) return file;
  return SAFE_FILE.test(file) ? `${IMAGE_DIR}${file}` : null;
};

// 写真が置かれていればイラストの上に重ねる。見つからなかったファイルはこのページを開いている間は再要求しない
const missingFiles = new Set();

const photo = (src, alt, eager) =>
  html`<img class="pimg__photo" src="${src}" alt="${alt}" ${eager ? attr('fetchpriority', 'high') : attr('loading', 'lazy')} decoding="async">`;

// 読み込み成功・失敗はバブリングしないため、捕捉フェーズでまとめて受ける
export function watchProductPhotos() {
  document.addEventListener('load', (event) => {
    if (event.target.matches?.('.pimg__photo')) event.target.classList.add('is-loaded');
  }, true);
  document.addEventListener('error', (event) => {
    if (!event.target.matches?.('.pimg__photo')) return;
    const src = event.target.getAttribute('src');
    if (!src.startsWith('data:')) missingFiles.add(src.split('/').pop());
    event.target.remove();
  }, true);
}

function Placeholder(product, view) {
  const brand = brandById(product.brandId);
  if (view === 1) {
    return html`
      <div class="pimg__sheet">
        <div class="pimg__sheet-art">${ProductArt(product)}</div>
        <ol class="pimg__points">
          ${product.highlights.map((point, index) => html`<li><span class="num">0${index + 1}</span>${point}</li>`)}
        </ol>
      </div>`;
  }
  if (view === 2) {
    return html`
      <div class="pimg__sheet pimg__sheet--box">
        <p class="pimg__sheet-title en">IN THE BOX</p>
        <ul class="pimg__box">
          ${product.inBox.map((item) => html`<li>${item}</li>`)}
        </ul>
      </div>`;
  }
  return html`${ProductArt(product)}<span class="pimg__caption en">${brand.name} / ${product.model}</span>`;
}

export function ProductImage(product, { view = 0, eager = false, className = '' } = {}) {
  const file = imageFiles(product)[view];
  const src = file && !missingFiles.has(file) ? imageSrc(file) : null;
  const alt = `${brandById(product.brandId).name} ${product.model} ${product.name}`;
  return html`
    <figure class="pimg ${className}">
      <div class="pimg__placeholder">${Placeholder(product, view)}</div>
      ${src ? photo(src, alt, eager) : ''}
    </figure>`;
}
