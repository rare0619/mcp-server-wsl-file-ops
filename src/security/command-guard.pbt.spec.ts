/**
 * 命令守卫属性测试
 * 使用 fast-check 验证 CommandGuard 在各种随机输入下的正确性
 *
 * Property 8: 命令白名单匹配算法
 * Property 9: 危险命令检测优先级高于白名单
 * Property 10: 管道命令允许通过
 * Property 11: 危险操作符拒绝
 * Property 12: 管道命令子命令独立检查
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
 * Property 10: 管道命令允许通过
 * **Validates: Requirements 3.1, 3.4**
 *
 * 生成白名单命令的管道组合，验证 sanitizeCommand 不抛异常且 checkPipelineCommand 返回 allowed: true
 */
describe('Property 10: 管道命令允许通过', () => {
  // 白名单命令名称生成器
  const whitelistCmds = ['ls', 'cat', 'head', 'tail', 'grep', 'find', 'wc', 'echo', 'which', 'file'];
  const cmdArb = fc.constantFrom(...whitelistCmds);
  // 安全参数生成器（不含管道、分号、&&、||、反引号、$( 以及 ../ 等特殊字符）
  const safeArgArb = fc.stringMatching(/^[a-zA-Z0-9._-]{1,15}$/);

  // 生成一个带参数的白名单命令
  const whitelistCommandArb = fc.tuple(cmdArb, safeArgArb).map(([cmd, arg]) => `${cmd} ${arg}`);

  // 白名单模式列表
  const whitelist = whitelistCmds.map((cmd) => cmd + ' *');

  it('白名单命令的管道组合 -> sanitizeCommand 不抛异常且 checkPipelineCommand 返回 allowed: true', () => {
    // 生成 2-4 个白名单命令组成的管道
    const pipelineArb = fc.array(whitelistCommandArb, { minLength: 2, maxLength: 4 })
      .map((cmds) => cmds.join(' | '));

    fc.assert(
      fc.property(pipelineArb, (pipeline) => {
        const guard = new CommandGuard(whitelist);

        // sanitizeCommand 不应抛出异常
        expect(() => guard.sanitizeCommand(pipeline)).not.toThrow();

        // checkPipelineCommand 应返回 allowed: true
        const result = guard.checkPipelineCommand(pipeline);
        expect(result.allowed).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('单个白名单命令（非管道）-> sanitizeCommand 不抛异常', () => {
    const safeCmdArb = fc.stringMatching(/^[a-z]{2,10}( [a-zA-Z0-9._-]+){0,3}$/);

    fc.assert(
      fc.property(safeCmdArb, (cmd) => {
        const guard = new CommandGuard([]);
        const result = guard.sanitizeCommand(cmd);
        expect(result).toBe(cmd.trim());
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 11: 危险操作符拒绝
 * **Validates: Requirements 3.2, 3.3, 3.7, 3.8**
 *
 * 生成包含 &&、||、;、反引号或 $() 的命令字符串，验证 sanitizeCommand 抛出异常
 */
describe('Property 11: 危险操作符拒绝', () => {
  const guard = new CommandGuard([]);
  const cmdPartArb = fc.stringMatching(/^[a-z]{2,10}$/);

  it('包含 ; 的命令 -> sanitizeCommand 抛出异常', () => {
    fc.assert(
      fc.property(cmdPartArb, cmdPartArb, (before, after) => {
        const malicious = `${before}; ${after}`;
        expect(() => guard.sanitizeCommand(malicious)).toThrow('检测到 shell 元字符注入 (;)');
      }),
      { numRuns: 100 },
    );
  });

  it('包含 && 的命令 -> sanitizeCommand 抛出异常', () => {
    fc.assert(
      fc.property(cmdPartArb, cmdPartArb, (before, after) => {
        const malicious = `${before} && ${after}`;
        expect(() => guard.sanitizeCommand(malicious)).toThrow('检测到 shell 元字符注入 (&&)');
      }),
      { numRuns: 100 },
    );
  });

  it('包含 || 的命令 -> sanitizeCommand 抛出异常', () => {
    fc.assert(
      fc.property(cmdPartArb, cmdPartArb, (before, after) => {
        const malicious = `${before} || ${after}`;
        expect(() => guard.sanitizeCommand(malicious)).toThrow('检测到 shell 元字符注入 (||)');
      }),
      { numRuns: 100 },
    );
  });

  it('包含反引号的命令 -> sanitizeCommand 抛出异常', () => {
    fc.assert(
      fc.property(cmdPartArb, cmdPartArb, (before, inner) => {
        const malicious = `${before} \`${inner}\``;
        expect(() => guard.sanitizeCommand(malicious)).toThrow('检测到 shell 元字符注入 (`)');
      }),
      { numRuns: 100 },
    );
  });

  it('包含 $() 的命令 -> sanitizeCommand 抛出异常', () => {
    fc.assert(
      fc.property(cmdPartArb, cmdPartArb, (before, inner) => {
        const malicious = `${before} $(${inner})`;
        expect(() => guard.sanitizeCommand(malicious)).toThrow('检测到 shell 元字符注入 ($())');
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 12: 管道命令子命令独立检查
 * **Validates: Requirements 3.4, 3.5, 3.6, 6.4**
 *
 * 生成包含非白名单子命令的管道，验证 checkPipelineCommand 返回 allowed: false
 * 且 failedCommandIndex 和 failedCommand 正确指向第一个失败子命令
 */
describe('Property 12: 管道命令子命令独立检查', () => {
  const whitelistCmds = ['ls', 'cat', 'head', 'tail', 'grep', 'find', 'wc', 'echo'];
  const whitelist = whitelistCmds.map((cmd) => cmd + ' *');

  // 非白名单命令生成器
  const nonWhitelistCmds = ['npm', 'docker', 'curl', 'wget', 'python', 'ruby', 'sh', 'bash'];
  const nonWhitelistCmdArb = fc.constantFrom(...nonWhitelistCmds);
  const safeArgArb = fc.stringMatching(/^[a-zA-Z0-9._-]{1,10}$/);

  // 白名单命令生成器
  const whitelistCmdArb = fc.constantFrom(...whitelistCmds);
  const whitelistCommandArb = fc.tuple(whitelistCmdArb, safeArgArb).map(([cmd, arg]) => `${cmd} ${arg}`);

  // 非白名单命令（带参数）
  const nonWhitelistCommandArb = fc.tuple(nonWhitelistCmdArb, safeArgArb).map(([cmd, arg]) => `${cmd} ${arg}`);

  it('管道中包含非白名单子命令 -> allowed: false 且 failedCommandIndex 正确', () => {
    // 生成 0-2 个白名单命令作为前缀，然后插入一个非白名单命令
    const prefixArb = fc.array(whitelistCommandArb, { minLength: 0, maxLength: 2 });

    fc.assert(
      fc.property(prefixArb, nonWhitelistCommandArb, (prefix, badCmd) => {
        const guard = new CommandGuard(whitelist);
        const pipeline = [...prefix, badCmd].join(' | ');
        const result = guard.checkPipelineCommand(pipeline);

        expect(result.allowed).toBe(false);
        expect(result.failedCommandIndex).toBe(prefix.length);
        expect(result.failedCommand).toBe(badCmd);
        expect(result.requiresAuth).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('所有子命令都在白名单中 -> allowed: true', () => {
    const pipelineArb = fc.array(whitelistCommandArb, { minLength: 1, maxLength: 4 })
      .map((cmds) => cmds.join(' | '));

    fc.assert(
      fc.property(pipelineArb, (pipeline) => {
        const guard = new CommandGuard(whitelist);
        const result = guard.checkPipelineCommand(pipeline);
        expect(result.allowed).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
