//#region dsh-plugin-minor-mode — host half
/**
 * 未成年模式 · Node 半。
 *
 * 这是一个纯浏览器侧的整活插件：逻辑全在 `exports["./client"]` 里，由
 * `package.json` 的 `dsh.client` 声明被 dsh-client-modules 发现并作为
 * `/plugins/<包名>/client.js` 提供给页面。
 *
 * 之所以仍然保留这一半（而不是只发布浏览器半），是因为 Loader 只认识
 * "一个 Cordis 插件条目"。宿主条目存在，浏览器半才会进入 boot graph。
 * 这里刻意什么都不做：不改配置、不注册服务、不碰会话。
 */

/**
 * 宿主插件体 —— 空实现。
 *
 * 若日后要让"未成年模式"在宿主侧也生效（例如拦截工具调用），
 * 在这里 `ctx.inject([...])` 即可，浏览器半不用改。
 */
export function apply() {}
//#endregion
