#!/usr/bin/env bash
#
# 把「未成年模式」装进 DSH 的 profile。
#
#   ./scripts/install.sh            # 装进 $DSH_PROFILE_DIR 或 ~/.dsh/profiles/desktop
#   DSH_PROFILE_DIR=/path/to/profile ./scripts/install.sh
#
# 做两件事：把本目录作为 file: 依赖加进 profile，然后在 profile 的
# cordis.patch.yml 末尾追加一条 Loader 插入条目。可重复执行。
#
# 注意：所有变量引用都写成 ${VAR}。macOS 的 bash 在 C.UTF-8 下会把紧跟变量名的
# 全角标点吞进变量名里，`"$X）"` 会被解析成变量 `X）`，于是 set -u 直接报错。
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE_DIR="${DSH_PROFILE_DIR:-${HOME}/.dsh/profiles/desktop}"
PATCH="${PROFILE_DIR}/cordis.patch.yml"
PKG_NAME="dsh-plugin-minor-mode"
RUNTIME="${HOME}/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies"
NODE_BIN="${DSH_NODE:-${RUNTIME}/node/bin/node}"
PNPM_MJS="${RUNTIME}/pnpm/bin/pnpm.mjs"

if [ ! -d "${PROFILE_DIR}" ]; then
	echo "x 找不到 profile 目录: ${PROFILE_DIR}" >&2
	echo "  用 DSH_PROFILE_DIR=/你的/profile 路径 再试一次。" >&2
	exit 1
fi
if [ ! -f "${PATCH}" ]; then
	echo "x 找不到 patch 文件: ${PATCH}" >&2
	exit 1
fi

run_pnpm() {
	if [ -x "${NODE_BIN}" ] && [ -f "${PNPM_MJS}" ]; then
		"${NODE_BIN}" "${PNPM_MJS}" "$@"
	elif command -v pnpm >/dev/null 2>&1; then
		pnpm "$@"
	else
		echo "x 找不到 pnpm（也不在 ${RUNTIME}）。" >&2
		return 127
	fi
}

echo "-> 插件目录: ${PLUGIN_DIR}"
echo "-> 目标 profile: ${PROFILE_DIR}"

echo "-> 写入依赖 (file:${PLUGIN_DIR})"
(cd "${PROFILE_DIR}" && run_pnpm add "file:${PLUGIN_DIR}")

if grep -q "${PKG_NAME}" "${PATCH}"; then
	echo "-> cordis.patch.yml 里已经有 ${PKG_NAME} 条目，跳过。"
else
	echo "-> 追加 Loader 插入条目"
	cat >>"${PATCH}" <<YAML

# 未成年模式（猎奇插件）：右下角会出现一个「未成年模式」挂件。
# 不想要了就删掉下面这三行，并执行 pnpm remove ${PKG_NAME}。
- insert:
    - id: minor-mode
      name: '${PKG_NAME}'
YAML
fi

echo
echo "完成。"
echo "  . 通常几秒内 HMR 就会生效；看不到右下角的挂件就刷新页面，或重启 DSH。"
echo "  . 紧急解锁: Cmd/Ctrl + Shift + Alt + L"
echo "  . 卸载: pnpm remove ${PKG_NAME}，并删掉 ${PATCH} 末尾的 minor-mode 条目。"
