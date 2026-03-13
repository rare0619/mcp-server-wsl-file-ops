/**
 * 命令守卫单元测试
 * 验证白名单匹配、危险命令检测、命令消毒和综合检查逻辑
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
        '检测到 shell 元字符注入',
      );
    });

    it('检测 && 注入', () => {
      expect(() => guard.sanitizeCommand('echo hello && rm -rf /')).toThrow(
        '检测到 shell 元字符注入',
      );
    });

    it('检测 || 注入', () => {
      expect(() => guard.sanitizeCommand('false || rm -rf /')).toThrow(
        '检测到 shell 元字符注入',
      );
    });

    it('检测管道注入', () => {
      expect(() => guard.sanitizeCommand('cat file | sh')).toThrow(
        '检测到 shell 元字符注入',
      );
    });

    it('安全命令正常返回', () => {
      expect(guard.sanitizeCommand('ls -la')).toBe('ls -la');
      expect(guard.sanitizeCommand('  pwd  ')).toBe('pwd');
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
      expect(result.reason).toBe('命令不在白名单中');
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
  });
});
