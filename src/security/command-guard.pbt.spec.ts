/**
 * 命令守卫属性测试
 * 使用 fast-check 验证 CommandGuard 在各种随机输入下的正确性
 *
 * Property 8: 命令白名单匹配算法
 * Property 9: 危险命令检测优先级高于白名单
 * Property 10: 命令消毒处理
 */
import * as fc from 'fast-check';
import { CommandGuard, DANGEROUS_KEYWORDS } from './command-guard';

/**
 * Property 8: 命令白名单匹配算法
 * **Validates: Requirements 5.8, 5.9, 5.11**
 */
describe('Property 8: 命令白名单匹配算法', () => {
  const cmdNameArb = fc.stringMatching(/^[a-z]{2,10}$/);

  it('精确命令在白名单中 -> matchesWhitelist 返回 true', () => {
    fc.assert(
      fc.property(cmdNameArb, (cmd) => {
        const guard = new CommandGuard([cmd]);
        expect(guard.matchesWhitelist(cmd)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('通配符模式 -> 任意参数的同名命令都匹配', () => {
    const argsArb = fc.stringMatching(/^[a-zA-Z0-9 .\\/_-]{1,30}$/);

    fc.assert(
      fc.property(cmdNameArb, argsArb, (cmd, args) => {
        const guard = new CommandGuard([cmd + ' *']);
        const fullCommand = cmd + ' ' + args;
        expect(guard.matchesWhitelist(fullCommand)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('不在白名单中的命令 -> matchesWhitelist 返回 false', () => {
    fc.assert(
      fc.property(cmdNameArb, cmdNameArb, (whitelistedCmd, testCmd) => {
        fc.pre(whitelistedCmd !== testCmd);
        const guard = new CommandGuard([whitelistedCmd]);
        expect(guard.matchesWhitelist(testCmd)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 9: 危险命令检测优先级高于白名单
 * **Validates: Requirements 5.13**
 */
describe('Property 9: 危险命令检测优先级高于白名单', () => {
  const cmdNameArb = fc.stringMatching(/^[a-z]{2,10}$/);
  const dangerousKeywordArb = fc.constantFrom(...DANGEROUS_KEYWORDS);

  it('包含危险关键词的白名单命令 -> allowed: false 且 requiresAuth: true', () => {
    fc.assert(
      fc.property(cmdNameArb, dangerousKeywordArb, (cmd, keyword) => {
        const guard = new CommandGuard([cmd + ' *']);
        const dangerousCommand = cmd + ' ' + keyword;
        const result = guard.checkCommand(dangerousCommand);

        expect(result.allowed).toBe(false);
        expect(result.requiresAuth).toBe(true);
        expect(result.dangerousKeywords).toBeDefined();
        expect(result.dangerousKeywords!.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('不包含危险关键词的白名单命令 -> allowed: true', () => {
    const safeArgsArb = fc.stringMatching(/^[a-z]{1,15}$/);

    fc.assert(
      fc.property(cmdNameArb, safeArgsArb, (cmd, args) => {
        const guard = new CommandGuard([cmd + ' *']);
        const safeCommand = cmd + ' ' + args;

        const keywords = guard.containsDangerousKeywords(safeCommand);
        fc.pre(keywords.length === 0);

        const result = guard.checkCommand(safeCommand);
        expect(result.allowed).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 10: 命令消毒处理
 * **Validates: Requirements 5.14**
 */
describe('Property 10: 命令消毒处理', () => {
  const injectionCharArb = fc.constantFrom(';', '&&', '||');

  it('包含 shell 注入字符的命令 -> sanitizeCommand 抛出错误', () => {
    const guard = new CommandGuard([]);
    const cmdPartArb = fc.stringMatching(/^[a-z]{2,10}$/);

    fc.assert(
      fc.property(cmdPartArb, injectionCharArb, cmdPartArb, (before, inject, after) => {
        const maliciousCommand = before + ' ' + inject + ' ' + after;
        expect(() => guard.sanitizeCommand(maliciousCommand)).toThrow();
      }),
      { numRuns: 100 },
    );
  });

  it('包含路径遍历模式的命令 -> sanitizeCommand 抛出错误', () => {
    const guard = new CommandGuard([]);
    const prefixArb = fc.stringMatching(/^[a-z]{2,10}$/);
    const suffixArb = fc.stringMatching(/^[a-z]{1,10}$/);

    fc.assert(
      fc.property(prefixArb, suffixArb, (prefix, suffix) => {
        const traversalCommand = prefix + ' ../' + suffix;
        expect(() => guard.sanitizeCommand(traversalCommand)).toThrow();
      }),
      { numRuns: 100 },
    );
  });

  it('安全的简单命令 -> sanitizeCommand 返回原命令（trim 后）', () => {
    const guard = new CommandGuard([]);
    const safeCmdArb = fc.stringMatching(/^[a-z]{2,10}( [a-zA-Z0-9._-]+){0,3}$/);

    fc.assert(
      fc.property(safeCmdArb, (cmd) => {
        const result = guard.sanitizeCommand(cmd);
        expect(result).toBe(cmd.trim());
      }),
      { numRuns: 100 },
    );
  });
});
