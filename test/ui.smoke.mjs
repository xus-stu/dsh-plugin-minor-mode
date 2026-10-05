// 未成年模式 · 端到端冒烟测试（自带最小 DOM 垫片）
//
// 目标：把 lib/client.js 整份塞进一个够用的假 DOM 里，从"点挂件"一路走到
// "填年龄 → 启用 → 引信烧完 → 大锁/蓝屏 → 输入口令解锁"，把查询选择器写错、
// 变量未定义、事件没接上这类运行时错误全抓出来。
//
//   node test/ui.smoke.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const bundle = readFileSync(join(here, "..", "lib", "client.js"), "utf8");

// ---------------------------------------------------------------------------
// 最小 DOM
// ---------------------------------------------------------------------------
const VOID_TAGS = new Set(["input", "br", "img", "hr", "meta", "link"]);

class ClassList {
	constructor(el) {
		this.el = el;
	}
	add(...names) {
		for (const n of names) this.el._classes.add(n);
	}
	remove(...names) {
		for (const n of names) this.el._classes.delete(n);
	}
	toggle(name, force) {
		const want = force === undefined ? !this.el._classes.has(name) : force === true;
		if (want) this.el._classes.add(name);
		else this.el._classes.delete(name);
		return want;
	}
	contains(name) {
		return this.el._classes.has(name);
	}
}

class Element {
	constructor(tag) {
		this.tagName = String(tag).toUpperCase();
		this.children = [];
		this.parentNode = null;
		this.attrs = Object.create(null);
		this.dataset = Object.create(null);
		this.style = Object.create(null);
		this._classes = new Set();
		this.classList = new ClassList(this);
		this._listeners = new Map();
		this._ownText = "";
		this.value = "";
		this.shadowRoot = null;
		this.content = null;
		this.host = null;
	}
	get firstElementChild() {
		return this.children.length > 0 ? this.children[0] : null;
	}
	get textContent() {
		let out = this._ownText;
		for (const child of this.children) out += child.textContent;
		return out;
	}
	set textContent(value) {
		this._ownText = String(value);
		this.children = [];
	}
	set innerHTML(html) {
		const target = this.tagName === "TEMPLATE" ? this.content : this;
		target.children = [];
		target._ownText = "";
		const state = { html: String(html), i: 0 };
		const parsed = parseNodes(state);
		target._ownText = parsed.text;
		for (const node of parsed.nodes) target.appendChild(node);
	}
	get innerHTML() {
		return this._ownText;
	}
	appendChild(node) {
		if (node.parentNode !== null) node.parentNode.children = node.parentNode.children.filter((c) => c !== node);
		node.parentNode = this;
		this.children.push(node);
		return node;
	}
	append(...nodes) {
		for (const node of nodes) this.appendChild(node);
	}
	remove() {
		if (this.parentNode === null) return;
		this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
		this.parentNode = null;
	}
	setAttribute(key, value) {
		this.attrs[key] = String(value);
		if (key === "class") {
			this._classes = new Set(String(value).split(/\s+/).filter(Boolean));
		} else if (key === "style") {
			for (const decl of String(value).split(";")) {
				const idx = decl.indexOf(":");
				if (idx === -1) continue;
				this.style[decl.slice(0, idx).trim()] = decl.slice(idx + 1).trim();
			}
		} else if (key.startsWith("data-")) {
			const camel = key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
			this.dataset[camel] = String(value);
		}
	}
	getAttribute(key) {
		if (Object.prototype.hasOwnProperty.call(this.attrs, key)) return this.attrs[key];
		if (key.startsWith("data-")) {
			const camel = key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
			if (Object.prototype.hasOwnProperty.call(this.dataset, camel)) return this.dataset[camel];
		}
		return null;
	}
	attachShadow() {
		const root = new Element("#shadow-root");
		root.host = this;
		this.shadowRoot = root;
		return root;
	}
	querySelector(selector) {
		const all = this.querySelectorAll(selector);
		return all.length > 0 ? all[0] : null;
	}
	querySelectorAll(selector) {
		const want = parseSelector(selector);
		const out = [];
		const walk = (node) => {
			for (const child of node.children) {
				if (want(child)) out.push(child);
				walk(child);
			}
		};
		walk(this);
		return out;
	}
	addEventListener(type, listener) {
		if (!this._listeners.has(type)) this._listeners.set(type, []);
		this._listeners.get(type).push(listener);
	}
	removeEventListener(type, listener) {
		const list = this._listeners.get(type);
		if (list === undefined) return;
		this._listeners.set(
			type,
			list.filter((fn) => fn !== listener)
		);
	}
	dispatch(type, patch) {
		const event = Object.assign({ type, target: this, currentTarget: this, preventDefault() {} }, patch);
		for (const listener of [...(this._listeners.get(type) || [])]) listener(event);
		return event;
	}
	click() {
		this.dispatch("click");
	}
	focus() {}
	get offsetWidth() {
		return 0;
	}
}

