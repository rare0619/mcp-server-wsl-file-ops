/**
 * 命令守卫模块
 * 负责命令白名单匹配、危险命令检测、命令消毒和管道命令支持
 * 需求引用: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 5.7, 5.8, 5.9, 5.11, 5.12, 5.13, 5.14, 5.15
 */

import * as path from 'path';
import { SYSTEM_PROTECTED_DIRS } from './path-validator.js';

/** 命令检查结果接口 */
export interface CommandCheckResult {
  /** 是否允许执行 */
  allowed: boolean;
  /** 拒绝原因 */
  reason?: string;
  /** 检测到的危险关键词 */
  dangerousKeywords?: string[];
  /** 是否需要授权 */
  requiresAuth?: boolean;
}

/** 管道命令拆分结果 */
export interface PipelineCommand {
  /** 管道拆分后的子命令列表 */
  commands: string[];
  /** 是否为管道命令 */
  isPipeline: boolean;
}

/** 管道命令检查结果 */
export interface PipelineCheckResult {
  /** 是否允许执行 */
  allowed: boolean;
  /** 拒绝原因 */
  reason?: string;
  /** 失败的子命令索引（0-based） */
  failedCommandIndex?: number;
  /** 失败的子命令文本 */
  failedCommand?: string;
  /** 检测到的危险关键词 */
  dangerousKeywords?: string[];
  /** 是否需要授权 */
  requiresAuth?: boolean;
}

/** 危险命令关键词列表 */
export const DANGEROUS_KEYWORDS: string[] = [
  'rm -rf',
  'rmdir',
  'mkfs',
  'dd if=',
  'shutdown',
  'reboot',
  'kill -9',
  'chmod 777',
  'chown',
  '> /dev',
  ':(){ :|:& };:',
];

/**
 * 命令守卫
 * 对命令执行进行多层安全检查：白名单匹配、危险命令检测、命令消毒、管道命令支持
 */
export class CommandGuard {
  /** 命令白名单模式列表 */
  private readonly commandWhitelist: string[];

  constructor(commandWhitelist: string[]) {
    this.commandWhitelist = commandWhitelist;
  }

