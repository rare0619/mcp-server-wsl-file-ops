/**
 * list_directory 工具 - 列出指定目录下的所有文件和子目录
 * [只读] 每个条目标注 [DIR] 或 [FILE] 前缀
 */

import { readdir } from 'node:fs/promises';
import { z } from 'zod';
import {
  PathValidator,
  PathValidationError,
} from '../security/path-validator.js';
import {
  createErrorResult,
  createSuccessResult,
  ErrorCode,
} from '../errors.js';
import type { ToolResult } from '../errors.js';

/** 工具输入参数 Schema（使用 zod 定义，MCP SDK 要求） */
export const listDirectoryInputSchema = z.object({
  path: z.string().describe('目录的绝对路径'),
});

/** 工具定义对象 */
export const listDirectoryToolDefinition = {
  name: 'list_directory',
  description:
    '[只读] 列出指定目录下的所有文件和子目录。每个条目标注 [DIR] 或 [FILE] 前缀。',
  inputSchema: listDirectoryInputSchema,
};

/**
 * list_directory 工具处理函数
 * @param args - 工具参数，包含 path 字段
 * @param pathValidator - 路径验证器实例
 * @returns MCP ToolResult 格式的响应
 */
export async function handleListDirectory(
  args: { path: string },
  pathValidator: PathValidator,
): Promise<ToolResult> {
  try {
    // 1. 验证路径是否在允许的目录范围内（只读操作）
    const validatedPath = pathValidator.validatePath(args.path, 'read');

    // 2. 读取目录内容，获取文件类型信息
    const entries = await readdir(validatedPath, { withFileTypes: true });

    // 3. 对每个条目标注类型前缀，按名称排序后拼接
    const listing = entries
      .map((entry) => {
        const prefix = entry.isDirectory() ? '[DIR]' : '[FILE]';
        return prefix + ' ' + entry.name;
      })
      .sort()
      .join('\n');

    // 4. 返回成功结果
    return createSuccessResult(listing);
  } catch (error: unknown) {
    // 路径验证错误（PATH_ACCESS_DENIED 或 SYSTEM_DIR_PROTECTED）
    if (error instanceof PathValidationError) {
      return createErrorResult(error.code, error.message, error.details);
    }

    // 目录不存在错误
    if (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return createErrorResult(
        ErrorCode.FILE_NOT_FOUND,
        '目录不存在: ' + args.path,
        { path: args.path },
      );
    }

    // 路径不是目录错误
    if (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOTDIR'
    ) {
      return createErrorResult(
        ErrorCode.NOT_A_DIRECTORY,
        '路径不是目录: ' + args.path,
        { path: args.path },
      );
    }

    // 其他未预期的错误
    const message =
      error instanceof Error ? error.message : '未知错误';
    return createErrorResult(
      ErrorCode.INVALID_ARGUMENT,
      '列出目录失败: ' + message,
      { path: args.path },
    );
  }
}
