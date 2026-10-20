#!/usr/bin/env bash
# 契约 pin 校验：证明 contracts/jimu.swagger.yaml 确实来自 backend-commit.txt 记录的提交。
#
# 属性：只读、零凭据、fail-closed。两个仓都是公开仓库，因此 git fetch 不需要任何 token；
# pin 一个未推送的提交会直接 fetch 失败 ⇒ 变红。这正是「契约只能来自已推送提交」的强制手段。
#
# 用法：
#   scripts/check_contract_pin.sh              # 校验 backend-commit.txt 记录的 SHA
#   scripts/check_contract_pin.sh <sha>        # 校验指定 SHA（本地观察失败用）
set -euo pipefail

# 公开仓 fetch 不需要凭据；显式关掉 git 的交互式提问，凭据缺失时直接失败而不是挂住 CI。
export GIT_TERMINAL_PROMPT=0

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
remote="${JIMU_REMOTE:-https://github.com/wangkuntian/jimu.git}"
swagger_path="docs/openapi/swagger.yaml"
pin_file="$repo_root/contracts/backend-commit.txt"
swagger_file="$repo_root/contracts/jimu.swagger.yaml"

sha="${1:-$(tr -d '[:space:]' < "$pin_file")}"
if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "::error::pin 必须是 40 位小写 hex SHA，实际是：$sha"
  exit 1
fi
[ -s "$swagger_file" ] || {
  echo "::error::缺少契约副本：$swagger_file"
  exit 1
}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
git -C "$tmp" init -q
if ! git -C "$tmp" fetch --depth=1 "$remote" "$sha"; then
  # ${sha} 必须带花括号：macOS bash 3.2 会把紧跟变量的多字节字符（——）并进变量名，
  # 触发 set -u 报「unbound variable」；随后 EXIT trap 里成功的 rm -rf 又把异常退出码覆盖成 0，
  # 使 fetch 失败变成 fail-open。
  echo "::error::无法从 $remote 取到 ${sha}——pin 必须是已推送的提交"
  exit 1
fi
git -C "$tmp" show "FETCH_HEAD:$swagger_path" > "$tmp/pinned.yaml"

if ! diff -u "$tmp/pinned.yaml" "$swagger_file"; then
  echo "::error::contracts/jimu.swagger.yaml 与 ${sha} 的 $swagger_path 不一致，请运行 scripts/sync-contract.sh <ref> 后重新生成类型"
  exit 1
fi
echo "✅ 契约副本与后端提交 $sha 的 $swagger_path 逐字节一致"
