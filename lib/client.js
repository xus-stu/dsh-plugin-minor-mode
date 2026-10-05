window.__ModuleLoader__.load({
	id: "dsh-plugin-minor-mode",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		//#region 常量
		/** 必须与 package.json 的 name 一致：boot graph 以包名为模块 id。 */
		const PLUGIN_ID = "dsh-plugin-minor-mode";
		/** localStorage 键；带版本号，方便日后改结构时无痛丢弃旧状态。 */
		const STORAGE_KEY = "dsh-minor-mode:v1";
		/** 引信时长：1 分钟。 */
		const DEFAULT_FUSE_MS = 60 * 1000;
		/** 解锁口令（锁屏 / 蓝屏里要输入的东西）。 */
		const UNLOCK_PHRASE = "我是成年人";
		/** 也接受的口令写法。 */
		const UNLOCK_ALIASES = [
			"我是成年人",
			"我是成年人了",
			"成年人",
			"i am adult",
			"im adult",
			"adult"
		];
		/** 全局紧急解锁：Cmd/Ctrl + Shift + Alt + L。 */
		const EMERGENCY_KEY = "l";
		/** 输错几次之后直接把口令告诉你（安全阀，别真的把人锁死）。 */
		const REVEAL_AFTER_FAILURES = 3;
		/** 弹窗类型：auto 按平台自动选，可被面板里的"预览"按钮覆盖。 */
		const THEMES = { AUTO: "auto", BSOD: "bsod", LOCK: "lock" };
		//#endregion

		//#region 年龄段分级文案
		/**
		 * 把年龄映射到一条评语。这里是整个插件的灵魂，改文案只需要动这张表。
		 * @param {number} age - 已归一化的年龄。
		 * @returns {{key: string, title: string, taunt: string, minor: boolean}}
		 */
		function classifyAge(age) {
			/** 未成年人一律触发引信；这里先算出来，后面各档不再重复判断。 */
			const minor = age < 18;
			if (age <= 0) {
				return {
					key: "single-cell",
					title: "单细胞生物",
					taunt: "你咋不填单细胞生物呢",
					minor: true
				};
			}
			if (age < 1) {
				return {
					key: "infant",
					title: "不到一岁",
					taunt: "0 岁多一点，你是怎么把键盘敲响的？",
					minor: true
				};
			}
			if (age < 3) {
				return {
					key: "toddler",
					title: "学步期",
					taunt: "奶瓶还没放下就会写 prompt 了？",
					minor: true
				};
			}
			if (age < 6) {
				return {
					key: "kindergarten",
					title: "幼儿园",
					taunt: "先去把积木搭完，回来再谈 AI。",
					minor: true
				};
			}
			if (age < 12) {
				return {
					key: "primary",
					title: "小学生",
					taunt: "作业写完了吗？就来找 AI 代写。",
					minor: true
				};
			}
			if (age < 15) {
				return {
					key: "junior",
					title: "初中生",
					taunt: "中考还有几年，别急着让 AI 替你动脑子。",
					minor: true
				};
			}
			if (age < 18) {
				return {
					key: "senior",
					title: "高中生",
					taunt: "未成年。倒计时已上膛，1 分钟后见。",
					minor: true
				};
			}
			if (age < 26) {
				return {
					key: "young-adult",
					title: "刚成年",
					taunt: "18 岁了。法律上放你进来，心智上你自己看着办。",
					minor: false
				};
			}
			if (age < 41) {
				return {
					key: "worker",
					title: "社畜黄金期",
					taunt: "欢迎来到 AI 血汗工厂，工位在那边。",
					minor: false
				};
			}
			if (age < 60) {
				return {
					key: "middle",
					title: "中年",
					taunt: "颈椎还好吗？坐直了再聊。",
					minor: false
				};
			}
			if (age < 100) {
				return {
					key: "retired",
					title: "退休",
					taunt: "退休了还这么卷，佩服。",
					minor: false
				};
			}
			if (age < 200) {
				return {
					key: "qing",
					title: "疑似清朝人",
					taunt: "你确定你不是清朝人？",
					minor: false
				};
			}
			if (age < 1000) {
				return {
					key: "spirit",
					title: "成精了",
					taunt: "成精了。建议先申报一下物种。",
					minor: false
				};
			}
			return {
				key: "floor",
				title: "疑似楼层号",
				taunt: "你填的是年龄还是楼层号？",
				minor: false
			};
		}

		/**
		 * 归一化用户输入：容忍全角数字、空白、"岁"后缀。
		 * @param {string} raw - 输入框原文。
		 * @returns {{ok: true, age: number} | {ok: false, reason: string}}
		 */
		function normalizeAge(raw) {
			const text = String(raw === undefined || raw === null ? "" : raw).trim();
			if (text === "") return { ok: false, reason: "空着不填，是想让我猜吗？" };
			const halfWidth = text
				.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
				.replace(/[．。]/g, ".")
				.replace(/[－—–−]/g, "-")
				.replace(/[岁週周]/g, "")
				.replace(/\s+/g, "");
			if (!/^-?\d+(\.\d+)?$/.test(halfWidth)) {
				return { ok: false, reason: "这不是数字，这是行为艺术。请填阿拉伯数字。" };
			}
			const age = Number(halfWidth);
			if (!Number.isFinite(age)) return { ok: false, reason: "这个数字我算不出来。" };
			return { ok: true, age };
		}
		//#endregion

		//#region 状态持久化
		/**
		 * 读取已保存的状态；任何异常都当作"没启用过"。
		 * @returns {{enabled: boolean, age: number, enabledAt: number}}
		 */
		function readState() {
			const empty = { enabled: false, age: Number.NaN, enabledAt: 0 };
			try {
				const raw = window.localStorage.getItem(STORAGE_KEY);
				if (raw === null) return empty;
				const parsed = JSON.parse(raw);
				if (parsed === null || typeof parsed !== "object") return empty;
				return {
					enabled: parsed.enabled === true,
					age: typeof parsed.age === "number" ? parsed.age : Number.NaN,
					enabledAt: typeof parsed.enabledAt === "number" ? parsed.enabledAt : 0
				};
			} catch {
				return empty;
			}
		}

		/** 写回状态；隐私模式下 localStorage 可能直接抛异常，忽略即可。 */
		function writeState(state) {
			try {
				window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
			} catch {
				/* 存不下就算了，只影响刷新后的记忆。 */
			}
		}
		//#endregion

		//#region 小工具
		/** 从静态 HTML 片段造一个元素（片段内不允许出现用户输入）。 */
		function fromHTML(html) {
			const tpl = document.createElement("template");
			tpl.innerHTML = html.trim();
			return tpl.content.firstElementChild;
		}

		/** 把毫秒格式化成 mm:ss。 */
		function formatRemaining(ms) {
			const total = Math.max(0, Math.ceil(ms / 1000));
			const mm = String(Math.floor(total / 60)).padStart(2, "0");
			const ss = String(total % 60).padStart(2, "0");
			return mm + ":" + ss;
		}

		/** 当前是不是 macOS（决定默认上蓝屏还是上大锁）。 */
		function detectMac() {
			try {
				const uaData = navigator.userAgentData;
				if (uaData && typeof uaData.platform === "string" && uaData.platform !== "") {
					return /mac/i.test(uaData.platform);
				}
			} catch {
				/* 老浏览器没有 userAgentData，退回 UA 判断。 */
			}
			return /mac/i.test(String(navigator.platform || navigator.userAgent || ""));
		}

		/** 当前时刻的 HH:MM，用于锁屏假时钟。 */
		function clockText() {
			const now = new Date();
			return String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
		}

		/** 判定是否为解锁口令。 */
		function isUnlockPhrase(text) {
			const value = String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
			return UNLOCK_ALIASES.some((alias) => alias.toLowerCase() === value);
		}
		//#endregion

		//#region 样式（住在 Shadow DOM 里，和 DSH 自己的 CSS 互不污染）
		const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.mm-root, .mm-root *, .mm-toast {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* ---------- 右下角挂件 ---------- */
.mm-launcher {
  position: fixed; right: 18px; bottom: 18px; z-index: 2147483000;
  display: flex; align-items: center; gap: 8px;
  padding: 8px 14px; border-radius: 999px; cursor: pointer;
  border: 1px solid rgba(255,255,255,.14);
  background: rgba(26,26,30,.86); color: #f5f5f7;
  font-size: 13px; line-height: 18px; letter-spacing: .2px;
  box-shadow: 0 10px 28px rgba(0,0,0,.38);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  user-select: none; transition: transform .12s ease, background .2s ease;
}
.mm-launcher:hover { transform: translateY(-1px); }
.mm-launcher.mm-active { background: rgba(158,32,38,.92); border-color: rgba(255,255,255,.22); }
.mm-dot { width: 8px; height: 8px; border-radius: 50%; background: #3ddc84; }
.mm-launcher.mm-active .mm-dot { background: #ffd166; animation: mm-pulse 1s ease-in-out infinite; }
@keyframes mm-pulse { 0%,100% { opacity: 1; } 50% { opacity: .25; } }
.mm-launcher-count { font-variant-numeric: tabular-nums; opacity: .85; min-width: 42px; text-align: right; }

/* ---------- 设置面板 ---------- */
.mm-mask {
  position: fixed; inset: 0; z-index: 2147483100; display: flex;
  align-items: center; justify-content: center;
  background: rgba(0,0,0,.46); backdrop-filter: blur(6px);
}
.mm-panel {
  width: 460px; max-width: calc(100vw - 40px);
  border-radius: 16px; overflow: hidden;
  background: #1c1c1f; color: #f2f2f4;
  border: 1px solid rgba(255,255,255,.1);
  box-shadow: 0 28px 80px rgba(0,0,0,.6);
}
.mm-panel-head { padding: 18px 20px 6px; display: flex; align-items: center; gap: 10px; }
.mm-panel-title { font-size: 16px; font-weight: 600; }
.mm-panel-badge {
  margin-left: auto; font-size: 11px; padding: 3px 8px; border-radius: 999px;
  background: rgba(255,255,255,.1); color: #c9c9cf;
}
.mm-panel-body { padding: 8px 20px 4px; font-size: 13px; line-height: 20px; color: #b9b9c0; }
.mm-row { margin-top: 14px; }
.mm-label { font-size: 12px; color: #8f8f99; margin-bottom: 6px; }
.mm-input {
  width: 100%; height: 38px; padding: 0 12px; border-radius: 10px;
  background: #121214; border: 1px solid rgba(255,255,255,.14); color: #f5f5f7;
  font-size: 14px; outline: none;
}
.mm-input:focus { border-color: #4a8cff; }
.mm-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.mm-chip {
  padding: 4px 10px; border-radius: 999px; font-size: 12px; cursor: pointer;
  background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.1); color: #d6d6dc;
}
.mm-chip:hover { background: rgba(255,255,255,.14); }
.mm-verdict {
  margin-top: 14px; padding: 12px 14px; border-radius: 12px;
  background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08);
}
.mm-verdict-title { font-size: 12px; color: #8f8f99; margin-bottom: 4px; }
.mm-verdict-text { font-size: 14px; line-height: 22px; color: #fff; }
.mm-verdict.mm-minor { background: rgba(180,38,38,.16); border-color: rgba(255,120,120,.28); }
.mm-error { margin-top: 12px; font-size: 12px; color: #ff8a8a; min-height: 16px; }
.mm-countdown { margin-top: 14px; font-size: 13px; color: #ffd166; font-variant-numeric: tabular-nums; }
.mm-panel-foot {
  padding: 16px 20px; display: flex; align-items: center; gap: 10px;
  border-top: 1px solid rgba(255,255,255,.08); margin-top: 16px;
}
.mm-hint { font-size: 11px; color: #77777f; line-height: 16px; margin-right: auto; }
.mm-btn {
  height: 34px; padding: 0 14px; border-radius: 9px; cursor: pointer; font-size: 13px;
  border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.07); color: #f0f0f3;
}
.mm-btn:hover { background: rgba(255,255,255,.14); }
.mm-btn.mm-primary { background: #2f6df6; border-color: #2f6df6; color: #fff; }
.mm-btn.mm-primary:hover { background: #3f7bff; }
.mm-btn.mm-danger { background: rgba(200,50,50,.9); border-color: rgba(255,255,255,.16); color: #fff; }

/* ---------- 假蓝屏 ---------- */
.mm-bsod {
  position: fixed; inset: 0; z-index: 2147483647; background: #0078d7; color: #fff;
  padding: 9vh 9vw; display: flex; flex-direction: column; gap: 22px;
  font-size: 15px; line-height: 1.7; cursor: default;
}
.mm-bsod-face { font-size: 84px; line-height: 1; font-weight: 200; }
.mm-bsod-text { max-width: 680px; font-size: 17px; line-height: 1.65; }
.mm-bsod-progress { font-size: 15px; font-variant-numeric: tabular-nums; }
.mm-bsod-more { font-size: 13px; opacity: .92; max-width: 680px; }
.mm-bsod-input {
  margin-top: auto; width: min(460px, 80vw); height: 38px; padding: 0 12px;
  border-radius: 6px; border: 1px solid rgba(255,255,255,.5);
  background: rgba(255,255,255,.12); color: #fff; font-size: 14px; outline: none;
}
.mm-bsod-input::placeholder { color: rgba(255,255,255,.72); }
.mm-bsod-skip {
  margin-top: 12px; align-self: flex-start; height: 34px; padding: 0 14px;
  border-radius: 6px; cursor: pointer; font-size: 13px; color: #fff;
  border: 1px solid rgba(255,255,255,.55); background: rgba(255,255,255,.16);
}
.mm-bsod-skip:hover { background: rgba(255,255,255,.28); }
.mm-bsod-title { font-weight: 600; font-size: 15px; }

/* ---------- macOS 风格雷霆大锁 ---------- */
.mm-lock {
  position: fixed; inset: 0; z-index: 2147483647; overflow: hidden;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: radial-gradient(120% 120% at 20% 10%, #3b4a63 0%, #1b2333 42%, #0c0f16 100%);
  color: #fff;
}
.mm-lock::before {
  content: ""; position: absolute; inset: -12%;
  background:
    radial-gradient(40% 30% at 70% 25%, rgba(120,160,255,.28), transparent 70%),
    radial-gradient(35% 26% at 25% 75%, rgba(255,120,180,.22), transparent 70%);
  filter: blur(40px);
}
.mm-lock-card { position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; }
.mm-lock-avatar {
  width: 92px; height: 92px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: 42px; background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.24);
  box-shadow: 0 16px 40px rgba(0,0,0,.45); backdrop-filter: blur(6px);
}
.mm-lock-clock { margin-top: 18px; font-size: 46px; font-weight: 300; letter-spacing: 1px; font-variant-numeric: tabular-nums; }
.mm-lock-title { margin-top: 6px; font-size: 17px; font-weight: 600; }
.mm-lock-sub { margin-top: 6px; font-size: 13px; color: rgba(255,255,255,.72); }
.mm-lock-field { margin-top: 22px; display: flex; align-items: center; gap: 8px; }
.mm-lock-input {
  width: 260px; height: 36px; padding: 0 12px; border-radius: 999px; text-align: center;
  border: 1px solid rgba(255,255,255,.28); background: rgba(255,255,255,.12);
  color: #fff; font-size: 13px; outline: none; backdrop-filter: blur(8px);
}
.mm-lock-input::placeholder { color: rgba(255,255,255,.6); }
.mm-lock-go {
  height: 36px; padding: 0 14px; border-radius: 999px; cursor: pointer; font-size: 13px;
  border: 1px solid rgba(255,255,255,.28); background: rgba(255,255,255,.18); color: #fff;
}
.mm-lock-msg { margin-top: 14px; font-size: 12px; min-height: 18px; color: #ffd166; max-width: 460px; }
.mm-lock-giveup {
  margin-top: 16px; height: 34px; padding: 0 16px; border-radius: 999px; cursor: pointer;
  border: 1px solid rgba(255,255,255,.3); background: rgba(255,255,255,.16); color: #fff;
  font-size: 13px; backdrop-filter: blur(8px);
}
.mm-lock-giveup:hover { background: rgba(255,255,255,.26); }
.mm-lock-shake { animation: mm-shake .38s ease; }
@keyframes mm-shake {
  0%,100% { transform: translateX(0); }
  20% { transform: translateX(-9px); }
  40% { transform: translateX(8px); }
  60% { transform: translateX(-5px); }
  80% { transform: translateX(3px); }
}
.mm-lock-bar {
  position: absolute; bottom: 26px; display: flex; gap: 26px; font-size: 13px; color: rgba(255,255,255,.8);
}
.mm-lock-bar button {
  background: none; border: none; color: inherit; font: inherit; cursor: pointer; padding: 6px 8px; border-radius: 8px;
}
.mm-lock-bar button:hover { background: rgba(255,255,255,.12); }
.mm-lock-emergency { position: absolute; bottom: 6px; font-size: 11px; color: rgba(255,255,255,.45); }

/* ---------- 顶部吐司 ---------- */
.mm-toast {
  position: fixed; left: 50%; top: 22px; transform: translateX(-50%); pointer-events: none;
  z-index: 2147483600; max-width: 70vw;
  padding: 10px 16px; border-radius: 12px; font-size: 13px;
  background: rgba(20,20,24,.94); color: #f2f2f4; border: 1px solid rgba(255,255,255,.14);
  box-shadow: 0 14px 40px rgba(0,0,0,.5);
}
`;
		//#endregion

		//#region 客户端插件体
		/**
		 * 浏览器半插件体。
		 *
		 * 说明：这里刻意不 inject 任何服务、不 require 任何平台模块——纯 DOM +
		 * Shadow DOM，插件坏掉也只会多一个右下角小挂件，不会拖垮页面。
		 * @param {any} ctx - 页面根上下文。
		 */
		function apply(ctx) {
			if (typeof document === "undefined" || document.body === null) return;

			// 同一页面被重复挂载（例如 HMR 重载）时，先清掉上一个实例，避免叠挂件。
			const STALE = window.__DSH_MINOR_MODE__;
			if (STALE !== undefined && typeof STALE.dispose === "function") {
				try {
					STALE.dispose();
				} catch {
					/* 旧实例清理失败不该阻止新实例。 */
				}
			}

			/** 全部可变状态都关在闭包里，卸载即回收。 */
			const timers = { fuse: 0, tick: 0, bsod: 0, clock: 0 };
			let state = readState();
			let disposed = false;
			let overlay = null;
			let overlayCleanups = [];
			let wrongCount = 0;
			let konami = [];

			// ---------- DOM 骨架 ----------
			const host = document.createElement("div");
			// 内联样式压过 DSH 的全局 CSS：宿主自己 fixed + 零尺寸 + 拉满的 z-index。
			// fixed 零尺寸：不参与 body 的 flex/文档流，也不会挤出滚动条（那会让全页文字左右偏移）。
			// 注意：position:fixed 会让宿主自己变成一个层叠上下文，所以 z-index 必须写在宿主身上——
			// 只写在里面的 .mm-launcher 上，整个插件就会被压到 z-index:0 那层，被对话页的右侧栏盖掉。
			host.style.cssText =
				"position:fixed;top:0;left:0;width:0;height:0;margin:0;padding:0;border:0;overflow:visible;" +
				"z-index:2147483000;";
			host.dataset.plugin = PLUGIN_ID;
			host.setAttribute("data-dsh-minor-mode", "root");
			const shadow = host.attachShadow({ mode: "open" });
			const style = document.createElement("style");
			style.textContent = CSS;
			shadow.appendChild(style);

			const launcher = fromHTML(`
				<button class="mm-launcher mm-root" type="button" title="未成年模式">
					<span class="mm-dot"></span>
					<span class="mm-launcher-label">未成年模式</span>
					<span class="mm-launcher-count"></span>
				</button>
			`);
			const launcherLabel = launcher.querySelector(".mm-launcher-label");
			const launcherCount = launcher.querySelector(".mm-launcher-count");
			shadow.appendChild(launcher);

			const toast = fromHTML(`<div class="mm-toast" style="display:none"></div>`);
			shadow.appendChild(toast);

			/** 浮层容器（面板 / 蓝屏 / 大锁都塞这里）。 */
			const layer = document.createElement("div");
			shadow.appendChild(layer);

			document.body.appendChild(host);

			let toastTimer = 0;
			/** 顶部吐司：一次性提示。 */
			function showToast(text, ms) {
				toast.textContent = text;
				toast.style.display = "block";
				if (toastTimer !== 0) window.clearTimeout(toastTimer);
				toastTimer = window.setTimeout(() => {
					toast.style.display = "none";
					toastTimer = 0;
				}, ms === undefined ? 2600 : ms);
			}

			/** 现在该上哪种弹窗：auto 时 mac 上大锁，其它平台蓝屏。 */
			function resolveTheme() {
				return detectMac() ? THEMES.LOCK : THEMES.BSOD;
			}

			// ---------- 设置面板 ----------
			let countdownEl = null;
			let countdownText = null;

			/** 打开设置面板。 */
			function openPanel() {
				closeOverlay();
				const mask = fromHTML(`
					<div class="mm-root">
						<div class="mm-mask">
							<div class="mm-panel" role="dialog" aria-label="未成年模式">
								<div class="mm-panel-head">
									<span class="mm-panel-title">🔞 未成年模式</span>
									<span class="mm-panel-badge"></span>
								</div>
								<div class="mm-panel-body">
									<div class="mm-desc"></div>
									<div class="mm-row mm-age-row">
										<div class="mm-label">你的年龄（周岁）</div>
										<input class="mm-input" type="text" inputmode="numeric" placeholder="例如 13、-1、0" autocomplete="off" />
										<div class="mm-chips"></div>
									</div>
									<div class="mm-row">
										<div class="mm-verdict">
											<div class="mm-verdict-title">系统评价</div>
											<div class="mm-verdict-text">等待输入……</div>
										</div>
										<div class="mm-countdown" style="display:none"></div>
									</div>
									<div class="mm-error"></div>
								</div>
								<div class="mm-panel-foot">
									<div class="mm-hint">
										紧急解锁：⌘/Ctrl + Shift + Alt + L<br />
										或在弹窗里输入「${UNLOCK_PHRASE}」。
									</div>
									<button class="mm-btn mm-cancel" type="button">取消</button>
									<button class="mm-btn mm-danger mm-off" type="button" style="display:none">关闭未成年模式</button>
									<button class="mm-btn mm-secondary" type="button" style="display:none">立即触发（测试）</button>
									<button class="mm-btn mm-primary mm-submit" type="button">启用</button>
								</div>
							</div>
						</div>
					</div>
				`).firstElementChild;

				const input = mask.querySelector(".mm-input");
				const chips = mask.querySelector(".mm-chips");
				const verdictText = mask.querySelector(".mm-verdict-text");
				const verdictBox = mask.querySelector(".mm-verdict");
				const errorEl = mask.querySelector(".mm-error");
				const badge = mask.querySelector(".mm-panel-badge");
				const desc = mask.querySelector(".mm-desc");
				const submit = mask.querySelector(".mm-submit");
				const cancel = mask.querySelector(".mm-cancel");
				const testBtn = mask.querySelector(".mm-secondary");
				const offBtn = mask.querySelector(".mm-off");
				countdownEl = mask.querySelector(".mm-countdown");
				countdownText = countdownEl;

				/** 按当前输入刷新"系统评价"。 */
				function refreshVerdict() {
					const parsed = normalizeAge(input.value);
					if (!parsed.ok) {
						verdictBox.classList.remove("mm-minor");
						verdictText.textContent = "等待输入……";
						errorEl.textContent = input.value.trim() === "" ? "" : parsed.reason;
						return;
					}
					const tier = classifyAge(parsed.age);
					verdictText.textContent = tier.taunt;
					badge.textContent = tier.title;
					verdictBox.classList.toggle("mm-minor", tier.minor);
					errorEl.textContent = "";
				}

				// 快捷年龄芯片：方便你自己试各个档位。
				for (const value of ["-1", "0", "3", "10", "13", "17", "18", "30", "70", "150"]) {
					const chip = fromHTML(`<button class="mm-chip" type="button"></button>`);
					chip.textContent = value;
					chip.addEventListener("click", () => {
						input.value = value;
						refreshVerdict();
						input.focus();
					});
					chips.appendChild(chip);
				}

				if (state.enabled) {
					desc.textContent = "未成年模式已启用。想关掉它，或者想立刻看看弹窗长什么样，都行。";
					badge.textContent = classifyAge(state.age).title;
					submit.textContent = "重新启用";
					input.value = String(state.age);
					testBtn.style.display = "";
					offBtn.style.display = "";
					testBtn.addEventListener("click", () => {
						closeOverlay();
						fireOverlay();
					});
					offBtn.addEventListener("click", () => {
						disable("已关闭未成年模式。");
					});
					renderCountdown();
				} else {
					desc.textContent =
						"填上你的年龄，系统会当着你的面点评一句。未满 18 岁的话，5 分钟后会有一场雷霆大弹窗——" +
						"macOS 上是雷霆大锁，其它平台是假蓝屏。两种都只覆盖 DSH 界面，绝不动你的系统。";
					submit.textContent = "启用";
				}

				submit.addEventListener("click", () => {
					const parsed = normalizeAge(input.value);
					if (!parsed.ok) {
						errorEl.textContent = parsed.reason;
						input.focus();
						return;
					}
					const tier = classifyAge(parsed.age);
					enable(parsed.age, tier);
					closeOverlay();
					showToast("已启用未成年模式：" + tier.taunt, 4200);
				});
				cancel.addEventListener("click", closeOverlay);
				input.addEventListener("input", refreshVerdict);
				input.addEventListener("keydown", (event) => {
					if (event.key === "Enter") submit.click();
					if (event.key === "Escape") closeOverlay();
				});
				mask.addEventListener("mousedown", (event) => {
					if (event.target === mask.firstElementChild) closeOverlay();
				});

				layer.appendChild(mask);
				overlay = mask;
				refreshVerdict();
				input.focus();
			}

			/** 关闭当前面板/弹窗。 */
			function closeOverlay() {
				for (const off of overlayCleanups) {
					try {
						off();
					} catch {
						/* 清理失败忽略。 */
					}
				}
				overlayCleanups = [];
				if (timers.bsod !== 0) {
					window.clearInterval(timers.bsod);
					timers.bsod = 0;
				}
				if (timers.clock !== 0) {
					window.clearInterval(timers.clock);
					timers.clock = 0;
				}
				if (overlay !== null) {
					overlay.remove();
					overlay = null;
				}
				countdownEl = null;
				countdownText = null;
			}

			// ---------- 启用 / 关闭 / 引信 ----------
			/** 启用未成年模式并点燃引信。 */
			function enable(age, tier) {
				state = { enabled: true, age: age, enabledAt: Date.now() };
				writeState(state);
				// 只有真的要炸（未成年）才把挂件变红；成年人只是留个记录。
				launcher.classList.toggle("mm-active", tier.minor);
				scheduleFuse();
				renderCountdown();
				if (!tier.minor) {
					showToast("成年豁免，弹窗不来了。评价：" + tier.taunt, 4200);
				} else {
					showToast("倒计时 " + formatRemaining(DEFAULT_FUSE_MS) + " 开始，祝你好运。", 3200);
				}
			}

			/** 彻底关闭未成年模式（用户主动解锁/关闭时调用）。 */
			function disable(reason) {
				stopFuse();
				state = { enabled: false, age: state.age, enabledAt: 0 };
				writeState(state);
				launcher.classList.remove("mm-active");
				launcherLabel.textContent = "未成年模式";
				launcherCount.textContent = "";
				wrongCount = 0;
				closeOverlay();
				showToast(reason === undefined ? "已关闭未成年模式。" : reason, 3200);
			}

			/** 停止引信和倒计时刷新。 */
			function stopFuse() {
				if (timers.fuse !== 0) {
					window.clearTimeout(timers.fuse);
					timers.fuse = 0;
				}
				if (timers.tick !== 0) {
					window.clearInterval(timers.tick);
					timers.tick = 0;
				}
			}

			/** 剩余毫秒数（负数按 0 处理）。 */
			function remainingMs() {
				if (!state.enabled) return 0;
				return Math.max(0, state.enabledAt + DEFAULT_FUSE_MS - Date.now());
			}

			/** 布置引信：到期就炸，没到期就每秒刷新倒计时。 */
			function scheduleFuse() {
				stopFuse();
				if (!state.enabled) return;
				if (!classifyAge(state.age).minor) return;
				const left = remainingMs();
				if (left <= 0) {
					fireOverlay();
					return;
				}
				timers.fuse = window.setTimeout(() => {
					timers.fuse = 0;
					fireOverlay();
				}, left);
				timers.tick = window.setInterval(renderCountdown, 1000);
				renderCountdown();
			}

			/** 刷新挂件和面板上的倒计时显示。 */
			function renderCountdown() {
				const show = state.enabled && classifyAge(state.age).minor;
				const text = show ? formatRemaining(remainingMs()) : "";
				launcherCount.textContent = text;
				if (countdownEl !== null && countdownText !== null) {
					if (show) {
						countdownEl.style.display = "block";
						countdownText.textContent = "引信剩余：" + text + "（到时触发弹窗）";
					} else {
						countdownEl.style.display = "none";
					}
				}
			}

			// ---------- 雷霆大弹窗 ----------
			/** 引信到点：按平台开炸。 */
			function fireOverlay() {
				const theme = resolveTheme();
				if (theme === THEMES.LOCK) buildLock();
				else buildBsod();
			}

			/** 在弹窗里解锁：关掉模式并收工。 */
			function unlock(reason) {
				disable("已解除锁定：" + reason);
			}

			/** 输入错误时统一处理的反馈。 */
			function rejectUnlock(msgEl, container) {
				wrongCount += 1;
				container.classList.remove("mm-lock-shake");
				// 触发一次重排，让抖动动画可以重复播放。
				void container.offsetWidth;
				container.classList.add("mm-lock-shake");
				if (wrongCount >= REVEAL_AFTER_FAILURES) {
					msgEl.textContent = "算了，直接告诉你：口令就是「" + UNLOCK_PHRASE + "」。";
				} else if (wrongCount === 2) {
					msgEl.textContent = "又错了。你是不是忘了自己填的年龄？还剩 1 次提示。";
				} else {
					msgEl.textContent = "口令不对。提示：你填的年龄是 " + String(state.age) + " 岁。";
				}
			}

			/** 组装假蓝屏。 */
			function buildBsod() {
				closeOverlay();
				const screen = fromHTML(`
					<div class="mm-root">
						<div class="mm-bsod">
							<div class="mm-bsod-face">:(</div>
							<div class="mm-bsod-text">
								你的 DSH 遇到问题，需要重新启动。我们只收集某些错误信息，然后为你重新启动。
							</div>
							<div class="mm-bsod-progress"><span class="mm-pct">0%</span> 完成</div>
							<div class="mm-bsod-more">
								<div class="mm-bsod-title">如需了解更多信息，可稍后在网上搜索此错误：</div>
								<div>停止代码：MINOR_MODE_NOT_SUPPORTED</div>
								<div>失败的操作：growing_up.sys</div>
								<div class="mm-bsod-note" style="margin-top:14px;opacity:.85">
									本屏幕只覆盖 DSH 界面，不会影响你的系统。（它当然也不会真的重启。）
								</div>
								<div class="mm-bsod-help" style="margin-top:8px;opacity:.72;font-size:12px">
									紧急解锁：⌘/Ctrl + Shift + Alt + L　·　或在下方输入「${UNLOCK_PHRASE}」后回车
								</div>
							</div>
							<input class="mm-bsod-input" type="text" lang="zh-CN" autocomplete="off"
								placeholder="解锁口令：${UNLOCK_PHRASE}（输入后回车）" />
							<button class="mm-bsod-skip" type="button">我是成年人 · 直接解锁</button>
						</div>
					</div>
				`).firstElementChild;

				const pct = screen.querySelector(".mm-pct");
				const note = screen.querySelector(".mm-bsod-note");
				const input = screen.querySelector(".mm-bsod-input");

				timers.bsod = window.setInterval(() => {
					const current = Number(String(pct.textContent).replace("%", "")) || 0;
					const next = current >= 100 ? 0 : current + 1;
					pct.textContent = next + "%";
					if (next === 100) note.textContent = "……它不会真的重启的，别等了。";
				}, 90);

				input.addEventListener("keydown", (event) => {
					if (event.key !== "Enter") return;
					if (isUnlockPhrase(input.value)) unlock("蓝屏说服成功。");
					else {
						input.value = "";
						note.textContent = "口令不对。冷静点，它只是 DSH 的一个弹窗。";
						wrongCount += 1;
						if (wrongCount >= REVEAL_AFTER_FAILURES) {
							note.textContent = "算了，直接告诉你：口令是「" + UNLOCK_PHRASE + "」。";
						}
					}
				});

				screen.querySelector(".mm-bsod-skip").addEventListener("click", () => {
					unlock("一键放行。");
				});

				layer.appendChild(screen);
				overlay = screen;
				installEscapeHatch();
				input.focus();
			}

			/** 组装 macOS 风格雷霆大锁。 */
			function buildLock() {
				closeOverlay();
				const tier = classifyAge(state.age);
				const screen = fromHTML(`
					<div class="mm-root">
						<div class="mm-lock">
							<div class="mm-lock-card">
								<div class="mm-lock-avatar">🔒</div>
								<div class="mm-lock-clock"></div>
								<div class="mm-lock-title">未成年模式已锁定</div>
								<div class="mm-lock-sub"></div>
								<div class="mm-lock-field">
									<input class="mm-lock-input" type="text" lang="zh-CN" inputmode="text"
										autocomplete="off" spellcheck="false"
										placeholder="输入「${UNLOCK_PHRASE}」解锁（支持中文输入法）" />
									<button class="mm-lock-go" type="button">解锁</button>
								</div>
								<div class="mm-lock-msg"></div>
								<button class="mm-lock-giveup" type="button">我已经成年了，放我进去</button>
							</div>
							<div class="mm-lock-bar">
								<button type="button" data-mm-joke="关机">关机</button>
								<button type="button" data-mm-joke="重启">重启</button>
								<button type="button" data-mm-joke="睡眠">睡眠</button>
							</div>
							<div class="mm-lock-emergency">
								紧急解锁：⌘/Ctrl + Shift + Alt + L　·　本次由「dsh-plugin-minor-mode」友情出演
							</div>
						</div>
					</div>
				`).firstElementChild;

				const card = screen.querySelector(".mm-lock-card");
				const clock = screen.querySelector(".mm-lock-clock");
				const sub = screen.querySelector(".mm-lock-sub");
				const input = screen.querySelector(".mm-lock-input");
				const go = screen.querySelector(".mm-lock-go");
				const msg = screen.querySelector(".mm-lock-msg");

				clock.textContent = clockText();
				sub.textContent =
					"年龄：" + String(state.age) + " 岁（" + tier.title + "） · 已休息 " +
					Math.floor((DEFAULT_FUSE_MS - remainingMs()) / 1000) + " 秒";
				msg.textContent = "提示：这是一块只属于 DSH 的假锁屏，你的 Mac 好好的。";

				timers.clock = window.setInterval(() => {
					clock.textContent = clockText();
				}, 1000);

				function attempt() {
					if (isUnlockPhrase(input.value)) {
						unlock("大锁已放下。");
						return;
					}
					input.value = "";
					rejectUnlock(msg, card);
				}

				go.addEventListener("click", attempt);
				screen.querySelector(".mm-lock-giveup").addEventListener("click", () => {
					unlock("一键放行。");
				});
				input.addEventListener("keydown", (event) => {
					if (event.key === "Enter") attempt();
				});
				for (const btn of screen.querySelectorAll("[data-mm-joke]")) {
					btn.addEventListener("click", () => {
						msg.textContent = "想得美。" + btn.dataset.mmJoke + "？这可是只属于 DSH 的假锁屏。";
					});
				}

				layer.appendChild(screen);
				overlay = screen;
				installEscapeHatch();
				input.focus();
			}

			/** 给锁屏/蓝屏装上键盘逃生通道：紧急组合键 + 科乐美秘技。 */
			function installEscapeHatch() {
				const KONAMI = [
					"ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
					"ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"
				];
				konami = [];
				const onKey = (event) => {
					if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.altKey &&
						String(event.key).toLowerCase() === EMERGENCY_KEY) {
						event.preventDefault();
						unlock("紧急组合键生效。");
						return;
					}
					konami.push(event.key.length === 1 ? event.key.toLowerCase() : event.key);
					if (konami.length > KONAMI.length) konami.shift();
					if (konami.length === KONAMI.length && KONAMI.every((k, i) => k === konami[i])) {
						unlock("科乐美秘技，经典永不过时。");
					}
				};
				document.addEventListener("keydown", onKey, true);
				overlayCleanups.push(() => document.removeEventListener("keydown", onKey, true));
			}

			// ---------- 挂载与清理 ----------
			launcher.addEventListener("click", openPanel);

			if (state.enabled) {
				launcher.classList.toggle("mm-active", classifyAge(state.age).minor);
				// 刷新恢复：引信已经烧完就直接炸，否则接着倒计时。
				scheduleFuse();
			}

			/** 卸载：还页面一个干净的世界。 */
			function dispose() {
				if (disposed) return;
				disposed = true;
				stopFuse();
				if (toastTimer !== 0) window.clearTimeout(toastTimer);
				closeOverlay();
				host.remove();
				if (window.__DSH_MINOR_MODE__ === api) delete window.__DSH_MINOR_MODE__;
			}

			const api = { dispose: dispose, fire: fireOverlay, state: () => Object.assign({}, state) };
			window.__DSH_MINOR_MODE__ = api;

			if (typeof ctx.effect === "function") {
				ctx.effect(() => dispose, "minor-mode: ui");
			}
		}
		//#endregion

		exports.apply = apply;
		exports.inject = [];
		/**
		 * 纯函数测试缝：给 `test/logic.test.mjs` 用，Loader 会忽略这些多余导出。
		 * 浏览器运行时对外只有 `apply` / `inject` 有意义。
		 */
		exports.__internals = {
			classifyAge: classifyAge,
			normalizeAge: normalizeAge,
			formatRemaining: formatRemaining,
			isUnlockPhrase: isUnlockPhrase,
			UNLOCK_PHRASE: UNLOCK_PHRASE,
			DEFAULT_FUSE_MS: DEFAULT_FUSE_MS
		};
		return module.exports;
	}
});
