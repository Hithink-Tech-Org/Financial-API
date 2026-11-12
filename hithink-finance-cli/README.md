# hithink-finance CLI

`hithink-finance` 是同花顺金融数据服务的 Node.js 命令行客户端，面向人类终端、AI Agent、CI 和自动化脚本。它统一提供远端数据、本地 DuckDB、认证、结构化输出、能力发现、诊断和生命周期管理，运行时不依赖 monorepo 的 Python 子项目。

CLI 文档只维护命令和运行语义；上游 REST 参数与响应字段统一见[官方 API 文档](https://fuyao.aicubes.cn/docs/)。

## 环境与安装

需要 Node.js `^22.13.0 || >=24.0.0`。

### 从当前仓库运行

```bash
cd hithink-finance-cli
npm ci --ignore-scripts
npm run build
node dist/cli/main.js --help
node dist/cli/main.js capabilities --format json
```

### npm 发布后安装

```bash
npm install -g @hithink-tech/hithink-finance-cli
hithink-finance version --format json
hithink-finance doctor --format json
```

如果 `npm install` 返回 `E404`，说明包尚未发布或当前 registry 无法访问。报告实际状态，不要在终端指引中把源码安装伪装成正式发布安装。

### 更新与修复

```bash
hithink-finance update --check --format json
hithink-finance update --format json
hithink-finance update --target-version <version> --format json
hithink-finance update --repair --format json
```

`update --check` 只检查版本；直接运行 `update` 会查询 npm latest 并更新到对应的精确版本。`--target-version` 用于安装指定版本或回滚，`--repair` 仅重新安装当前版本；这三个选项互斥。

## 登录与共享凭据

同一系统用户的终端、Agent 和不同安装副本共享认证状态。可以分别保存 OAuth 与 API Key，使用 `auth use` 选择当前方式；成功登录会保存并启用新凭据。

CLI 默认推荐 OAuth。先用 `auth status` 复用当前有效凭据；首次登录使用 `auth login --method oauth`，OAuth 失效时重新授权。用户明确选择 API Key 时，使用对应的登录命令与统一 Key 来源。

日常认证结果展示连接状态、当前方式及可用凭据。排障时使用 `auth status --debug --format json` 获取存储诊断；OAuth交互流程依次提示准备登录、浏览器授权和完成登录。

OAuth授权包含数据访问、自动续期及服务所需的基础账号权限，具体以当前授权页展示为准。授权范围更新后需重新登录完成确认。

当前版本的OAuth服务配置与已存授权不匹配时，状态显示需要重新登录。完成新授权后启用新凭据。

```bash
hithink-finance auth status --format json
hithink-finance auth login --method oauth
```

API Key 在 <https://fuyao.aicubes.cn/admin/> 获取。交互式隐藏输入使用 `auth login --method api-key`；登录会先验证新 Key，失败时保留已提交凭据。`--replace` 继续兼容。

用户选择 API Key 时，通过 stdin 登录；已有两类凭据时可显式切换：

```bash
hithink-finance auth login --method api-key --api-key-stdin
hithink-finance auth use api-key
```

OAuth 默认连接生产认证服务，使用 `auth login --method oauth` 打开浏览器授权，数据服务验证新凭据可用后保存并启用。`--background --no-browser` 在回调 worker 就绪后输出独立 HTTPS URL，供宿主打开。OAuth 到期后续期；无法安全续期时提示重新登录。

网页授权完成后若数据服务不可达，登录会报告凭据验证阶段的网络错误；恢复数据服务连接后重新登录。

业务命令的显式 `--api-key-stdin` 只用于本次调用，即使凭据存储不可用也可使用。环境变量 `HITHINK_FINANCE_API_KEY` 只在初次初始化且没有旧 Key 时导入一次；以后通过登录更新。隐藏的兼容选项 `--api-key <value>` 会发出弃用警告。

普通业务命令首次初始化时自动迁移旧 default Key，或唯一旧条目。OAuth 登录初始化只读凭据文件和一次性环境 Key；进入该流程后，需要导入旧系统库中的 Key 时，运行 `auth migrate --legacy-profile default`（其它旧条目使用对应名称）。多份候选或旧配置选了非默认 profile 时也需明确选择。共享登录状态要求各安装副本均升级到支持该格式的版本。

旧格式凭据通过 `auth migrate` 一次性迁入共享文件。迁移保留已保存凭据和当前启用方式；旧登录、刷新或清理任务结束后才可迁移。迁移失败时保留原文件，恢复来源后可重试。

凭据位于操作系统用户主目录下的 `.hithink-finance/auth/production/`，与配置、数据和 npm 安装目录分开。统一使用操作系统私有权限保护的明文文件；系统凭据库适配器仅用于旧凭据的一次性迁入。macOS/Linux 保持凭据文件私有、目录不可由其他用户写入，兼容合法 root 场景；root 在用户目录中创建状态后保留该用户的访问能力。Windows 兼容当前用户、系统服务与管理员的权限及安全继承，按实际读写权限运行；`doctor` 可显式检查。日常读取不反复启动权限子进程。`auth status` 只读本地状态，`connected` 不代表即时远端验权。认证目录需位于可靠本地文件系统。

`auth logout` 清当前方式，`--all` 清两类凭据；随后尽力撤销 OAuth，失败时明确报告本地退出已完成、远端撤销未确认。已有签名下载链接按自身有效期失效。`uninstall --purge-credentials` 清理认证秘密；普通数据或配置清理保持其各自范围。

`auth status` 在已连接时退出 0，未连接时退出 3；两种状态均在 stdout 返回 `ok=true` 的状态信封，通过 `data.connected` 读取连接状态。该命令只读持久化凭据，不联网、不刷新或写入凭据。

WorkBuddy 连接器使用 Node 24 托管运行时，通过 `npmRegistries` 优先使用国内镜像 `https://registry.npmmirror.com`，失败时回退到官方源 `https://registry.npmjs.org`，安装 CLI 的 `latest` 版本，并通过 `versionCheck` 检查最低版本。登录使用 `auth login --method oauth --background --no-browser`，在后台回调任务就绪后输出授权 URL；宿主打开浏览器并轮询 `auth status --format json`。取消连接调用 `auth logout --all --format json`。连接器配置由 `scripts/package-workbuddy.mjs` 生成，最低 WorkBuddy 版本为 4.24.0。

## 能力发现

CLI 的当前命令事实由运行时输出提供：

```bash
hithink-finance capabilities --format json
hithink-finance schema market.snapshot --format json
hithink-finance market snapshot --help
```

Agent 不应只凭 README 猜参数。先读取 `capabilities`，再对目标 capability 读取 `schema`。

同会话同版本的发现结果可复用。`schema` 列出命令选项；参数组合和复杂 JSON 的有效实例见配套 Skill 的对应 reference。表格指标的 `paging=json` 表示分页参数位于 `--page-info` JSON 中，实际是否推进需核对返回代码与总量。

## 命令导航

| 命令组                          | 用途                                                                    |
| ------------------------------- | ----------------------------------------------------------------------- |
| `version`, `doctor`             | 版本、认证、配置、DuckDB、数据锁和内置 Skills 诊断                      |
| `auth`, `config`                | 登录与非敏感配置                                                        |
| `worker status`, `worker stop`  | 查看或停止当前构建和环境的本地查询 worker                               |
| `symbol`                        | 标的检索与代码表                                                        |
| `market`                        | 个股行情、集合竞价、交易日历、本地面板和复权因子                        |
| `financials`                    | 财务报表与财务指标                                                      |
| `index`                         | 指数/板块目录、成分和行情                                               |
| `fund`                          | 基金档案、公司、经理、持仓、财务、资讯、回测、指标、QDII 额度和场内行情 |
| `futures`                       | 期货品种、合约、持仓、仓单、基差、日程与行情                            |
| `options`                       | 期权品种、合约与行情                                                    |
| `valuation`                     | A 股当前市盈率、市净率、市销率和市现率估值快照                          |
| `special`                       | 涨停、跌停、炸板、连板、异动、热榜和龙虎榜                              |
| `ipo`                           | A 股新股日历、港股递表、认购、上市与发行详情                            |
| `news`                          | 资讯详情、快讯与刷新、公告解读、热门专题、日期范围异动与分时新闻        |
| `data`                          | 本地数据库初始化、同步、状态、校验、迁移、修复和清理                    |
| `db`                            | DuckDB 描述、只读 SQL 和导出                                            |
| `capabilities`, `schema`        | 机器可读命令契约                                                        |
| `skills`, `update`, `uninstall` | Agent Skills 与 CLI 生命周期                                            |

常见调用：

```bash
hithink-finance symbol search --q 600519 --limit 5 --format json
hithink-finance market snapshot --thscodes 600519.SH --format json
hithink-finance market auction-snapshot --thscodes 600519.SH --stage final --format json
hithink-finance financials income --thscode 600519.SH --limit 4 --format json
hithink-finance index constituents --thscode 000300.SH --format json
hithink-finance fund nav --thscode 025480.OF --range year --format json
hithink-finance fund manager-detail --manager-id <id> --format json
hithink-finance fund backtest-indicators --format json
hithink-finance fund quota-list --tab '["nazhi100"]' --buy true --format json
hithink-finance valuation snapshot --thscodes 600519.SH,000001.SZ --format json
hithink-finance special limit-break-pool --size 50 --format json
hithink-finance special hot-stock --limit 100 --format json
hithink-finance special auction-opportunities --date 2026-10-12 --size 20 --format json
hithink-finance ipo a-share-calendar --market bj --status subscribable --format json
hithink-finance ipo hk-issue-detail --issue-code HK2636 --format json
hithink-finance news flash-list --tag-id <id> --seq 0 --format json
hithink-finance news stock-timeline-list --thscode 300033.SZ --offset first --format json
hithink-finance data status --format json
hithink-finance db query --sql "SELECT * FROM v_daily_qfq LIMIT 10" --format json
```

## 输出与错误语义

远端取数命令默认使用用户级本地查询 worker，命令写法保持一致。首次调用按需启动，后续独立命令复用已加载模块和HTTP连接；空闲约120秒后退出。每次请求重新读取当前配置和凭据，认证切换/退出对后续请求生效。帮助、版本、认证、维护及数据库命令在前台执行；`market history` 显式使用 `--source remote` 时可复用。

```bash
hithink-finance worker status --format json
hithink-finance worker stop --format json
```

`status` 只读本地状态，`state=running` 表示已连接当前兼容worker，`absent` 表示当前构建/环境没有登记实例；`starting/unreachable/unavailable` 的 `running=null` 表示尚未确认，`stopping` 表示正在等待现有任务结束。`stop` 处理当前兼容实例。排障或需要普通执行路径时设置进程环境 `HITHINK_FINANCE_NO_WORKER=1`。状态检查不启动worker、不联网。

worker 无法取得系统用户目录，或启动、握手失败且任务尚未发送时，CLI使用普通路径继续执行。发送后断线返回 `WORKER_RESULT_UNKNOWN`，需先检查输出文件再明确重试；队列满或停止中返回 `WORKER_BUSY`。请求预算包含排队时间，Ctrl+C取消当前请求。开发期 `npm run build` 会先标记构建中，成功后发布运行标识；`CLI_BUILD_NOT_READY` 应先完成构建。

CA/OpenSSL等相对进程路径按调用目录解析；自定义Node加载器或其他目录敏感的启动配置按调用目录分别复用。依赖声明与shrinkwrap也参与构建标识，修改依赖后运行 `npm run build` 可使旧worker与新构建隔离。

- 默认 `auto`：交互终端显示按屏幕宽度排版的表格，管道/重定向输出单行紧凑 JSON 信封；配置和显式 `--format` 可覆盖。
- `--format table` 使用业务默认列，按中文/常见 emoji 宽度对齐，数值右对齐；价格、成交量及涨跌幅标注契约单位，不额外查询名称。宽表转逐条记录，长值换行，空集合显示 `(empty)`。数字保留当前精度，字符串代码保留前导零；实际字宽取决于终端字体。
- 数据列表默认预览20条，显示本次返回/展示数量及已有分页元数据。`--max-rows N` 控制表格预览，0显示本次全部；`--columns field1,field2` 按原始字段选列，`--columns "*"` 查看全部列。两项只影响人类表格。业务视图先覆盖标的目录/检索、A股快照/历史和估值，其余取数结果使用通用视图。已确认语义的毫秒时间按 `Asia/Shanghai` 展示。
- `--format json` 输出两空格缩进的严格 JSON 信封，便于人类阅读及程序解析；`--format ndjson` 每次命令输出一个单行信封（数组仍在 `data` 内），适合按行读取。字段和成功判断相同。
- `--format csv` 输出本次数据行，支持管道背压。顶层数组或 `data.item` 为记录集合，详情对象为一行；CSV包含列头，空值为空单元格，嵌套值为JSON字符串。字段名和记录均按CSV规则转义；CSV不携带JSON类型信息。
- 远端命令的 `--output` 默认保存完整紧凑JSON信封；`--file-format ndjson|csv` 只导出本次数据行，stdout报告路径/格式/数量。行导出按背压增量序列化，取消或文件写入失败不替换已有目标文件；远端响应仍整体接收。命令不自动翻页，完整分页数据需调用方按契约逐页获取。`db export`、`market panel` 仍按各自的文件格式执行。

```bash
hithink-finance market snapshot --thscodes 600519.SH,000001.SZ
hithink-finance market snapshot --columns thscode,last_price --max-rows 10
hithink-finance symbol list --limit 100 --output symbols.ndjson --file-format ndjson --format json
```

- 成功以进程退出码 0 和 JSON 信封 `ok=true` 为准。
- `data validate` 的外层成功仅表示检查执行完成；质量通过还要求 `data.ok=true`。研究任务另行核对目标标的、窗口及行数，空库质量通过不能代替样本验收。
- 失败以非 0 退出码和 `ok=false` 为准，读取 `error.code`、`error.category`、`error.hint` 与请求标识。
- 远端上游使用 `{code, message, request_id, data}`，但 CLI 会规范化为自己的信封；不要混用两套成功判断。
- `--debug` 或 `DEBUG=hithink-finance*` 会在错误信封的 `meta.diagnostics` 中附加已脱敏的 request ID 与堆栈；错误信封只写 stderr。反馈问题时提供 CLI 版本、命令、错误码和 request ID，通过[官网](https://fuyao.aicubes.cn/)提供的支持方式联系。

## 大结果与数据源

批量历史行情使用 `market history-batch`、`index history-batch`、`fund history-batch`；三大财报使用 `financials income-batch`、`financials balance-sheet-batch` 和 `financials cash-flow-batch`。六个命令通过 `--thscodes`、`--codes-file` 或 `--codes-stdin` 接收代码，每批最多 10 个原始代码，先检查上限再规范化、稳定去重。

ETF/LOF 快照使用 `fund snapshot --thscode <CSV>`，最多 100 个原始代码，返回平铺报价行。

批量历史窗口和报表条件由整批共享，超限时需缩小输入范围。A 股批量 K 线支持 `--interval 1d|1w|1mo`；指数批量与 ETF 批量固定日线，指数历史为按上海日期滚动的近五年。参数与响应说明见[官方 API 文档](https://fuyao.aicubes.cn/docs/)。

六个 batch 的 `data.item` 按代码保存分组，每组保留时间和原记录数组。有效标的没有数据时保留空组；无效标的由服务省略，调用成功时退出 0。财报最近期数按每代码计算，默认 4 期、最多 20 期。`--output` 保存完整结果，CSV/NDJSON 每行导出一个代码分组。批量查询不自动重试传输或业务错误；OAuth 使用既有凭据续期与鉴权拒绝恢复流程。

```bash
hithink-finance market history-batch --thscodes 600519.SH,000001.SZ \
  --start-ms 1767196800000 --end-ms 1769788800000 --interval 1d --adjust forward \
  --output history-batch.json --format json
```

`--source auto|local|remote` 控制支持该选项的行情路由。只有具体命令声明的 `--output <path>` 才能直接落盘，它不是全局选项。

```bash
hithink-finance market panel \
  --start 2026-01-01 --end 2026-01-31 \
  --output panel.parquet --file-format parquet --format json

hithink-finance db export \
  --sql "SELECT * FROM v_daily_qfq" \
  --output daily.parquet --file-format parquet --format json
```

全市场、分页全集、多标的或长时间窗口必须落盘。终端和 Agent 对话只报告路径、行数、窗口和摘要。

## 本地 DuckDB

```bash
hithink-finance data init --format json
hithink-finance data sync --format json
hithink-finance data status --format json
hithink-finance data validate --format json
hithink-finance db describe --format json
```

初始化和同步使用当前全局凭据或本次显式 Key；已有本地库的只读查询通常不需要认证。迁移、修复、清理和卸载等有副作用操作先查看计划或帮助，并在命令要求时获得用户明确确认。

`auth status` 只读当前全局认证状态；`connected` 表示本地可用或可安全续期，线上访问需通过有界请求验证。

严格只读研究先用文件系统确认目标数据库存在并固定 `--db` 路径，再查看 `data status` 和 `data migrate` 的默认迁移计划。仅在计划的 `data.versions` 为空时运行 `data validate`；有待执行迁移时先报告维护需求。`data status` 可创建缺失数据库，`data validate` 和 `db describe` 会应用普通迁移，因此不用于直接探测未知目标。表结构可用 `db query` 查询 `information_schema`。

远端初始化和同步下载数据包时，交互终端会在 stderr 动态刷新进度；stderr 被重定向时会输出开始、完成及节流后的进度日志（至少相隔 5 秒且新增 8 MiB）。无论何种模式，`--format json` 的结果信封都只写入 stdout。

下载校验在流式写盘过程中增量计算 SHA-256，不会为了哈希再次把完整 dump 读入内存。DuckDB 默认最多使用 4 个线程，内存上限按系统内存的 50% 计算并限制在 256 MiB 至 4 GiB，以满足带主键索引的增量导入与事务提交；可用 `HITHINK_FINANCE_DUCKDB_THREADS` 和 `HITHINK_FINANCE_DUCKDB_MEMORY_LIMIT`（例如 `2GiB`）覆盖。只读查询会响应终止信号；数据导入提交后仍先完成复权、元数据和质量一致性收尾。

stdin 输入受大小保护：API Key 最多 16 KiB，批量证券代码最多 1 MiB。超限返回 `CLI_STDIN_TOO_LARGE`，不会继续缓存输入。

更新和卸载的前台子进程均有执行时限。Windows 使用 `taskkill /t /f`，POSIX 使用独立进程组的 `SIGTERM`/`SIGKILL` 终止整棵前台进程树；超时返回 `CLI_CHILD_TIMEOUT`。普通命令的 detached 更新检查由跨进程租约保护，同一状态目录最多一个刷新任务。

## 配置优先级

CLI 按以下顺序解析非敏感配置：

1. CLI 参数
2. 环境变量
3. 项目 `hithink-finance.config.json`
4. 用户配置
5. 默认值

自动发现的项目配置可以不存在；通过 `--config` 或 `HITHINK_FINANCE_CONFIG` 显式指定文件时，该文件必须存在，否则返回 `CONFIG_NOT_FOUND`。

使用 `hithink-finance config show --format json` 查看最终生效的非敏感配置。

## Agent Skill lifecycle

CLI 包内包含 14 个独立 Skills，宿主优先根据 description 直接选择业务域，选中后读取对应入口与命令 reference；共享规则和辅助选路由 `hithink-finance-shared` 提供。通过 `hithink-finance skills status|sync|remove` 安装、检查和移除。

首次全局安装采用保存的 `auto` 策略：检测已安装的 Codex、Claude Code、Cursor、Gemini CLI、OpenCode、GitHub Copilot CLI、Trae、WorkBuddy 和 QClaw，并只向检测到的客户端同步。仅存在旧 `skills` 目录不算安装证据；未检测到任何客户端时不会创建一批 Agent 根目录。CLI 升级和 `update` 会复用同一策略自动更新。

默认将内容发布到 CLI 用户级数据目录，再为每个目标的每个 Skill 建立目录链接（Windows 为 junction，其他平台为 symlink），因此多 Agent 只共享一份内容。`status --format json` 实际校验共享内容和逐目标文件；`ready` 不代表客户端已加载，新增后可能需要刷新或新建会话。

### 同步与目标目录

如果 npm 使用了 `--ignore-scripts`，优先在安装完成后执行：

```bash
hithink-finance skills sync --repair --format json
```

同步从已安装 CLI 包的 `skills/` 读取内容与 manifest，发布到用户级共享目录，并为选定 Agent 建立链接。默认目标目录如下：

| Agent              | Skills 根目录                                                                    |
| ------------------ | -------------------------------------------------------------------------------- |
| Codex              | `~/.codex/skills/`                                                               |
| Claude Code        | `~/.claude/skills/`                                                              |
| Cursor             | `~/.cursor/skills/`                                                              |
| Gemini CLI         | `~/.gemini/skills/`                                                              |
| OpenCode           | Windows：`%APPDATA%/opencode/skills/`；macOS/Linux：`~/.config/opencode/skills/` |
| GitHub Copilot CLI | `~/.copilot/skills/`                                                             |
| Trae / Trae CN     | `~/.trae/skills/` / `~/.trae-cn/skills/`                                         |
| WorkBuddy          | `~/.workbuddy/skills/`                                                           |
| QClaw              | `~/.qclaw/skills/`                                                               |

链接或同步异常时，先运行 `skills status --format json` 查看目标详情，再使用下面的命令修复。客户端不支持目录链接时，可为该目标选择 `--copy`；CLI 会验证并替换自己管理的链接，保留共享源内容及其他 Agent 的链接。安装后刷新或新建 Agent 会话。

```bash
# 追加目标，保留已有选择
hithink-finance skills sync --agent claude-code --format json
hithink-finance skills sync --agent workbuddy --agent qclaw --format json

# 回到自动检测；已显式添加的目标仍保留
hithink-finance skills sync --agent auto --format json

# 为一个已知客户端使用的目录设置持久化覆盖；仅在不兼容链接时使用复制模式
hithink-finance skills sync --agent cursor --directory <absolute-path> --copy --format json

# 查看、修复、移除
hithink-finance skills status --format json
hithink-finance skills sync --repair --format json
hithink-finance skills remove --agent codex --format json
```

安装时可设置 `HITHINK_FINANCE_SKILLS_AGENTS=auto` 或以逗号分隔的目标名称来替换保存策略；值必须非空且全部合法，`auto` 不能与名称混用。显式指定的目标即使尚未检测到客户端也会创建对应 Skills 根目录。`sync --agent <name>` 会解除该目标此前的排除状态。`remove --agent <name>` 只删除 CLI 托管内容并阻止自动模式再次添加；无 `--agent` 时移除全部托管内容并禁用后续自动重装，直到再次同步。

同步由互斥锁保护，先验证新共享内容再发布；单个目标失败不会把其他成功目标误报为失败。CLI 不覆盖未知或用户占用的同名目录。哈希未变的历史托管副本会在首次同步时自动迁移为共享链接，修改过的副本则保留并报告冲突；确认客户端不支持目录链接后，可为该目标显式使用 `--copy`。npm 使用 `--ignore-scripts` 时，安装后执行 `hithink-finance skills sync --repair --format json`。直接 `npm uninstall -g` 不保证生命周期清理，先执行 `hithink-finance skills remove`。

## 开发与验证

```bash
npm ci --ignore-scripts
npm run generate:contracts
npm run verify
node scripts/release-smoke.mjs
```

- 改动命令、选项、输出或错误语义后，先运行 `npm run generate:contracts` 更新 CLI 自带能力与 Skill 契约。
- `npm run verify` 依次检查格式、lint、类型、测试和构建。
- 版本变化见 [`CHANGELOG.md`](CHANGELOG.md)，安全问题按 [`SECURITY.md`](SECURITY.md) 私下报告。
