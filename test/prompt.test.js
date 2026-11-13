import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  enhanceReviewPolicy,
  isAutoReviewSystem,
  EXPLANATION_HEADER,
  EXPLANATION_RULES,
  REVIEW_POLICY_PREFIX,
} from '../lib/prompt.js';

const BASE = `${REVIEW_POLICY_PREFIX}
You are the final authorization reviewer for exactly one pending tool call.

For any allow, end with exactly the applicable two-member object and nothing else.
Stop immediately after the closing brace.`;

const REAL_POLICY = readFileSync(
  fileURLToPath(new URL('./fixtures/review-policy-0.2.2-rc.1.txt', import.meta.url)),
  'utf8',
);

test('只识别以 REVIEW_POLICY 开头的系统提示词', () => {
  assert.equal(isAutoReviewSystem(BASE), true);
  assert.equal(isAutoReviewSystem('You are a helpful assistant.'), false);
  assert.equal(isAutoReviewSystem('REVIEW_POLICY_APPENDIX'), true);
  assert.equal(isAutoReviewSystem(undefined), false);
  assert.equal(isAutoReviewSystem(42), false);
});

test('在 JSON 格式段之前插入中文规则', () => {
  const out = enhanceReviewPolicy(BASE);

  assert.ok(out.includes(EXPLANATION_HEADER));
  assert.ok(out.includes('简体中文'));
  assert.ok(out.includes('对象'));
  assert.ok(out.includes('后果'));
  assert.ok(out.includes('选择'));
  assert.ok(out.includes('允许一次'));
  assert.ok(out.includes('拒绝'));

  const headerAt = out.indexOf(EXPLANATION_HEADER);
  const allowAt = out.indexOf('For any allow');
  assert.ok(headerAt > 0);
  assert.ok(allowAt > headerAt, '格式段必须仍在解释规则之后');
  assert.ok(out.endsWith('Stop immediately after the closing brace.'));
});

test('规则把模型锚在最后一条待审调用上，而不是用户的请求上', () => {
  assert.ok(EXPLANATION_RULES.includes('最后一条'));
  assert.ok(EXPLANATION_RULES.includes('kind 为 tool-call'));
  assert.ok(EXPLANATION_RULES.includes('不要复述更早的历史调用'));
  // 旧模板以“你让我……”开头，是理由描述错动作的直接来源；不允许再出现在提示词里。
  assert.equal(EXPLANATION_RULES.includes('你让我'), false);
  assert.equal(EXPLANATION_RULES.includes('你要求'), false);
  assert.equal(EXPLANATION_RULES.includes('Use the latest human instruction'), false);
});

test('规则明确本段只约束理由文本，不改变风险判定', () => {
  assert.ok(EXPLANATION_RULES.includes('照常 allow'));
  assert.ok(EXPLANATION_RULES.includes('不许为了写出理由而改成 deny'));
  // 旧模板预设“中/高风险”，把只读调用也往拒绝方向推。
  assert.equal(EXPLANATION_RULES.includes('为什么按中风险或高风险处理'), false);
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

test('格式段措辞变化时插到最后一段之前，不追加在终止指令之后', () => {
  const odd = `${REVIEW_POLICY_PREFIX}
First paragraph.

Second paragraph ends here.`;
  const out = enhanceReviewPolicy(odd);

  assert.ok(out.includes(EXPLANATION_HEADER));
  assert.ok(out.endsWith('Second paragraph ends here.'));
  assert.ok(out.indexOf(EXPLANATION_HEADER) < out.indexOf('Second paragraph'));
  assert.ok(out.length > odd.length);
});

test('既没有格式段也没有段落边界时原样返回，宁可退回英文', () => {
  const flat = `${REVIEW_POLICY_PREFIX}
No paragraph break in this policy at all.`;

  assert.equal(enhanceReviewPolicy(flat), flat);
});

test('真实 0.2.2-rc.1 策略：插入点、末行、增量都符合预期', () => {
  const out = enhanceReviewPolicy(REAL_POLICY);

  assert.ok(REAL_POLICY.length > 4000, 'fixture 应为上游完整策略');
  assert.ok(out.includes(EXPLANATION_HEADER));
  assert.ok(
    out.indexOf(EXPLANATION_HEADER) < out.indexOf('For any allow, end with exactly'),
    '中文规则必须在允许格式段之前',
  );
  assert.ok(out.endsWith('Stop immediately after the closing brace.'));
  assert.ok(out.length - REAL_POLICY.length < 1500, '注入块不应继续膨胀');
});

test('最后一行的严格 JSON 指令保持不变', () => {
  const out = enhanceReviewPolicy(BASE);
  const lastLine = out.trimEnd().split('\n').at(-1);
  assert.equal(lastLine, 'Stop immediately after the closing brace.');
});
