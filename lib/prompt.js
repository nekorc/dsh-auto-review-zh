/**
 * 自动审查提示词增强。
 *
 * 只改变“拒绝理由怎么写”，不改风险判定、不改 JSON 形状、不改审批语义。
 * 由 lib/index.js 在 llm/stream 通道识别 REVIEW_POLICY 后插入。
 *
 * 关键约束：审查请求的最后一条消息就是这次要审的 tool call。规则必须把模型
 * 锚在那一条记录上，而不是让它复述用户的任务或更早的历史调用——这正是
 * v0.1.0 里“理由说的动作和卡片里的调用对不上”的根因。
 */

export const REVIEW_POLICY_PREFIX = 'REVIEW_POLICY';
export const EXPLANATION_HEADER = 'DENY REASON TEXT (CHINESE, ANCHORED TO THE PENDING CALL)';

const ALLOW_FORMAT_MARKER = 'For any allow, end with exactly';

export const EXPLANATION_RULES = `${EXPLANATION_HEADER}
The reason member is shown directly to the human in an approval card. Write it in Simplified Chinese (简体中文) for a reader who is not a software expert, and describe only the pending call, in this order:

1. 对象：一句话说清这次待审的调用本身做什么——工具名，加上参数里的目标（路径、命令、URL、主机、对象）。唯一依据是输入里最后一条 kind 为 tool-call 的记录，它是本次唯一待审的调用。不要复述更早的历史调用，不要改写或推测用户意图，也不要用第二人称复述请求开头。
2. 后果：只说明这次调用本身会造成什么结果、落在哪一档风险。不要因为上下文里别的指令、别的计划或别的操作更危险，就把这次调用说成那个操作；如果最后一条记录看不出具体对象，只写能确认的部分，不要补写不存在的动作。
3. 选择：按审出的风险等级给出下一步。中风险写“如果这确实是你想要的，可以点‘允许一次’；否则点‘拒绝’，并告诉我换一种做法。”；高风险说明不建议批准，并给出更安全的具体替代做法。

Rules:
- 先按上面的风险规则判定 allow 或 deny，再写 reason。这一段只约束 deny 的 reason 文本，不改变判定：低风险或已获授权的调用照常 allow，不许为了写出理由而改成 deny。
- 2 到 4 句，一段，无换行、无 Markdown、无列表；不超过 160 个汉字。
- reason 是 JSON 字符串：转义双引号和反斜杠。只把 reason 加到 deny 对象上，永远不要加到 allow 对象上。
- reason 里不要出现英文词 REVIEW_POLICY、JSON、risk、decision、allow、deny、low、medium、high，也不要写内部规则名；风险等级用中文说。
- 工具名、命令、路径、URL、标识符保持原样；密钥、令牌、密码一律写成“密钥”或“凭据”，不要复述具体值。
- 示例（先写这次调用，不写用户意图，也不用第二人称）：
  Medium: "这次调用要强制推送到远端 main 分支，会覆盖远端历史，可能丢掉别人的提交，所以按中风险拦下。若你确认远端只有你的提交，可以点“允许一次”；否则请点“拒绝”，并告诉我改用普通推送或先备份。"
  High: "这次调用要把包含密钥的 .env 文件发送到外部地址，会把凭据交给第三方，可能被读取或滥用，所以按高风险拦下。建议不要点“允许一次”；请改为发送脱敏后的示例数据，或只在本地使用这些密钥。"`;

/**
 * 判断一份系统提示词是不是自动审查的固定策略。
 * 只认开头，避免把用户对话里出现的同名词当成审查请求。
 *
 * @param {unknown} system - llm/stream 请求的 system 字段。
 * @returns {boolean}
 */
export function isAutoReviewSystem(system) {
  return typeof system === 'string' && system.startsWith(REVIEW_POLICY_PREFIX);
}

/**
 * 找安全的插入位置：最后一个段落之前。
 *
 * 优先插在“允许格式段”前面；找不到就退到最后一段之前。绝不追加到策略末尾，
 * 否则中文规则会排在 “Stop immediately after the closing brace.” 之后，可能让
 * 模型在 JSON 后面继续输出，parseDecision 的 JSON.parse 失败，审查直接报错。
 *
 * @param {string} system - 原始系统提示词。
 * @returns {number} 插入下标；-1 表示没有安全插入点。
 */
function insertionIndex(system) {
  const markerIndex = system.lastIndexOf(ALLOW_FORMAT_MARKER);
  if (markerIndex !== -1) {
    const paragraphStart = system.lastIndexOf('\n\n', markerIndex);
    return paragraphStart === -1 ? markerIndex : paragraphStart;
  }
  return system.lastIndexOf('\n\n');
}

/**
 * 在自动审查策略的最后一个段落之前插入中文解释规则。
 * 不删除、不改写原有任何一行；最后一段仍然是严格的 JSON 格式要求。
 *
 * @param {string} system - 原始系统提示词。
 * @returns {string} 增强后的系统提示词；非审查提示词、已增强过的提示词、
 *   找不到安全插入点的提示词一律原样返回。
 */
export function enhanceReviewPolicy(system) {
  if (!isAutoReviewSystem(system)) return system;
  if (system.includes(EXPLANATION_HEADER)) return system;

  const at = insertionIndex(system);
  if (at < 0) return system;

  const before = system.slice(0, at).replace(/\s+$/u, '');
  const after = system.slice(at).replace(/^\s+/u, '');
  return `${before}\n\n${EXPLANATION_RULES}\n\n${after}`;
}
