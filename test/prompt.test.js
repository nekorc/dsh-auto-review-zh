import test from 'node:test';
import assert from 'node:assert/strict';

import {
  enhanceReviewPolicy,
  isAutoReviewSystem,
  EXPLANATION_HEADER,
  REVIEW_POLICY_PREFIX,
} from '../lib/prompt.js';

const BASE = `${REVIEW_POLICY_PREFIX}
You are the final authorization reviewer for exactly one pending tool call.

For any allow, end with exactly the applicable two-member object and nothing else.
Stop immediately after the closing brace.`;

test('只识别以 REVIEW_POLICY 开头的系统提示词', () => {
  assert.equal(isAutoReviewSystem(BASE), true);
  assert.equal(isAutoReviewSystem('You are a helpful assistant.'), false);
  assert.equal(isAutoReviewSystem('REVIEW_POLICY_APPENDIX'), true);
  assert.equal(isAutoReviewSystem(undefined), false);
  assert.equal(isAutoReviewSystem(42), false);
});

test('在 JSON 格式段之前插入中文 wait-what 规则', () => {
  const out = enhanceReviewPolicy(BASE);

  assert.ok(out.includes(EXPLANATION_HEADER));
  assert.ok(out.includes('简体中文'));
  assert.ok(out.includes('背景'));
  assert.ok(out.includes('原因'));
  assert.ok(out.includes('选择'));
  assert.ok(out.includes('允许一次'));
  assert.ok(out.includes('拒绝'));

  const headerAt = out.indexOf(EXPLANATION_HEADER);
  const allowAt = out.indexOf('For any allow');
  assert.ok(headerAt > 0);
  assert.ok(allowAt > headerAt, '格式段必须仍在解释规则之后');
  assert.ok(out.endsWith('Stop immediately after the closing brace.'));
});

test('重复调用不会重复插入', () => {
  const once = enhanceReviewPolicy(BASE);
  const twice = enhanceReviewPolicy(once);
  assert.equal(twice, once);
});

test('非自动审查提示词原样返回', () => {
  const other = 'You are a helpful assistant.';
  assert.equal(enhanceReviewPolicy(other), other);
});

test('格式段措辞变化时退化为追加，并说明本条优先', () => {
  const odd = `${REVIEW_POLICY_PREFIX}
No allow-format marker here.`;
  const out = enhanceReviewPolicy(odd);

  assert.ok(out.includes(EXPLANATION_HEADER));
  assert.ok(out.includes('take precedence'));
  assert.ok(out.startsWith(odd));
});

test('最后一行的严格 JSON 指令保持不变', () => {
  const out = enhanceReviewPolicy(BASE);
  const lastLine = out.trimEnd().split('\n').at(-1);
  assert.equal(lastLine, 'Stop immediately after the closing brace.');
});