/** 支持 `.a.b`、`[attr]`、`tag`，够本插件用了。 */
function parseSelector(selector) {
	const text = selector.trim();
	if (text.startsWith("[")) {
		const name = text.slice(1, -1);
		return (el) => el.getAttribute(name) !== null;
	}
	if (text.startsWith(".")) {
		const classes = text.slice(1).split(".").filter(Boolean);
		return (el) => classes.every((c) => el._classes.has(c));
	}
	return (el) => el.tagName === text.toUpperCase();
}

function tagEnd(html, from) {
	let quote = null;
	for (let i = from; i < html.length; i += 1) {
		const ch = html[i];
		if (quote !== null) {
			if (ch === quote) quote = null;
		} else if (ch === '"' || ch === "'") {
			quote = ch;
		} else if (ch === ">") {
			return i;
		}
	}
	return html.length;
}

/** 把标签里 `在 = 之后` 的部分切成 [name, value]，尊重引号（class="a b" 是一个属性）。 */
function parseAttrs(body) {
	const out = [];
	let i = 0;
	while (i < body.length) {
		while (i < body.length && /\s/.test(body[i])) i += 1;
		if (i >= body.length) break;
		let start = i;
		while (i < body.length && !/[\s=]/.test(body[i])) i += 1;
		const name = body.slice(start, i);
		while (i < body.length && /\s/.test(body[i])) i += 1;
		if (body[i] === "=") {
			i += 1;
			while (i < body.length && /\s/.test(body[i])) i += 1;
			let value = "";
			if (body[i] === '"' || body[i] === "'") {
				const quote = body[i];
				i += 1;
				start = i;
				while (i < body.length && body[i] !== quote) i += 1;
				value = body.slice(start, i);
				i += 1;
			} else {
				start = i;
				while (i < body.length && !/\s/.test(body[i])) i += 1;
				value = body.slice(start, i);
			}
			out.push([name, value]);
		} else {
			out.push([name, ""]);
		}
	}
	return out;
}

function parseNodes(state) {
	const nodes = [];
	let text = "";
	while (state.i < state.html.length) {
		const lt = state.html.indexOf("<", state.i);
		if (lt === -1) {
			text += state.html.slice(state.i);
			state.i = state.html.length;
			break;
		}
		text += state.html.slice(state.i, lt);
		if (state.html.startsWith("<!--", lt)) {
			const end = state.html.indexOf("-->", lt);
			state.i = end === -1 ? state.html.length : end + 3;
			continue;
		}
		if (state.html.startsWith("</", lt)) {
			const gt = state.html.indexOf(">", lt);
			state.i = gt === -1 ? state.html.length : gt + 1;
			break;
		}
		const gt = tagEnd(state.html, lt);
		const raw = state.html.slice(lt + 1, gt);
		const selfClosing = /\/\s*$/.test(raw);
		const body = raw.replace(/\/\s*$/, "");
		const nameEnd = body.search(/\s/);
		const tag = (nameEnd === -1 ? body : body.slice(0, nameEnd)).trim().toLowerCase();
		const el = new Element(tag);
		for (const [key, value] of parseAttrs(nameEnd === -1 ? "" : body.slice(nameEnd))) {
			el.setAttribute(key, value);
		}
		state.i = gt + 1;
		if (!selfClosing && !VOID_TAGS.has(tag)) {
			const inner = parseNodes(state);
			el._ownText = inner.text;
			for (const child of inner.nodes) el.appendChild(child);
		}
		nodes.push(el);
	}
	return { nodes, text };
}

