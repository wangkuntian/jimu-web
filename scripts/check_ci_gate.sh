#!/usr/bin/env bash
# 聚合门禁的 fail-closed 判定（ci.yml 的 CI Gate 使用）。
#
# 为什么抽成脚本：判定表本身就是规格，写在 YAML 里无法单独跑；抽出来后只依赖传入的结论字符串，
# 可以在本地用模拟值把整张表跑一遍（见 docs/CONTRIBUTING.md「验证」）。
#
# 判定表（双向 fail-closed）：
#   router 非 success                      → fail（状态未知，不放过）
#   该域适用(true) 且 job 非 success        → fail
#   该域适用(true) 但 job 是 skipped        → fail（门禁悄悄消失必须报错）
#   该域不适用(false) 且 job 是 skipped     → 通过
#   该域不适用(false) 但 job 是 success     → fail（不该跑却跑了，触发口径漂移；比宽松解释更严格是有意为之）
#   该域不适用(false) 但 job 既非 skipped 又非 success（如 failure）→ fail（触发口径漂移必须暴露）
#
# 用法：
#   check_ci_gate.sh <门禁名> <router 结论> <job名>=<结论>=<该域是否适用> ...
# 例：
#   check_ci_gate.sh "CI Gate" success "Policy=success=true" "Build=skipped=false"
set -euo pipefail

[ "$#" -ge 2 ] || {
  echo "用法: check_ci_gate.sh <门禁名> <router 结论> <job名>=<结论>=<适用 true|false> ..." >&2
  exit 2
}

label="$1"
router="$2"
shift 2

fail=0
[ "$router" = "success" ] || {
  echo "::error::${label}: 路由 job 未成功（${router}），判定不可信"
  fail=1
}

for spec in "$@"; do
  name="${spec%%=*}"
  rest="${spec#*=}"
  result="${rest%%=*}"
  applies="${rest#*=}"
  case "$applies" in
  true)
    [ "$result" = "success" ] || {
      echo "::error::${label}: ${name} 应成功，实际是 ${result}"
      fail=1
    }
    ;;
  false)
    [ "$result" = "skipped" ] || {
      echo "::error::${label}: ${name} 本应跳过，实际是 ${result}"
      fail=1
    }
    ;;
  *)
    echo "::error::${label}: ${name} 的适用标记非法（${applies}，应为 true|false）"
    fail=1
    ;;
  esac
done

[ "$fail" -eq 0 ] || exit 1
echo "✅ ${label} 通过（router=${router}，共 $# 个 job）"
