import { parseConfig, parseWhitelist, DEFAULT_COMMAND_WHITELIST, ServerConfig } from './config';

describe('配置解析模块', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.COMMAND_WHITELIST;
    delete process.env.COMMAND_TIMEOUT;
    delete process.env.MAX_SEARCH_RESULTS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('parseConfig', () => {
    it('应正确解析单个目录参数', () => {
      const config = parseConfig(['/data/project']);
      expect(config.allowedDirectories).toEqual(['/data/project']);
    });

    it('应正确解析多个目录参数', () => {
      const config = parseConfig(['/data/project1', '/data/project2', '/home/user']);
      expect(config.allowedDirectories).toEqual(['/data/project1', '/data/project2', '/home/user']);
    });

    it('无参数时应输出错误并退出进程', () => {
      const mockStderrWrite = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      expect(() => parseConfig([])).toThrow('process.exit called');
      expect(mockStderrWrite).toHaveBeenCalledWith(
        expect.stringContaining('NO_ALLOWED_DIRS')
      );
      expect(mockExit).toHaveBeenCalledWith(1);

      mockStderrWrite.mockRestore();
      mockExit.mockRestore();
    });

    it('未设置 COMMAND_WHITELIST 时应使用默认白名单', () => {
      const config = parseConfig(['/data/project']);
      expect(config.commandWhitelist).toEqual(DEFAULT_COMMAND_WHITELIST);
    });

    it('应从环境变量 COMMAND_WHITELIST 解析逗号分隔的命令白名单', () => {
      process.env.COMMAND_WHITELIST = 'npm *,git *,node *';
      const config = parseConfig(['/data/project']);
      expect(config.commandWhitelist).toEqual(['npm *', 'git *', 'node *']);
    });

    it('应正确处理 COMMAND_WHITELIST 中的空格和空项', () => {
      process.env.COMMAND_WHITELIST = ' npm * , git * , , node * ';
      const config = parseConfig(['/data/project']);
      expect(config.commandWhitelist).toEqual(['npm *', 'git *', 'node *']);
    });

    it('未设置 COMMAND_TIMEOUT 时应使用默认值 30000ms', () => {
      const config = parseConfig(['/data/project']);
      expect(config.commandTimeout).toBe(30000);
    });

    it('应从环境变量 COMMAND_TIMEOUT 解析超时时间', () => {
      process.env.COMMAND_TIMEOUT = '60000';
      const config = parseConfig(['/data/project']);
      expect(config.commandTimeout).toBe(60000);
    });

    it('COMMAND_TIMEOUT 为非数字时应使用默认值', () => {
      process.env.COMMAND_TIMEOUT = 'invalid';
      const mockStderrWrite = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const config = parseConfig(['/data/project']);
      expect(config.commandTimeout).toBe(30000);
      mockStderrWrite.mockRestore();
    });

    it('未设置 MAX_SEARCH_RESULTS 时应使用默认值 500', () => {
      const config = parseConfig(['/data/project']);
      expect(config.maxSearchResults).toBe(500);
    });

    it('应从环境变量 MAX_SEARCH_RESULTS 解析搜索结果上限', () => {
      process.env.MAX_SEARCH_RESULTS = '1000';
      const config = parseConfig(['/data/project']);
      expect(config.maxSearchResults).toBe(1000);
    });

    it('MAX_SEARCH_RESULTS 为非数字时应使用默认值', () => {
      process.env.MAX_SEARCH_RESULTS = 'abc';
      const config = parseConfig(['/data/project']);
      expect(config.maxSearchResults).toBe(500);
    });

    // === 新增测试用例 ===

    it('空字符串 COMMAND_WHITELIST 应使用默认白名单', () => {
      process.env.COMMAND_WHITELIST = '';
      const mockStderrWrite = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const config = parseConfig(['/data/project']);
      expect(config.commandWhitelist).toEqual(DEFAULT_COMMAND_WHITELIST);
      expect(mockStderrWrite).toHaveBeenCalledWith(
        expect.stringContaining('COMMAND_WHITELIST 为空字符串'),
      );
      mockStderrWrite.mockRestore();
    });

    it('JSON 数组格式 COMMAND_WHITELIST 应正确解析', () => {
      process.env.COMMAND_WHITELIST = '["npm *","git *"]';
      const config = parseConfig(['/data/project']);
      expect(config.commandWhitelist).toEqual(['npm *', 'git *']);
    });

    it('以 [ 开头但无效 JSON 应回退逗号分隔解析', () => {
      process.env.COMMAND_WHITELIST = '[invalid json,npm *';
      const mockStderrWrite = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const config = parseConfig(['/data/project']);
      // 回退到逗号分隔：'[invalid json' 和 'npm *'
      expect(config.commandWhitelist).toContain('npm *');
      expect(mockStderrWrite).toHaveBeenCalledWith(
        expect.stringContaining('JSON 解析失败'),
      );
      mockStderrWrite.mockRestore();
    });

    it('JSON 数组包含非字符串元素应忽略非字符串', () => {
      process.env.COMMAND_WHITELIST = '["npm *", 123, "git *", null]';
      const mockStderrWrite = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const config = parseConfig(['/data/project']);
      expect(config.commandWhitelist).toEqual(['npm *', 'git *']);
      expect(mockStderrWrite).toHaveBeenCalledWith(
        expect.stringContaining('非字符串元素'),
      );
      mockStderrWrite.mockRestore();
    });

    it('COMMAND_TIMEOUT 为 0 应使用默认值', () => {
      process.env.COMMAND_TIMEOUT = '0';
      const mockStderrWrite = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const config = parseConfig(['/data/project']);
      expect(config.commandTimeout).toBe(30000);
      expect(mockStderrWrite).toHaveBeenCalledWith(
        expect.stringContaining('不是有效的正整数'),
      );
      mockStderrWrite.mockRestore();
    });

    it('COMMAND_TIMEOUT 为负数应使用默认值', () => {
      process.env.COMMAND_TIMEOUT = '-5000';
      const mockStderrWrite = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const config = parseConfig(['/data/project']);
      expect(config.commandTimeout).toBe(30000);
      expect(mockStderrWrite).toHaveBeenCalledWith(
        expect.stringContaining('不是有效的正整数'),
      );
      mockStderrWrite.mockRestore();
    });

    it('应输出配置摘要到 stderr', () => {
      const mockStderrWrite = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      parseConfig(['/data/project1', '/data/project2']);
      expect(mockStderrWrite).toHaveBeenCalledWith(
        expect.stringContaining('配置摘要'),
      );
      expect(mockStderrWrite).toHaveBeenCalledWith(
        expect.stringContaining('允许目录=2个'),
      );
      mockStderrWrite.mockRestore();
    });
  });

  describe('parseWhitelist', () => {
    it('undefined 应返回默认白名单', () => {
      const result = parseWhitelist(undefined);
      expect(result).toEqual(DEFAULT_COMMAND_WHITELIST);
    });

    it('空字符串应返回默认白名单', () => {
      const mockStderrWrite = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const result = parseWhitelist('');
      expect(result).toEqual(DEFAULT_COMMAND_WHITELIST);
      mockStderrWrite.mockRestore();
    });

    it('逗号分隔字符串应正确解析', () => {
      const result = parseWhitelist('npm *,git *,node *');
      expect(result).toEqual(['npm *', 'git *', 'node *']);
    });

    it('JSON 数组字符串应正确解析', () => {
      const result = parseWhitelist('["npm *","git *","node *"]');
      expect(result).toEqual(['npm *', 'git *', 'node *']);
    });

    it('无效 JSON 应回退逗号分隔', () => {
      const mockStderrWrite = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const result = parseWhitelist('[broken');
      // 回退逗号分隔，'[broken' 作为单个条目
      expect(result).toEqual(['[broken']);
      expect(mockStderrWrite).toHaveBeenCalledWith(
        expect.stringContaining('JSON 解析失败'),
      );
      mockStderrWrite.mockRestore();
    });

    it('JSON 数组中非字符串元素应被过滤', () => {
      const mockStderrWrite = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const result = parseWhitelist('["ls *", 42, true, "grep *"]');
      expect(result).toEqual(['ls *', 'grep *']);
      mockStderrWrite.mockRestore();
    });

    it('应 trim 每个条目并过滤空字符串', () => {
      const result = parseWhitelist(' npm * , , git * ');
      expect(result).toEqual(['npm *', 'git *']);
    });
  });

  describe('DEFAULT_COMMAND_WHITELIST', () => {
    it('应包含 13 个默认命令模式', () => {
      expect(DEFAULT_COMMAND_WHITELIST).toHaveLength(13);
    });

    it('应包含常用的只读命令', () => {
      expect(DEFAULT_COMMAND_WHITELIST).toContain('ls *');
      expect(DEFAULT_COMMAND_WHITELIST).toContain('cat *');
      expect(DEFAULT_COMMAND_WHITELIST).toContain('grep *');
      expect(DEFAULT_COMMAND_WHITELIST).toContain('find *');
    });

    it('应包含无参数命令', () => {
      expect(DEFAULT_COMMAND_WHITELIST).toContain('pwd');
      expect(DEFAULT_COMMAND_WHITELIST).toContain('whoami');
      expect(DEFAULT_COMMAND_WHITELIST).toContain('date');
    });
  });
});
