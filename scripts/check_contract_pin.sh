#!/usr/bin/env bash
# 契约 lockfile 校验：证明 contracts/jimu.swagger.yaml 确实来自
# contracts/jimu.lock.json 记录的提交，并且内容摘要一致。
#
# 属性：只读、零凭据、fail-closed。两个仓都是公开仓库，因此 git fetch 不需要任何 token；
# pin 一个未推送的提交会直接 fetch 失败 ⇒ 变红。这正是「契约只能来自已推送提交」的强制手段。
#
# 用法：
#   scripts/check_contract_pin.sh              # 校验 lockfile 记录的 commit
#   scripts/check_contract_pin.sh <commit>     # 校验指定 commit（本地观察失败用，跳过 lock 哈希）
set -euo pipefail

# 公开仓 fetch 不需要凭据；显式关掉 git 的交互式提问，凭据缺失时直接失败而不是挂住 CI。
export GIT_TERMINAL_PROMPT=0

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
swagger_path="docs/openapi/swagger.yaml"
lock_file="$repo_root/contracts/jimu.lock.json"
swagger_file="$repo_root/contracts/jimu.swagger.yaml"

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

get_field() {
  sed -n "s/^[[:space:]]*\"$1\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\"[,]*[[:space:]]*$/\\1/p" "$lock_file" | head -n1
}

[ -s "$lock_file" ] || {
  echo "::error::缺少契约 lockfile：$lock_file"
  exit 1
}

lock_repo=$(get_field repo)
lock_ref=$(get_field ref)
lock_commit=$(get_field commit)
lock_contract=$(get_field contract_version)
lock_swagger_sha=$(get_field swagger_sha256)

for field in "repo:$lock_repo" "ref:$lock_ref" "commit:$lock_commit" \
  "contract_version:$lock_contract" "swagger_sha256:$lock_swagger_sha"; do
  [ -n "${field#*:}" ] || {
    echo "::error::lockfile 缺少字段 ${field%%:*}"
    exit 1
  }
done

if [[ ! "$lock_commit" =~ ^[0-9a-f]{40}$ ]]; then
  echo "::error::lockfile commit 必须是 40 位小写 hex SHA，实际是：$lock_commit"
  exit 1
fi
if [[ ! "$lock_swagger_sha" =~ ^[0-9a-f]{64}$ ]]; then
  echo "::error::lockfile swagger_sha256 必须是 64 位小写 hex，实际是：$lock_swagger_sha"
  exit 1
fi
[ -s "$swagger_file" ] || {
  echo "::error::缺少契约副本：$swagger_file"
  exit 1
}

override="${1:-}"
if [ -n "$override" ]; then
  sha="$override"
  verify_lock_sha=false
else
  sha="$lock_commit"
  verify_lock_sha=true
fi
if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "::error::commit 必须是 40 位小写 hex SHA，实际是：$sha"
  exit 1
fi

remote="${JIMU_REMOTE:-$lock_repo}"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp" 2>/dev/null || true' EXIT
git -C "$tmp" init -q

# ref 是发布 tag 时，额外证明 tag 仍指向 lockfile 记录的 commit。
if [ -z "$override" ] && [[ "$lock_ref" == v* ]]; then
  if ! git -C "$tmp" fetch --depth=1 "$remote" "refs/tags/$lock_ref"; then
    echo "::error::无法从 $remote 取到 tag ${lock_ref}——lockfile 的 ref 必须可获取"
    exit 1
  fi
  tag_commit=$(git -C "$tmp" rev-parse 'FETCH_HEAD^{commit}')
  if [ "$tag_commit" != "$sha" ]; then
    echo "::error::tag ${lock_ref} 指向 ${tag_commit}，但 lockfile commit 是 ${sha}"
    exit 1
  fi
fi

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

if [ "$verify_lock_sha" = true ]; then
  actual_sha=$(sha256_file "$swagger_file")
  if [ "$actual_sha" != "$lock_swagger_sha" ]; then
    echo "::error::contracts/jimu.swagger.yaml 的 sha256 与 lockfile 不一致（lock=${lock_swagger_sha}, actual=${actual_sha}）"
    exit 1
  fi
fi

echo "✅ 契约副本与 lockfile 提交 ${sha} 的 ${swagger_path} 一致（ref ${lock_ref}, contract ${lock_contract}）"
