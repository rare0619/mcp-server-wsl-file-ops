# WSL File Ops MCP Server

专为 WSL（Windows Subsystem for Linux）环境设计的 MCP Server，解决 Kiro IDE 等工具在 WSL UNC 路径（`\\wsl.localhost\...`）下文件操作工具的路径重复拼接问题。

## 功能特性

- **路径安全校验**：基于白名单的目录访问控制，防止越权访问
- **系统目录保护**：自动拒绝对 `/etc`、`/usr`、`/bin` 等系统目录的写操作
- **命令白名单**：可配置的命令执行白名单，仅允许预定义的安全命令
- **危险命令检测**：自动检测并拒绝 `rm -rf /`、`mkfs`、`dd` 等危险命令
- **命令消毒**：对命令中的特殊字符进行转义，防止命令注入；支持管道操作符 `|`
- **文本替换增强**：自动处理 CRLF/LF 换行符、Unicode NFC 规范化、BOM 字符，匹配失败时提供诊断信息和模糊匹配回退
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
        "COMMAND_WHITELIST": "[\"npm *\", \"git *\", \"node *\", \"npx *\", \"ls *\", \"cat *\", \"head *\", \"tail *\", \"grep *\", \"find *\", \"wc *\", \"echo *\", \"pwd\", \"whoami\", \"date\", \"which *\", \"file *\"]",
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

命令在执行前会进行安全检查，防止命令注入攻击：

- **允许**：管道操作符 `|`（每个子命令需分别通过白名单检查）
- **拒绝**：`&&`（命令链接）、`||`（条件执行）、`;`（命令分隔符）、反引号（`` ` ``）、`$()`（命令替换）

管道命令示例：
```bash
# ✅ 允许（grep 和 head 都在白名单中）
grep -r "TODO" /data/project | head -20

# ✅ 允许（多级管道）
cat file.txt | grep "error" | wc -l

# ❌ 拒绝（sort 不在白名单中）
grep "error" log.txt | sort | uniq

