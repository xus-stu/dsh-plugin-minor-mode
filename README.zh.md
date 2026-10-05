# dsh-plugin-minor-mode

> **DSH** 的猎奇插件：给 DSH 装一道年龄闸门。填上年龄就被点评一句；只要未满 18 岁，**1 分钟**后引信烧完，触发**雷霆大弹窗**——非 macOS 是 Windows 风格假蓝屏，macOS 是假锁屏。两块屏幕都只活在 **DSH 窗口内部**，不碰你的系统。

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20web-lightgrey.svg)](#环境要求)
[![DSH](https://img.shields.io/badge/DSH-0.2.0--rc.2-4a8cff.svg)](#环境要求)
[![Tests](https://img.shields.io/badge/tests-34%20passed-brightgreen.svg)](#测试)
[![Not affiliated](https://img.shields.io/badge/DeepSeek-unofficial-orange.svg)](#限制与免责声明)

[English](README.md) | 中文

---

## 目录

- [它做什么](#它做什么)
- [年龄段评语](#年龄段评语)
- [安装](#安装)
- [使用](#使用)
- [雷霆大弹窗](#雷霆大弹窗)
- [逃生通道](#逃生通道)
- [卸载](#卸载)
- [自定义](#自定义)
- [实现原理](#实现原理)
- [测试](#测试)
- [限制与免责声明](#限制与免责声明)

---

## 它做什么

1. DSH 窗口**右下角**出现一个小胶囊：`● 未成年模式`。
2. 点它，填年龄。面板会一边输入一边点评，还有快捷芯片（`-1`、`0`、`3`、`10`、`13`、`17`、`18`、`30`、`70`、`150`）让你把每一档都试一遍。
3. 点 **启用**。
   - **≥ 18 岁** → 成年豁免，不点火。
   - **< 18 岁** → 挂件变红，`01:00` 倒计时开始。
4. 一分钟后开炸：非 Mac 是**假蓝屏**，Mac 是**雷霆大锁**。
5. 输入 `我是成年人` 出来，或者走下面的[逃生通道](#逃生通道)。

不想等？面板里有 **立即触发（测试）** 按钮，一点就炸。

## 年龄段评语

| 年龄 | 档位 | 点评 |
| --- | --- | --- |
| `<= 0` | 单细胞生物 | **你咋不填单细胞生物呢** |
| `0 < a < 1` | 不到一岁 | 0 岁多一点，你是怎么把键盘敲响的？ |
| `1 <= a < 3` | 学步期 | 奶瓶还没放下就会写 prompt 了？ |
| `3 <= a < 6` | 幼儿园 | 先去把积木搭完，回来再谈 AI。 |
| `6 <= a < 12` | 小学生 | 作业写完了吗？就来找 AI 代写。 |
| `12 <= a < 15` | 初中生 | 中考还有几年，别急着让 AI 替你动脑子。 |
| `15 <= a < 18` | 高中生 | 未成年。倒计时已上膛，1 分钟后见。 |
| `18 <= a < 26` | 刚成年 | 18 岁了。法律上放你进来，心智上你自己看着办。 |
| `26 <= a < 41` | 社畜黄金期 | 欢迎来到 AI 血汗工厂，工位在那边。 |
| `41 <= a < 60` | 中年 | 颈椎还好吗？坐直了再聊。 |
| `60 <= a < 100` | 退休 | 退休了还这么卷，佩服。 |
| `100 <= a < 200` | 疑似清朝人 | 你确定你不是清朝人？ |
| `200 <= a < 1000` | 成精了 | 成精了。建议先申报一下物种。 |
| `>= 1000` | 疑似楼层号 | 你填的是年龄还是楼层号？ |

输入容忍度：全角数字（`１３`）、`岁` 后缀、前后空格、全角负号都认。`abc`、`十岁`、空白会被判为非法并**拒绝点火**。

## 安装

### 环境要求

DSH `0.2.0-rc.2`（插件契约是 `dsh.client` + `window.__ModuleLoader__`）。无构建步骤、无依赖、安装不需要联网。

### 脚本安装

```bash
cd dsh-plugin-minor-mode
./scripts/install.sh
```

它在你的 profile（`$DSH_PROFILE_DIR`，默认 `~/.dsh/profiles/desktop`）里做两件可重复执行的事：

1. `pnpm add file:<本目录>`；
2. 在 `cordis.patch.yml` 末尾追加一条 Loader 插入条目。

### 手动安装

```bash
cd ~/.dsh/profiles/desktop
pnpm add file:/path/to/dsh-plugin-minor-mode
```

```yaml
# 追加到 ~/.dsh/profiles/desktop/cordis.patch.yml
- insert:
    - id: minor-mode
      name: 'dsh-plugin-minor-mode'
```

### 生效

改 profile 补丁会触发 HMR 重新组合，**不用重启**，几秒内插件就上线。已实测：补丁落地后，
页面的 boot graph 里立刻出现了组合脚本 `plugins/??dsh-plugin-minor-mode/client.js&rev=…`，
浏览器也把它编译执行了。右下角一直没出现挂件的话，先刷新 DSH 页面，再不行就重启 DSH。

## 使用

| 元素 | 含义 |
| --- | --- |
| `● 未成年模式` | 待机 |
| `● 未成年模式 00:40` | 已点火，数字是引信剩余时间 |
| 面板 → **启用 / 重新启用** | 点火，或刷新后重新点火 |
| 面板 → **立即触发（测试）** | 马上就炸 |
| 面板 → **关闭未成年模式** | 拆弹 |

引信 **1 分钟**（`DEFAULT_FUSE_MS`），只有 `< 18` 岁才点火。状态存在 `localStorage` 的
`dsh-minor-mode:v1`，所以刷新页面**引信继续烧**；要是早就烧完了，页面一加载就炸。

## 雷霆大弹窗

一个全屏遮罩，`z-index` 拉满，鼠标键盘都被它接住。

**假蓝屏**（非 Mac 默认）——Windows 蓝：巨大的 `:(`、`0% → 100%` 循环的进度条、停止代码
`MINOR_MODE_NOT_SUPPORTED`、失败操作 `growing_up.sys`，底部一个口令输入框。

**雷霆大锁**（macOS 默认）——模糊壁纸、圆形头像、实时假时钟、口令输入框，还有一排
`关机 / 重启 / 睡眠`，点了只会说「想得美」。

两块屏幕都是纯 DOM 遮罩：没有系统 API、没有 shell、没有进程调用。关掉或强退 DSH，它们立刻消失。

## 逃生通道

按先易后难排：

1. **口令** —— 输入 `我是成年人`（也认 `我是成年人了`、`成年人`、`i am adult` 等）。
2. **一键放行** —— 锁屏上是 `我已经成年了，放我进去`，蓝屏上是 `我是成年人 · 直接解锁`。不用打字，不吃输入法。
3. **紧急组合键** —— `⌘/Ctrl + Shift + Alt + L`，随时可用。
4. **科乐美秘技** —— `↑ ↑ ↓ ↓ ← → ← → B A`。
5. **暴力流** —— 开发者工具执行 `localStorage.removeItem('dsh-minor-mode:v1')`，或者卸载。

任何一种解锁方式都会**关闭**未成年模式（不是暂停），所以刷新后不会再跳出来。

## 卸载

```bash
cd ~/.dsh/profiles/desktop
pnpm remove dsh-plugin-minor-mode
```

然后删掉 `cordis.patch.yml` 末尾那段 `- insert:`，再
`localStorage.removeItem('dsh-minor-mode:v1')`。

## 自定义

所有能调的东西都在 `lib/client.js` 顶部：

| 想改什么 | 改哪里 |
| --- | --- |
| 引信时长 | `DEFAULT_FUSE_MS` |
| 解锁口令 | `UNLOCK_PHRASE` / `UNLOCK_ALIASES` |
| 紧急组合键 | `EMERGENCY_KEY`（默认 `l`，配合 Meta/Ctrl+Shift+Alt） |
| 输错几次直接报口令 | `REVEAL_AFTER_FAILURES`（默认 3） |
| 各年龄段文案 | `classifyAge()` 里的分支 |
| 弹窗主题 | `resolveTheme()`：写死 `THEMES.BSOD` 或 `THEMES.LOCK` |
| 挂件位置 | CSS 串里的 `.mm-launcher { right / bottom }` |

改 `lib/client.js` **不会**热更：宿主发布 boot graph 时就把 bundle 内容快照了，而 DSH 的 HMR
默认只监听 profile 补丁、不监听模块源码（`root: []`）。所以改完要重启 DSH（或者在
「设置 → 插件」里把 `minor-mode` 关掉再打开试试），然后刷新页面。

浏览器控制台里的实时句柄：

```js
window.__DSH_MINOR_MODE__.fire()    // 立刻触发弹窗
window.__DSH_MINOR_MODE__.state()   // 看当前状态
window.__DSH_MINOR_MODE__.dispose() // 拆掉挂件
```

## 实现原理

DSH 插件是 Cordis 插件，由 profile 的 `cordis.patch.yml` 组合而成（补丁按 `id` 定位已有条目，
新增条目用 `insert`）。一个包可以同时提供两半：

| 半边 | 文件 | 跑在 |
| --- | --- | --- |
| 宿主半 | `lib/index.js`（`exports["."]`） | DSH 的 Node 进程 |
| 浏览器半 | `lib/client.js`（`exports["./client"]`） | Web GUI 页面 |

`@deepseek-ai/dsh-client-modules` 扫描启用的 Loader 条目，读取各 `package.json` 的 `dsh.client`，
把浏览器半作为 `<包名>/client.js` 提供给页面；页面懒加载它，而它只注册一个工厂。所以
`lib/client.js` **不是 ESM**：

```js
window.__ModuleLoader__.load({
  id: "dsh-plugin-minor-mode",     // 必须等于 package.json 的 name
  factory: (require) => {
    var module = { exports: {} };
    function apply(ctx) { /* 挂 UI */ }
    module.exports.apply = apply;
    module.exports.inject = [];    // 依赖的客户端服务；本插件一个都不要
    return module.exports;
  }
});
```

几个刻意的选择：

- **宿主半是空的。** Loader 条目只负责让插件进 boot graph，活全在浏览器半；它不读配置、不碰会话。
- **零平台模块依赖。** 纯 DOM + Shadow DOM，不用 React、不碰 `dsh-client-ui-*`，坏了最多多一个野 `<div>`。
- **Shadow DOM + fixed 零尺寸宿主。** UI 挂在一个内联 `position: fixed; width: 0; height: 0` 的宿主
  下的 shadow root 里，因此不会参与 `body` 的文档流，也不会挤出滚动条（那会让整页文字左右偏移）。
- **锁屏输入框是 `type="text"`。** Chromium 会对 `type="password"` 关闭输入法，中文根本打不进去；
  另外每个遮罩都有「一键放行」按钮兜底。
- **幂等挂载。** `apply()` 会通过 `window.__DSH_MINOR_MODE__` 先卸掉上一个实例，并用 `ctx.effect`
  注册清理，HMR 重载不会叠出两个挂件。

## 测试

```bash
npm test          # node test/logic.test.mjs && node test/ui.smoke.mjs
```

两个测试都通过假的 `window.__ModuleLoader__` **直接求值 `lib/client.js` 本体**，测的就是浏览器
跑的那份字节。无构建步骤、无第三方依赖。

- **`test/logic.test.mjs`**（13 项）—— 输入归一化、年龄分级（`<= 0`、18 岁分界、评语非空且互不重复）、
  倒计时格式化、口令匹配。
- **`test/ui.smoke.mjs`**（21 项）—— 一个约 300 行手写 DOM 垫片（元素、`classList`、`dataset`、
  Shadow DOM、`<template>` 解析、`querySelector`、事件派发、虚拟时钟、假 `localStorage`）跑完整流程：
  点挂件 → 面板 → 点评 → 非法输入被拒 → 点火 → 倒计时 → Mac 大锁 → 连错三次 → 解锁；蓝屏、
  一键放行、紧急组合键、科乐美秘技；再加上成年豁免、刷新后引信续烧、`dispose()` 干净、
  重复 `apply()` 不叠挂件。

## 限制与免责声明

- **补丁热更，代码不热更。** 见[自定义](#自定义)。
- **锁屏是假的。** 它只覆盖 DSH 页面。本插件里刻意没有 `require("os")`、没有任何系统调用——
  别指望它真的锁住你的机器。
- **状态是本地的。** 以 `localStorage` 为粒度，清站点数据即重置。
- **它是整活插件。** 自娱自乐、发给朋友笑一下都行；别用来吓唬真的小孩，也别拿它当真的未成年人
  保护措施——那是产品设计问题，一个全屏 `<div>` 解决不了。
- **非官方。** 不是 DeepSeek 发布的插件，不享受 DSH 的兼容性承诺。插件契约
  （`dsh.client`、`__ModuleLoader__`、补丁语义）变了，本插件需要跟着改。

## License

[MIT](LICENSE)
