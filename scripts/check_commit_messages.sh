#!/usr/bin/env bash
# Validate the commit messages in <base>..<head> against the repository convention.
# The rule itself lives in githooks/commit-msg so the local hook and CI share one
# implementation; CI 的 Policy job 直接用本脚本兜底。
#
# Usage:
#   scripts/check_commit_messages.sh <base> <head>
#
# Fallbacks:
#   - empty base, zero SHA (new branch), or unresolvable base (force push):
#     only the <head> tip commit is checked
#   - failed per-commit checks accumulate; exits 1 with a summary at the end
set -euo pipefail

base="${1:-}"
head="${2:-}"
if [ -z "$head" ]; then
  echo "usage: $0 <base> <head>" >&2
  exit 2
fi

hook="$(cd "$(dirname "$0")/.." && pwd)/githooks/commit-msg"

# --no-merges 是必须的：GitHub 为 pull_request 事件检出的 HEAD 是它自己合成的合并提交
# （"Merge <head> into <base>"），消息由平台生成、不受作者控制，必须排除在规范校验之外。
if [ -n "$base" ] &&
  [ "$base" != "0000000000000000000000000000000000000000" ] &&
  git cat-file -e "$base" 2>/dev/null; then
  shas="$(git rev-list --no-merges "$base..$head")"
else
  # new branch / unavailable base: check the tip commit only (unless it is a merge)
  shas="$(git rev-list --no-merges -n 1 "$head")"
fi

if [ -z "$shas" ]; then
  echo "✅ no commits to check"
  exit 0
fi

fail=0
total=0
for sha in $shas; do
  total=$((total + 1))
  tmp="$(mktemp)"
  git log -1 --format=%B "$sha" >"$tmp"
  if ! "$hook" "$tmp"; then
    echo "  ✗ $(git log -1 --format='%h %s' "$sha")" >&2
    fail=$((fail + 1))
  fi
  rm -f "$tmp"
done

if [ "$fail" -ne 0 ]; then
  echo "❌ $fail/$total commit message(s) violate the convention (see AGENTS.md「Commit Message」)" >&2
  exit 1
fi
echo "✅ commit message check passed ($total commit(s))"
