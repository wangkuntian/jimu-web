# Jimu Portal 设计系统来源与 UI 规范

## 状态

已确认（2026-10-10）。本文承接 [Jimu Portal 前端设计](./2026-09-20-jimu-portal-design.md)，只决定「视觉 token 从哪来」和「UI 质量规则如何引入」，不改变既有的路由、权限、会话和契约结论。

视觉取值的规范本体是 [`DESIGN.md`](../../DESIGN.md)；本文记录选型理由、被否决的候选、映射依据与落地状态。

## 决策一：视觉规范采用 IBM Carbon

在 `VoltAgent/awesome-design-md` 的 74 份 `DESIGN.md` 中选定 **IBM**（其营销视觉即 Carbon Design System 的直接应用）作为本项目的视觉事实来源。

理由：

- **它是候选范围内唯一锚定「产品级」设计系统的文件**，而不是营销官网提取物。Carbon 是开源的企业级设计系统，具备本项目大量需要的数据表格、面包屑、右键菜单等规范；多数候选文件连 hover 态都不定义。
- **迁移到 Element Plus 的代价最小**。主色同属蓝色系，中性色几乎重合（见下方映射表），不需要推翻组件库视觉。
- **「无阴影 + 1px hairline」的层级模型与 Element Plus 的边框式表格/卡片天然一致**，不会出现「规范要求无阴影、组件库自带投影」的长期对抗。
- **语义色是 Carbon 官方色阶**，可一对一映射到 Element Plus 语义变量，审计日志、配额超限、权限拒绝等状态都有确定取值。
- **字体可商用且有中文版本**。IBM Plex Sans 为 SIL OFL 授权，IBM 另发布简体中文的 IBM Plex Sans SC。

被否决的主要候选：HashiCorp（近乎纯黑白，缺少一个可承载主操作的主色）、Linear（暗色优先 + 紫色强调，与现有光模式冲突）、Cal.com / Airtable / Notion（营销页提取、留白偏大、无 hover 态定义，或彩色体系会让权限矩阵失控）。

## 决策二：圆角取 2–4px

Carbon 原文要求 0px 直角，与 Element Plus 默认 4px 冲突。本项目取 **2–4px**。

- Element Plus 默认 `--el-border-radius-base: 4px`、`--el-border-radius-small: 2px` 已落在该区间，因此**不覆盖圆角变量**。
- 该取值在 IBM 文件内部同样有依据：其 `rounded.sm` 即 4px。
- 代价：放弃 Carbon 最具辨识度的直角质感，换取与组件库默认观感一致、无全局覆盖。

## Token 映射

| 用途          | Carbon token              | 值      | Element Plus 变量           | Element Plus 默认 |
| ------------- | ------------------------- | ------- | --------------------------- | ----------------- |
| 主色          | `colors.primary`          | #0f62fe | `--el-color-primary`        | #409eff           |
| 页面底色      | `colors.canvas`           | #ffffff | `--el-bg-color`             | #fff              |
| 分层 / 斑马纹 | `colors.surface-1`        | #f4f4f4 | `--el-fill-color-light`     | #f5f7fa           |
| 1px 分隔线    | `colors.hairline`         | #e0e0e0 | `--el-border-color-light`   | #e4e7ed           |
| 主文本        | `colors.ink`              | #161616 | `--el-text-color-primary`   | #303133           |
| 次文本        | `colors.ink-muted`        | #525252 | `--el-text-color-regular`   | #606266           |
| 辅助 / 禁用   | `colors.ink-subtle`       | #8c8c8c | `--el-text-color-secondary` | #909399           |
| 成功          | `colors.semantic-success` | #24a148 | `--el-color-success`        | #67c23a           |
| 警告          | `colors.semantic-warning` | #f1c21b | `--el-color-warning`        | #e6a23c           |
| 危险          | `colors.semantic-error`   | #da1e28 | `--el-color-danger`         | #f56c6c           |
| 信息          | `colors.semantic-info`    | #0f62fe | `--el-color-info`           | #909399（不覆盖） |
| 圆角          | `rounded.sm`              | 4px     | `--el-border-radius-base`   | 4px（一致）       |
| 正文字号      | `typography.body-sm`      | 14px    | `--el-font-size-base`       | 14px（一致）      |
| 间距基准      | Carbon 4px 网格           | 4px     | —                           | 4 / 8px（一致）   |
| 字体          | IBM Plex Sans             | OFL     | `--el-font-family`          | 需补中文回落      |

注意三点：

- 改 `--el-color-primary` 时，Element Plus 由主色派生的 light-3 / 5 / 7 / 8 / 9 阶需要一并重算，否则 hover、disabled、浅底状态仍停留在默认蓝。
- 字体栈需保留中文回落，例如 `IBM Plex Sans, IBM Plex Sans SC, PingFang SC, Microsoft YaHei`，不直接用 IBM 文件里的 `Helvetica Neue, Arial`。
- **`--el-color-info` 刻意不覆盖。** Carbon 的 `semantic-info` 与主色同值，但 Element Plus 的 `info` 承担的是中性/次要角色（`type="info"` 的按钮、标签、提示）。若映射成主色蓝，`info` 与 `primary` 将无法区分，同时丢失中性语义，因此保留 Element Plus 默认的 #909399。

