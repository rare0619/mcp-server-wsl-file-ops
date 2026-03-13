/**
 * 路径验证器模块
 * 负责路径规范化、目录白名单验证和系统目录保护
 * 需求引用: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

import * as path from 'path';
import { ErrorCode } from '../errors.js';

/** 系统关键目录列表 - 写操作被禁止，读操作允许 */
export const SYSTEM_PROTECTED_DIRS: string[] = [
  '/etc',
  '/boot',
  '/sys',
  '/proc',
  '/dev',
  '/sbin',
  '/bin',
  '/usr/sbin',
];

/**
 * 路径验证异常
 * 继承 Error，包含错误码和详情，便于调用方捕获并转换为 MCP 错误响应
 */
export class PathValidationError extends Error {
  public readonly code: ErrorCode;
  public readonly details: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'PathValidationError';
    this.code = code;
    this.details = details;
  }
}

/**
 * 路径验证器
 * 验证文件操作路径是否在允许的目录范围内，并保护系统关键目录
 */
export class PathValidator {
  /** 规范化后的允许目录列表 */
  private readonly allowedDirectories: string[];

  constructor(allowedDirectories: string[]) {
    // 对传入的目录列表进行规范化处理并存储
    this.allowedDirectories = allowedDirectories.map((dir) =>
      path.resolve(dir),
    );
  }

  /**
   * 规范化路径
   * 使用 path.resolve 处理 ..、.、多余的 / 等，返回绝对路径
   * @param inputPath - 输入路径（可以是相对路径或绝对路径）
   * @returns 规范化后的绝对路径
   */
  normalizePath(inputPath: string): string {
    return path.resolve(inputPath);
  }

  /**
   * 验证路径是否在允许的目录范围内
   * @param targetPath - 目标路径
   * @param operation - 操作类型
   * @returns 规范化后的路径（验证通过时）
   * @throws PathValidationError - 路径不在允许范围内或系统目录写保护
   */
  validatePath(targetPath: string, operation: 'read' | 'write'): string {
    // 1. 规范化路径
    const normalized = this.normalizePath(targetPath);

    // 2. 检查路径是否在允许的目录范围内
    const isAllowed = this.allowedDirectories.some(
      (dir) => normalized === dir || normalized.startsWith(dir + '/'),
    );

    if (!isAllowed) {
      throw new PathValidationError(
        ErrorCode.PATH_ACCESS_DENIED,
        '路径访问被拒绝: ' + normalized + ' 不在允许的目录范围内',
        {
          path: normalized,
          allowedDirectories: this.allowedDirectories,
        },
      );
    }

    // 3. 检查系统关键目录保护
    const isSystemDir = SYSTEM_PROTECTED_DIRS.some(
      (dir) => normalized === dir || normalized.startsWith(dir + '/'),
    );

    if (isSystemDir && operation === 'write') {
      throw new PathValidationError(
        ErrorCode.SYSTEM_DIR_PROTECTED,
        '系统目录写保护: 禁止对 ' + normalized + ' 执行写操作',
        {
          path: normalized,
          operation,
          protectedDirs: SYSTEM_PROTECTED_DIRS,
        },
      );
    }

    // 4. 验证通过，返回规范化后的路径
    return normalized;
  }
}
