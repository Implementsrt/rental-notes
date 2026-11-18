// A backend address is supplied by the user; deployment addresses never belong here.
const VIEWS = new Set(['guide', 'homes', 'compare']);
const isLoopback = hostname => ['localhost', '127.0.0.1', '[::1]'].includes(hostname);

export function viewFromHash(hash) {
  const view = hash.replace(/^#/, '').split('?')[0];
  return VIEWS.has(view) ? view : 'guide';
}

export function backendHash(view, endpoint = null) {
  const route = VIEWS.has(view) ? view : 'guide';
  return `#${route}${endpoint ? `?${new URLSearchParams({api: endpoint})}` : ''}`;
}

export function resolveConnection(pageAddress, configuredBase = null) {
  const page = new URL(pageAddress);
  const values = new URLSearchParams(page.hash.split('?').slice(1).join('?')).getAll('api');
  if (!values.length) {
    return {endpoint: configuredBase === null ? null : new URL(configuredBase || page.origin, page).href.replace(/\/$/, ''), fromLink: false, error: ''};
  }
  try {
    if (values.length !== 1 || !values[0].trim() || values[0].length > 2048) throw new Error('链接中需要且只能有一个完整的服务器地址');
    const endpoint = new URL(values[0].trim());
    if (endpoint.username || endpoint.password || endpoint.href.includes('?') || endpoint.href.includes('#') || endpoint.pathname !== '/') throw new Error('服务器地址只能包含协议、主机和可选端口，不能包含账号、密码、路径或其他参数');
    const localDevelopment = page.protocol === 'http:' && isLoopback(page.hostname) && isLoopback(endpoint.hostname);
    if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && localDevelopment)) throw new Error('服务器必须使用 HTTPS；HTTP 仅限本机开发');
    return {endpoint: endpoint.origin, fromLink: true, error: ''};
  } catch (error) {
    return {endpoint: null, fromLink: true, error: error instanceof TypeError ? '服务器地址无效，请使用完整的 HTTPS 地址' : error.message};
  }
}
