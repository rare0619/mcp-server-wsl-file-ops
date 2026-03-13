/**
 * MCP Server 入口文件
 * 创建并启动 wsl-file-ops MCP Server，通过 stdio 传输层与客户端通信
 * 需求引用: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { parseConfig } from './config.js';
import { registerTools } from './tools/index.js';

/**
 * 主函数 - 解析配置、创建 MCP Server、注册工具并启动
 */
async function main(): Promise<void> {
  // 解析命令行参数（跳过 node 和脚本路径）
  const args = process.argv.slice(2);
  const config = parseConfig(args);

  // 创建 MCP Server 实例
  const server = new McpServer({
    name: 'wsl-file-ops',
    version: '1.0.0',
  });

  // 注册所有工具
  registerTools(server, config);

  // 创建 stdio 传输层并连接
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // 输出启动信息到 stderr（stdout 保留给 JSON-RPC）
  console.error('[wsl-file-ops] MCP Server 已启动');
  console.error(`[wsl-file-ops] 允许的目录: ${config.allowedDirectories.join(', ')}`);
}

// 捕获未处理的异常
process.on('uncaughtException', (error) => {
  console.error('[wsl-file-ops] 未捕获的异常:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('[wsl-file-ops] 未处理的 Promise 拒绝:', reason);
});

// 启动服务器
main().catch((error) => {
  console.error('[wsl-file-ops] 启动失败:', error);
  process.exit(1);
});
