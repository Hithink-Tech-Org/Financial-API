# AGENTS.md

> 任何 AI coding/data Agent 进入本仓库后的公开入口。项目品牌为“同花顺金融数据服务（hithink finance）”。

## 必读顺序

1. 旧 checkout、旧 Prompt 或旧根级 Python 路径：先读 [`docs/monorepo-migration.md`](docs/monorepo-migration.md)。
2. CLI 业务任务直接读取命中的 CLI 内置领域 Skill，安装前准备读取 [CLI 首次接入](skills/hithink-finance/references/cli.md)；REST 文档和接口选路读取 [`hithink-finance`](skills/hithink-finance/SKILL.md)，MCP 配置和工具调用读取 [`hithink-finance-mcp`](skills/hithink-finance-mcp/SKILL.md)。
3. 只加载 Skill 选择的接入入口、业务域首页和目标接口小节或工具文档，不要递归读取全部契约。

## Monorepo 边界

- `hithink-finance-cli/`：Node.js CLI 子项目，面向人类、Agent 和自动化；运行时不依赖 Python。
- `python/`：唯一 Python 项目根，包含远端取数 toolkit、本地 `marketdb`、示例和测试。
- `docs/`：公共文档中心；`docs/api/` 按前端单接口页与多接口模块页组织 REST 契约，`docs/mcp/` 提供原子工具文档。
- `skills/hithink-finance/`：独立的 REST API Wiki 与 API Router；契约从 `docs/api/` 镜像，附带 CLI 简介。
- `skills/hithink-finance-mcp/`：独立的 MCP 配置、业务域选路与 tool 契约；按业务分类合并工具文档，每个 tool 保留包含参数与返回字段的独立小节。
- `examples/`：monorepo 级示例导航与静态灵感。

## 选择接入方式

| 场景 | 优先入口 |
| --- | --- |
| 人类终端、Agent 执行、自动化、远端+本地一体化 | `hithink-finance` CLI |
| 已连接 MCP 的 Chat 场景 | 托管 MCP |
| 零依赖 HTTP、自定义语言或服务端 | REST API |
| Python/Notebook/研究或已有 marketdb | Python toolkit/SDK |

CLI 业务域优先按内置 Skill 的 description 选择，选定后读取目标 reference，并按需运行 `schema <id>`；未知命令再查询 `capabilities`；MCP 以实时 `tools/list` 为准；REST 响应字段以 `docs/api/` 及远端 <https://fuyao.aicubes.cn/llms-full.txt> 为准；Python 适配层参数以当前函数签名和 `--help` 为准。

## 认证凭据

CLI 默认推荐 OAuth，先复用当前有效凭据；同一系统用户、同一服务环境下共享认证状态，可分别保存 OAuth 和 API Key，由 `auth use` 选择当前方式。首次登录或 OAuth 失效时使用 `auth login --method oauth`；用户明确选择 API Key 时使用对应流程。OAuth 默认连接生产认证服务。命令和存储边界见 [`hithink-finance-cli/README.md`](hithink-finance-cli/README.md)。

REST/Python/MCP 使用在 <https://fuyao.aicubes.cn/admin/> 获取的 API Key，统一来源为用户级 `HITHINK_FINANCE_API_KEY`，其次是 `hithink-finance/credentials.env` 用户级凭据文件。

- 准备 CLI 远端取数时先用只读 `auth status` 检查已启用凭据，按当前方式调用；OAuth 失效时提示重新认证。仅查询接口文档时直接读取本地契约。
- REST/Python/MCP 取数或认证诊断复用统一 Key 来源，不得因切换接入方式再次索要。
- 不得强制用户把 Key 粘贴到对话；用户可以为了便利主动提供给 Agent 上下文。接收后不得复述，应提示聊天平台可能保留消息记录，并安全写入用户级统一凭据来源。
- 不得把 Key 写入代码、日志、公开配置、产物或 Git。
- CLI 首次初始化且没有旧 Key 候选时，仅导入一次进程环境 Key；后续通过 `auth login --method api-key --api-key-stdin` 更新，兼容 `--replace`。业务命令的显式 `--api-key-stdin` 只覆盖本次请求。
- REST/Python 读取统一环境变量或用户级凭据文件；旧变量仅兼容。
- MCP 优先使用 `${HITHINK_FINANCE_API_KEY}`，不继承环境时由 Agent 从统一来源配置客户端 Secret。

## 大数据纪律

禁止把全市场、分页全集、多年或多标的原始结果输出到会话上下文。

```bash
<command> ... > /tmp/result.json
# 只报告文件路径、行数、时间窗口和摘要
```

CLI 优先使用具体命令的 `--output`、`db export` 或 `market panel --output`。Python/marketdb 将结果写到 `/tmp/`、`out/` 或用户指定路径。不要回显凭证或完整数据文件。

## 文档治理

- 根 README 做项目总览；子目录 README 详细解释当前目录，不把细节继续拆散到不必要的多层文档。
- REST 单接口页与多接口模块页、MCP 原子文档按业务域组织，业务域 README 提供索引，API 根 README 集中通用协议与端内说明。接口字段以源接口正文为准；MCP 只收录明确工具定义。Market Dumps 的 API Key 契约由本项目维护。契约更新后运行：

  ```bash
  python scripts/sync_skill_contracts.py
  python scripts/sync_skill_contracts.py --check
  ```

- 不要直接编辑两个 Skill 的生成契约目录；REST 源为 `docs/api/`，MCP 源为 `docs/mcp.md` 和 `docs/mcp/`，更新源文档后重新生成并检查覆盖。
- 两个独立 Skill 各自的总文件数不得超过 100；MCP 文档按业务分类合并，目录链接定位到工具名小节。
- 不要在 Python、CLI、examples 或其他 README 中复制上游参数表、响应字段表和错误码全集；这些文档只说明自身功能与运行方式并链接契约。
- 仓库不保存 `llms.txt`、`llms-full.txt` 或相似副本，只链接远端地址。
- 改动公开能力、命令、选项或路由时，同步更新 README、对应 Skill、契约镜像和开发期契约测试。

## 验证

```bash
python scripts/sync_skill_contracts.py --check
python -m pytest python/tests/

cd hithink-finance-cli
npm run verify
```

批量文档变更还要运行相对链接、旧品牌、旧 Skill 路径和重复契约扫描。离线测试不能证明线上认证或实时服务可用；只有实际授权请求才能称为线上验证。

## 入口索引

- 项目总览：[`README.md`](README.md)
- 文档中心：[`docs/README.md`](docs/README.md)
- REST API 契约：[`docs/api/README.md`](docs/api/README.md)
- MCP：[`docs/mcp.md`](docs/mcp.md)
- CLI：[`hithink-finance-cli/README.md`](hithink-finance-cli/README.md)
- Python：[`python/README.md`](python/README.md)
- Toolkit 路由：[`python/toolkit/README.md`](python/toolkit/README.md)
- 示例：[`examples/README.md`](examples/README.md)
