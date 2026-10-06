// テンプレート文字列でHTMLを組み立てる。差し込む値は既定でエスケープし、
// 検索語などの入力がそのままHTMLとして解釈されないようにする。
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export class SafeHTML {
  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value;
  }
}

export const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);

// 自前で組んだ信頼できる断片（SVGなど）だけに使う
export const raw = (value) => new SafeHTML(String(value));

// 条件つきの属性。値が null / undefined / false なら属性ごと出さない
export const attr = (name, value) => (value === null || value === undefined || value === false ? '' : raw(`${name}="${escapeHTML(value)}"`));

function serialize(value) {
  if (value === null || value === undefined || value === false) return '';
  if (value instanceof SafeHTML) return value.value;
  if (Array.isArray(value)) return value.map(serialize).join('');
  return escapeHTML(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, index) => {
    out += serialize(value) + strings[index + 1];
  });
  return new SafeHTML(out);
}

export function render(target, content) {
  target.innerHTML = serialize(content);
}
