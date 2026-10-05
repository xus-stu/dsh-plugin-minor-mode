// 未成年模式 · 纯逻辑单测
//
// 直接吃 lib/client.js：用一个假的 __ModuleLoader__ 把 factory 截下来，
// 再喂一个假的 require 把模块导出取出来。这样测的就是浏览器里跑的同一份代码。
//
//   node test/logic.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const bundle = readFileSync(join(here, "..", "lib", "client.js"), "utf8");

let captured = null;
globalThis.window = {
	__ModuleLoader__: {
		load(entry) {
			captured = entry;
		}
	}
};

// 客户端 bundle 是"注册工厂"形状的脚本，不是 ESM；用函数构造器求值即可。
new Function(bundle)();

assert.ok(captured, "client.js 应该调用 window.__ModuleLoader__.load");
assert.equal(captured.id, "dsh-plugin-minor-mode", "模块 id 必须等于包名");

const mod = captured.factory(() => {
	throw new Error("本测试不应 require 任何平台模块");
});
const { classifyAge, normalizeAge, formatRemaining, isUnlockPhrase, UNLOCK_PHRASE, DEFAULT_FUSE_MS } = mod.__internals;

assert.equal(typeof mod.apply, "function", "必须导出 apply");
assert.deepEqual(mod.inject, [], "不依赖任何客户端服务");

let passed = 0;
function check(name, fn) {
	fn();
	passed += 1;
	console.log("  ✓ " + name);
}

console.log("normalizeAge");
check("空输入被拒绝", () => {
	assert.equal(normalizeAge("").ok, false);
	assert.equal(normalizeAge("   ").ok, false);
});
check("非数字被拒绝", () => {
	assert.equal(normalizeAge("abc").ok, false);
	assert.equal(normalizeAge("十岁").ok, false);
});
check("普通数字", () => {
	assert.deepEqual(normalizeAge("13"), { ok: true, age: 13 });
	assert.deepEqual(normalizeAge(" -1 "), { ok: true, age: -1 });
	assert.deepEqual(normalizeAge("0"), { ok: true, age: 0 });
});
check("容忍全角数字与「岁」后缀", () => {
	assert.deepEqual(normalizeAge("１３岁"), { ok: true, age: 13 });
	assert.deepEqual(normalizeAge("－２"), { ok: true, age: -2 });
});

console.log("classifyAge");
check("<=0 就是那句灵魂拷问", () => {
	assert.equal(classifyAge(0).taunt, "你咋不填单细胞生物呢");
	assert.equal(classifyAge(-1).taunt, "你咋不填单细胞生物呢");
	assert.equal(classifyAge(-999).minor, true);
});
check("18 岁以下全部算未成年", () => {
	for (const age of [0.5, 1, 2, 5, 11, 14, 17, 17.9]) {
		assert.equal(classifyAge(age).minor, true, age + " 应该是未成年");
	}
});
check("18 岁起成年豁免", () => {
	for (const age of [18, 25, 40, 59, 99, 150, 5000]) {
		assert.equal(classifyAge(age).minor, false, age + " 应该是成年");
	}
});
check("每一档都有非空评语且互不相同", () => {
	const samples = [-1, 0.5, 2, 5, 10, 13, 17, 20, 35, 50, 80, 150, 500, 5000];
	const taunts = samples.map((age) => {
		const tier = classifyAge(age);
		assert.equal(typeof tier.taunt, "string");
		assert.ok(tier.taunt.length > 0);
		assert.ok(tier.title.length > 0);
		return tier.taunt;
	});
	assert.equal(new Set(taunts).size, taunts.length, "档位评语不应重复");
});
check("境界线上不出偏差", () => {
	assert.equal(classifyAge(17.99).minor, true);
	assert.equal(classifyAge(18).minor, false);
	assert.equal(classifyAge(17).key, "senior");
	assert.equal(classifyAge(18).key, "young-adult");
});

console.log("formatRemaining");
check("格式化 mm:ss", () => {
	assert.equal(formatRemaining(5 * 60 * 1000), "05:00");
	assert.equal(formatRemaining(61_000), "01:01");
	assert.equal(formatRemaining(0), "00:00");
	assert.equal(formatRemaining(-5), "00:00");
});

console.log("isUnlockPhrase");
check("接受正式口令与常见别名", () => {
	assert.equal(isUnlockPhrase(UNLOCK_PHRASE), true);
	assert.equal(isUnlockPhrase("  我是成年人 "), true);
	assert.equal(isUnlockPhrase("I Am Adult"), true);
});
check("拒绝错误口令", () => {
	assert.equal(isUnlockPhrase(""), false);
	assert.equal(isUnlockPhrase("我是未成年人"), false);
	assert.equal(isUnlockPhrase("password"), false);
});

check("引信就是 1 分钟", () => {
	assert.equal(DEFAULT_FUSE_MS, 60000);
});

console.log("\n全部通过：" + passed + " 项");
