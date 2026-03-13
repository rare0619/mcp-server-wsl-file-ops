import { parseConfig, DEFAULT_COMMAND_WHITELIST, ServerConfig } from './config';

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

    it('应从环境变量 COMMAND_WHITELIST 解析命令白名单', () => {
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
      const config = parseConfig(['/data/project']);
      expect(config.commandTimeout).toBe(30000);
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
