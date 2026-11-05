/**
 * 自动审查提示词增强。
 *
 * 只改变“拒绝理由怎么写”，不改风险判定、不改 JSON 形状、不改审批语义。
 * 由 lib/index.js 在 llm/stream 通道识别 REVIEW_POLICY 后插入。
 */

export const REVIEW_POLICY_PREFIX = 'REVIEW_POLICY';
export const EXPLANATION_HEADER = 'WAIT-WHAT USER-FACING EXPLANATION';

const ALLOW_FORMAT_MARKER = 'For any allow, end with exactly';

export const EXPLANATION_RULES = `WAIT-WHAT USER-FACING EXPLANATION (MANDATORY ON EVERY DENY)
The reason member is shown directly to the human in an approval card. Write it in Simplified Chinese (简体中文) for a reader who is not a software expert. Re-pitch it in the "wait-what" order:

1. 背景：先用一句话说清用户让你做什么，以及你准备对什么对象执行什么动作。Use the latest human instruction and the pending action. Do not invent facts.
2. 原因：再用日常中文说明这一步会造成什么后果，为什么按中风险或高风险处理。Do not use unexplained English words or internal rule names. If a technical term is unavoidable, explain it in parentheses in Chinese.
3. 选择：最后告诉用户现在能怎么做。中风险时说“如果这确实是你想要的，可以点‘允许一次’；否则点‘拒绝’，并告诉我换一种做法。”高风险时说明不建议批准，并给出更安全的替代做法。

Rules:
- 2 to 4 short sentences, one paragraph, no line breaks, no Markdown, no lists. No more than 180 Chinese characters.
- Inside the reason text, do not use the English words REVIEW_POLICY, JSON, risk, decision, allow, deny, low, medium, high, or internal rule names. The JSON keys themselves are unchanged. Say 中风险 / 高风险 in Chinese when needed.
- Keep tool names, command names, file paths, URLs, and identifiers exactly as written. Do not repeat secrets, tokens, passwords, or full credential values; call them 密钥 or 凭据.
- reason is a JSON string. Escape double quotes and backslashes. Add reason only to a deny object, never to an allow object.
- Do not put the explanation only in reasoning; the reason member must contain it.
- Do not start the reason with “Auto review” or “自动审查”; start with the background sentence.
- Examples:
  Medium: "你让我把本地提交推到远端 main 分支。我准备执行强制推送，这会覆盖远端历史，可能丢掉别人的提交，所以按中风险拦下。若你确认远端只有你的提交，可以点“允许一次”；否则请点“拒绝”，并告诉我改用普通推送或先备份。"
  High: "你让我把包含密钥的 .env 文件发送到外部地址。这会把凭据交给第三方，可能被读取或滥用，属于高风险。建议不要点“允许一次”；请改为发送脱敏后的示例数据，或只在本地使用这些密钥。"`;

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
 * 在自动审查策略的“JSON 格式段”之前插入中文解释规则。
 * 不删除、不改写原有任何一行；最后一段仍然是严格的 JSON 格式要求。
 *
 * @param {string} system - 原始系统提示词。
 * @returns {string} 增强后的系统提示词；非审查提示词原样返回。
 */
export function enhanceReviewPolicy(system) {
  if (!isAutoReviewSystem(system)) return system;
  if (system.includes(EXPLANATION_HEADER)) return system;

  const markerIndex = system.lastIndexOf(ALLOW_FORMAT_MARKER);
  const block = `\n\n${EXPLANATION_RULES}\n\n`;

  if (markerIndex === -1) {
    // DSH 升级后如果格式段措辞变了，退化为追加，并明确说明本条优先。
    return `${system}${block}These output rules take precedence over earlier text about reason.`;
  }

  return `${system.slice(0, markerIndex)}${block}${system.slice(markerIndex)}`;
}