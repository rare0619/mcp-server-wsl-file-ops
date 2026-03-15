/**
 * 配置解析模块 - 属性测试
 *
 * Property 16: 配置解析完整性
 * **Validates: Requirements 1.3, 5.7, 9.3, 9.7**
 *
 * Property 8: 白名单配置解析往返
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.6**
 *
 * Property 9: 白名单条目清洗
 * **Validates: Requirements 2.6**
 */
import * as fc from 'fast-check';
import { parseConfig, parseWhitelist, DEFAULT_COMMAND_WHITELIST } from './config';

describe('Property 16: 配置解析完整性', () => {
  const originalEnv = process.env;
  let mockExit: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.COMMAND_WHITELIST;
    delete process.env.COMMAND_TIMEOUT;
    delete process.env.MAX_SEARCH_RESULTS;

    mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    mockExit.mockRestore();
  });

  /**
   * 属性 1: 对于任意非空的目录路径数组，parseConfig 应返回包含所有路径的 allowedDirectories
   * **Validates: Requirements 1.3, 9.3**
   */
  it('任意非空目录路径数组 → allowedDirectories 应包含所有路径', () => {
    const dirPathArb = fc.stringMatching(/^\/[a-z][a-z0-9/]*$/);
    const dirArrayArb = fc.array(dirPathArb, { minLength: 1, maxLength: 10 });

    fc.assert(
      fc.property(dirArrayArb, (dirs) => {
        delete process.env.COMMAND_WHITELIST;
        delete process.env.COMMAND_TIMEOUT;
        delete process.env.MAX_SEARCH_RESULTS;

        const config = parseConfig(dirs);

        expect(config.allowedDirectories).toEqual(dirs);
        expect(config.allowedDirectories.length).toBe(dirs.length);
        for (const dir of dirs) {
          expect(config.allowedDirectories).toContain(dir);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * 属性 2: 对于任意逗号分隔的命令白名单字符串，parseConfig 应正确解析为数组
   * **Validates: Requirements 5.7, 9.7**
   */
  it('任意逗号分隔命令白名单 → 应正确解析为数组', () => {
    const cmdPatternArb = fc.stringMatching(/^[a-z]+( \*)?$/);
    const cmdArrayArb = fc.array(cmdPatternArb, { minLength: 1, maxLength: 8 });

    fc.assert(
      fc.property(cmdArrayArb, (cmds) => {
        process.env.COMMAND_WHITELIST = cmds.join(',');
        delete process.env.COMMAND_TIMEOUT;
        delete process.env.MAX_SEARCH_RESULTS;

        const config = parseConfig(['/data/test']);

        expect(config.commandWhitelist).toEqual(cmds);
        expect(config.commandWhitelist.length).toBe(cmds.length);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * 属性 3: 对于任意正整数超时值，parseConfig 应正确解析为 commandTimeout
   * **Validates: Requirements 5.7**
   */
  it('任意正整数超时值 → 应正确解析为 commandTimeout', () => {
    const positiveIntArb = fc.integer({ min: 1, max: 600000 });

    fc.assert(
      fc.property(positiveIntArb, (timeout) => {
        process.env.COMMAND_TIMEOUT = String(timeout);
        delete process.env.COMMAND_WHITELIST;
        delete process.env.MAX_SEARCH_RESULTS;

        const config = parseConfig(['/data/test']);

        expect(config.commandTimeout).toBe(timeout);
        expect(config.commandTimeout).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * 属性 4: 未设置环境变量时，应使用默认值
   * **Validates: Requirements 5.7, 9.7**
   */
  it('未设置环境变量时 → 应使用默认值', () => {
    const dirPathArb = fc.stringMatching(/^\/[a-z][a-z0-9/]*$/);
    const dirArrayArb = fc.array(dirPathArb, { minLength: 1, maxLength: 10 });

    fc.assert(
      fc.property(dirArrayArb, (dirs) => {
        delete process.env.COMMAND_WHITELIST;
        delete process.env.COMMAND_TIMEOUT;
        delete process.env.MAX_SEARCH_RESULTS;

        const config = parseConfig(dirs);

        expect(config.commandWhitelist).toEqual(DEFAULT_COMMAND_WHITELIST);
        expect(config.commandTimeout).toBe(30000);
        expect(config.maxSearchResults).toBe(500);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: wsl-file-ops-improvements, Property 8: 白名单配置解析往返
describe('Property 8: 白名单配置解析往返', () => {
  let mockStderrWrite: jest.SpyInstance;

  beforeEach(() => {
    mockStderrWrite = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    mockStderrWrite.mockRestore();
  });

  /**
   * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.6**
   *
   * 生成随机字符串数组（元素不含逗号且非空），验证 JSON 数组和逗号分隔两种格式的解析往返一致
   */
  it('JSON 数组格式和逗号分隔格式的解析往返应一致', () => {
    // 生成不含逗号、不含引号、非空、trim 后不变的字符串
    const cmdArb = fc
      .stringMatching(/^[a-z][a-z0-9 *\-_.]+$/)
      .filter((s) => s.trim() === s && s.length > 0);
    const cmdArrayArb = fc.array(cmdArb, { minLength: 1, maxLength: 10 });

    fc.assert(
      fc.property(cmdArrayArb, (cmds) => {
        // JSON 数组格式
        const jsonStr = JSON.stringify(cmds);
        const jsonResult = parseWhitelist(jsonStr);

        // 逗号分隔格式
        const csvStr = cmds.join(',');
        const csvResult = parseWhitelist(csvStr);

        // 两种格式解析结果应一致
        expect(jsonResult).toEqual(cmds);
        expect(csvResult).toEqual(cmds);
        expect(jsonResult).toEqual(csvResult);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: wsl-file-ops-improvements, Property 9: 白名单条目清洗
describe('Property 9: 白名单条目清洗', () => {
  let mockStderrWrite: jest.SpyInstance;

  beforeEach(() => {
    mockStderrWrite = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    mockStderrWrite.mockRestore();
  });

  /**
   * **Validates: Requirements 2.6**
   *
   * 生成包含空白和空字符串的输入，验证解析后不包含空字符串且每个条目首尾无空白
   */
  it('解析后不应包含空字符串且每个条目首尾无空白', () => {
    // 生成可能包含前后空白的字符串
    const paddedCmdArb = fc.tuple(
      fc.stringOf(fc.constantFrom(' ', '\t'), { minLength: 0, maxLength: 3 }),
      fc.oneof(
        fc.stringMatching(/^[a-z][a-z0-9 *]+$/),
        fc.constant(''),
      ),
      fc.stringOf(fc.constantFrom(' ', '\t'), { minLength: 0, maxLength: 3 }),
    ).map(([pre, cmd, post]) => `${pre}${cmd}${post}`);

    const cmdArrayArb = fc.array(paddedCmdArb, { minLength: 1, maxLength: 10 });

    fc.assert(
      fc.property(cmdArrayArb, (cmds) => {
        // 逗号分隔格式
        const csvStr = cmds.join(',');
        const result = parseWhitelist(csvStr);

        // 验证：不包含空字符串
        for (const item of result) {
          expect(item.length).toBeGreaterThan(0);
        }

        // 验证：每个条目首尾无空白
        for (const item of result) {
          expect(item).toBe(item.trim());
        }
      }),
      { numRuns: 100 },
    );
  });

  it('JSON 数组格式解析后也不应包含空字符串且首尾无空白', () => {
    const paddedCmdArb = fc.tuple(
      fc.stringOf(fc.constantFrom(' ', '\t'), { minLength: 0, maxLength: 3 }),
      fc.oneof(
        fc.stringMatching(/^[a-z][a-z0-9 *]+$/),
        fc.constant(''),
      ),
      fc.stringOf(fc.constantFrom(' ', '\t'), { minLength: 0, maxLength: 3 }),
    ).map(([pre, cmd, post]) => `${pre}${cmd}${post}`);

    const cmdArrayArb = fc.array(paddedCmdArb, { minLength: 1, maxLength: 10 });

    fc.assert(
      fc.property(cmdArrayArb, (cmds) => {
        // JSON 数组格式
        const jsonStr = JSON.stringify(cmds);
        const result = parseWhitelist(jsonStr);

        // 验证：不包含空字符串
        for (const item of result) {
          expect(item.length).toBeGreaterThan(0);
        }

        // 验证：每个条目首尾无空白
        for (const item of result) {
          expect(item).toBe(item.trim());
        }
      }),
      { numRuns: 100 },
    );
  });
});
