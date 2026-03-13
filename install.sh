#!/bin/bash
set -e

echo "=== WSL File Ops MCP Server 安装 ==="

# 安装依赖
echo "正在安装依赖..."
npm install

# 编译项目
echo "正在编译项目..."
npm run build

echo ""
echo "=== 安装完成 ==="
echo ""
echo "请将以下配置添加到 ~/.kiro/settings/mcp.json："
echo ""
cat << 'EOF'
{
  "mcpServers": {
    "wsl-file-ops": {
      "command": "node",
      "args": [
        "/data/mcp-server-wsl-file-ops/dist/index.js",
        "/data/your-project-1",
        "/data/your-project-2"
      ],
      "env": {
        "COMMAND_WHITELIST": "npm *,git *,node *,npx *,ls *,cat *,head *,tail *,grep *,find *,wc *"
      },
      "disabled": false,
      "autoApprove": ["read_file", "list_directory", "search_files"]
    }
  }
}
EOF
echo ""
echo "请将 args 中的目录路径替换为你的实际项目目录。"