// ---------------------------------------------------------------------------
// 假 window / document / 定时器 / localStorage
// ---------------------------------------------------------------------------
let clock = 1_700_000_000_000;
const realNow = Date.now;
Date.now = () => clock;

let nextTimerId = 1;
const timers = new Map();
function fakeSetTimeout(fn, ms) {
	const id = nextTimerId++;
	timers.set(id, { fn, at: clock + (Number(ms) || 0), every: 0 });
	return id;
}
function fakeSetInterval(fn, ms) {
	const id = nextTimerId++;
	const every = Number(ms) || 1;
	timers.set(id, { fn, at: clock + every, every });
	return id;
}
function fakeClear(id) {
	timers.delete(id);
}
/** 把虚拟时间往前推 ms，按到期顺序执行定时器。 */
function advance(ms) {
	const target = clock + ms;
	let guard = 0;
	for (;;) {
		let pick = null;
		for (const [id, timer] of timers) {
			if (timer.at <= target && (pick === null || timer.at < pick[1].at)) pick = [id, timer];
		}
		if (pick === null) break;
		const [id, timer] = pick;
		clock = timer.at;
		if (timer.every > 0) timer.at = clock + timer.every;
		else timers.delete(id);
		timer.fn();
		guard += 1;
		if (guard > 200000) throw new Error("定时器爆炸：疑似死循环");
	}
	clock = target;
}

const documentListeners = new Map();
const document = {
	body: new Element("body"),
	head: new Element("head"),
	createElement: (tag) => {
		const el = new Element(tag);
		if (String(tag).toLowerCase() === "template") el.content = new Element("#fragment");
		return el;
	},
	addEventListener(type, listener) {
		if (!documentListeners.has(type)) documentListeners.set(type, []);
		documentListeners.get(type).push(listener);
	},
	removeEventListener(type, listener) {
		const list = documentListeners.get(type);
		if (list === undefined) return;
		documentListeners.set(
			type,
			list.filter((fn) => fn !== listener)
		);
	},
	dispatch(type, patch) {
		const event = Object.assign({ type, target: document, preventDefault() {} }, patch);
		for (const listener of [...(documentListeners.get(type) || [])]) listener(event);
		return event;
	}
};

const storage = new Map();
const localStorage = {
	getItem: (k) => (storage.has(k) ? storage.get(k) : null),
	setItem: (k, v) => storage.set(k, String(v)),
	removeItem: (k) => storage.delete(k)
};

function installGlobals(platform) {
	globalThis.window = {
		__ModuleLoader__: { load: (entry) => (captured = entry) },
		setTimeout: fakeSetTimeout,
		clearTimeout: fakeClear,
		setInterval: fakeSetInterval,
		clearInterval: fakeClear,
		localStorage,
		__DSH_MINOR_MODE__: undefined
	};
	delete window.__DSH_MINOR_MODE__;
	globalThis.document = document;
	// Node 24 自带只读的 navigator，得用 defineProperty 覆盖。
	Object.defineProperty(globalThis, "navigator", {
		value: { platform: platform, userAgent: "test/" + platform },
		configurable: true,
		writable: true
	});
}

// ---------------------------------------------------------------------------
// 加载插件
// ---------------------------------------------------------------------------
let captured = null;

