/**
 * 很小的本地诊断文件。
 *
 * 目的：重启 DSH 后，能确认“插件加载了”和“审查提示词确实被增强过”。
 * 只写时间戳和长度，不写提示词、命令、路径或任何用户内容。
 */

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
    note: 'An auto-review system prompt was enhanced with the Chinese wait-what explanation rules.',
  });
}