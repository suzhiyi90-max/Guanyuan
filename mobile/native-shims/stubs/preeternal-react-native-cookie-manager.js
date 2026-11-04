/**
 * @preeternal/react-native-cookie-manager 的 Web 预览降级 stub。
 *
 * 真包入口会直接访问 TurboModule，浏览器里不存在对应原生模块。这里仅保持 API
 * 形状，使依赖 Cookie 恢复逻辑的页面能按“没有原生 Cookie”继续渲染。刻意不使用
 * document.cookie 或 localStorage 模拟：这会把 Web 预览的凭据与真机 CookieStore
 * 混为一谈，并可能让用户误以为 HttpOnly Cookie 也能被网页 JavaScript 读取。
 */

const { createStubApi, createStubModule } = require('../runtime/stub-factory');

const PKG = '@preeternal/react-native-cookie-manager';

function api(apiName, result) {
  return createStubApi({ package: PKG, apiName, result, silent: true });
}

const getAll = api('getAll', {});
const getAllAsArray = api('getAllAsArray', []);
const get = api('get', {});
const getAsArray = api('getAsArray', []);
const getCookieHeader = api('getCookieHeader', '');
const getFromResponse = api('getFromResponse', {});
const set = api('set', false);
const setFromResponse = api('setFromResponse', false);
const clearAll = api('clearAll', false);
const clearAllStores = api('clearAllStores', false);
const clearByName = api('clearByName', false);
const removeSessionCookies = api('removeSessionCookies', false);
const flush = api('flush', undefined);

module.exports = createStubModule(PKG, {
  getAll,
  getAllAsArray,
  get,
  getAsArray,
  getCookieHeader,
  getFromResponse,
  set,
  setFromResponse,
  clearAll,
  clearAllStores,
  clearByName,
  removeSessionCookies,
  flush,
});
