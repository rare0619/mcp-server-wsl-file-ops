/**
 * 配置解析模块
 * 从命令行参数和环境变量解析 MCP Server 配置
 */

/** 服务器配置接口 */
export interface ServerConfig {
  /** 允许操作的目录列表（绝对路径） */
  allowedDirectories: string[];
  /** 命令白名单模式列表 */
  commandWhitelist: string[];
  /** 命令执行超时时间（毫秒） */
  commandTimeout: number;
  /** 搜索结果最大条数 */
  maxSearchResults: number;
}

/** 默认命令白名单 */
export const DEFAULT_COMMAND_WHITELIST: string[] = [
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

/**
 * 从命令行参数和环境变量解析服务器配置
 * @param args - 命令行参数（每个参数为一个允许操作的目录路径）
 * @returns 解析后的服务器配置
 */
export function parseConfig(args: string[]): ServerConfig {
  // 验证是否提供了允许的目录
  if (args.length === 0) {
    process.stderr.write(
      '[ERROR] NO_ALLOWED_DIRS: 启动时必须提供至少一个 Allowed_Directory 路径作为命令行参数。\n' +
      '用法: node dist/index.js <allowed_dir_1> [allowed_dir_2] ...\n'
    );
    process.exit(1);
  }

  // 解析命令白名单：从环境变量 COMMAND_WHITELIST 读取（逗号分隔），未设置则使用默认白名单
  const envWhitelist = process.env.COMMAND_WHITELIST;
  const commandWhitelist = envWhitelist
    ? envWhitelist.split(',').map((cmd) => cmd.trim()).filter((cmd) => cmd.length > 0)
    : DEFAULT_COMMAND_WHITELIST;

  // 解析命令超时时间：从环境变量 COMMAND_TIMEOUT 读取，默认 30000ms
  const envTimeout = process.env.COMMAND_TIMEOUT;
  const commandTimeout = envTimeout ? parseInt(envTimeout, 10) : 30000;

  // 解析搜索结果上限：从环境变量 MAX_SEARCH_RESULTS 读取，默认 500
  const envMaxResults = process.env.MAX_SEARCH_RESULTS;
  const maxSearchResults = envMaxResults ? parseInt(envMaxResults, 10) : 500;

  return {
    allowedDirectories: args,
    commandWhitelist,
    commandTimeout: isNaN(commandTimeout) ? 30000 : commandTimeout,
    maxSearchResults: isNaN(maxSearchResults) ? 500 : maxSearchResults,
  };
}
