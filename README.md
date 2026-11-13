# dsh-auto-review-zh

> 把 DSH **Auto review（自动审查）** 的拒绝理由变成中文、wait-what 风格：先说这次调用做什么，再说后果，最后告诉你该点“允许一次”还是“拒绝”。

[![CI](https://github.com/nekorc/dsh-auto-review-zh/actions/workflows/test.yml/badge.svg)](https://github.com/nekorc/dsh-auto-review-zh/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-0.2.2--rc.1-4B6BFB)](https://github.com/deepseek-ai/deepseek-harness)
[![Node](https://img.shields.io/badge/Node-%3E%3D20-339933)](https://nodejs.org/)
[![Status](https://img.shields.io/badge/status-experimental-orange)](#)

Community plugin, not affiliated with DeepSeek.

---

## 目录

- [为什么需要它](#为什么需要它)
- [功能](#功能)
- [效果示例](#效果示例)
- [工作原理](#工作原理)
- [兼容性](#兼容性)
- [安装](#安装)
- [配置](#配置)
- [开关与卸载](#开关与卸载)
- [安全边界](#安全边界)
- [排障](#排障)
- [开发与测试](#开发与测试)
- [已知限制](#已知限制)
- [贡献](#贡献)
- [许可证](#许可证)
- [致谢](#致谢)
- [English summary](#english-summary)

---

## 为什么需要它

DSH 的 `Auto review` 会在每次工具调用前判断风险；它拒绝时，会把模型写的 `reason` 显示在审批卡里。

原版审查提示词是英文的，所以理由常常是：

> Force push rewrites remote history and requires explicit authorization.

这句话对非技术用户不友好：既没有说清“你刚才想做什么”，也没有说清“允许之后会发生什么”。本插件不是在事后翻译，而是在审查模型**生成理由的那一刻**就要求它用中文、按 wait-what 顺序写：

1. **对象**：这次待审的调用要做什么——工具名 + 参数里的目标（路径、命令、URL）；只依据输入里最后一条 `tool-call`，不复述用户的任务；
2. **后果**：这次调用本身会造成什么结果，落在哪一档风险；
3. **选择**：现在该点“允许一次”还是“拒绝”，以及更安全的替代做法。

它**不改**风险判定、**不改**审批语义、**不改** JSON 形状，也不增加第二次翻译调用。

---

## 功能

- 审查模型生成拒绝理由时直接写**简体中文**。
- 理由固定按 **对象 → 后果 → 选择** 组织，尽量不用未解释的术语。
- 不需要额外的翻译 provider，不增加第二次模型调用。
- 不修改 `app.asar`，不 fork、不修改 DSH 自带的 Auto review 插件。
- 低/中/高风险判定、允许/拒绝规则、审批按钮行为全部保持原样。
- 支持通过 profile 配置临时关闭，或完全卸载。
- 提供三个很小的诊断文件，方便确认插件是否加载、是否增强过审查请求、是否因上游策略变化退回英文。
- 17 个单元测试覆盖提示词插入与锚定、递归保护、放行、关闭开关、失败回退和策略漂移。

---

## 效果示例

> 示例，实际措辞会随具体操作变化。

**改造前**

> Auto review 拒绝了此调用：Force push rewrites remote history and requires explicit authorization.

**改造后**

> Auto review 拒绝了此调用：这次调用要强制推送到远端 main 分支，会覆盖远端历史，可能丢掉别人的提交，所以按中风险拦下。若你确认远端只有你的提交，可以点“允许一次”；否则请点“拒绝”，并告诉我改用普通推送或先备份。

说明：弹窗开头的 `Auto review` 是功能名，暂时保留英文；正文是中文。理由以**这次调用本身**开头，不复述用户的任务。

### 为什么 0.1.1 改了写法

0.1.0 的模板是“你让我……我准备……”，模型会把**用户的任务**当成被审对象。实测出现过待审 `read fixtures.py`、理由却写“我准备把明文密钥写进 runs/equity_config.toml”的情况；模板里的“为什么按中风险或高风险处理”也预设了拒绝，导致只读调用被抬成中风险。0.1.1 起规则锚定在审查请求的**最后一条 `tool-call`** 上，并明确“本段只约束理由文本、不改变判定”。

---

## 工作原理

```text
Auto review 请求（system 以 REVIEW_POLICY 开头）
        │
        ▼
llm/stream 监听器（本插件）
        │  复制请求；在最后一个段落之前插入中文锚定规则
        ▼
同一个模型 / 同一个 provider
        │
        ▼
严格 JSON：{ "risk": ..., "decision": ..., "reason": ... }
        │
        ▼
审批卡：英文标题 + 中文理由
```

具体步骤：

1. DSH 每次调用模型都会经过内部通道 `llm/stream`。
2. 自动审查请求有一个稳定特征：`system` 以 `REVIEW_POLICY` 开头。
3. 本插件只认这种请求；其他所有模型调用原样放行。
4. 复制一份请求，在“允许格式段”所在的**最后一个段落之前**插入“中文锚定理由规则”。
5. 用同一个模型、同一个 provider 重新发起这次审查。
6. 用一个 `WeakSet` 记住已经改过的请求对象，避免递归。
7. 原来的安全规则一行没删，最后一段仍然是：

   > For any allow, end with exactly the applicable two-member object and nothing else.
   > Stop immediately after the closing brace.

8. 找不到安全插入点（上游改了措辞）时**不追加任何文本**，直接按英文原样审查，并写 `state/last-drift.json`。宁可回到英文，也不把规则放到 `Stop immediately after the closing brace.` 之后——那样模型可能在 JSON 后面继续输出，导致审查解析失败。

所以审查模型仍然只返回一个合法 JSON；只是 `reason` 变成了中文，且必须围绕这次待审调用写。

---

## 兼容性

| DSH 版本 | 状态 |
|---|---|
| `0.2.2-rc.1` | 已验证（Windows DSH Desktop；`REVIEW_POLICY` 4334 字符、格式段标记仍在） |
| `0.2.1-rc.5` | 已验证（Windows DSH Desktop） |
| `0.2.x` | 预期可用 |
| `0.3.x` | 未验证；`package.json` 的 `engines.dsh` 暂不包含 |

- Node：`>=20`（DSH 运行时自带 Node）。
- 这是 **host 插件**，安装、关闭、卸载后都需要重启 DSH；页面刷新不够。
- 插件只在权限预设为 **Auto review（自动审查）** 时生效；完全权限、只读等模式不会触发审查。
- 如果 DSH 未来修改了 `REVIEW_POLICY` 的开头，插件会自动不生效；Auto review 仍能工作，只是回到英文。届时更新 `lib/prompt.js` 的识别条件即可。

---

## 安装

### 前置条件

- 已安装 DSH，并能使用 Auto review；
- 有权限修改 `~/.dsh/profiles/desktop`（macOS/Linux）或 `%USERPROFILE%\.dsh\profiles\desktop`（Windows）；
- 准备重启一次 DSH。

### 方式一：手动 link（推荐；Windows Desktop 已验证）

1. 克隆仓库：

   ```bash
   git clone https://github.com/nekorc/dsh-auto-review-zh.git ~/projects/dsh-auto-review-zh
   ```

2. 编辑 profile 的 `package.json`：

   - Windows：`%USERPROFILE%\.dsh\profiles\desktop\package.json`
   - macOS/Linux：`~/.dsh/profiles/desktop/package.json`

   在 `dependencies` 里追加（把路径换成你的实际路径）：

   ```json
   "dsh-auto-review-zh": "link:C:/path/to/dsh-auto-review-zh"
   ```

   在 `dsh.profile.bundles` 里追加：

   ```json
   "bundles": [
     "...保留原有条目...",
     "@deepseek-ai/dsh-experimental-auto-review",
     "dsh-auto-review-zh"
   ]
   ```

   只追加，不要删除已有条目。

3. 在 profile 的 `node_modules` 下建立目录链接：

   **Windows PowerShell**

   ```powershell
   New-Item -ItemType Junction `
     -Path "$HOME\.dsh\profiles\desktop\node_modules\dsh-auto-review-zh" `
     -Target "C:\path\to\dsh-auto-review-zh"
   ```

   **macOS / Linux**

   ```bash
   ln -s /path/to/dsh-auto-review-zh ~/.dsh/profiles/desktop/node_modules/dsh-auto-review-zh
   ```

4. 重启 DSH，在权限选择器里选择 **Auto review（自动审查）**。

5. 检查插件是否加载：

   - `dsh-auto-review-zh/state/loaded.json` 存在即已加载；
   - 随便执行一次工具调用后，`state/last-enhancement.json` 存在即增强过审查请求。

### 方式二：插件管理器

如果你的 DSH 插件管理器支持 GitHub 规格，可以直接安装：

```text
github:nekorc/dsh-auto-review-zh
```

请确认装进的是 **`desktop`** profile，并重启 DSH。桌面端 profile 由 DSH Desktop 托管；如果管理器或 CLI 拒绝直接操作 `desktop`，请使用方式一。

### 方式三：Web / CLI profile

如果你使用 `dsh` CLI 的 `web` profile：

```bash
dsh plugin --profile web add github:nekorc/dsh-auto-review-zh
```

然后重启 DSH。注意：DSH Desktop 使用 `desktop` profile，不是 `web`。

---

## 配置

在 profile 的 `cordis.patch.yml` 里覆盖：

```yaml
- id: dsh-auto-review-zh
  config:
    enabled: false
```

| 键 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | `false` 时回到英文审查理由；Auto review 仍正常工作 |
| `diagnostics` | `true` | 写三个诊断文件；只含时间戳、PID、提示词长度/指纹 |

改完配置后重启 DSH。诊断文件位于插件目录的：

```text
state/loaded.json           插件已加载
state/last-enhancement.json 最近一次增强（只写长度）
state/last-drift.json       上游策略变化、本次退回英文（只写长度与提示词指纹）
```

它们不记录提示词内容、命令、路径或任何用户数据。`last-drift.json` 出现时说明 DSH 改过审查提示词，插件的规则没插进去——Auto review 回到英文，功能不受影响。

---

## 开关与卸载

### 临时关闭

在 profile 的 `cordis.patch.yml` 末尾追加：

```yaml
- id: dsh-auto-review-zh
  config:
    enabled: false
```

重启 DSH。自动审查会回到原来的英文解释，但功能不受影响。

### 完全卸载

1. 先备份 profile 的 `package.json` 和 `cordis.patch.yml`；
2. 从 `dsh.profile.bundles` 和 `dependencies` 里删掉 `dsh-auto-review-zh`；
3. 删除 `node_modules/dsh-auto-review-zh` 这个 junction / symlink；
4. 重启 DSH。

原版 `@deepseek-ai/dsh-experimental-auto-review` 始终没有被修改；卸载本插件不会影响它。

---

## 安全边界

- **不改风险判定**：低/中/高风险分类、允许/拒绝规则、审批按钮行为全部保持原样。
- **不改 `app.asar`**：不修改 DSH 安装包，不 fork 自带插件。
- **不增加 provider**：只使用宿主已有的 `llm` 服务，不请求额外的翻译 API。
- **不持久化内容**：诊断文件只写时间戳、PID 和提示词长度；不写提示词、工具参数或用户数据。
- **不是安全边界**：本插件只改变解释语言，不能把不安全操作变安全；最终判断仍以原 Auto review 为准。
- **成本**：每次审查大约多 400–500 token 的固定提示词；只有拒绝时多约 100–200 token 的理由文本。
- **代码很小**：核心是 [`lib/index.js`](lib/index.js) 和 [`lib/prompt.js`](lib/prompt.js)，可以自行审计。

如果你发现安全问题，请按 [`SECURITY.md`](SECURITY.md) 私下报告，不要开公开 issue。

---

## 排障

| 现象 | 检查 |
|---|---|
| 没有 `state/loaded.json` | 插件没加载：检查 profile 的 bundle、junction 和重启 |
| `state/last-enhancement.json` 不更新 | 当前会话没有 Auto review 请求：确认权限预设是 Auto；重启 DSH 可能把 Auto 会话迁回完全权限，需要重新选择 |
| 理由还是英文 | 模型没有遵守插入的规则；确认 DSH 版本和 `REVIEW_POLICY` 是否变化；欢迎附卡片文字开 issue（请先去掉密钥和隐私） |
| 理由说的动作和卡片里的调用对不上 | 先确认不是 0.1.0：0.1.0 的“你让我……”模板会把用户任务当成被审对象，升级到 0.1.1 并重启；仍然复现就把卡片文字去掉密钥后开 issue |
| 出现 `state/last-drift.json` | 上游改了审查提示词的措辞，插件没有安全插入点，已主动回到英文。用文件里的 `policySha256` / `policyLength` 对照新版 `REVIEW_POLICY`，更新 `lib/prompt.js` |
| Auto review 不弹审批 | 审批策略可能是 `never`，或当前不是 Auto preset |
| DSH 升级后不再生效 | `REVIEW_POLICY` 前缀可能变了；更新 `lib/prompt.js`，或等插件更新 |
| DSH 启动失败 | 先把 `dsh-auto-review-zh` 从 profile 移除并重启；原 Auto review 不受影响 |

诊断文件只用于确认插件是否运行，不包含审查内容。

---

## 开发与测试

项目结构：

```text
lib/index.js         llm/stream 监听器、递归保护、开关、策略漂移放行
lib/prompt.js        提示词识别、锚定规则与安全插入点
lib/diagnostics.js   三个诊断文件
test/                提示词与中间件单测
test/fixtures/       上游 REVIEW_POLICY 原文（回归测试插入点）
cordis.patch.yml     DSH bundle 行
```

运行测试：

```bash
npm test
# 或
node --test
```

要求：Node `>=20`，无第三方运行时依赖。
测试覆盖：只识别审查请求、插入位置与末行不变、锚定待审调用、反拒绝偏置、真实策略回归、幂等、绕过非审查请求、递归保护、关闭开关、同步失败回退、无插入点时安全退回英文。

GitHub Actions 在 Node 22 / 24 上运行同样的测试。欢迎 fork、开分支、补测试后提交 PR。

---

## 已知限制

- 审批卡开头的 `Auto review` 是功能名，本次不翻译；正文是中文。
- 子代理在 `never` 审批策略下的最终英文错误文本不由本插件处理。
- 插件只约束 `reason` 的写法，不能保证模型的风险判定正确；判定仍完全由上游 `REVIEW_POLICY` 决定。
- 模型偶尔可能仍写英文、超过 160 字，或把理由写偏；提示词已经做了锚定与反偏置约束，遇到问题欢迎反馈。
- 如果 DSH 修改了 `REVIEW_POLICY` 的开头、段落结构或格式段，插件会自动退回英文（`state/last-drift.json`），Auto review 仍可用。
- 这是 host 插件：安装、开关、卸载后需要重启 DSH。
- 只在 Auto preset 下工作，不改变其他权限模式。
- 它不是通用翻译器，不翻译 DSH 的其他界面或对话内容。

---

## 贡献

欢迎 issue 和 PR。提交前请：

1. 跑 `npm test`；
2. 保持改动聚焦，不要顺手改插件行为或风险判定；
3. 不要在代码、测试或示例里放真实密钥、个人路径或会话内容；
4. 如果是行为变化，请在 PR 里说明对原有 Auto review 的影响。

---

## 许可证

[MIT](LICENSE) © 2026 nekorc

---

## 致谢

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- [`@deepseek-ai/dsh-experimental-auto-review`](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/experimental/auto-review)
- [Matt Pocock 的 `wait-what` 技能](https://github.com/mattpocock/skills)：本插件的“补背景、说人话、给下一步”方法来自它。

---

## English summary

`dsh-auto-review-zh` makes DSH Auto review denial reasons understandable to Chinese users. It intercepts the reviewer's `llm/stream` request, inserts a Simplified-Chinese reason rule **anchored to the last `tool-call` message** before the final format paragraph, and sends it to the same model. The rule only constrains the `reason` text and never changes risk classification or approval semantics; if no safe insertion point exists, the plugin leaves the English prompt untouched and records `state/last-drift.json`. Disable with `enabled: false`; uninstall without touching `app.asar`. Tested on DSH `0.2.2-rc.1` and `0.2.1-rc.5`; Node `>=20`.