  /**
   * 检查命令是否匹配白名单
   * 提取命令的第一个词（命令名称），与白名单模式匹配：
   * - 精确匹配：如 'pwd' 匹配 'pwd'
   * - 通配符匹配：如 'npm run build' 匹配 'npm *'
   * @param command - 待检查的命令字符串
   * @returns 是否匹配白名单
   */
  matchesWhitelist(command: string): boolean {
    const trimmed = command.trim();
    if (trimmed.length === 0) {
      return false;
    }

    // 提取命令的第一个词
    const commandName = trimmed.split(/\s+/)[0];

    for (const pattern of this.commandWhitelist) {
      const patternParts = pattern.trim().split(/\s+/);
      const patternCmd = patternParts[0];
      const hasWildcard = patternParts.length > 1 && patternParts[1] === '*';

      if (hasWildcard) {
        // 通配符模式：命令名称匹配即可，后面可以有任意参数
        if (commandName === patternCmd) {
          return true;
        }
      } else {
        // 精确匹配：整个命令必须完全等于模式（无参数的命令）
        if (trimmed === pattern.trim()) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 检测命令中是否包含危险关键词
   * @param command - 待检查的命令字符串
   * @returns 匹配到的危险关键词列表
   */
  containsDangerousKeywords(command: string): string[] {
    const matched: string[] = [];
    const lowerCommand = command.toLowerCase();

    for (const keyword of DANGEROUS_KEYWORDS) {
      if (lowerCommand.includes(keyword.toLowerCase())) {
        matched.push(keyword);
      }
    }

    return matched;
  }

  /**
   * 命令消毒处理
   * 检测并过滤危险 shell 操作符和路径遍历模式
   * 允许单管道 |，拒绝 ; && || 反引号 $()
   * @param command - 待消毒的命令字符串
   * @returns 清理后的命令
   * @throws Error - 检测到注入时抛出错误
   */
  sanitizeCommand(command: string): string {
    // 检测路径遍历模式
    if (/\.\.\//.test(command)) {
      throw new Error('检测到路径遍历模式 (../): 命令被拒绝');
    }

    // 检测危险 shell 操作符（允许单管道 |，拒绝 ; && || 反引号 $()）
    if (/;\s*\S/.test(command)) {
      throw new Error('检测到 shell 元字符注入 (;): 命令被拒绝');
    }
    if (/&&\s*\S/.test(command)) {
      throw new Error('检测到 shell 元字符注入 (&&): 命令被拒绝');
    }
    if (/\|\|\s*\S/.test(command)) {
      throw new Error('检测到 shell 元字符注入 (||): 命令被拒绝');
    }
    if (/`/.test(command)) {
      throw new Error('检测到 shell 元字符注入 (`): 命令被拒绝');
    }
    if (/\$\(/.test(command)) {
      throw new Error('检测到 shell 元字符注入 ($()): 命令被拒绝');
    }

    return command.trim();
  }

  /**
   * 拆分管道命令
   * 按 | 拆分命令，trim 每个子命令
   * @param command - 待拆分的命令字符串
   * @returns 管道命令拆分结果
   */
  splitPipeline(command: string): PipelineCommand {
    const parts = command.split('|').map((part) => part.trim());
    return {
      commands: parts,
      isPipeline: parts.length > 1,
    };
  }

  /**
   * 检查管道命令
   * 先对完整命令做危险关键词检测，再拆分管道对每个子命令分别执行白名单和危险命令检查
   * @param command - 待检查的管道命令
   * @param workingDir - 可选的工作目录
   * @returns 管道命令检查结果
   */
  checkPipelineCommand(command: string, workingDir?: string): PipelineCheckResult {
    // 先对完整命令做危险关键词检测（避免管道拆分后丢失跨管道的危险模式）
    const fullDangerousKeywords = this.containsDangerousKeywords(command);
    if (fullDangerousKeywords.length > 0) {
      return {
        allowed: false,
        requiresAuth: true,
        dangerousKeywords: fullDangerousKeywords,
        reason: '命令包含危险关键词: ' + fullDangerousKeywords.join(', '),
      };
    }

    const pipeline = this.splitPipeline(command);

    for (let i = 0; i < pipeline.commands.length; i++) {
      const subCommand = pipeline.commands[i];

      // 跳过空子命令
      if (subCommand.length === 0) {
        continue;
      }

      // 检测子命令的危险命令关键词
      const dangerousKeywords = this.containsDangerousKeywords(subCommand);
      if (dangerousKeywords.length > 0) {
        return {
          allowed: false,
          requiresAuth: true,
          dangerousKeywords,
          failedCommandIndex: i,
          failedCommand: subCommand,
          reason: `管道子命令 [${i}] "${subCommand}" 包含危险关键词: ${dangerousKeywords.join(', ')}`,
        };
      }

      // 检查工作目录是否涉及系统关键目录
      if (workingDir) {
        const normalizedDir = path.resolve(workingDir);
        const isSystemDir = SYSTEM_PROTECTED_DIRS.some(
          (dir) => normalizedDir === dir || normalizedDir.startsWith(dir + '/'),
        );
        if (isSystemDir) {
          return {
            allowed: false,
            failedCommandIndex: i,
            failedCommand: subCommand,
            reason: '工作目录涉及系统关键目录: ' + normalizedDir,
          };
        }
      }

      // 检查白名单
      if (!this.matchesWhitelist(subCommand)) {
        return {
          allowed: false,
          requiresAuth: true,
          failedCommandIndex: i,
          failedCommand: subCommand,
          reason: `管道子命令 [${i}] "${subCommand}" 不在白名单中`,
        };
      }
    }

    return {
      allowed: true,
    };
  }

  /**
   * 综合检查命令是否可以执行
   * 内部调用 checkPipelineCommand 支持管道命令
   * @param command - 待检查的命令
   * @param workingDir - 可选的工作目录
   * @returns 命令检查结果
   */
  checkCommand(command: string, workingDir?: string): CommandCheckResult {
    const result = this.checkPipelineCommand(command, workingDir);
    return {
      allowed: result.allowed,
      reason: result.reason,
      dangerousKeywords: result.dangerousKeywords,
      requiresAuth: result.requiresAuth,
    };
  }
}
