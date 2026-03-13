/**
 * read_file 工具 - 读取指定路径的文件内容
 * [只读] 使用 UTF-8 编码，返回文件的完整文本内容
 * 需求引用: 2.1, 2.2, 2.3, 2.4, 11.4
 */

import { readFile } from 'node:fs/promises';
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
export const readFileInputSchema = z.object({
  path: z.string().describe('文件的绝对路径'),
});

/** 工具定义对象 */
export const readFileToolDefinition = {
  name: 'read_file',
  description:
    '[只读] 读取指定路径的文件内容。使用 UTF-8 编码，返回文件的完整文本内容。',
  inputSchema: readFileInputSchema,
};

/**
 * read_file 工具处理函数
 * @param args - 工具参数，包含 path 字段
 * @param pathValidator - 路径验证器实例
 * @returns MCP ToolResult 格式的响应
 */
export async function handleReadFile(
  args: { path: string },
  pathValidator: PathValidator,
): Promise<ToolResult> {
  try {
    // 1. 验证路径是否在允许的目录范围内（只读操作）
    const validatedPath = pathValidator.validatePath(args.path, 'read');

    // 2. 使用 UTF-8 编码读取文件内容
    const content = await readFile(validatedPath, 'utf-8');

    // 3. 返回成功结果
    return createSuccessResult(content);
  } catch (error: unknown) {
    // 路径验证错误（PATH_ACCESS_DENIED 或 SYSTEM_DIR_PROTECTED）
    if (error instanceof PathValidationError) {
      return createErrorResult(error.code, error.message, error.details);
    }

    // 文件不存在错误
    if (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return createErrorResult(
        ErrorCode.FILE_NOT_FOUND,
        '文件不存在: ' + args.path,
        { path: args.path },
      );
    }

    // 其他未预期的错误
    const message =
      error instanceof Error ? error.message : '未知错误';
    return createErrorResult(
      ErrorCode.INVALID_ARGUMENT,
      '读取文件失败: ' + message,
      { path: args.path },
    );
  }
}
