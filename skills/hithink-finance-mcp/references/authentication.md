# MCP 认证与恢复

同花顺金融数据 MCP 使用 API Key。已连接服务优先复用现有客户端配置与 Secret；需要配置或恢复时，检查以下来源：

1. 用户通过安全输入提供的本次 Key。
2. 用户级 `HITHINK_FINANCE_API_KEY`。
3. 用户级凭据文件：Windows `%APPDATA%\hithink-finance\credentials.env`；macOS `~/Library/Application Support/hithink-finance/credentials.env`；Linux `${XDG_CONFIG_HOME:-~/.config}/hithink-finance/credentials.env`。
4. 已有的兼容变量 `FUYAO_TOKEN`、`API_KEY`。

只报告来源与存在状态。Key 缺失时，使用 <https://fuyao.aicubes.cn/admin/> 获取；优先复用已经签发的 Key。支持浏览器代办时可由 Agent 配置，用户也可自行操作后通过安全输入交接。

## 配置与持久化

- 配置见 [MCP 接入](mcp.md)。按宿主实际支持的环境变量插值或 Secret 机制传递 `X-api-key`，在授权范围内只配置所需服务。
- GUI 客户端可能不继承 Shell 环境。环境变量未注入时，从统一来源写入客户端 Secret，再重新连接目标服务。
- `credentials.env` 使用单行 `HITHINK_FINANCE_API_KEY=...`，放在用户级目录。Unix 目录使用 `0700`、文件使用 `0600`；Windows 限制当前用户可访问。更新使用同目录临时文件加原子替换。
- 新会话和客户端重启后需要继续复用时，使用用户级持久来源或客户端 Secret；配置文件存在只表示已保存配置。

## 验证与恢复

1. 确认目标服务已连接并返回 `tools/list`，读取目标工具的当前 schema。
2. 用当前任务需要的最小有界请求验证访问，检查响应信封 `code=0` 及实际数据。
3. 认证失败时先核对请求是否传入 Key，再核对已有 Key 的可用性；修复同一来源并重连、重试一次有界请求。
4. 权限、参数、限流或上游故障分别报告错误和下一步操作。离线文档、配置检查和工具清单不能代替业务调用验收。

Key 不进入命令参数、日志、输出、项目文件、公开配置或 Git。用户主动在对话中提供 Key 时不复述，并提示聊天平台可能保留消息记录；配置与验证完成后清理临时文件、临时变量和剪贴板中的秘密。
