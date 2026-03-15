/**
 * 命令守卫单元测试
 * 验证白名单匹配、危险命令检测、命令消毒、管道命令支持和综合检查逻辑
 */

import { CommandGuard, DANGEROUS_KEYWORDS } from './command-guard.js';

describe('CommandGuard', () => {
  const defaultWhitelist = [
    'ls *',
    'cat *',
    'head *',
    'tail *',
    'grep *',
    'find *',
    'wc *',
    'echo *',
    'pwd',
    'whoami',
    'date',
    'which *',
    'file *',
  ];

  let guard: CommandGuard;

  beforeEach(() => {
    guard = new CommandGuard(defaultWhitelist);
  });

  describe('matchesWhitelist', () => {
    it('精确匹配无参数命令', () => {
      expect(guard.matchesWhitelist('pwd')).toBe(true);
      expect(guard.matchesWhitelist('whoami')).toBe(true);
      expect(guard.matchesWhitelist('date')).toBe(true);
    });

    it('通配符匹配带参数命令', () => {
      expect(guard.matchesWhitelist('ls -la')).toBe(true);
      expect(guard.matchesWhitelist('cat /tmp/test.txt')).toBe(true);
      expect(guard.matchesWhitelist('grep -r pattern src/')).toBe(true);
      expect(guard.matchesWhitelist('echo hello world')).toBe(true);
    });

    it('拒绝不在白名单中的命令', () => {
      expect(guard.matchesWhitelist('npm install')).toBe(false);
      expect(guard.matchesWhitelist('rm file.txt')).toBe(false);
      expect(guard.matchesWhitelist('docker ps')).toBe(false);
    });

    it('空命令返回 false', () => {
      expect(guard.matchesWhitelist('')).toBe(false);
      expect(guard.matchesWhitelist('   ')).toBe(false);
    });

    it('精确匹配命令不允许带参数', () => {
      expect(guard.matchesWhitelist('pwd -L')).toBe(false);
    });
  });

  describe('containsDangerousKeywords', () => {
    it('检测到 rm -rf', () => {
      const result = guard.containsDangerousKeywords('rm -rf /');
      expect(result).toContain('rm -rf');
    });

    it('检测到 shutdown', () => {
      const result = guard.containsDangerousKeywords('shutdown -h now');
      expect(result).toContain('shutdown');
    });

    it('检测到 chmod 777', () => {
      const result = guard.containsDangerousKeywords('chmod 777 /tmp/file');
      expect(result).toContain('chmod 777');
    });

    it('检测到 fork bomb', () => {
      const result = guard.containsDangerousKeywords(':(){ :|:& };:');
      expect(result).toContain(':(){ :|:& };:');
    });

    it('安全命令返回空数组', () => {
      const result = guard.containsDangerousKeywords('ls -la');
      expect(result).toHaveLength(0);
    });

    it('检测多个危险关键词', () => {
      const result = guard.containsDangerousKeywords('rm -rf / && shutdown');
      expect(result).toContain('rm -rf');
      expect(result).toContain('shutdown');
    });
  });

  describe('sanitizeCommand', () => {
    it('检测路径遍历模式', () => {
      expect(() => guard.sanitizeCommand('cat ../../etc/passwd')).toThrow(
        '检测到路径遍历模式',
      );
    });

    it('检测分号注入', () => {
      expect(() => guard.sanitizeCommand('ls; rm -rf /')).toThrow(
        '检测到 shell 元字符注入 (;)',
      );
    });

    it('检测 && 注入', () => {
      expect(() => guard.sanitizeCommand('echo hello && rm -rf /')).toThrow(
        '检测到 shell 元字符注入 (&&)',
      );
    });

    it('检测 || 注入', () => {
      expect(() => guard.sanitizeCommand('false || rm -rf /')).toThrow(
        '检测到 shell 元字符注入 (||)',
      );
    });

    it('检测反引号注入', () => {
      expect(() => guard.sanitizeCommand('echo `whoami`')).toThrow(
        '检测到 shell 元字符注入 (`)',
      );
    });

    it('检测 $() 注入', () => {
      expect(() => guard.sanitizeCommand('echo $(whoami)')).toThrow(
        '检测到 shell 元字符注入 ($())',
      );
    });

    it('管道命令允许通过', () => {
      // 管道不再被 sanitizeCommand 拒绝
      expect(guard.sanitizeCommand('cat file | sh')).toBe('cat file | sh');
      expect(guard.sanitizeCommand('grep foo file | head -10')).toBe('grep foo file | head -10');
      expect(guard.sanitizeCommand('cat file | grep foo | head -10')).toBe('cat file | grep foo | head -10');
    });

    it('安全命令正常返回', () => {
      expect(guard.sanitizeCommand('ls -la')).toBe('ls -la');
      expect(guard.sanitizeCommand('  pwd  ')).toBe('pwd');
    });
  });

  describe('splitPipeline', () => {
    it('拆分单管道命令', () => {
      const result = guard.splitPipeline('grep foo file | head -10');
      expect(result.isPipeline).toBe(true);
      expect(result.commands).toEqual(['grep foo file', 'head -10']);
    });

    it('拆分多管道命令', () => {
      const result = guard.splitPipeline('cat file | grep foo | head -10');
      expect(result.isPipeline).toBe(true);
      expect(result.commands).toEqual(['cat file', 'grep foo', 'head -10']);
    });

    it('非管道命令', () => {
      const result = guard.splitPipeline('ls -la');
      expect(result.isPipeline).toBe(false);
      expect(result.commands).toEqual(['ls -la']);
    });

    it('子命令自动 trim', () => {
      const result = guard.splitPipeline('  grep foo  |  head -10  ');
      expect(result.commands).toEqual(['grep foo', 'head -10']);
    });

    it('空命令拆分', () => {
      const result = guard.splitPipeline('');
      expect(result.isPipeline).toBe(false);
      expect(result.commands).toEqual(['']);
    });
  });

  describe('checkPipelineCommand', () => {
    it('单管道命令通过白名单检查', () => {
      const result = guard.checkPipelineCommand('grep foo file | head -10');
      expect(result.allowed).toBe(true);
    });

    it('多管道命令通过白名单检查', () => {
      const result = guard.checkPipelineCommand('cat file | grep foo | head -10');
      expect(result.allowed).toBe(true);
    });

    it('管道中包含非白名单命令被拒绝', () => {
      const result = guard.checkPipelineCommand('cat file | sh');
      expect(result.allowed).toBe(false);
      expect(result.failedCommandIndex).toBe(1);
      expect(result.failedCommand).toBe('sh');
      expect(result.requiresAuth).toBe(true);
    });

    it('管道中包含危险命令被拒绝', () => {
      const result = guard.checkPipelineCommand('cat file | rm -rf /');
      expect(result.allowed).toBe(false);
      expect(result.dangerousKeywords).toContain('rm -rf');
      expect(result.requiresAuth).toBe(true);
    });

    it('第一个子命令不在白名单时拒绝', () => {
      const result = guard.checkPipelineCommand('npm install | grep success');
      expect(result.allowed).toBe(false);
      expect(result.failedCommandIndex).toBe(0);
      expect(result.failedCommand).toBe('npm install');
    });

    it('非管道白名单命令通过', () => {
      const result = guard.checkPipelineCommand('ls -la');
      expect(result.allowed).toBe(true);
    });

    it('系统目录工作目录拒绝', () => {
      const result = guard.checkPipelineCommand('ls -la', '/etc');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('系统关键目录');
    });

    it('failedCommandIndex 和 failedCommand 正确指向第一个失败子命令', () => {
      const result = guard.checkPipelineCommand('cat file | npm run | docker ps');
      expect(result.allowed).toBe(false);
      expect(result.failedCommandIndex).toBe(1);
      expect(result.failedCommand).toBe('npm run');
    });
  });

  describe('checkCommand', () => {
    it('白名单命令允许执行', () => {
      const result = guard.checkCommand('ls -la');
      expect(result.allowed).toBe(true);
    });

    it('危险命令拒绝并要求授权', () => {
      const result = guard.checkCommand('rm -rf /tmp');
      expect(result.allowed).toBe(false);
      expect(result.requiresAuth).toBe(true);
      expect(result.dangerousKeywords).toContain('rm -rf');
    });

    it('系统目录工作目录拒绝', () => {
      const result = guard.checkCommand('ls', '/etc');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('系统关键目录');
    });

    it('系统子目录工作目录拒绝', () => {
      const result = guard.checkCommand('ls', '/etc/nginx');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('系统关键目录');
    });

    it('非白名单命令拒绝并要求授权', () => {
      const result = guard.checkCommand('npm install');
      expect(result.allowed).toBe(false);
      expect(result.requiresAuth).toBe(true);
      expect(result.reason).toContain('不在白名单中');
    });

    it('危险命令优先级高于白名单', () => {
      const guardWithRm = new CommandGuard(['rm *']);
      const result = guardWithRm.checkCommand('rm -rf /');
      expect(result.allowed).toBe(false);
      expect(result.requiresAuth).toBe(true);
      expect(result.dangerousKeywords).toContain('rm -rf');
    });

    it('正常工作目录不影响白名单命令', () => {
      const result = guard.checkCommand('ls -la', '/data/project');
      expect(result.allowed).toBe(true);
    });

    it('管道命令通过 checkCommand 检查', () => {
      const result = guard.checkCommand('grep foo file | head -10');
      expect(result.allowed).toBe(true);
    });

    it('管道中非白名单命令通过 checkCommand 拒绝', () => {
      const result = guard.checkCommand('cat file | sh');
      expect(result.allowed).toBe(false);
      expect(result.requiresAuth).toBe(true);
    });
  });
});
