/**
 * Property 16: 配置解析完整性 - 属性测试
 * **Validates: Requirements 1.3, 5.7, 9.3, 9.7**
 *
 * 使用 fast-check 验证 parseConfig 在各种随机输入下的正确性：
 * 1. 任意非空目录路径数组 → allowedDirectories 包含所有路径
 * 2. 任意逗号分隔命令白名单字符串 → 正确解析为数组
 * 3. 任意正整数超时值 → 正确解析为 commandTimeout
 * 4. 未设置环境变量时 → 使用默认值
 */
import * as fc from 'fast-check';
import { parseConfig, DEFAULT_COMMAND_WHITELIST } from './config';

describe('Property 16: 配置解析完整性', () => {
  const originalEnv = process.env;
  let mockExit: jest.SpyInstance;

  beforeEach(() => {
    // 隔离环境变量，避免测试间干扰
    process.env = { ...originalEnv };
    delete process.env.COMMAND_WHITELIST;
    delete process.env.COMMAND_TIMEOUT;
    delete process.env.MAX_SEARCH_RESULTS;

    // mock process.exit 防止测试进程退出
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