## 需从 Carbon 官方补齐的缺口

IBM 的 `DESIGN.md` 由营销页提取，其 `Known Gaps` 自述缺少 Carbon 在**产品界面**中的组件，以及表单错误态和暗色主题。这三类不自行发明，一律取 Carbon 官方规范：

| 缺口         | 本项目对应界面                     |
| ------------ | ---------------------------------- |
| 数据表格规格 | 租户、用户、审计日志等全部列表页   |
| 表单错误态   | 登录、角色权限、租户配置等表单     |
| 暗色主题     | 暂不实现，需要时取 Carbon Gray-100 |

## 决策三：`ui-ux-pro-max` 的用法边界

引入 `nextlevelbuilder/ui-ux-pro-max-skill` 作为 **UI/UX 质量规则的检索来源**，它不参与视觉 token 决策。

分层原则：

```text
Carbon（本文档）        →  视觉事实来源：颜色、字号、间距、圆角，唯一权威
ui-ux-pro-max           →  咨询性规则：无障碍、交互反馈、Vue 实现质量
```

**禁止使用 `--design-system`。** 实测其对本项目的输出与 Carbon 正面冲突：模式给出的是营销首页结构（Hero / 客户 Logo / Contact Sales），配色给出橙色 CTA 与深蓝正文前景，字体给出 Fira Code / Fira Sans。它会覆盖本文档的 token 结论。

允许的用法是定向检索：`--domain ux`（无障碍与交互）、`--stack vue`（实现质量）、`--domain chart` 等。本项目的界面需求已能在其规则库中命中对应条目：

| 本项目要求         | 命中规则                                        |
| ------------------ | ----------------------------------------------- |
| 破坏性操作确认流程 | Confirmation Dialogs（High）                    |
| 列表空状态         | Empty States（Medium）                          |
| 表单字段级校验错误 | Focusable Error Summary、Error Messages（High） |
| 权限树键盘可达     | Keyboard Navigation（High）                     |
| 列表多选与批量操作 | Bulk Actions                                    |

## 安装与调用

技能安装在 DSH 的用户级技能根目录 `~/.agents/skills/ui-ux-pro-max/`，无需 Claude Code。

```bash
python3 "$HOME/.agents/skills/ui-ux-pro-max/scripts/search.py" "<keyword>" --domain ux
python3 "$HOME/.agents/skills/ui-ux-pro-max/scripts/search.py" "<keyword>" --stack vue
```

已应用两处本地修补，`uipro update` 会覆盖，需重新应用：

1. 上游 SKILL.md 用 `${CLAUDE_PLUGIN_ROOT}` 定位脚本，该变量只在 Claude 插件安装下存在；已改为绝对路径。
2. 上游调用 `python`，本机只有 `python3`；已一并替换。

未安装的部分及原因：

- `ui-styling`：体积几乎全部是画布字体资源，与本项目无关。
- `brand`、`banner-design`、`slides`、`design`：面向品牌与演示，与后台开发无关。
- `icons` 域的数据 100% 是 Phosphor，而本项目图标库为 `@lucide/vue`；只借用其图标选型语义，不采用其中的导入代码。

## 落地状态

- token 已落到 `src/styles/main.css`，Element Plus 在 `src/main.ts` 中全量引入并先于该文件，覆盖依赖这一顺序。
- **采用全量引入而非按需导入**：按需导入的 CSS 随组件注入，而当前 `src/` 尚无 Element Plus 组件，`--el-*` 变量不会存在，覆盖无从谈起也无从验证。代价是主包体积约 1MB（gzip 325KB），开始批量使用组件、体积成为实际问题时再切换按需导入。

## 未决与风险

- `design-audit.mjs`（六档视口截图 + 无障碍启发式检查）尚未接入。其 `import { chromium } from 'playwright'` 在 pnpm 严格布局下无法从仓库根解析，需改为 `@playwright/test`；改动仅一行且不新增依赖。
- 本文与技能边界尚未写入 `AGENTS.md`，因此规则不会在每个会话自动生效，需要人工引用。
- Carbon 的 `DESIGN.md` 原文含大量营销段落（hero、客户 Logo 走马灯、footer 反色），落地时一律裁掉，只取上述 token 与产品级规范。
- IBM Plex Sans 尚未随包引入，当前仅在系统已安装时生效，中文回落已就位。引入字体文件（尤其简体中文子集）体积可观，属独立决策。
- Element Plus 的表格类变量（如 `--el-table-border-color`）走的是另一套中性色，待列表页真正落地时再映射，避免现在做无用功。
