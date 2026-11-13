import test from 'node:test';
import assert from 'node:assert/strict';

import { apply, inject, name } from '../lib/index.js';
import { enhanceReviewPolicy, EXPLANATION_HEADER } from '../lib/prompt.js';

const BASE = `REVIEW_POLICY
You are the final authorization reviewer for exactly one pending tool call.

For any allow, end with exactly the applicable two-member object and nothing else.
Stop immediately after the closing brace.`;

/** 有审查前缀、但没有任何段落边界：插件找不到安全插入点。 */
const NO_INSERTION_POINT = `REVIEW_POLICY
No paragraph break in this policy at all.`;

function makeCtx() {
  let listener;
  const onCalls = [];
  const ctx = {
    logger: { info() {}, warn() {}, error() {} },
    effect(fn) {
      return fn();
    },
    on(event, fn, options) {
      listener = fn;
      onCalls.push({ event, options });
      return () => {
        listener = undefined;
      };
    },
    llm: {
      calls: 0,
      nextCalls: 0,
      seen: [],
      stream(options) {
        this.calls += 1;
        this.seen.push(options);
        const next = () => {
          this.nextCalls += 1;
          return (async function* () {
            yield {
              type: 'text',
              text: options.system.includes(EXPLANATION_HEADER) ? 'enhanced' : 'original',
            };
          })();
        };
        if (typeof listener !== 'function') throw new Error('no llm/stream listener registered');
        return listener(options, next);
      },
    },
    onCalls,
    get listener() {
      return listener;
    },
  };
  return ctx;
}

async function collect(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

test('插件元数据正确', () => {
  assert.equal(name, 'dsh-auto-review-zh');
  assert.deepEqual(inject, ['llm']);
});

test('自动审查请求只递归一次，并且用增强后的 system 调用模型', async () => {
  const ctx = makeCtx();
  apply(ctx, { diagnostics: false });

  const messages = [{ role: 'user', content: [{ type: 'text', text: 'pending' }] }];
  const original = Object.freeze({
    system: BASE,
    messages,
    provider: 'p',
    model: 'm',
    temperature: 0,
    purpose: 'auto-review',
    sessionId: 'session-1',
  });
  const chunks = await collect(ctx.llm.stream(original));

  assert.equal(ctx.llm.calls, 2, '外层请求 + 内层增强请求');
  assert.equal(ctx.llm.nextCalls, 1, '真正到达下游的只有一次');
  assert.equal(chunks.map((chunk) => chunk.text).join(''), 'enhanced');

  assert.equal(ctx.llm.seen.length, 2);
  assert.equal(ctx.llm.seen[0].system, BASE);
  assert.ok(ctx.llm.seen[1].system.includes(EXPLANATION_HEADER));
  assert.notEqual(ctx.llm.seen[1], original, '必须复制请求，不能修改冻结的原请求');

  // 只换 system，审查路由与消息一个字都不动。
  const enhancedOptions = ctx.llm.seen[1];
  assert.equal(enhancedOptions.messages, messages);
  assert.equal(enhancedOptions.provider, 'p');
  assert.equal(enhancedOptions.model, 'm');
  assert.equal(enhancedOptions.temperature, 0);
  assert.equal(enhancedOptions.purpose, 'auto-review');
  assert.equal(enhancedOptions.sessionId, 'session-1');

  assert.deepEqual(ctx.onCalls, [
    { event: 'llm/stream', options: { prepend: true, global: true } },
  ]);
});

test('非自动审查请求原样放行', async () => {
  const ctx = makeCtx();
  apply(ctx, { diagnostics: false });

  const chunks = await collect(ctx.llm.stream({ system: 'You are a helpful assistant.', messages: [] }));

  assert.equal(ctx.llm.calls, 1);
  assert.equal(ctx.llm.nextCalls, 1);
  assert.equal(chunks.map((chunk) => chunk.text).join(''), 'original');
});

test('已经增强过的提示词不会再次递归', async () => {
  const ctx = makeCtx();
  apply(ctx, { diagnostics: false });

  const already = { system: enhanceReviewPolicy(BASE), messages: [] };
  const chunks = await collect(ctx.llm.stream(already));

  assert.equal(ctx.llm.calls, 1);
  assert.equal(ctx.llm.nextCalls, 1);
  assert.equal(chunks.map((chunk) => chunk.text).join(''), 'enhanced');
});

test('找不到安全插入点时退回英文审查，仍然放行且不抛错', async () => {
  const ctx = makeCtx();
  apply(ctx, { diagnostics: false });

  const chunks = await collect(ctx.llm.stream({ system: NO_INSERTION_POINT, messages: [] }));

  assert.equal(ctx.llm.calls, 1, '不应发起第二次模型调用');
  assert.equal(ctx.llm.nextCalls, 1, '原请求必须照常到达下游');
  assert.equal(ctx.llm.seen[0].system, NO_INSERTION_POINT);
  assert.equal(chunks.map((chunk) => chunk.text).join(''), 'original');
});

test('enabled: false 时完全不注册监听器', () => {
  const ctx = makeCtx();
  apply(ctx, { enabled: false, diagnostics: false });

  assert.equal(ctx.listener, undefined);
  assert.equal(ctx.onCalls.length, 0);
});

test('增强后的模型调用同步失败时回退到原请求，不阻断审查', async () => {
  const ctx = makeCtx();
  const originalStream = ctx.llm.stream;
  ctx.llm.stream = function streamWithFailure(options) {
    if (options.system.includes(EXPLANATION_HEADER)) {
      throw new Error('simulated llm stream failure');
    }
    return originalStream.call(this, options);
  };

  apply(ctx, { diagnostics: false });

  const chunks = await collect(ctx.llm.stream({ system: BASE, messages: [] }));

  assert.equal(ctx.llm.nextCalls, 1);
  assert.equal(chunks.map((chunk) => chunk.text).join(''), 'original');
});