/** 每个"页面"跑一次：加载 bundle、apply、返回操作句柄。 */
function boot(platform, options) {
	const keepStorage = options !== undefined && options.keepStorage === true;
	document.body = new Element("body");
	documentListeners.clear();
	if (!keepStorage) {
		storage.clear();
		clock = 1_700_000_000_000;
	}
	timers.clear();
	captured = null;
	installGlobals(platform);
	new Function(bundle)();
	assert.ok(captured, "client.js 应该注册工厂");
	assert.equal(captured.id, "dsh-plugin-minor-mode");
	const mod = captured.factory(() => {
		throw new Error("不该 require 平台模块");
	});
	let disposer = null;
	const ctx = {
		effect(factory) {
			disposer = factory();
			return () => {
				if (disposer) disposer();
			};
		}
	};
	mod.apply(ctx);
	const host = document.body.children.find((c) => c.getAttribute("data-plugin") === "dsh-plugin-minor-mode");
	assert.ok(host, "apply 之后 body 下应该有带 data-plugin 的宿主节点");
	const shadow = host.shadowRoot;
	assert.ok(shadow, "宿主节点应该有 shadow root");
	return {
		host,
		shadow,
		mod,
		teardown: () => (disposer ? disposer() : undefined),
		launcher: shadow.querySelector(".mm-launcher"),
		layer: shadow.children[shadow.children.length - 1],
		overlayRoot: () => shadow.querySelector(".mm-bsod") || shadow.querySelector(".mm-lock"),
		lock: () => shadow.querySelector(".mm-lock"),
		bsod: () => shadow.querySelector(".mm-bsod")
	};
}

let passed = 0;
function check(name, fn) {
	fn();
	passed += 1;
	console.log("  ✓ " + name);
}

// ---------------------------------------------------------------------------
// 场景 1：macOS 全流程 —— 挂件 → 面板 → 填 13 岁 → 启用 → 引信 → 大锁 → 解锁
// ---------------------------------------------------------------------------
console.log("场景 1 · macOS 全流程");
const mac = boot("MacIntel");

check("挂件就位，初始不带 active", () => {
	assert.ok(mac.host.style.cssText.includes("position:fixed"), "宿主必须 fixed 零尺寸，否则会挤动全页布局");
	assert.ok(/z-index:\s*2147483000/.test(mac.host.style.cssText), "z-index 必须写在宿主上：fixed 宿主自己就是层叠上下文，写在里面会被对话页的侧栏盖住");
	assert.ok(mac.launcher, "应该渲染 .mm-launcher");
	assert.equal(mac.launcher.classList.contains("mm-active"), false);
	assert.equal(mac.launcher.textContent.includes("未成年模式"), true);
});

check("点挂件弹出面板", () => {
	mac.launcher.click();
	const panel = mac.shadow.querySelector(".mm-panel");
	assert.ok(panel, "应该弹出 .mm-panel");
	assert.ok(mac.shadow.querySelector(".mm-input"), "面板里应该有年龄输入框");
});

check("输入年龄实时给点评", () => {
	const input = mac.shadow.querySelector(".mm-input");
	input.value = "13";
	input.dispatch("input");
	assert.equal(mac.shadow.querySelector(".mm-verdict-text").textContent, "中考还有几年，别急着让 AI 替你动脑子。");
	assert.equal(mac.shadow.querySelector(".mm-panel-badge").textContent, "初中生");
});

check("非法输入被拒绝且不点火", () => {
	const input = mac.shadow.querySelector(".mm-input");
	input.value = "abc";
	input.dispatch("input");
	assert.equal(mac.shadow.querySelector(".mm-error").textContent, "这不是数字，这是行为艺术。请填阿拉伯数字。");
	mac.shadow.querySelector(".mm-submit").click();
	assert.ok(mac.shadow.querySelector(".mm-panel"), "面板不该关闭");
	assert.equal(mac.launcher.classList.contains("mm-active"), false, "不该点火");
	assert.equal(localStorage.getItem("dsh-minor-mode:v1"), null, "不该写入任何状态");
});

