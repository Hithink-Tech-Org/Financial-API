<p align="center">
  <img src="dsh-plugins/hithink-finance/assets/icon.png" alt="同花顺金融数据服务图标" width="128" height="128">
</p>

<h1 align="center">同花顺金融数据</h1>

<p align="center">
  <strong>为 AI Agent、量化研究者和应用开发者提供同花顺官方金融数据</strong>
</p>

<p align="center">
  <a href="https://fuyao.aicubes.cn/"><img src="https://img.shields.io/badge/官网-fuyao.aicubes.cn-0b66ff" alt="官网"></a>
  <a href="https://fuyao.aicubes.cn/docs/"><img src="https://img.shields.io/badge/API%20Docs-同花顺金融数据服务-0f766e" alt="API 文档"></a>
  <a href="https://lumi.10jqka.com.cn/?channel=Hithink-API"><img src="https://img.shields.io/badge/%E5%90%8C%E8%8A%B1%E9%A1%BAAI%E5%AE%A2%E6%88%B7%E7%AB%AF-%E4%B8%8B%E8%BD%BD-d92b32" alt="同花顺AI客户端下载"></a>
  <a href="hithink-finance-cli/package.json"><img src="https://img.shields.io/badge/Node.js-22.13%2B%20%2822.x%29%20%7C%2024%2B-339933" alt="Node.js 22.13+（22.x）或 24+"></a>
  <a href="dsh-plugins/hithink-finance/README.md#安装"><img src="https://img.shields.io/badge/DeepSeek%20Harness-%E6%8F%92%E4%BB%B6-4d6bfe" alt="DeepSeek Harness 插件"></a>
  <a href="python/pyproject.toml"><img src="https://img.shields.io/badge/Python-3.11%2B-3776ab" alt="Python 3.11+"></a>
</p>

<p align="center">
  <a href="#项目介绍">项目介绍</a> ·
  <a href="#数据能力范围">数据能力范围</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#示例与灵感">示例与灵感</a> ·
  <a href="#star-趋势">Star 趋势</a> ·
  <a href="#license">License</a>
</p>

## 项目介绍

同花顺金融数据是同花顺官方提供和维护的金融数据服务。本仓库汇集接入文档、客户端工具、Agent Skills 和示例，方便在 AI 对话、研究脚本和业务应用中使用同一数据服务。

### 使用场景

- **AI 对话与分析**。通过 MCP 或 DeepSeek Harness 插件查询行情和财报，也可以在同花顺AI客户端直接使用金融数据和分析功能。
- **量化研究与自动化**。用 CLI 或 Python 批量取数和导出，或用本地 DuckDB 研究历史数据。
- **应用集成**。通过 REST API 将金融数据接入网站、App 或后台服务。

### 能力范围

