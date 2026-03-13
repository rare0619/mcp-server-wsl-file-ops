# WSL File Ops MCP Server

专为 WSL（Windows Subsystem for Linux）环境设计的 MCP Server，解决 Kiro IDE 等工具在 WSL UNC 路径（`\\wsl.localhost\...`）下文件操作工具的路径重复拼接问题。

## 功能特性

- **路径安全校验**：基于白名单的目录访问控制，防止越权访问
- **系统目录保护**：自动拒绝对 `/etc`、`/usr`、`/bin` 等系统目录的写操作
- **命令白名单**：可配置的命令执行白名单，仅允许预定义的安全命令
- **危险命令检测**：自动检测并拒绝 `rm -rf /`、`mkfs`、`dd` 等危险命令
- **命令消毒**：对命令中的特殊字符进行转义，防止命令注入
- **6 个文件操作工具**：覆盖读取、写入、搜索、替换、目录列表、命令执行

## 安装步骤

### 1. 克隆项目

```bash
git clone <repository-url> /data/mcp-server-wsl-file-ops
cd /data/mcp-server-wsl-file-ops
```

### 2. 安装并编译

```bash
bash install.sh
```

或手动执行：

```bash
npm install
npm run build
```

### 3. 配置 MCP

将以下配置添加到 `~/.kiro/settings/mcp.json`（也可参考项目中的 `mcp.json.example`）：

```json
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
        "COMMAND_WHITELIST": "npm *,git *,node *,npx *,ls *,cat *,head *,tail *,grep *,find *,wc *,echo *,pwd,whoami,date,which *,file *",
        "COMMAND_TIMEOUT": "30000",
        "MAX_SEARCH_RESULTS": "500"
      },
      "disabled": false,
      "autoApprove": ["read_file", "list_directory", "search_files"]
    }
  }
}
```

**配置说明**：
- `args`：第一个参数为编译后的入口文件路径，后续参数为允许操作的目录路径（Allowed_Directory），至少需要一个
- `env`：环境变量配置（详见下方环境变量说明）
- `autoApprove`：自动批准的只读工具列表，无需用户确认即可执行

## 工具列表

### 只读工具

| 工具名 | 说明 | 参数 |
|--------|------|------|
| `read_file` | 读取指定路径的文件内容（UTF-8 编码） | `path`：文件绝对路径 |
| `list_directory` | 列出目录下所有文件和子目录，标注 [DIR]/[FILE] 前缀 | `path`：目录绝对路径 |
| `search_files` | 在目录中递归搜索文件内容，支持正则表达式 | `path`：搜索根目录绝对路径；`pattern`：正则表达式；`filePattern`（可选）：文件名通配符，如 `*.ts` |

### 可写工具

| 工具名 | 说明 | 参数 |
|--------|------|------|
| `write_file` | 创建或覆盖文件，自动创建父目录 | `path`：文件绝对路径；`content`：文件内容 |
| `replace_in_file` | 查找并替换文件中首次匹配的文本 | `path`：文件绝对路径；`old_str`：原始文本；`new_str`：替换文本 |
| `run_command` | 在 WSL Linux 环境中执行 shell 命令 | `command`：shell 命令；`workingDir`（可选）：工作目录绝对路径 |

## 安全机制

### 路径白名单

启动时通过命令行参数指定允许操作的目录列表。所有文件操作（读取、写入、搜索等）都会验证目标路径是否在白名单目录内，拒绝越权访问。

### 系统目录保护

以下系统目录受到保护，写操作会被自动拒绝：
- `/etc`、`/usr`、`/bin`、`/sbin`、`/boot`、`/dev`、`/proc`、`/sys`

### 命令白名单

`run_command` 工具仅允许执行白名单中的命令。白名单通过 `COMMAND_WHITELIST` 环境变量配置，支持通配符匹配（如 `npm *` 匹配所有以 `npm` 开头的命令）。

### 危险命令检测

即使命令在白名单中，以下危险模式也会被拒绝：
- `rm -rf /`（删除根目录）
- `mkfs`（格式化磁盘）
- `dd if=`（磁盘写入）
- `:(){ :|:& };:`（fork 炸弹）
- 其他可能造成系统损坏的命令

### 命令消毒

命令在执行前会进行特殊字符转义，防止命令注入攻击。

## 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `COMMAND_WHITELIST` | `ls *,cat *,head *,tail *,grep *,find *,wc *,echo *,pwd,whoami,date,which *,file *` | 命令白名单，逗号分隔。每个条目支持通配符 `*` |
| `COMMAND_TIMEOUT` | `30000` | 命令执行超时时间（毫秒） |
| `MAX_SEARCH_RESULTS` | `500` | `search_files` 工具返回的最大匹配结果数 |

## 开发说明

### 运行测试

```bash
npm test
```

### 编译项目

```bash
npm run build
```

### 项目结构

```
src/
├── index.ts              # MCP Server 入口
├── config.ts             # 配置解析
├── errors.ts             # 错误处理
├── security/
│   ├── path-validator.ts # 路径安全校验
│   └── command-guard.ts  # 命令安全守卫
└── tools/
    ├── index.ts          # 工具注册
    ├── read-file.ts      # read_file 工具
    ├── list-directory.ts # list_directory 工具
    ├── search-files.ts   # search_files 工具
    ├── write-file.ts     # write_file 工具
    ├── replace-in-file.ts# replace_in_file 工具
    └── run-command.ts    # run_command 工具
```

## 许可证

本项目基于 [MIT 许可证](LICENSE) 开源。