check("启用 13 岁：面板关闭、挂件变红、引信约 1 分钟", () => {
	const input = mac.shadow.querySelector(".mm-input");
	input.value = "13";
	input.dispatch("input");
	mac.shadow.querySelector(".mm-submit").click();
	assert.equal(mac.shadow.querySelector(".mm-panel"), null, "面板应该关闭");
	assert.equal(mac.launcher.classList.contains("mm-active"), true);
	const saved = JSON.parse(storage.get("dsh-minor-mode:v1"));
	assert.equal(saved.enabled, true);
	assert.equal(saved.age, 13);
	const fuse = [...timers.values()].find((t) => t.every === 0);
	assert.ok(fuse, "应该有点火定时器");
	assert.equal(fuse.at - clock, 60 * 1000, "引信应该是 1 分钟");
});

check("倒计时挂在挂件上", () => {
	assert.equal(mac.launcher.querySelector(".mm-launcher-count").textContent, "01:00");
	advance(20 * 1000);
	assert.equal(mac.launcher.querySelector(".mm-launcher-count").textContent, "00:40");
});

check("引信烧完弹出雷霆大锁（mac）", () => {
	advance(40 * 1000);
	const lock = mac.lock();
	assert.ok(lock, "应该有 .mm-lock");
	assert.equal(mac.bsod(), null, "mac 上不该出现蓝屏");
	assert.ok(lock.textContent.includes("未成年模式已锁定"));
	assert.ok(lock.textContent.includes("年龄：13 岁（初中生）"));
	assert.ok(lock.querySelector(".mm-lock-input"), "应该有口令输入框");
	assert.ok(lock.querySelector(".mm-lock-giveup"), "应该有一键放行按钮（输入法抽风时的后路）");
	assert.equal(lock.querySelector(".mm-lock-input").getAttribute("type"), "text", "不能是 password：Chromium 会关掉输入法");
});

check("输错口令有反馈，连错三次直接报答案", () => {
	const input = mac.shadow.querySelector(".mm-lock-input");
	const msg = () => mac.shadow.querySelector(".mm-lock-msg").textContent;
	input.value = "随便写写";
	input.dispatch("keydown", { key: "Enter" });
	assert.ok(msg().includes("口令不对"), "第一次应该有提示：" + msg());
	input.value = "我是未成年人";
	input.dispatch("keydown", { key: "Enter" });
	assert.ok(msg().includes("又错了"), "第二次：" + msg());
	input.value = "password";
	input.dispatch("keydown", { key: "Enter" });
	assert.ok(msg().includes("我是成年人"), "第三次应该报出答案：" + msg());
	assert.ok(msg().includes("算了"), "第三次应该是那句算了：" + msg());
});

check("正确口令解锁并关闭未成年模式", () => {
	const input = mac.shadow.querySelector(".mm-lock-input");
	input.value = "我是成年人";
	input.dispatch("keydown", { key: "Enter" });
	assert.equal(mac.lock(), null, "大锁应该消失");
	assert.equal(mac.launcher.classList.contains("mm-active"), false);
	assert.equal(JSON.parse(storage.get("dsh-minor-mode:v1")).enabled, false);
	const intervals = [...timers.values()].filter((t) => t.every > 0);
	assert.equal(intervals.length, 0, "不该留下任何轮询定时器（进度条/假时钟/倒计时）");
});

// ---------------------------------------------------------------------------
// 场景 2：非 mac —— 假蓝屏 + 紧急组合键
// ---------------------------------------------------------------------------
console.log("场景 2 · 假蓝屏与紧急解锁");
const win = boot("Win32");

check("填 0 岁：单细胞生物，且仍是未成年", () => {
	win.launcher.click();
	const input = win.shadow.querySelector(".mm-input");
	input.value = "0";
	input.dispatch("input");
	assert.equal(win.shadow.querySelector(".mm-verdict-text").textContent, "你咋不填单细胞生物呢");
	win.shadow.querySelector(".mm-submit").click();
	assert.equal(win.launcher.classList.contains("mm-active"), true, "0 岁也要点火");
});

