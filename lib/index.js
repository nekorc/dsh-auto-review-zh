/**
 * dsh-auto-review-zh — Host-only bundle.
 *
 * 只做一件事：在 DSH 的 llm/stream 通道里认出自动审查请求，
 * 把它的系统提示词增强为“拒绝理由用中文、只描述最后一条待审调用”，
 * 再用同一个模型重新发起这次审查。
 *
 * 不修改 app.asar，不 fork 自带插件，不改风险判定，不增加第二次翻译调用。
 */

import { EXPLANATION_HEADER, enhanceReviewPolicy, isAutoReviewSystem } from './prompt.js';
import { reportDrift, reportEnhancement, reportLoaded } from './diagnostics.js';

export const name = 'dsh-auto-review-zh';
export const inject = ['llm'];

/** 记录已经增强过的请求对象，防止在 llm/stream 里无限递归。 */
const REWRITTEN = new WeakSet();

function normalizeConfig(rawConfig) {
  return {
    enabled: rawConfig?.enabled !== false,
    diagnostics: rawConfig?.diagnostics !== false,
  };
}

function log(ctx, level, message) {
  try {
    const logger = ctx?.logger;
    const sink = logger && typeof logger[level] === 'function' ? logger[level].bind(logger) : null;
    if (sink) sink(message);
  } catch {
    // 日志绝不能把审查链路带崩。
  }
}

/**
 * 注册审查提示词增强层。
 *
 * @param {object} ctx - Cordis 上下文。
 * @param {object} [rawConfig] - { enabled?: boolean, diagnostics?: boolean }。
 */
export function apply(ctx, rawConfig = {}) {
  const config = normalizeConfig(rawConfig);

  if (!config.enabled) {
    log(ctx, 'info', '[dsh-auto-review-zh] disabled by config');
    return;
  }

  if (config.diagnostics) reportLoaded();

  let reportedEnhancement = false;
  let reportedDrift = false;

  const listener = (options, next) => {
    try {
      if (!isAutoReviewSystem(options?.system)) return next();
      if (REWRITTEN.has(options)) return next();
      // 已经带规则的请求（重复进入通道或别的层加过）直接放行。
      if (options.system.includes(EXPLANATION_HEADER)) return next();

      const enhanced = enhanceReviewPolicy(options.system);
      if (enhanced === options.system) {
        // 上游策略改到没有安全插入点：宁可回到英文审查，也不把规则追加到
        // “Stop immediately after the closing brace.” 之后。
        if (!reportedDrift) {
          reportedDrift = true;
          if (config.diagnostics) reportDrift(options.system);
          log(ctx, 'warn', '[dsh-auto-review-zh] no safe insertion point in the review policy; auto-review stays English');
        }
        return next();
      }

      // 原请求通常是 deepFreeze 的；复制一份，只替换 system。
      const nextOptions = Object.freeze({ ...options, system: enhanced });
      REWRITTEN.add(nextOptions);

      if (!reportedEnhancement) {
        reportedEnhancement = true;
        if (config.diagnostics) reportEnhancement(options.system.length, enhanced.length);
        log(ctx, 'info', '[dsh-auto-review-zh] auto-review prompt enhanced with Chinese anchored reason rules');
      }

      // 重新走同一条模型通道；内层调用会被 REWRITTEN 放行。
      return ctx.llm.stream(nextOptions);
    } catch (error) {
      log(ctx, 'warn', `[dsh-auto-review-zh] falling back to the original review prompt: ${error?.message ?? error}`);
      return next();
    }
  };

  try {
    ctx.effect(
      () => ctx.on('llm/stream', listener, { prepend: true, global: true }),
      'dsh-auto-review-zh: llm/stream',
    );
    log(ctx, 'info', '[dsh-auto-review-zh] llm/stream listener registered');
  } catch (error) {
    log(ctx, 'error', `[dsh-auto-review-zh] failed to register listener: ${error?.message ?? error}`);
  }
}
