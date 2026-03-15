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

/** 白名单配置格式 */
export type WhitelistFormat = 'json' | 'csv';

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
 * 解析白名单配置
 * 支持 JSON 数组格式和逗号分隔格式，自动检测并解析
 * @param envValue - COMMAND_WHITELIST 环境变量的值
 * @returns 解析后的白名单数组
 */
export function parseWhitelist(envValue: string | undefined): string[] {
  // 未设置环境变量 → 使用默认白名单
  if (envValue === undefined) {
    return DEFAULT_COMMAND_WHITELIST;
  }

  // 空字符串 → 使用默认白名单并输出信息日志
  if (envValue.trim() === '') {
    process.stderr.write(
      '[INFO] COMMAND_WHITELIST 为空字符串，使用默认白名单。\n',
    );
    return DEFAULT_COMMAND_WHITELIST;
  }

  let items: unknown[];
  let format: WhitelistFormat;

  // 检测是否以 [ 开头 → 尝试 JSON 数组解析
  if (envValue.trimStart().startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(envValue);
      if (!Array.isArray(parsed)) {
        process.stderr.write(
          '[WARN] COMMAND_WHITELIST 以 [ 开头但解析结果不是数组，回退到逗号分隔解析。\n',
        );
        items = envValue.split(',');
        format = 'csv';
      } else {
        // 过滤非字符串元素
        const nonStringItems = parsed.filter((item) => typeof item !== 'string');
        if (nonStringItems.length > 0) {
          process.stderr.write(
            `[WARN] COMMAND_WHITELIST JSON 数组中包含 ${nonStringItems.length} 个非字符串元素，已忽略。\n`,
          );
        }
        items = parsed;
        format = 'json';
      }
    } catch {
      // JSON 解析失败 → 回退到逗号分隔
      process.stderr.write(
        '[WARN] COMMAND_WHITELIST 以 [ 开头但 JSON 解析失败，回退到逗号分隔解析。\n',
      );
      items = envValue.split(',');
      format = 'csv';
    }
  } else {
    // 不以 [ 开头 → 逗号分隔解析
    items = envValue.split(',');
    format = 'csv';
  }

  // 过滤：只保留字符串元素，trim 每个条目，过滤空字符串
  const result = items
    .filter((item): item is string => typeof item === 'string')
    .map((cmd) => cmd.trim())
    .filter((cmd) => cmd.length > 0);

  // 如果解析结果为空，使用默认白名单
  if (result.length === 0) {
    process.stderr.write(
      `[INFO] COMMAND_WHITELIST (${format}) 解析后无有效条目，使用默认白名单。\n`,
    );
    return DEFAULT_COMMAND_WHITELIST;
  }

  return result;
}

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

  // 解析命令白名单
  const commandWhitelist = parseWhitelist(process.env.COMMAND_WHITELIST);

  // 解析命令超时时间：从环境变量 COMMAND_TIMEOUT 读取，默认 30000ms
  const envTimeout = process.env.COMMAND_TIMEOUT;
  let commandTimeout = 30000;
  if (envTimeout !== undefined) {
    const parsed = parseInt(envTimeout, 10);
    if (isNaN(parsed) || parsed <= 0 || !Number.isInteger(parsed) || String(parsed) !== envTimeout) {
      process.stderr.write(
        `[WARN] COMMAND_TIMEOUT 值 "${envTimeout}" 不是有效的正整数，使用默认值 30000ms。\n`,
      );
      commandTimeout = 30000;
    } else {
      commandTimeout = parsed;
    }
  }

  // 解析搜索结果上限：从环境变量 MAX_SEARCH_RESULTS 读取，默认 500
  const envMaxResults = process.env.MAX_SEARCH_RESULTS;
  const maxSearchResults = envMaxResults ? parseInt(envMaxResults, 10) : 500;

  const config: ServerConfig = {
    allowedDirectories: args,
    commandWhitelist,
    commandTimeout,
    maxSearchResults: isNaN(maxSearchResults) ? 500 : maxSearchResults,
  };

  // 输出配置摘要到 stderr
  process.stderr.write(
    `[INFO] 配置摘要: 允许目录=${config.allowedDirectories.length}个, ` +
    `白名单条目=${config.commandWhitelist.length}个, ` +
    `超时时间=${config.commandTimeout}ms, ` +
    `搜索结果上限=${config.maxSearchResults}条\n`,
  );

  return config;
}