check("用测试按钮立刻触发假蓝屏", () => {
	win.launcher.click();
	const testBtn = win.shadow.querySelector(".mm-secondary");
	assert.equal(testBtn.style.display, "", "测试按钮应该可见");
	testBtn.click();
	const bsod = win.bsod();
	assert.ok(bsod, "应该有 .mm-bsod");
	assert.equal(win.lock(), null, "非 mac 不该出现大锁");
	assert.ok(bsod.textContent.includes("停止代码：MINOR_MODE_NOT_SUPPORTED"));
	assert.ok(bsod.textContent.includes("紧急解锁"));
	assert.ok(bsod.querySelector(".mm-bsod-skip"), "蓝屏也该有一键解锁");
});

check("蓝屏进度条会动", () => {
	const pct = win.shadow.querySelector(".mm-pct");
	assert.equal(pct.textContent, "0%");
	advance(90 * 5);
	assert.equal(pct.textContent, "5%");
});

check("蓝屏点一下就能放行", () => {
	win.launcher.click();
	win.shadow.querySelector(".mm-input").value = "9";
	win.shadow.querySelector(".mm-input").dispatch("input");
	win.shadow.querySelector(".mm-submit").click();
	win.launcher.click();
	win.shadow.querySelector(".mm-secondary").click();
	assert.ok(win.bsod(), "先得有蓝屏");
	win.shadow.querySelector(".mm-bsod-skip").click();
	assert.equal(win.bsod(), null, "一键放行应该解锁");
});

check("蓝屏里输口令也能解锁", () => {
	win.launcher.click();
	win.shadow.querySelector(".mm-input").value = "9";
	win.shadow.querySelector(".mm-input").dispatch("input");
	win.shadow.querySelector(".mm-submit").click();
	win.launcher.click();
	const testBtn = win.shadow.querySelector(".mm-secondary");
	testBtn.click();
	const input = win.shadow.querySelector(".mm-bsod-input");
	input.value = "i am adult";
	input.dispatch("keydown", { key: "Enter" });
	assert.equal(win.bsod(), null, "蓝屏应该消失");
	assert.equal(JSON.parse(storage.get("dsh-minor-mode:v1")).enabled, false);
});

check("紧急组合键 ⌘⇧⌥L 解锁大锁", () => {
	win.launcher.click();
	win.shadow.querySelector(".mm-input").value = "17";
	win.shadow.querySelector(".mm-input").dispatch("input");
	win.shadow.querySelector(".mm-submit").click();
	win.launcher.click();
	win.shadow.querySelector(".mm-secondary").click();
	assert.ok(win.bsod(), "蓝屏应该在场");
	document.dispatch("keydown", { key: "l", metaKey: true, shiftKey: true, altKey: true });
	assert.equal(win.bsod(), null, "组合键应该解锁");
	assert.equal(JSON.parse(storage.get("dsh-minor-mode:v1")).enabled, false);
});

check("科乐美秘技也能解锁", () => {
	win.launcher.click();
	win.shadow.querySelector(".mm-input").value = "9";
	win.shadow.querySelector(".mm-input").dispatch("input");
	win.shadow.querySelector(".mm-submit").click();
	win.launcher.click();
	win.shadow.querySelector(".mm-secondary").click();
	for (const key of ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"]) {
		document.dispatch("keydown", { key });
	}
	assert.equal(win.bsod(), null, "秘技应该解锁");
});

// ---------------------------------------------------------------------------
// 场景 3：刷新恢复 + 成年豁免 + 卸载
// ---------------------------------------------------------------------------
console.log("场景 3 · 刷新恢复、成年豁免、卸载");