# ❌ 拒绝（使用了 && 操作符）
npm run build && npm test
```

## 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `COMMAND_WHITELIST` | `ls *,cat *,head *,tail *,grep *,find *,wc *,echo *,pwd,whoami,date,which *,file *` | 命令白名单。推荐使用 JSON 数组格式（见下方说明），也支持逗号分隔格式（向后兼容）。每个条目支持通配符 `*` |
| `COMMAND_TIMEOUT` | `30000` | 命令执行超时时间（毫秒）。必须为正整数，无效值将回退到默认值 |
| `MAX_SEARCH_RESULTS` | `500` | `search_files` 工具返回的最大匹配结果数 |

### COMMAND_WHITELIST 格式说明

**推荐：JSON 数组格式**

```json
"COMMAND_WHITELIST": "[\"npm *\", \"git *\", \"node *\", \"npx *\"]"
```

JSON 数组格式更直观、易于维护，支持包含逗号的命令模式。

**兼容：逗号分隔格式**

```json
"COMMAND_WHITELIST": "npm *,git *,node *,npx *"
```

逗号分隔格式仍然完全支持，适用于简单场景。

**自动检测逻辑**：
- 值以 `[` 开头 → 按 JSON 数组解析
- JSON 解析失败 → 输出警告并回退到逗号分隔解析
- 值不以 `[` 开头 → 按逗号分隔解析
- 值为空字符串或未设置 → 使用默认白名单

## 已知限制

- `replace_in_file` 的模糊匹配仅处理空白字符差异（将连续空白折叠为单个空格），不处理语义等价的代码变体
- Unicode NFC 规范化可能改变某些特殊字符的表示形式（如组合字符序列会被合并为预组合字符）
- mixed 换行符风格（同一文件中混合 CRLF 和 LF）时，`replace_in_file` 不做换行符转换，保留原始内容
- 管道命令中每个子命令都必须在白名单中，任一子命令不在白名单则整个命令被拒绝
- 文件编码仅支持 UTF-8（含 BOM），不支持 GBK、Shift-JIS 等其他编码

## 故障排查

### replace_in_file 匹配失败

当 `replace_in_file` 报告 `old_str` 未找到时，可按以下步骤排查：

#### 1. 换行符差异（CRLF vs LF）

工具会自动处理 CRLF/LF 差异，但如果文件使用 mixed 换行符风格（同时包含 CRLF 和 LF），规范化不会生效。

排查方法：
```bash
# 检查文件换行符类型
file -b <file-path>

# 查看文件中的换行符（\r\n 为 CRLF）
cat -A <file-path> | head -5
# 行尾显示 ^M$ 表示 CRLF，仅 $ 表示 LF
```

#### 2. Unicode 规范化差异（NFD vs NFC）

工具会自动将文件内容和 `old_str` 规范化为 NFC 形式。如果 `old_str` 中包含特殊的 Unicode 组合序列，规范化后可能与预期不同。

排查方法：检查错误响应中的十六进制编码，对比 `old_str` 的实际字节表示。

#### 3. 不可见字符

常见的不可见字符包括：
- **BOM（U+FEFF）**：工具会自动处理文件开头的 BOM
- **零宽空格（U+200B）**：不会被自动处理
- **零宽连接符（U+200D）**：不会被自动处理

排查方法：检查错误响应中的十六进制编码前缀，识别不可见字符。

#### 4. 空白字符差异

精确匹配失败后，工具会自动尝试模糊匹配（将连续空白折叠为单个空格）。如果模糊匹配也失败，说明差异不仅仅是空白字符。

排查方法：
- 检查错误响应中的诊断信息：字节长度、十六进制编码
- 查看「最相似行」提示，对比与 `old_str` 第一行的差异
- 确认 `old_str` 的前 3 行预览是否与文件内容一致

#### 5. 诊断信息说明

匹配失败时，错误响应包含以下诊断信息：

| 字段 | 说明 |
|------|------|
| `old_str 字节长度` | `old_str` 的 UTF-8 字节长度 |
| `文件字节长度` | 文件内容的 UTF-8 字节长度 |
| `十六进制编码` | `old_str` 前 20 个字符的十六进制表示，用于识别不可见字符 |
| `文件总行数` | 文件的总行数 |
| `文件总字符数` | 文件的总字符数 |
| `old_str 前 3 行` | `old_str` 的前 3 行内容预览 |
| `最相似行` | 文件中与 `old_str` 第一行最相似的行及其行号和相似度分数 |

## 实际项目配置示例

以下是一个多项目 workspace 的完整 MCP 配置示例，使用推荐的 JSON 数组格式白名单：

```json
{
  "mcpServers": {
    "wsl-file-ops": {
      "command": "node",
      "args": [
        "/data/mcp-server-wsl-file-ops/dist/index.js",
        "/data/project-a",
        "/data/project-b",
        "/data/project-c"
      ],
      "env": {
        "COMMAND_WHITELIST": "[\"npm *\", \"git *\", \"node *\", \"npx *\", \"ls *\", \"cat *\", \"head *\", \"tail *\", \"grep *\", \"find *\", \"wc *\", \"echo *\", \"pwd\", \"whoami\", \"date\", \"which *\", \"file *\"]",
        "COMMAND_TIMEOUT": "30000",
        "MAX_SEARCH_RESULTS": "500"
      },
      "disabled": false,
      "autoApprove": ["read_file", "list_directory", "search_files"]
    }
  }
}
```

**说明**：
- `args` 中可以指定多个项目目录，MCP Server 会允许对这些目录下的文件进行操作
- `COMMAND_WHITELIST` 使用 JSON 数组格式，每个条目是一个命令模式，支持 `*` 通配符
- `autoApprove` 列出的只读工具无需用户确认即可执行，提升使用效率
- `COMMAND_TIMEOUT` 设置命令超时时间，防止长时间运行的命令阻塞

## WSL 环境注意事项

### 路径格式要求

所有路径参数必须使用 Linux 绝对路径格式：

```
✅ /data/project
✅ /home/user/workspace
❌ C:\Users\project
❌ \\wsl.localhost\Ubuntu\data\project
```

### Windows 宿主机调用

当从 Windows 宿主机（如 Kiro IDE、VS Code）调用 MCP Server 时，MCP 客户端会自动处理 WSL 路径映射。配置中的路径应始终使用 WSL 内部的 Linux 绝对路径。

如果需要手动在 Windows 命令行中调用 WSL 中的 MCP Server：

```bash
wsl node /data/mcp-server-wsl-file-ops/dist/index.js /data/project
```

### 文件编码

- 默认使用 UTF-8 编码读写文件
- 支持带 BOM（Byte Order Mark）的 UTF-8 文件：`replace_in_file` 在匹配时自动忽略 BOM，写回时保留 BOM
- 不支持 GBK、Shift-JIS 等非 UTF-8 编码

## 配置迁移指南

### 从逗号分隔迁移到 JSON 数组格式

如果你当前使用逗号分隔格式的白名单配置，可以按以下步骤迁移到推荐的 JSON 数组格式：

**旧格式（逗号分隔）**：
```json
{
  "env": {
    "COMMAND_WHITELIST": "npm *,git *,node *,npx *,ls *,cat *"
  }
}
```

**新格式（JSON 数组，推荐）**：
```json
{
  "env": {
    "COMMAND_WHITELIST": "[\"npm *\", \"git *\", \"node *\", \"npx *\", \"ls *\", \"cat *\"]"
  }
}
```

**迁移步骤**：
1. 将逗号分隔的每个条目提取出来
2. 用 JSON 数组格式包裹：`["条目1", "条目2", ...]`
3. 由于 JSON 值本身在 MCP 配置中是字符串，需要对内部引号进行转义：`[\"条目1\", \"条目2\"]`
4. 替换原有的 `COMMAND_WHITELIST` 值

**注意**：两种格式都完全支持，无需强制迁移。JSON 数组格式的优势在于：
- 更直观的条目分隔
- 支持包含逗号的命令模式
- 更好的可读性和可维护性

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
├── config.ts             # 配置解析（支持 JSON 数组和逗号分隔白名单）
├── errors.ts             # 错误处理
├── security/
│   ├── path-validator.ts # 路径安全校验
│   └── command-guard.ts  # 命令安全守卫（支持管道命令）
├── utils/
│   ├── text-normalizer.ts # 文本规范化（CRLF/LF、NFC、BOM）
│   ├── fuzzy-match.ts     # 模糊匹配与诊断信息
│   └── diff-utils.ts      # Diff 上下文与替换统计
└── tools/
    ├── index.ts          # 工具注册
    ├── read-file.ts      # read_file 工具
    ├── list-directory.ts # list_directory 工具
    ├── search-files.ts   # search_files 工具
    ├── write-file.ts     # write_file 工具
    ├── replace-in-file.ts# replace_in_file 工具（含文本规范化和诊断增强）
    └── run-command.ts    # run_command 工具（含管道命令支持）
```

## 许可证

本项目基于 [MIT 许可证](LICENSE) 开源。