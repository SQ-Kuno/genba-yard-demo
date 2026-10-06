// ハッシュ方式のルーター。静的ホスティングにそのまま置けるよう、サーバー側の設定を要らなくしている。
const routes = [];
let notFound = null;
let onChange = () => {};

function compile(pattern) {
  const keys = [];
  const source = pattern
    .split('/')
    .map((part) => {
      if (part.startsWith(':')) {
        keys.push(part.slice(1));
        return '([^/]+)';
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { regex: new RegExp(`^${source}$`), keys };
}

export function route(pattern, page) {
  routes.push({ ...compile(pattern), pattern, page });
}

export function fallback(page) {
  notFound = page;
}

export function parseLocation(hash = location.hash) {
  const value = hash.replace(/^#/, '') || '/';
  const [path, queryString = ''] = value.split('?');
  return { path, query: new URLSearchParams(queryString) };
}

export function resolve(hash = location.hash) {
  const { path, query } = parseLocation(hash);
  for (const entry of routes) {
    const match = entry.regex.exec(path);
    if (match) {
      let params;
      try {
        params = Object.fromEntries(entry.keys.map((key, index) => [key, decodeURIComponent(match[index + 1])]));
      } catch {
        break; // 不正なエンコード（例: %）は「見つかりません」へ
      }
      return { page: entry.page, pattern: entry.pattern, path, params, query };
    }
  }
  return { page: notFound, pattern: null, path, params: {}, query };
}

export function navigate(path, { replace = false } = {}) {
  const target = `#${path}`;
  if (replace) {
    history.replaceState(null, '', target);
    onChange();
  } else if (location.hash === target) {
    onChange();
  } else {
    location.hash = target;
  }
}

export function start(handler) {
  onChange = handler;
  window.addEventListener('hashchange', handler);
  handler();
}

// 一覧の絞り込みなど、同じ画面のままクエリだけ変えたいとき
export function withQuery(path, params) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else if (value !== undefined && value !== null && value !== '' && value !== false) query.set(key, value);
  });
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}
