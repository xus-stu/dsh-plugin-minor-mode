# dsh-plugin-minor-mode

> A novelty plugin for **DSH** that adds an age gate. Type your age, get roasted, and if you are under 18 a **1-minute** fuse lights up and ends in a **thunderous fake popup** — a Windows-style blue screen, or a macOS-style lock screen if you are on a Mac. Both are DOM overlays living **only inside the DSH window**; nothing touches your OS.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20web-lightgrey.svg)](#requirements)
[![DSH](https://img.shields.io/badge/DSH-0.2.0--rc.2-4a8cff.svg)](#requirements)
[![Tests](https://img.shields.io/badge/tests-34%20passed-brightgreen.svg)](#testing)
[![Not affiliated](https://img.shields.io/badge/DeepSeek-unofficial-orange.svg)](#limitations--disclaimer)

English | [中文](README.zh.md)

---

## Table of contents

- [What it does](#what-it-does)
- [Age tiers](#age-tiers)
- [Install](#install)
- [Usage](#usage)
- [The thunderous popup](#the-thunderous-popup)
- [Escape hatches](#escape-hatches)
- [Uninstall](#uninstall)
- [Customize](#customize)
- [How it works](#how-it-works)
- [Testing](#testing)
- [Limitations & disclaimer](#limitations--disclaimer)

---

## What it does

1. A small pill appears in the **bottom-right corner** of the DSH window: `● 未成年模式`.
2. Click it, type your age. The panel roasts you live as you type; quick-pick chips
   (`-1`, `0`, `3`, `10`, `13`, `17`, `18`, `30`, `70`, `150`) let you sample every tier.
3. Hit **启用** (Enable).
   - **18 or older** → adult exemption, no fuse.
   - **Under 18** → the pill turns red and a `01:00` countdown starts.
4. One minute later the popup fires: a **fake BSOD** on non-Mac, a **macOS-style lock screen** on Mac.
5. Type `我是成年人` to get out — or use any of the [escape hatches](#escape-hatches).

In a hurry? The panel has a **立即触发（测试）** button that fires the popup immediately.

## Age tiers

| Age | Tier | Verdict |
| --- | --- | --- |
| `<= 0` | Single-cell organism | **你咋不填单细胞生物呢** |
| `0 < a < 1` | Not even one | 0 岁多一点，你是怎么把键盘敲响的？ |
| `1 <= a < 3` | Toddler | 奶瓶还没放下就会写 prompt 了？ |
| `3 <= a < 6` | Kindergarten | 先去把积木搭完，回来再谈 AI。 |
| `6 <= a < 12` | Primary school | 作业写完了吗？就来找 AI 代写。 |
| `12 <= a < 15` | Middle school | 中考还有几年，别急着让 AI 替你动脑子。 |
| `15 <= a < 18` | High school | 未成年。倒计时已上膛，1 分钟后见。 |
| `18 <= a < 26` | Just turned adult | 18 岁了。法律上放你进来，心智上你自己看着办。 |
| `26 <= a < 41` | Prime working years | 欢迎来到 AI 血汗工厂，工位在那边。 |
| `41 <= a < 60` | Middle-aged | 颈椎还好吗？坐直了再聊。 |
| `60 <= a < 100` | Retired | 退休了还这么卷，佩服。 |
| `100 <= a < 200` | Possibly Qing dynasty | 你确定你不是清朝人？ |
| `200 <= a < 1000` | Became a spirit | 成精了。建议先申报一下物种。 |
| `>= 1000` | That's a floor number | 你填的是年龄还是楼层号？ |

Input tolerance: full-width digits (`１３`), a `岁` suffix, surrounding spaces and full-width
minus signs all work. `abc`, `十岁` or an empty box is rejected and **nothing gets armed**.

## Install

### Requirements

DSH `0.2.0-rc.2` (the plugin contract is `dsh.client` + `window.__ModuleLoader__`). No build step,
no dependencies, no network access at install time.

### Script

```bash
cd dsh-plugin-minor-mode
./scripts/install.sh
```

It does two idempotent things in your profile (`$DSH_PROFILE_DIR`, defaulting to
`~/.dsh/profiles/desktop`):

1. `pnpm add file:<this directory>`;
2. appends one Loader insert entry to `cordis.patch.yml`.

### Manual

```bash
cd ~/.dsh/profiles/desktop
pnpm add file:/path/to/dsh-plugin-minor-mode
```

```yaml
# append to ~/.dsh/profiles/desktop/cordis.patch.yml
- insert:
    - id: minor-mode
      name: 'dsh-plugin-minor-mode'
```

### Activation

Profile patch changes trigger HMR recomposition — **no restart needed**, the plugin goes live within
seconds. Verified: right after the patch landed, the page's boot graph contained the combo script
`plugins/??dsh-plugin-minor-mode/client.js&rev=…` and the browser compiled it. If the pill never shows
up, refresh the DSH page, then restart DSH.

## Usage

| Element | Meaning |
| --- | --- |
| `● 未成年模式` | Idle |
| `● 未成年模式 00:40` | Armed; the number is the remaining fuse |
| Panel → **启用 / 重新启用** | Arm, or re-arm after a reload |
| Panel → **立即触发（测试）** | Fire the popup now |
| Panel → **关闭未成年模式** | Disarm |

The fuse lasts **1 minute** (`DEFAULT_FUSE_MS`). Only ages `< 18` arm it. State lives in
`localStorage` under `dsh-minor-mode:v1`, so a page reload **keeps the fuse burning**; if it already
burned out, the popup fires immediately on load.

## The thunderous popup

A full-screen overlay, `z-index` maxed out, owning all mouse and keyboard input.

**Fake BSOD** (non-Mac default) — Windows-blue: a giant `:(`, a progress counter looping `0% → 100%`,
stop code `MINOR_MODE_NOT_SUPPORTED`, failed operation `growing_up.sys`. An input at the bottom takes
the passphrase.

**Mac lock** (macOS default) — blurred wallpaper, round avatar, live fake clock, passphrase field, and
a `关机 / 重启 / 睡眠` bar that only ever says "想得美".

Both are pure DOM overlays: no system API, no shell, no process calls. Quitting or force-quitting DSH
removes them instantly.

## Escape hatches

Easiest first:

1. **Passphrase** — type `我是成年人` (also accepts `我是成年人了`, `成年人`, `i am adult`, …).
2. **One-click release** — the lock screen has a `我已经成年了，放我进去` button, the BSOD has
   `我是成年人 · 直接解锁`. No typing, no IME required.
3. **Emergency combo** — `⌘/Ctrl + Shift + Alt + L`, always works.
4. **Konami code** — `↑ ↑ ↓ ↓ ← → ← → B A`.
5. **Brute force** — `localStorage.removeItem('dsh-minor-mode:v1')` in DevTools, or uninstall.

Any successful unlock **disarms** the mode (not pauses it), so it will not come back after a reload.

## Uninstall

```bash
cd ~/.dsh/profiles/desktop
pnpm remove dsh-plugin-minor-mode
```

Then delete the `- insert:` block appended to `cordis.patch.yml` and
`localStorage.removeItem('dsh-minor-mode:v1')`.

## Customize

Everything tunable sits at the top of `lib/client.js`:

| Knob | Where |
| --- | --- |
| Fuse duration | `DEFAULT_FUSE_MS` |
| Passphrase | `UNLOCK_PHRASE` / `UNLOCK_ALIASES` |
| Emergency combo | `EMERGENCY_KEY` (default `l`, with Meta/Ctrl+Shift+Alt) |
| Reveal the passphrase after N failures | `REVEAL_AFTER_FAILURES` (default 3) |
| Tier copy | the branches in `classifyAge()` |
| Popup theme | `resolveTheme()` — pin `THEMES.BSOD` or `THEMES.LOCK` |
| Pill position | `.mm-launcher { right / bottom }` in the CSS string |

Editing `lib/client.js` does **not** hot-reload: the host snapshots the bundle when it publishes the
boot graph, and DSH's HMR watches profile patches, not module sources (`root: []` by default). So after
editing, restart DSH (or try toggling `minor-mode` off/on in Settings → Plugins) and refresh the page.

Live handles in the browser console:

```js
window.__DSH_MINOR_MODE__.fire()    // trigger the popup now
window.__DSH_MINOR_MODE__.state()   // current state
window.__DSH_MINOR_MODE__.dispose() // tear the pill down
```

## How it works

DSH plugins are Cordis plugins composed from the profile's `cordis.patch.yml` (patches target rows by
`id`; new rows use `insert`). A package can ship two halves:

| Half | File | Runs in |
| --- | --- | --- |
| Host | `lib/index.js` (`exports["."]`) | the DSH Node process |
| Browser | `lib/client.js` (`exports["./client"]`) | the Web GUI page |

`@deepseek-ai/dsh-client-modules` scans enabled Loader rows, reads `dsh.client` from each
`package.json`, and serves the browser half as `<package>/client.js`; the page lazy-loads it, where it
only registers a factory. Hence `lib/client.js` is **not ESM**:

```js
window.__ModuleLoader__.load({
  id: "dsh-plugin-minor-mode",     // must equal package.json "name"
  factory: (require) => {
    var module = { exports: {} };
    function apply(ctx) { /* mount UI */ }
    module.exports.apply = apply;
    module.exports.inject = [];    // required client services; this plugin needs none
    return module.exports;
  }
});
```

Design choices worth knowing:

- **The host half is empty.** Loader rows are what put a plugin in the boot graph; the browser half does
  everything. Nothing here reads config or touches sessions.
- **Zero platform modules.** Plain DOM + Shadow DOM, no React, no `dsh-client-ui-*` API, so a failure
  can at worst add one stray `<div>`.
- **Shadow DOM + a fixed, zero-size host.** UI lives in a shadow root under a `position: fixed;
  width: 0; height: 0` host with inline styles, so it cannot join `body`'s flow or introduce a
  scrollbar (which would shift the whole app's text).
- **The lock input is `type="text"`.** Chromium disables IME composition for `type="password"`, which
  made Chinese input impossible — plus every overlay has a one-click release.
- **Idempotent mount.** `apply()` disposes the previous instance via `window.__DSH_MINOR_MODE__`, and
  registers cleanup through `ctx.effect`, so HMR reloads never stack pills.

## Testing

```bash
npm test          # node test/logic.test.mjs && node test/ui.smoke.mjs
```

Both suites evaluate **`lib/client.js` itself** through a fake `window.__ModuleLoader__`, so they test
the exact bytes the browser runs. No build step, no third-party dependencies.

- **`test/logic.test.mjs`** (13 checks) — input normalization, the age table (`<= 0`, the 18 boundary,
  non-empty and distinct verdicts), countdown formatting, passphrase matching.
- **`test/ui.smoke.mjs`** (21 checks) — a ~300-line hand-rolled DOM shim (elements, `classList`,
  `dataset`, Shadow DOM, `<template>` parsing, `querySelector`, event dispatch, virtual clock, fake
  `localStorage`) drives the whole flow: pill → panel → verdict → invalid input rejected → arm →
  countdown → Mac lock → wrong passphrase ×3 → unlock; BSOD, one-click release, emergency combo,
  Konami; plus adult exemption, fuse persistence across reload, clean `dispose()`, and no double-mount
  on re-`apply()`.

## Limitations & disclaimer

- **Patches hot-apply, code edits do not.** See [Customize](#customize).
- **The lock is fake.** It only covers the DSH page. There is deliberately no `require("os")` and no
  system call anywhere in this plugin — do not expect it to lock your machine.
- **State is local.** `localStorage` per browser profile; clearing site data resets it.
- **It is a joke.** Amuse yourself, send it to a friend — but do not use it to scare an actual child,
  and do not mistake it for real minor protection. That is a product-design problem; a full-screen
  `<div>` does not solve it.
- **Unofficial.** Not published by DeepSeek and carries no DSH compatibility promise. If the plugin
  contract changes (`dsh.client`, `__ModuleLoader__`, patch semantics), this plugin will need updating.

## License

[MIT](LICENSE)