提供金融行情、财务与研究数据，覆盖股票、指数与板块、基金和公开衍生品等领域。[查看数据能力范围](#数据能力范围)

### 项目结构

各子项目的安装和使用说明位于对应目录，REST API 与 MCP 的接口契约集中在 `docs/`。使用 CLI 的 Agent Skills 随 CLI 分发，独立的 REST API 和 MCP Skills 位于 `skills/`。

| 目录 | 用途 | 文档入口 |
| --- | --- | --- |
| `hithink-finance-cli/` | 安装命令行工具，查询和导出数据，管理内置 Skills。 | [CLI 使用指南](hithink-finance-cli/README.md) |
| `python/` | 在 Python 或 Notebook 中取数，用 DuckDB 维护本地历史数据。 | [Python SDK](python/README.md) · [marketdb](python/toolkit/marketdb/README.md) |
| `docs/` | 查阅接口参数、响应字段和 MCP 接入配置。 | [文档中心](docs/README.md) · [REST API](docs/api/README.md) · [MCP](docs/mcp.md) |
| `skills/` | 为 Agent 安装独立 Skill，查找 REST 接口或 MCP 工具。 | [REST API Skill](skills/hithink-finance/SKILL.md) · [MCP Skill](skills/hithink-finance-mcp/SKILL.md) |
| `dsh-plugins/` | 在 DeepSeek Harness 中取数、看图和制作看板。 | [插件安装](dsh-plugins/hithink-finance/README.md#安装) |
| `examples/` | 查找可运行的 Python 示例和可复用的看板 Prompt。 | [示例与灵感](examples/README.md) |

## 数据能力范围

| 数据领域 | 覆盖内容 | 文档 |
| --- | --- | --- |
| 标的与交易日历 | 标的搜索、代码表、交易日历和交易时段 | [公共基础数据](docs/api/meta/README.md) |
| A 股 | 最新行情和历史日 K、集合竞价、公司行动与复权、财报和指标、估值、新股申购与上市日历 | [A 股数据](docs/api/a-share/README.md) |
| A 股特色数据 | 涨跌停池、炸板池、连板天梯、个股异动、热榜和龙虎榜 | [特色数据](docs/api/a-share/README.md#同花顺功能数据) |
| 指数与板块 | 指数与板块目录、成分股、快照和历史行情 | [指数与板块](docs/api/index/README.md) |
| 公募基金 | 基金档案、经理、持仓、净值、区间收益、回撤和场内行情 | [公募基金](docs/api/fund/README.md) |
| 公开期货与期权 | 品种和合约、分时和日 K，以及期货交易日程、持仓、仓单和基差 | [期货](docs/api/futures/README.md) · [期权](docs/api/options/README.md) |
| 港股新股 | 递表、认购和上市日历，以及发行价格和每手股数 | [港股新股](docs/api/hk-share/README.md) |
| 资讯事件 | 资讯详情、快讯、公告解读、专题、异动解读和个股分时新闻 | [资讯事件](docs/api/news/README.md) |
| 批量导出与本地研究 | 全市场全量或增量日 K、公司行动等数据文件，以及本地 DuckDB 查询与导出 | [Market Dumps](docs/api/market-dumps.md) · [marketdb](python/toolkit/marketdb/README.md) |

分钟 K、tick、Level-2、港股和美股行情、宏观数据、新闻公告和研报原文、基金申赎交易超出公开接入范围。资金流向、高频动向和专业期货期权等端内专用能力可在[同花顺AI客户端](#同花顺ai客户端)使用。实际权限、频率和时间范围以账号授权和接口文档为准。

查询前先确认标的代码。全市场、长时间范围和大量分页结果请导出为文件。触发限流时降低并发并退避重试。结果摘要注明数据时间，历史行情注明复权口径，财务数据注明报告期。

## 快速开始

| 你想做什么 | 接入方式 |
| --- | --- |
| 在终端或 Agent 中取数和导出 | [CLI](#cli) |
| 从支持 MCP 的对话客户端取数 | [MCP](#mcp) |
| 把金融数据接入应用或服务 | [REST API](#rest-api) |
| 在 Python、Notebook 或 DuckDB 中研究数据 | [Python](#python) |
| 给 Agent 增加 REST API 或 MCP 的使用指引 | [Agent Skills](#agent-skills) |
| 在 DeepSeek Harness 中取数、看图和制作看板 | [DeepSeek Harness 插件](#deepseek-harness-插件) |
| 打开客户端直接体验金融数据与分析 | [同花顺AI客户端](#同花顺ai客户端) |

已有凭据可直接复用。CLI 和 DeepSeek Harness 插件支持同花顺账号 OAuth。REST API、MCP 和 Python 使用 API Key，可在[管理页](https://fuyao.aicubes.cn/admin/)获取，再通过用户级环境变量 `HITHINK_FINANCE_API_KEY` 或客户端 Secret 安全配置。

### CLI

在 Node.js 环境安装后，先检查现有登录。首次使用或 OAuth 失效时运行 `hithink-finance auth login --method oauth`，完成浏览器授权。

```bash
npm install -g @hithink-tech/hithink-finance-cli
hithink-finance auth status --format json
hithink-finance market snapshot --thscodes 600519.SH --format json
```

已安装的 Agent 可使用 CLI 内置 Skills，运行 `hithink-finance skills status --format json` 查看同步状态。[CLI 安装与命令](hithink-finance-cli/README.md) · [CLI Skills 管理](hithink-finance-cli/README.md#agent-skill-lifecycle)

<details>
<summary>复制给 Agent</summary>

```text
请帮我通过 CLI 接入同花顺金融数据。先检查 Node.js 和现有 hithink-finance，缺少 CLI 时用 npm install -g @hithink-tech/hithink-finance-cli 安装。运行 hithink-finance auth status --format json，复用有效凭据，首次使用时引导我完成 OAuth 登录。检查内置 Skills 是否可用，再运行 hithink-finance market snapshot --thscodes 600519.SH --format json 验证取数。只汇报验证状态、数据时间和必要结果，不输出凭据。
```

</details>

### MCP

在支持 HTTP MCP 的客户端中添加 `https://fuyao.aicubes.cn/mcp/a-share`，将 `X-api-key` 请求头指向客户端 Secret，重连后用一个已知标的验证。其他数据域、配置示例和工具发现方式见 [MCP 接入说明](docs/mcp.md)。

<details>
<summary>复制给 Agent</summary>

```text
请按 https://github.com/Hithink-Tech-Org/Financial-API/blob/main/docs/mcp.md 帮我配置当前客户端的同花顺金融数据 MCP。先接入 https://fuyao.aicubes.cn/mcp/a-share，保留其他 MCP 配置。复用 HITHINK_FINANCE_API_KEY 或通过客户端 Secret 配置 X-api-key，缺少 Key 时引导我在 https://fuyao.aicubes.cn/admin/ 获取。重连后用 tools/list 确认行情工具，并查询 600519.SH 验证连接。需要我在客户端操作时，告诉我具体怎么做，不输出凭据。
```

</details>

### REST API

将 API Key 配置为 `HITHINK_FINANCE_API_KEY`，再请求单只股票行情。业务成功需同时满足 HTTP 200 和响应 `code == 0`。[REST API 契约](docs/api/README.md) · [在线接口文档](https://fuyao.aicubes.cn/docs/)

```bash
curl --fail-with-body 'https://fuyao.aicubes.cn/api/a-share/prices/snapshot?thscodes=600519.SH' \
  -H "X-api-key: ${HITHINK_FINANCE_API_KEY}"
```

<details>
<summary>复制给 Agent</summary>

```text
请按 https://github.com/Hithink-Tech-Org/Financial-API/blob/main/docs/api/README.md 帮我接入同花顺金融数据 REST API。复用用户级 HITHINK_FINANCE_API_KEY，缺少 Key 时引导我在 https://fuyao.aicubes.cn/admin/ 获取并安全配置。向 https://fuyao.aicubes.cn/api/a-share/prices/snapshot 发送带 X-api-key 的 GET 请求，传 thscodes=600519.SH，核对 HTTP 200 和业务 code=0，再给出本项目所用语言的最小调用示例，不把 Key 写入代码或日志。
```

</details>

### Python

使用 Python 3.11 或更高版本，在虚拟环境中从仓库根目录安装，配置 `HITHINK_FINANCE_API_KEY` 后运行行情示例。

```bash
git clone https://github.com/Hithink-Tech-Org/Financial-API.git
cd Financial-API
python -m pip install -e ./python
python python/toolkit/fuyao/scripts/fuyao.py prices-snapshot --thscodes 600519.SH
```

[Python SDK 与取数文档](python/README.md) · [本地 DuckDB 指南](python/toolkit/marketdb/README.md)

<details>
<summary>复制给 Agent</summary>

```text
请按 https://github.com/Hithink-Tech-Org/Financial-API/blob/main/python/README.md 在我的 Python 环境接入同花顺金融数据。复用已有仓库和虚拟环境，缺少仓库时从 https://github.com/Hithink-Tech-Org/Financial-API.git 克隆，在仓库根运行 python -m pip install -e ./python。复用 HITHINK_FINANCE_API_KEY，缺少 Key 时引导我安全配置。运行 python python/toolkit/fuyao/scripts/fuyao.py prices-snapshot --thscodes 600519.SH 验证，并给出一个可放进脚本或 Notebook 的最小示例，不输出凭据。
```

</details>

### Agent Skills

按宿主的 Skill 安装方式导入完整目录，保留 `references/`。通过 HTTP 接入时选择 [`hithink-finance`](skills/hithink-finance/SKILL.md)，使用已连接的 MCP 时选择 [`hithink-finance-mcp`](skills/hithink-finance-mcp/SKILL.md)。

<details>
<summary>复制给 Agent</summary>

```text
请从 https://github.com/Hithink-Tech-Org/Financial-API 的 skills/ 目录为当前 Agent 安装同花顺金融数据 Skill。已连接同花顺 MCP 时选 hithink-finance-mcp，否则选 hithink-finance 并复用已有 API Key。按宿主方式导入完整目录和 references/，确认 Skill 已被识别，再用对应方式查 600519.SH 的最新行情。缺少权限或凭据时告诉我具体需要完成哪一步，不输出凭据。
```

</details>

### DeepSeek Harness 插件

在 DeepSeek Harness 的「插件」页面打开「添加插件」，粘贴以下完整包名，然后点击「安装」。

```text
@hithink-tech/dsh-finance
```

在「已安装」确认「同花顺金融数据」已启用。从左侧打开工作台，在「设置 → 账号连接」用同花顺账号或 API Key 连接，再回到对话查询一次行情。

[其他安装方式](dsh-plugins/hithink-finance/README.md#安装) · [插件快速开始](dsh-plugins/hithink-finance/README.md#快速开始)

<details>
<summary>复制给 Agent</summary>

```text
请帮我在当前 DeepSeek Harness 中接入同花顺金融数据。打开「插件 → 添加插件」，粘贴完整包名 @hithink-tech/dsh-finance 并点击安装。如果当前版本没有此入口，按 https://github.com/Hithink-Tech-Org/Financial-API/blob/main/dsh-plugins/hithink-finance/README.md#安装 选择对应的安装方式。安装并启用后，引导我从工作台设置完成账号连接，再在 DSH 对话里查询 600519.SH 的最新行情。需要我扫码或操作界面时，告诉我具体步骤。
```

</details>

### 同花顺AI客户端

[下载同花顺AI客户端](https://lumi.10jqka.com.cn/?channel=Hithink-API)，打开后进入对话，输入「查询贵州茅台的最新行情并注明行情时间」。

<details>
<summary>复制给 Agent</summary>

```text
请通过 https://lumi.10jqka.com.cn/?channel=Hithink-API 帮我开始使用同花顺AI客户端。根据我的系统找到下载入口，引导我安装并按客户端提示完成登录。打开对话后，用「查询贵州茅台的最新行情并注明行情时间」完成首次体验。需要我在客户端操作时，告诉我具体怎么做。
```

</details>

## 示例与灵感

点击预览图进入案例和可复制的 Prompt。[全部看板灵感](examples/inspirations/README.md) · [可运行的 Python 示例](python/examples/README.md)

<table>
  <tr>
    <td width="50%">
      <a href="examples/inspirations/01-stock-overview/README.md"><img src="examples/inspirations/01-stock-overview/preview.jpg" alt="单股行情与趋势速览看板"><br><strong>单股行情与趋势速览</strong></a>
    </td>
    <td width="50%">
      <a href="examples/inspirations/06-marketdb-research/README.md"><img src="examples/inspirations/06-marketdb-research/preview.jpg" alt="本地全市场趋势研究看板"><br><strong>本地全市场趋势研究</strong></a>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <a href="examples/inspirations/03-index-constituents/README.md"><img src="examples/inspirations/03-index-constituents/preview.jpg" alt="同花顺概念板块联动看板"><br><strong>同花顺概念板块联动</strong></a>
    </td>
    <td width="50%">
      <a href="examples/inspirations/08-dragon-tiger-watch/README.md"><img src="examples/inspirations/08-dragon-tiger-watch/preview.jpg" alt="龙虎榜机构与游资观察看板"><br><strong>龙虎榜机构与游资观察</strong></a>
    </td>
  </tr>
</table>

## Star 趋势

<a href="https://www.star-history.com/#Hithink-Tech-Org/Financial-API&amp;Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=Hithink-Tech-Org/Financial-API&amp;type=Date&amp;theme=dark">
    <img src="https://api.star-history.com/svg?repos=Hithink-Tech-Org/Financial-API&amp;type=Date" alt="Hithink-Tech-Org/Financial-API 的 GitHub Star 趋势">
  </picture>
</a>

## 参与贡献

使用遇到问题、发现缺陷或想改进文档，欢迎通过 [GitHub Issues](https://github.com/Hithink-Tech-Org/Financial-API/issues) 反馈。

[开发与验证](AGENTS.md) · [更新日志](CHANGELOG.md) · [Monorepo 迁移指南](docs/monorepo-migration.md)

## License

本仓库采用 [MIT License](LICENSE)。
