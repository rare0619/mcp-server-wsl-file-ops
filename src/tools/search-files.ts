/**
 * search_files 工具 - 在指定目录中递归搜索文件内容
 * [只读] 使用正则表达式匹配，返回匹配的文件路径、行号和行内容
 * 自动跳过 node_modules、.git、dist 等目录
 * 需求引用: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 11.4
 */

import { readdir, readFile } from 'node:fs/promises';
import * as path from 'node:path';
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
export const searchFilesInputSchema = z.object({
  path: z.string().describe('搜索的根目录绝对路径'),
  pattern: z.string().describe('正则表达式搜索模式'),
  filePattern: z
    .string()
    .optional()
    .describe('文件名通配符过滤，如 *.ts、*.js'),
});

/** 工具定义对象 */
export const searchFilesToolDefinition = {
  name: 'search_files',
  description:
    '[只读] 在指定目录中递归搜索文件内容。使用正则表达式匹配，返回匹配的文件路径、行号和行内容。自动跳过 node_modules、.git、dist 等目录。',
  inputSchema: searchFilesInputSchema,
};

/** 递归搜索时跳过的目录列表 */
export const SKIP_DIRS: string[] = [
  'node_modules',
  '.git',
  'dist',
  '.next',
  '.nuxt',
  'build',
  'coverage',
  '__pycache__',
  '.cache',
];

/**
 * 简单的通配符匹配函数
 * 支持 *.ext 格式（如 *.ts 匹配所有 .ts 文件）和 * 匹配所有文件
 * @param filename - 文件名
 * @param pattern - 通配符模式
 * @returns 是否匹配
 */
export function matchGlob(filename: string, pattern: string): boolean {
  if (pattern === "*") {
    return true;
  }
  if (pattern.startsWith("*.")) {
    const ext = pattern.slice(1);
    return filename.endsWith(ext);
  }
  return filename === pattern;
}

/**
 * 递归遍历目录，收集匹配正则的文件行
 */
async function searchDirectory(
  dirPath: string,
  regex: RegExp,
  filePattern: string | undefined,
  results: string[],
  maxResults: number,
): Promise<number> {
  let totalMatches = results.length;
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return totalMatches;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && SKIP_DIRS.includes(entry.name)) {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      totalMatches = await searchDirectory(fullPath, regex, filePattern, results, maxResults);
    } else if (entry.isFile()) {
      if (filePattern && !matchGlob(entry.name, filePattern)) {
        continue;
      }
      try {
        const content = await readFile(fullPath, "utf-8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            totalMatches++;
            if (results.length < maxResults) {
              results.push(fullPath + ":" + (i + 1) + ":" + lines[i]);
            }
          }
        }
      } catch {
        continue;
      }
    }
  }
  return totalMatches;
}

/**
 * search_files 工具处理函数
 */
export async function handleSearchFiles(
  args: { path: string; pattern: string; filePattern?: string },
  pathValidator: PathValidator,
  maxResults: number = 500,
): Promise<ToolResult> {
  try {
    const validatedPath = pathValidator.validatePath(args.path, "read");
    let regex: RegExp;
    try {
      regex = new RegExp(args.pattern);
    } catch {
      return createErrorResult(
        ErrorCode.INVALID_ARGUMENT,
        "无效的正则表达式: " + args.pattern,
        { pattern: args.pattern },
      );
    }
    const results: string[] = [];
    const totalMatches = await searchDirectory(
      validatedPath, regex, args.filePattern, results, maxResults,
    );
    if (totalMatches === 0) {
      return createSuccessResult("未找到匹配结果");
    }
    let output = results.join("\n");
    if (totalMatches > maxResults) {
      output += "\n... 结果已截断，共找到 " + totalMatches + " 条匹配（显示前 " + maxResults + " 条）";
    }
    return createSuccessResult(output);
  } catch (error: unknown) {
    if (error instanceof PathValidationError) {
      return createErrorResult(error.code, error.message, error.details);
    }
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return createErrorResult(ErrorCode.FILE_NOT_FOUND, "目录不存在: " + args.path, { path: args.path });
    }
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOTDIR") {
      return createErrorResult(ErrorCode.NOT_A_DIRECTORY, "路径不是目录: " + args.path, { path: args.path });
    }
    const message = error instanceof Error ? error.message : "未知错误";
    return createErrorResult(ErrorCode.INVALID_ARGUMENT, "搜索文件失败: " + message, { path: args.path });
  }
}
