/**
 * 统一错误处理模块
 * 定义 MCP Server 的错误类型、错误接口和响应构建辅助函数
 */

/** 错误码枚举 */
export enum ErrorCode {
  /** 路径访问被拒绝 */
  PATH_ACCESS_DENIED = 'PATH_ACCESS_DENIED',
  /** 文件不存在 */
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  /** 不是目录 */
  NOT_A_DIRECTORY = 'NOT_A_DIRECTORY',
  /** 匹配未找到 */
  MATCH_NOT_FOUND = 'MATCH_NOT_FOUND',
  /** 命令执行超时 */
  COMMAND_TIMEOUT = 'COMMAND_TIMEOUT',
  /** 危险命令 */
  COMMAND_DANGEROUS = 'COMMAND_DANGEROUS',
  /** 命令需要授权 */
  COMMAND_REQUIRES_AUTH = 'COMMAND_REQUIRES_AUTH',
  /** 系统目录受保护 */
  SYSTEM_DIR_PROTECTED = 'SYSTEM_DIR_PROTECTED',
  /** 无效参数 */
  INVALID_ARGUMENT = 'INVALID_ARGUMENT',
  /** 未提供允许的目录 */
  NO_ALLOWED_DIRS = 'NO_ALLOWED_DIRS',
}

/** MCP 错误接口 */
export interface McpError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/** MCP ToolResult 格式 */
export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * 创建 MCP ToolResult 格式的错误响应
 * @param code - 错误码
 * @param message - 错误消息
 * @param details - 可选的错误详情
 */
export function createErrorResult(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ error: code, message, details }),
      },
    ],
    isError: true,
  };
}

/**
 * 创建 MCP ToolResult 格式的成功响应
 * @param text - 响应文本内容
 */
export function createSuccessResult(text: string): ToolResult {
  return {
    content: [{ type: 'text', text }],
  };
}
