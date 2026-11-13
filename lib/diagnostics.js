/**
 * 很小的本地诊断文件。
 *
 * 目的：重启 DSH 后，能确认“插件加载了”“审查提示词确实被增强过”，以及
 * “上游策略改了、插件主动退回英文”。只写时间戳和长度/指纹，不写提示词、
 * 命令、路径或任何用户内容。
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_DIR = join(PLUGIN_ROOT, 'state');

function writeJson(filename, value) {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(join(STATE_DIR, filename), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  } catch {
    // 诊断失败绝不影响审查链路。
  }
}

/** 策略指纹：只用来识别“DSH 改过提示词”，不保留正文。 */
function policyFingerprint(policy) {
  return createHash('sha256').update(policy, 'utf8').digest('hex').slice(0, 12);
}

/** 插件加载成功。 */
export function reportLoaded() {
  writeJson('loaded.json', {
    at: new Date().toISOString(),
    pid: process.pid,
    note: 'dsh-auto-review-zh plugin is loaded.',
  });
}

/** 第一次真正增强审查提示词。 */
export function reportEnhancement(beforeLength, afterLength) {
  writeJson('last-enhancement.json', {
    at: new Date().toISOString(),
    pid: process.pid,
    beforeLength,
    afterLength,
    note: 'An auto-review system prompt was enhanced with the Chinese anchored reason rules.',
  });
}

/** 识别到审查请求、但没有安全插入点：这次用英文原文审查。 */
export function reportDrift(policy) {
  writeJson('last-drift.json', {
    at: new Date().toISOString(),
    pid: process.pid,
    policySha256: policyFingerprint(policy),
    policyLength: policy.length,
    note: 'No safe insertion point in the auto-review system prompt; the review ran with the original prompt.',
  });
}
