#!/usr/bin/env bash
# 契约同步：把 jimu 某个提交的 docs/openapi/swagger.yaml 固定到本仓，再重新生成类型。
#
# 用法：
#   scripts/sync-contract.sh                  # 默认取本地 ../jimu 的 HEAD（提交态，不是工作区）
#   scripts/sync-contract.sh <sha|tag|branch> # 从公开远端 fetch --depth=1 后取该提交
#
# 取「提交态」而不是工作区文件：后端仓库里未提交的本地改动不应该悄悄进契约副本。
# CI 会用同一个 SHA 去公开仓取证并逐字节比对，所以 pin 必须是**已推送**的提交。
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
backend_dir="${JIMU_BACKEND_DIR:-$repo_root/../jimu}"
remote="${JIMU_REMOTE:-https://github.com/wangkuntian/jimu.git}"
swagger_path="docs/openapi/swagger.yaml"

if [ "$#" -gt 1 ]; then
  echo "用法: scripts/sync-contract.sh [<sha|tag|branch>]" >&2
  exit 2
fi

tmp=""
staged_swagger=""
cleanup() {
  if [ -n "$tmp" ]; then rm -rf "$tmp"; fi
  if [ -n "$staged_swagger" ]; then rm -f "$staged_swagger"; fi
}
trap cleanup EXIT

if [ "$#" -eq 0 ]; then
  [ -d "$backend_dir/.git" ] || {
    # ${backend_dir} 带花括号的理由同 check_contract_pin.sh：紧跟的多字节字符会被并进变量名。
    echo "❌ 找不到本地后端仓库：${backend_dir}（可用 JIMU_BACKEND_DIR 覆盖，或传入 <sha|tag> 走远端）" >&2
    exit 1
  }
  sha=$(git -C "$backend_dir" rev-parse HEAD)
  source_repo="$backend_dir"
  if ! diff -q <(git -C "$backend_dir" show "$sha:$swagger_path") "$backend_dir/$swagger_path" > /dev/null; then
    echo "❌ $backend_dir 的 $swagger_path 有未提交改动，拒绝把工作区内容写进契约副本" >&2
    exit 1
  fi
else
  tmp=$(mktemp -d)
  git -C "$tmp" init -q
  git -C "$tmp" fetch --depth=1 "$remote" "$1"
  sha=$(git -C "$tmp" rev-parse FETCH_HEAD)
  source_repo="$tmp"
fi

# 先写同目录之外的临时文件、校验通过后再原子替换：失败时已跟踪的契约不能被截断或写坏。
staged_swagger=$(mktemp "${TMPDIR:-/tmp}/jimu-swagger.XXXXXX")
git -C "$source_repo" show "$sha:$swagger_path" > "$staged_swagger"
grep -q '^swagger:' "$staged_swagger" || {
  echo "❌ $sha 的 $swagger_path 不是 Swagger 文档，拒绝写入" >&2
  exit 1
}
mv "$staged_swagger" "$repo_root/contracts/jimu.swagger.yaml"
staged_swagger=""
printf '%s\n' "$sha" > "$repo_root/contracts/backend-commit.txt"

echo "✅ 已固定 jimu@$sha"
( cd "$repo_root" && pnpm run api:types )