check("成年豁免：18 岁不点火、不写引信、挂件不变红", () => {
	const page = boot("Win32");
	page.launcher.click();
	const input = page.shadow.querySelector(".mm-input");
	input.value = "18";
	input.dispatch("input");
	assert.equal(
		page.shadow.querySelector(".mm-verdict-text").textContent,
		"18 岁了。法律上放你进来，心智上你自己看着办。"
	);
	page.shadow.querySelector(".mm-submit").click();
	assert.equal(page.launcher.classList.contains("mm-active"), false, "成年人不该变红");
	// 只该剩下吐司那种短命定时器，不该有几分钟后的引信
	const longTimers = [...timers.values()].filter((t) => t.every === 0 && t.at - clock > 10_000);
	assert.equal(longTimers.length, 0, "成年人不该有引信");
	assert.equal(JSON.parse(storage.get("dsh-minor-mode:v1")).enabled, true, "但状态还是记着的");
	page.teardown();
});

check("刷新页面：引信接着烧", () => {
	const page = boot("Win32");
	page.launcher.click();
	const input = page.shadow.querySelector(".mm-input");
	input.value = "15";
	input.dispatch("input");
	page.shadow.querySelector(".mm-submit").click();
	advance(20 * 1000);
	assert.equal(page.launcher.querySelector(".mm-launcher-count").textContent, "00:40");
	page.teardown();
	// 模拟刷新：同一份 localStorage，重新 boot 一个页面
	const reloaded = boot("Win32", { keepStorage: true });
	assert.equal(reloaded.launcher.classList.contains("mm-active"), true, "刷新后应该仍是启用态");
	assert.equal(reloaded.launcher.querySelector(".mm-launcher-count").textContent, "00:40", "剩余时间应该接着算");
	reloaded.teardown();
});

check("引信早就在上次烧完：刷新后立刻开炸", () => {
	const saved = JSON.parse(storage.get("dsh-minor-mode:v1"));
	saved.enabledAt = clock - 10 * 60 * 1000;
	storage.set("dsh-minor-mode:v1", JSON.stringify(saved));
	const reloaded = boot("Win32", { keepStorage: true });
	assert.ok(reloaded.bsod(), "刷新后应该立刻是蓝屏（Win32 平台上）");
	// 口令解锁后状态要写回
	const input = reloaded.shadow.querySelector(".mm-bsod-input");
	input.value = "我是成年人";
	input.dispatch("keydown", { key: "Enter" });
	assert.equal(reloaded.bsod(), null);
	assert.equal(JSON.parse(storage.get("dsh-minor-mode:v1")).enabled, false);
	reloaded.teardown();
});

check("dispose 之后页面干干净净", () => {
	const clean = boot("Win32");
	assert.ok(clean.host.parentNode, "宿主节点在 body 里");
	assert.equal(typeof window.__DSH_MINOR_MODE__, "object");
	clean.teardown();
	assert.equal(clean.host.parentNode, null, "宿主节点应该被摘掉");
	assert.equal(window.__DSH_MINOR_MODE__, undefined, "全局句柄应该被清掉");
	assert.equal(timers.size, 0, "不该留下任何定时器");
});

check("重复 apply 不会叠挂件（HMR 场景）", () => {
	const page = boot("Win32");
	page.launcher.click();
	const input = page.shadow.querySelector(".mm-input");
	input.value = "13";
	input.dispatch("input");
	page.shadow.querySelector(".mm-submit").click();
	// 同一页面再 apply 一次：只换掉 __ModuleLoader__，保留 window.__DSH_MINOR_MODE__
	window.__ModuleLoader__ = { load: (entry) => (captured = entry) };
	captured = null;
	new Function(bundle)();
	const mod = captured.factory(() => {
		throw new Error("不该 require 平台模块");
	});
	mod.apply({ effect: (factory) => factory() });
	const hosts = document.body.children.filter((c) => c.getAttribute("data-plugin") === "dsh-plugin-minor-mode");
	assert.equal(hosts.length, 1, "body 下应该只有一个宿主节点，实际 " + hosts.length);
	assert.equal(page.host.parentNode, null, "旧实例应该已经被卸掉");
	page.teardown();
});

Date.now = realNow;
console.log("\n全部通过：" + passed + " 项");
