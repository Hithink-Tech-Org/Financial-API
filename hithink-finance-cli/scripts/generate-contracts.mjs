import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { format } from 'prettier';
import { createHash } from 'node:crypto';
import { remoteCapabilities } from '../dist/contracts/remote-capabilities.js';
import { localCapabilities } from '../dist/contracts/local-capabilities.js';
import { authCapabilities } from '../dist/contracts/auth-capabilities.js';
import { remoteOutputOptions, tableOutputOptions } from '../dist/contracts/output-options.js';
import { externalize } from '../dist/output/json.js';

const root = path.resolve(process.argv[2] ?? process.cwd());
async function writeFormatted(file, content, parser) {
  await writeFile(
    file,
    await format(content, {
      parser,
      singleQuote: true,
      trailingComma: 'all',
      printWidth: 100,
    }),
  );
}
await mkdir(path.join(root, 'schemas'), { recursive: true });
const capabilities = [
  ...authCapabilities.map((item) => ({ ...item, source: 'authentication' })),
  ...remoteCapabilities.map(({ id, command, endpoint, method, paging, window }) => ({
    id,
    command,
    endpoint,
    method,
    paging,
    window,
    source: 'remote',
  })),
  ...localCapabilities.map(({ id, command, description }) => ({
    id,
    command,
    description,
    source: 'local',
  })),
].sort((left, right) => left.id.localeCompare(right.id));
const skillCapabilities = [...remoteCapabilities, ...localCapabilities].sort((left, right) =>
  left.id.localeCompare(right.id),
);
await writeFormatted(
  path.join(root, 'schemas', 'capabilities.json'),
  `${JSON.stringify({ schema_version: '1', global_options: externalize(tableOutputOptions), capabilities }, null, 2)}\n`,
  'json',
);
await writeFormatted(
  path.join(root, 'schemas', 'command-envelope.schema.json'),
  `${JSON.stringify(
    {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'hithink-finance command envelope',
      oneOf: [
        { properties: { ok: { const: true } }, required: ['ok', 'command', 'data', 'meta'] },
        { properties: { ok: { const: false } }, required: ['ok', 'command', 'error', 'meta'] },
      ],
    },
    null,
    2,
  )}\n`,
  'json',
);

const domainConfigs = {
  shared: {
    description:
      '管理 hithink-finance CLI 的 OAuth/API Key 登录、配置、自检、版本更新、卸载和 Skills 安装/同步/修复；查询 CLI 可用能力及通用输出规则。',
    identity:
      'CLI 认证、配置、输出和生命周期入口。宿主优先依据各内置 Skill 的 description 选择业务域；此处提供通用规则及需要时的辅助选路。',
    decisions: [
      ['检查 CLI 是否可用或版本', '`hithink-finance version --format json`'],
      ['查看真实能力清单', '`hithink-finance capabilities --format json`'],
      ['查看某个命令参数契约', '`hithink-finance schema <capability-id> --format json`'],
      [
        '首次登录（默认推荐 OAuth）',
        '`hithink-finance auth login --method oauth`；先用 `auth status` 复用当前有效凭据',
      ],
      [
        '显式选择 API Key 登录',
        '先复用统一来源的 Key，缺失时在 https://fuyao.aicubes.cn/admin/ 获取；用 `hithink-finance auth login --method api-key --api-key-stdin --format json` 登录，交互终端使用 `--method api-key` 隐藏输入',
      ],
      ['检查认证状态', '`hithink-finance auth status --format json`'],
      ['查看非敏感配置', '`hithink-finance config show --format json`'],
      ['诊断运行环境', '`hithink-finance doctor --format json`'],
      [
        '同步/修复配套 Skills',
        '`hithink-finance skills status --format json` 或 `hithink-finance skills sync --format json`',
      ],
      [
        '更新 CLI',
        '`hithink-finance update --check --format json` 只检查；确认后用 `hithink-finance update --format json` 更新到最新版',
      ],
      ['预览卸载', '`hithink-finance uninstall --plan --format json`'],
    ],
    boundaries: [
      '用户可以为了便利把 API Key 提供给 Agent 上下文；Agent 不复述，并提示聊天平台可能保留消息记录。不要把 Key 写入命令参数、项目配置、日志、Markdown、Git 或其他可共享内容；本地配置优先 stdin、用户级持久来源或系统凭据库。',
      '不要把 stderr 更新提示、诊断详情或完整大数据结果当作最终答案原样展开。',
    ],
  },
  symbol: {
    description:
      '通过 hithink-finance CLI 搜索股票、指数、基金、期货和期权的名称或代码，消歧为 thscode；导出 A 股或指数代码表。',
    identity:
      '标的识别和代码表路由。目标是把自然语言名称、ticker、thscode 或代码表需求变成后续可执行的证券标识。',
    decisions: [
      ['用户给出名称/简称/ticker，需要消歧', '`symbol search`'],
      ['用户要股票或指数代码表/全量目录', '`symbol list --output <file>`，按页保存并核对完整性'],
      ['用户要价格、K 线、快照', '切到 `hithink-finance-market`'],
      ['用户要指数成分或指数行情', '切到 `hithink-finance-index`'],
    ],
    boundaries: [
      '只解决“标的是什么”。不要在本 skill 内回答价格、涨跌幅、财报或策略结论。',
      '名称搜索可能返回多个候选；用于后续精确查询前必须让用户意图或字段证据完成消歧。',
    ],
  },
  market: {
    description:
      '通过 hithink-finance CLI 查询 A 股实时价格、行情快照、集合竞价、历史 K 线、交易日历、复权因子和公司行动，导出本地历史行情面板。',
    identity:
      '普通行情和本地行情派生能力。优先使用本地库覆盖的历史/面板能力，必要时走远端同花顺金融数据服务。',
    decisions: [
      ['单票历史日线/K 线', '`market history`；`--source auto` 会在本地覆盖时走本地'],
      ['多只 A 股历史 K 线', '`market history-batch --thscodes <codes>`；每批最多 10 个原始代码'],
      ['实时或分页行情快照', '`market snapshot`'],
      ['集合竞价实时/终态快照', '`market auction-snapshot`'],
      ['集合竞价短期基准', '`market auction-benchmark`'],
      ['交易日历', '`market calendar`'],
      ['复权因子', '`market adjustment-factors`'],
      ['公司行动/除权除息事件', '`market corporate-actions`'],
      ['全市场区间面板/批量研究输入', '`market panel --output <file>`'],
      ['涨跌停池、炸板池、连板、热股、龙虎榜、异动', '切到 `hithink-finance-special-data`'],
    ],
    boundaries: [
      '不提供投资建议、买卖判断或收益承诺；只返回数据或中立统计。',
      '全市场、长区间、多标的结果必须落盘，只汇报路径、行数和关键元信息。',
    ],
  },
  'special-data': {
    description:
      '通过 hithink-finance CLI 查询涨停池、跌停池、炸板池、连板天梯、股票异动及原因、热股与热度排名、龙虎榜和机构营业部记录。',
    identity: '特色榜单和事件型数据入口。强调窗口约束和榜单口径，不替代普通行情或财报。',
    decisions: [
      ['今日异动列表/异动标签', '`special anomaly-list`，仅今日'],
      ['最多 50 只股票的今日异动原因', '`special anomaly-stock`，仅今日'],
      ['涨停池分页', '`special limit-up-pool`'],
      ['跌停池分页', '`special limit-down-pool`'],
      ['炸板池分页', '`special limit-break-pool`'],
      ['连板天梯', '`special limit-up-ladder`'],
      ['飙升榜', '`special skyrocket`'],
      ['当前热股榜', '`special hot-stock`'],
      ['历史热股榜', '`special hot-stock-history`'],
      ['单股热度趋势', '`special hot-stock-trend`'],
      ['龙虎榜/机构/游资', '`special dragon-tiger`'],
      ['市场涨停汇总与连板统计', '`special limit-up-statistics`'],
      ['单股龙虎榜机构金额', '`special dragon-tiger-stock-institution`'],
      [
        '营业部经典战绩与历史记录',
        '`special dragon-tiger-department-classic-record` 或 `special dragon-tiger-department-history`',
      ],
      ['严重异动与重点监控', '`special abnormal-monitor`'],
      [
        '集合竞价机会与可选日期',
        '`special auction-opportunities` 与 `special auction-opportunity-dates`',
      ],
    ],
    boundaries: [
      'today-only 能力不能补历史；用户要历史时说明边界并选择有历史窗口的命令。',
      '榜单热度不是投资建议，不要扩写成推荐或确定性原因。',
    ],
  },
  news: {
    description:
      '通过 hithink-finance CLI 查询资讯详情、快讯、公告解读、热门专题、日期范围异动解读和个股分时新闻。',
    identity: '资讯查询入口。保留正文 HTML、链接、字符串标识、空值与原有顺序。',
    decisions: [
      ['已知资讯标识的正文', '`news article-detail --client-type WEB --encoded-seq <id>`'],
      ['栏目快讯', '`news flash-list --tag-id <id> --seq 0`'],
      ['刷新快讯', '`news flash-refresh --tag-id <id> --seq <seq> --create-time-ms <ms>`'],
      ['公告详情与结构化解读', '`news notice-detail --seq <id>`'],
      ['热门深度专题', '`news topic-hot-list --tab-id <id>`'],
      ['日期范围异动解读', '`news anomaly-analysis --begin-date <date> --end-date <date>`'],
      ['个股分时新闻', '`news stock-timeline-list --thscode 300033.SZ --offset first`'],
    ],
    boundaries: [
      '栏目与内容标识由调用方按接口提供；内容链接不保证能转换为资讯详情标识。',
      '快讯只承诺单次查询，分页与刷新边界以接口说明为准；seq 必须使用字符串以保留长整数精度。',
      '公告查询提供已有结构化解读；公告正文、PDF 与附件超出当前范围。',
    ],
  },
  ipo: {
    description:
      '通过 hithink-finance CLI 查询 A 股新股申购和上市日历、港股递表与认购日历，以及发行价格、每手股数和入场费等新股资料。',
    identity: '新股资料与发行阶段查询入口。区分沪深、北交所和港股；港股发行标识来自日历。',
    decisions: [
      [
        'A 股发行、可申购或待上市新股',
        '`ipo a-share-calendar --market sh_sz|bj --status upcoming|subscribable|awaiting_listing`',
      ],
      ['港股递表记录', '`ipo hk-applications`'],
      ['港股认购或待上市日历', '`ipo hk-calendar`'],
      ['港股发行价格、每手股数和入场费', '`ipo hk-issue-detail --issue-code <id>`'],
    ],
    boundaries: [
      '发行资料不提供申购、交易或投资建议。',
      '发行记录标识与正式证券代码分别使用，不补造 thscode。',
    ],
  },
  financials: {
    description:
      '通过 hithink-finance CLI 查询 A 股利润表、资产负债表、现金流量表和财务指标；支持单只或批量查询、年报和季报窗口。',
    identity: 'A 股财务报表和指标入口。把报告期、时间窗口和 limit 约束转成稳定命令。',
    decisions: [
      ['利润表/收入成本利润项目', '`financials income`'],
      ['资产负债结构', '`financials balance-sheet`'],
      ['现金流量项目', '`financials cash-flow`'],
      [
        '多只股票的三大财务报表',
        '`financials income-batch`、`balance-sheet-batch` 或 `cash-flow-batch`；每批最多 10 个原始代码',
      ],
      ['单个报告期的财务指标', '`financials indicators`'],
      ['用户问价格或涨跌', '切到 `hithink-finance-market`'],
    ],
    boundaries: [
      '财务报表窗口最多 10 年；超过时拆分不重叠窗口并合并去重。',
      '`--limit` 与 `--start-ms/--end-ms` 互斥；不要同时传。',
    ],
  },
  index: {
    description:
      '通过 hithink-finance CLI 查询同花顺指数、概念、行业、地域和特色板块目录、指数成分股、指数实时快照和历史行情。',
    identity: '指数目录、指数成分和指数行情入口。只处理指数对象及其成分关系。',
    decisions: [
      ['找概念/行业/地域/特色指数目录', '`index catalog`'],
      ['查某个指数成分股', '`index constituents`'],
      ['查指数实时快照', '`index snapshot`'],
      ['查指数历史日线', '`index history`'],
      ['多只指数历史日线', '`index history-batch --thscodes <codes>`；每批最多 10 个原始代码'],
      ['查个股历史/快照', '切到 `hithink-finance-market`'],
    ],
    boundaries: [
      '指数代码通常是 `000000.SH/SZ/BJ/TI` 形式；不要把 A 股股票 thscode 当指数代码。',
      '成分股结果是指数成员关系，不等于用户的投资组合或推荐清单。',
    ],
  },
  fund: {
    description:
      '通过 hithink-finance CLI 查询基金档案、公司和经理、持仓、净值、收益、基金财务与资讯、在线回测、指标及 QDII 额度；查询 ETF/LOF 快照和 ETF 历史行情。',
    identity:
      '基金资料、机构与经理、财务、业绩、披露和场内行情入口。根据基金类型、标识来源与市场形态选择稳定命令。',
    decisions: [
      ['基金档案', '`fund profile`'],
      ['基金持仓', '`fund holdings`'],
      ['基金净值', '`fund nav`'],
      ['基金区间收益', '`fund returns`'],
      ['基金持有人结构', '`fund holders`'],
      [
        '基金在线回测',
        '先用 `fund backtest-indicators` 获取指标规则，再调用 `fund backtest-result`',
      ],
      ['基金画线/表格指标', '`fund indicators-line` / `fund indicators-table`'],
      ['QDII 额度汇总/列表', '`fund quota-summary` / `fund quota-list`'],
      ['基金公司详情', '`fund company-detail`'],
      [
        '基金经理资料/经历/业绩/风格',
        '`fund manager-detail/manager-experience/manager-performance/manager-style`',
      ],
      [
        '基金财务指标/利润表/资产负债表',
        '`fund financial-indicators/income-statements/balance-sheets`',
      ],
      ['基金诊断', '`fund diagnostics`'],
      ['基金资讯', '`fund news`'],
      ['在售或待售基金', '`fund offerings`'],
      ['历史股票/债券持仓', '先用对应 `report-dates`，再调用 `stock-history` 或 `bond-history`'],
      ['ETF/LOF 快照', '`fund snapshot`'],
      ['ETF 历史日线', '`fund history`'],
      [
        '多只场内基金行情',
        '`fund snapshot --thscode <CSV>` 最多 100 个原始代码；`fund history-batch` 最多 10 个',
      ],
      ['基金代码或名称搜索', '切到 `hithink-finance-symbol`'],
    ],
    boundaries: [
      '基金详情按单个 `thscode` 定位；场内快照使用原 `--thscode` 接收最多 100 个原始代码的 CSV，并返回平铺报价。',
      '复杂对象和数组参数使用 JSON 字符串；绝对时间使用 Unix 毫秒，动态字段与局部空值保持原义。',
      '`fund snapshot` 只支持 ETF/LOF；`fund history` 只支持 ETF、固定 `1d` 且窗口最多 5 年。',
      '基金数据不是投资建议，不要据此扩写买卖或收益承诺。',
    ],
  },
  futures: {
    description:
      '通过 hithink-finance CLI 查询期货品种、合约目录与详情、主力/次主力/主连、商品指数、交易时段与日程、持仓、仓单、基差、分时和日 K。',
    identity: '期货公开资料和行情入口。按完整 thscode、品种与日期语义选择稳定命令。',
    decisions: [
      ['期货品种', '`futures varieties`'],
      ['合约详情', '`futures contract-detail`'],
      ['品种或公司持仓', '`futures variety-positions` / `futures company-variety-positions`'],
      ['合约持仓', '`futures contract-positions` / `futures contract-position-history`'],
      [
        '仓单或基差',
        '`futures warehouse-receipts` / `futures latest-basis` / `futures basis-history`',
      ],
      ['交易日程', '`futures trading-schedule`'],
      ['分时或日 K', '`futures intraday` / `futures daily`'],
    ],
    boundaries: [
      '使用完整期货 thscode；品种代码必须大写并与合约匹配。',
      '历史持仓开始日在调用日前一年内；daily 的 start/end 必须成对提供。',
      '金融数值与日期允许 null，合法无数据数组保留为空数组。',
    ],
  },
  options: {
    description:
      '通过 hithink-finance CLI 查询期权品种、合约目录与详情、交易时段、分时和日 K 行情。',
    identity: '期权公开资料和行情入口。按完整 thscode 和固定行情参数查询。',
    decisions: [
      ['期权品种', '`options varieties`'],
      ['合约详情', '`options contract-detail`'],
      ['分时或日 K', '`options intraday` / `options daily`'],
    ],
    boundaries: [
      '分时 session 仅为 pre_market、intraday 或 post_market。',
      '日 K 周期固定 1d；start/end 必须成对提供。',
      '金融数值与日期允许 null，未知期权枚举保留原始编码。',
    ],
  },
  valuation: {
    description:
      '通过 hithink-finance CLI 查询 A 股最新估值快照，包括市盈率、市净率、市销率和市现率。',
    identity:
      'A 股当前估值快照入口。按用户给出的股票代码批量返回服务端口径的估值指标，不自行补算或扩展指标。',
    decisions: [
      ['查询一只或多只 A 股当前估值', '`valuation snapshot --thscodes <codes>`'],
      ['用户给出名称或简称而非 thscode', '先切到 `hithink-finance-symbol` 完成消歧'],
      ['用户要价格、涨跌或 K 线', '切到 `hithink-finance-market`'],
      ['用户要历史估值或 ROE', '说明当前能力不支持，不得用其他字段臆算替代'],
    ],
    boundaries: [
      '`--thscodes` 最多接受 100 个原始逗号分隔 token；空 token 或非 A 股代码会被拒绝。',
      '代码会转为大写并按首次出现顺序去重；估值字段允许为空或为负数，不要擅自过滤。',
      '估值数据不是投资建议，不要据此扩写买卖、目标价或收益承诺。',
    ],
  },
  data: {
    description:
      '通过 hithink-finance CLI 管理本地 DuckDB 数据的初始化、同步、状态、质量校验、迁移、修复、清理和删除，以及只读 SQL 查询和文件导出。',
    identity:
      '本地数据生命周期和 SQL 入口。负责让数据可用、可校验、可导出，而不是解释所有研究结论。',
    decisions: [
      ['首次建库或从 dump 导入', '`data init`'],
      ['增量/重新同步本地数据', '`data sync`'],
      ['查看库路径和 schema', '`data status`'],
      ['质量校验', '`data validate`'],
      ['迁移计划或应用', '`data migrate`'],
      ['重建复权等派生数据', '`data repair`'],
      ['清理下载缓存', '`data clean`'],
      ['删除本地库', '`data remove --plan` 先预览'],
      ['查看表/视图', '`db describe`'],
      ['只读 SQL 查询', '`db query --sql <sql>`'],
      ['大结果导出', '`db export --sql <sql> --output <file>`'],
    ],
    boundaries: [
      'SQL 必须只读；写入、DDL、删除或外部副作用不属于 `db query`。',
      '删除数据库或清除数据前先用 plan/状态输出让用户确认，真正删除需要显式 `--yes`。',
      '`data init` / `data sync` 下载阶段可立即取消；数据库导入提交后会先完成复权、元数据和质量一致性收尾，再报告取消。',
      '需要限制本地资源时使用 `HITHINK_FINANCE_DUCKDB_THREADS` / `HITHINK_FINANCE_DUCKDB_MEMORY_LIMIT`；`DATA_LOCK_OPEN_FAILED` 应检查状态目录权限和存储。',
      '查询结果很多时用 `db export --output <file>`，不要回显全表。',
    ],
  },
  research: {
    description:
      '通过 hithink-finance CLI 基于已有本地金融数据做中立研究：核验样本与时间窗口、描述性统计、面板导出和可复现实证数据集；组合本地命令完成多步分析。',
    identity:
      '研究工作流路由。它不拥有独立 `research` 命令，而是指导 Agent 组合 data、db 和 market panel 产出可复现数据证据。',
    decisions: [
      [
        '用户要构造研究样本/面板',
        '先按 research-workflow 确认库文件与迁移计划，再校验质量、窗口和样本后导出',
      ],
      ['用户要 SQL 统计或因子分布', '用 `db query` 小结果或 `db export` 大结果'],
      ['用户要解释数据缺口', '先 `data validate`，必要时 `data sync` 或 `data repair`'],
      ['用户要实时快照或最新榜单', '切到对应业务 skill，不在 research 中直接取数'],
      ['用户要投资建议/策略推荐', '拒绝给出建议，可提供中立数据分析边界'],
    ],
    boundaries: [
      '只做描述性、可复现、数据来源明确的研究辅助；不要生成买入/卖出/持有建议。',
      '必须保留查询 SQL、输入文件路径、输出路径、行数和时间窗口，便于复核。',
    ],
  },
};

const domainOrder = [
  'shared',
  'news',
  'symbol',
  'market',
  'special-data',
  'ipo',
  'financials',
  'index',
  'fund',
  'futures',
  'options',
  'valuation',
  'data',
  'research',
];

const localCommandDetails = {
  'fund.backtest-result': {
    exampleArgs: `--thscode 000001.OF --buy-conditions '{"indicator_code":"rsi_pct","operator":">","value":0.5}' --sell-conditions '{"indicator_code":"rsi_pct","operator":"<","value":0.3}' --buy-frequency-type WEEKLY --max-buy-times 5 --per-buy-amount 100 --output fund-backtest.json`,
    preconditions: [
      '先运行 fund backtest-indicators，按 indicator_code、support_operation、value_kind、unit 与 state_rules 核对用户指定的回测条件。示例仅用于说明参数结构，实际规则由用户给定。',
    ],
  },
  'market.history': {
    preconditions: [
      '`--source auto` 在本地覆盖时读取本地日线；远端路径先用 `auth status` 复用当前启用的 OAuth 或 API Key。可用 `--source local` 明确只读本地数据。',
    ],
  },
  'fund.indicators-line': {
    exampleArgs: `--indexes '[{"thscodes":["000001.OF"],"index_info":[{"index_id":"rsi_pct"}]}]' --time-range '{"time_type":"DAY_1","start":1788192000000,"end":1788796800000}'`,
    preconditions: [
      '每组 indexes 包含 thscodes 和 index_info；每个 index_info 元素包含 index_id。time_range 必须包含 time_type，绝对时间使用 Unix 毫秒。',
    ],
    errors: [
      '缺少嵌套字段时按错误中的 JSON 路径修正。指标 ID 与时间类型沿用已知契约或实际返回，不猜枚举。',
    ],
  },
  'fund.indicators-table': {
    exampleArgs: `--code-selectors '{"include":[{"type":"fund_code","thscodes":["000001.OF"]}]}' --indexes '[{"index_id":"maxDrawDownWeek"}]' --page-info '{"page_begin":0,"page_size":20,"code_begin":0,"code_page_size":20}' --output fund-indicators.json`,
    preconditions: [
      '已知基金集合用 code_selectors.include 的 fund_code + thscodes 显式选择；indexes 每项包含 index_id，排序 sort 每项包含 idx 与 type。',
    ],
    errors: [
      '核对响应 data.data 的唯一 thscode 数与 data.total；改变 page_info 后没有新增主键时停止，不把重复页当新增数据。已知代码可显式分批；未确认全集时报告已取得范围。',
    ],
  },
  'fund.quota-list': {
    exampleArgs: `--tab '["nazhi100"]' --buy true --output fund-quota.json`,
    preconditions: ['tab 为类别字符串数组；示例类别来自现有契约，其他类别须有已知取值依据。'],
  },
  'data.init': {
    exampleArgs: '--kline <kline.parquet> --events <events.parquet>',
    preconditions: [
      '远端初始化先通过 `auth status` 复用当前启用的 OAuth 或 API Key；首次登录默认推荐 OAuth。本地文件导入无需远端认证。',
      '本地文件导入必须同时提供 `--kline` 和 `--events`。',
      '远端全量初始化包含下载、导入和复权重建；使用可等待全部子进程的前台执行器，超时不少于 15 分钟。下载完成不表示命令已结束或数据库已解锁。',
      '仅在退出码 0 且 JSON 信封 `ok=true` 后，才对同一 `--db` 继续状态、行情或 SQL 查询。',
    ],
    parameters: [
      '`--kline <path>` 与 `--events <path>` 成对出现；可选 `--symbols <path>`。',
      '省略本地文件时从远端 Market Dump 初始化，使用当前全局凭据或本次显式 `--api-key-stdin`。',
    ],
    errors: [
      '只给 `--kline` 或只给 `--events` 会失败；两者必须成对。',
      '执行器超时或非零退出时，检查锁文件或错误中的存活 PID；PID 仍存活则继续等待，不得在该 DB 上继续执行或删除活锁。用户明确取消时才终止对应进程。',
    ],
  },
  'data.sync': {
    preconditions: [
      '需要当前可用凭据，先按 shared 查看只读 auth status，或提供本次显式 Key。',
      '命令会持有数据锁，避免并发写库。',
    ],
    parameters: ['使用全局 `--db` 指定库路径；默认路径来自平台数据目录。'],
    errors: ['认证失败时先回到 shared skill 的 auth 流程。'],
  },
  'data.status': {
    preconditions: [
      '查看库路径和 schema 版本；该命令可创建缺失数据库，严格只读任务须先用文件系统确认目标存在。',
    ],
    parameters: ['可用全局 `--db <path>` 指定库。'],
    errors: ['schema 过新时升级 CLI；schema 过旧时看 `data migrate`。'],
  },
  'data.validate': {
    preconditions: [
      '质量检查会先应用普通迁移。严格只读研究须先确认目标文件存在，并用 data migrate 的默认计划确认 versions 为空。',
    ],
    parameters: ['可用全局 `--db <path>` 指定库。'],
    errors: [
      '退出码 0 且外层 ok=true 表示检查执行成功；质量通过还要求 data.ok=true。data.issues 非空时按 code/count 报告问题。',
      '空库也可能质量通过；研究前另核对目标窗口、样本和行数。',
    ],
  },
  'data.repair': {
    preconditions: ['用于重建派生复权因子等本地派生数据。'],
    parameters: ['可用全局 `--db <path>` 指定库。'],
    errors: ['修复前后建议跑 `data validate` 复核。'],
  },
  'data.migrate': {
    exampleArgs: '',
    preconditions: ['默认只输出迁移计划；应用迁移前让用户确认。'],
    parameters: ['`--apply` 应用迁移；重型迁移需要 `--allow-heavy`。'],
    errors: ['看到重型迁移提示时不要自动加 `--allow-heavy`。'],
  },
  'data.clean': {
    preconditions: ['只清理 CLI 管理的下载缓存，不删除数据库。'],
    parameters: ['当前实现清理 cache；仍使用 `--format json` 读取结果。'],
    errors: ['不要把 cache 清理当作数据库删除。'],
  },
  'data.remove': {
    exampleArgs: '--plan',
    preconditions: ['高风险操作；先运行 `--plan` 报告路径和大小。'],
    parameters: ['真正删除需要全局 `--yes`；可用全局 `--db <path>` 指定目标。'],
    errors: ['没有用户明确确认时不要追加 `--yes`。'],
  },
  'db.describe': {
    preconditions: [
      '查询表和视图清单，并应用普通迁移；严格只读研究使用 db query 查询 information_schema。',
    ],
    parameters: ['可用全局 `--db <path>` 指定库。'],
    errors: ['如果库不存在或 schema 不兼容，先处理 `data status|migrate`。'],
  },
  'db.query': {
    exampleArgs: '--sql "<readonly sql>"',
    preconditions: ['只读 SQL；小结果才可直接读取 JSON。'],
    parameters: ['必填 `--sql <sql>`；大结果改用 `db export`。'],
    errors: ['不要执行写入、DDL、删除、外部函数或会改变状态的 SQL。'],
  },
  'db.export': {
    exampleArgs: '--sql "<readonly sql>" --output <result.parquet> --file-format parquet',
    preconditions: ['用于大结果或下游 pandas/notebook 消费。'],
    parameters: ['必填 `--sql <sql>` 和 `--output <path>`；`--file-format ndjson|csv|parquet`。'],
    errors: ['导出后只汇报路径、格式、行数，不回显文件内容。'],
  },
  'market.panel': {
    exampleArgs:
      '--start <YYYY-MM-DD> --end <YYYY-MM-DD> --output <panel.parquet> --file-format parquet',
    preconditions: ['需要本地库覆盖请求窗口；适合作为研究样本输入。'],
    parameters: ['必填 `--start YYYY-MM-DD --end YYYY-MM-DD --output <path>`；默认 parquet。'],
    errors: ['日期必须是 `YYYY-MM-DD`；大面板永远落盘。'],
  },
  'market.adjustment-factors': {
    exampleArgs: '--thscode <code> --start <YYYY-MM-DD> --end <YYYY-MM-DD>',
    preconditions: ['查询本地日级复权因子；需要本地库。'],
    parameters: ['必填 `--thscode <code>`；可选 `--start` / `--end`。'],
    errors: ['日期必须是 `YYYY-MM-DD`；没有本地库先走 `data init|sync`。'],
  },
};

const sharedReferenceFiles = {
  'query-worker.md': `# 本地查询 worker

现有远端命令默认透明复用当前系统用户、构建和环境的本地worker。首次按需启动，后续命令复用模块与HTTP连接，空闲约120秒退出；每条请求重新读取配置和凭据。帮助、认证、维护和数据库命令在前台；market history显式--source remote可复用。

\`\`\`bash
hithink-finance worker status --format json
hithink-finance worker stop --format json
\`\`\`

status只读、不启动worker、不联网。state=running表示可连接；absent表示没有当前兼容实例；starting/unreachable/unavailable的running=null表示尚未确认；stopping等待现有任务完成。stop作用于当前兼容实例。进程环境HITHINK_FINANCE_NO_WORKER=1使用普通路径。

CA/OpenSSL等相对进程路径按调用目录解析；自定义Node加载器等目录敏感配置按目录隔离。依赖声明与shrinkwrap参与构建标识；修改依赖后运行npm run build，使旧worker与新构建隔离。

启动/握手失败且任务未发送时使用普通路径。发送后断线返回WORKER_RESULT_UNKNOWN，不自动重放，应检查输出文件后明确重试。WORKER_BUSY表示队列满或正在停止。请求期限包含排队，Ctrl+C取消当前任务。CLI_BUILD_NOT_READY表示本地构建未完成，应先成功运行npm run build。
`,
  'global-rules.md': `# 全局规则

## 前置条件

- 宿主依据内置 Skill 的 description 直接选择业务域。选定命令后按需读取目标 reference 与 schema；需要发现未知命令时再运行 \`capabilities\`。同版本已读取的规则和目标 schema 可复用。
- 远端取数逐命令透明复用本地worker，空闲约120秒退出；认证、维护和数据库命令在前台。状态/停止/普通路径及不确定结果处理见 [本地查询worker](query-worker.md)。
- 默认 auto 在终端显示按宽度排版的表格，管道输出紧凑 JSON 信封；机器读取显式使用 \`--format json\`（两空格缩进）或 \`--format ndjson\`（每次命令一个单行信封，数组保留在 data 内）。
- \`--format table\` 使用业务默认列、数值右对齐和宽屏/窄屏布局；数据列表默认预览20条，\`--max-rows N\` 控制预览（0为本次全部），\`--columns a,b\` 按原始字段选列（\`*\`为全部）。这些选项仅影响终端表格；JSON/NDJSON和导出保持完整。
- \`--output <path>\` 只用于声明该参数的命令。远端默认保存完整紧凑JSON信封；\`--file-format ndjson|csv\` 将本次结果逐行导出，stdout报告路径/格式/数量。一次命令不自动翻页。CSV空值为空单元格、嵌套值为JSON字符串；NDJSON保留类型和嵌套结构。db export/market panel仍按各自文件格式契约执行。

## 输出契约

- \`auth status\` 用退出码表达连接状态：已连接退出 0，未连接退出 3；两者均在 stdout 返回 \`ok=true\`，读取 \`data.connected\`。读取或存储失败时，从 stderr 的 \`ok=false\` 信封读取 \`error\`。
- 命令执行成功以进程退出码 0 和 \`ok: true\` 为准；业务验收还应检查命令结果，例如质量检查的 \`data.ok\`、目标窗口、样本和行数。
- 错误以非 0 退出码和 \`ok: false\` 为准；读取 \`error.code\`、\`error.category\`、\`error.hint\`。
- 需要诊断时使用 \`--debug\`；已脱敏的 request ID 与堆栈位于 \`meta.diagnostics\`，非预期内部错误的预填问题链接位于 \`error.report_url\`。
- HTTP 429/502/503/504 优先于响应体中的业务错误信封进行有界重试；耗尽后返回 \`UPSTREAM_HTTP_<status>\`。
- 不要按上游旧格式 \`code == 0\` 判断成功。

## 大结果纪律

- 全市场、分页、长区间、多 ticker 数据不得回显完整内容。
- 远端大结果用该命令自己的 \`--output <path>\`，stdout 只保留路径/count 摘要。
- 本地大结果用 \`db export --output <path>\` 或 \`market panel --output <path>\`。
- 最终回答只报告输出路径、行数、时间窗口、命令摘要和必要字段名。
- 下游需要数据时让 pandas/notebook/脚本读取落盘文件。
`,
  'auth-and-config.md':
    '# 认证和配置\n\nCLI 默认推荐 OAuth。先运行 `auth status --format json` 复用当前有效凭据；首次登录使用 `auth login --method oauth`。已连接时沿用当前方式，OAuth 失效时重新授权；用户明确选择 API Key 时使用对应的登录与配置流程。\n\n同一系统用户的终端、Agent 与各安装副本共享一套认证状态。分别保存 OAuth 和 API Key，当前只启用一种；成功登录保存并启用新凭据。\n\n## 命令\n\n```bash\nhithink-finance auth status --format json\nhithink-finance auth login --method oauth\nhithink-finance auth login --method api-key --api-key-stdin --format json\nhithink-finance auth use api-key\nhithink-finance auth use oauth\nhithink-finance auth logout\nhithink-finance auth logout --all\nhithink-finance config show --format json\n```\n\n- 用户选择 API Key 时，在 https://fuyao.aicubes.cn/admin/ 获取。交互隐藏输入使用 `auth login --method api-key`。新 Key 远端验证成功后才保存；`--replace` 继续接受。\n- OAuth 登录默认连接生产认证服务。宿主使用 `auth login --method oauth --background --no-browser`，就绪后输出裸 HTTPS URL，再轮询本地 status。\n- `auth status` 展示连接状态、当前方式及可用凭据；`--debug` 提供附加诊断。状态检查不联网、不导入环境变量、不创建文件或刷新令牌。`connected` 表示本地存在可使用或可安全续期的当前凭据，不代表实时远端验权。\n- 业务命令显式 `--api-key-stdin` 仅覆盖本次请求，不要求持久存储可用。隐藏的兼容 `--api-key <value>` 会发出弃用警告。\n- `HITHINK_FINANCE_API_KEY` 仅在首次初始化且没有已存旧 Key 时导入一次；后续改变环境变量或退出均不自动导入。需要更新时使用登录命令。\n- 普通业务首次初始化自动迁移旧 default Key 或唯一条目。OAuth 登录初始化不探测旧系统凭据库；其后需要导入旧 Key，或遇多候选/旧非默认 profile，使用 `auth migrate --legacy-profile <name>` 一次性选择，再移除旧 profile 设置。\n- \`auth status\` 已连接时退出 0，未连接时退出 3；stdout 保留 \`ok=true\` 状态信封，读取 \`data.connected\`。状态检查只读本地凭据。\n- OAuth 失败保持当前选择。权限错误不刷新；刷新结果未知时不重复发送旧 RT，仍有效 AT 可继续使用，到期后重新登录。\n- 凭据根使用 OS 用户主目录 `.hithink-finance/auth/production/`，与 npm 安装及数据配置路径独立。统一采用操作系统私有权限保护的明文凭据文件。macOS/Linux 兼容合法 root 和可搜索目录，管理员写入用户目录后保留普通用户的访问能力。Windows 兼容合法的系统、管理员和继承权限；后台登录的存储故障保留本地存储错误分类。存储诊断使用 `auth status --debug --format json`。\n- `logout` 清当前凭据，`--all` 清两类凭据。OAuth 本地退出先提交，远端撤销失败会明确报告；已签名下载链接按自身期限失效。\n- Agent 从用户级 `credentials.env` 读取 Key 时，通过 stdin 显式登录或仅用于本次请求。不要把 Key、Token、授权码或完整授权 URL 写入日志、Markdown、Git 或对话。\n- 共享安装副本须升级到支持全局格式的版本。认证目录需位于可靠本地文件系统。\n\n- 旧格式使用 `auth migrate` 一次迁入；迁移后正常请求只访问文件，旧安装副本须一起升级。运行中的旧登录/刷新须结束后再迁移。\n\n## 错误与恢复\n\n- `AUTH_LOGIN_REQUIRED`：为当前方式重新登录。\n- `AUTH_MIGRATION_REQUIRED`：运行 `auth migrate`；多份旧条目使用 `--legacy-profile` 明确选择。\n- `AUTH_REFRESH_IN_PROGRESS`：稍后重试；`AUTH_REFRESH_UNCERTAIN`：有效 AT 到期后重新登录。\n- `AUTH_CREDENTIAL_STORE_UNAVAILABLE`：旧凭据迁入时解锁原存储；`AUTH_STORAGE_PERMISSIONS`：修复凭据文件权限。显式 Key 仍可用于本次业务请求。\n- `AUTH_REVOCATION_INCOMPLETE`：本地已退出，远端撤销未确认。\n- `CLI_MISSING_ARGUMENT`：非交互 Key 登录使用 `--api-key-stdin`。\n- `CLI_CONFLICTING_ARGUMENTS`：选择一种认证方式和一种 Key 输入。\n- `CLI_STDIN_TOO_LARGE`：API Key 输入上限 16 KiB，批量代码上限 1 MiB。\n- `CONFIG_NOT_FOUND`：修正显式配置路径或移除无效设置。\n',
  'lifecycle.md': `# 生命周期命令

## 命令

\`\`\`bash
hithink-finance version --format json
hithink-finance doctor --format json
hithink-finance update --check --format json
hithink-finance update --format json
hithink-finance update --repair --format json
hithink-finance update --target-version <version> --format json
hithink-finance uninstall --plan --format json
\`\`\`

## 参数选择策略

- \`update --check\` 只检查版本；确认后直接运行 \`update\` 更新到 npm latest。
- \`update --target-version <version>\` 安装指定版本，可用于升级或回滚；\`update --repair\` 仅重新安装当前版本。
- \`--check\`、\`--repair\` 与 \`--target-version\` 互斥，不要组合使用。
- 卸载先 \`uninstall --plan\`，真实清理按计划和用户确认执行。
- Skills、更新和卸载响应取消并具有执行时限；超时返回 \`CLI_CHILD_TIMEOUT\`，SIGINT/SIGTERM 的退出码为 130/143。
- 直接 \`npm uninstall -g\` 不可靠清理 Agent Skill 目录；需要先运行 \`hithink-finance uninstall --yes\` 或 \`hithink-finance skills remove\`。
- 诊断输出包括版本、配置路径、认证来源（不含密钥）、DuckDB、数据库文件、数据锁和包内 Skills manifest；不要把它当业务数据。

## 常见错误

- 普通命令可能在完成后向 stderr 输出更新提示；不要把它混入业务数据。
- 不要因为更新提示中断取数、翻页或导出流程；需要升级时先运行 \`update --check\`，获得用户确认后再运行 \`update\`。
- \`update\` 会同步查询 npm latest 并安装对应的精确版本；查询失败时可检查 npm registry，或改用 \`--target-version <version>\`。
- \`--target-version\` 只接受合法 SemVer 版本号；更新、回滚或修复后仍须用 \`hithink-finance version --format json\` 复核实际生效版本。
`,
  'skills-management.md': `# Skills 管理

## 命令

\`\`\`bash
hithink-finance skills status --format json
hithink-finance skills sync --format json
hithink-finance skills remove --format json
\`\`\`

## 参数选择策略

- 内容来自 CLI 包内的 Skills 与 manifest，发布到用户级共享目录，再链接到选定 Agent。\n- 首次安装和升级默认读取已保存策略：\`auto\` 仅检测已安装的 Codex、Claude Code、Cursor、Gemini CLI、OpenCode、GitHub Copilot CLI、Trae、WorkBuddy 与 QClaw；仅存在历史 \`skills\` 目录不算客户端证据，也不会创建未检测到的根目录。
- 安装时可用 \`HITHINK_FINANCE_SKILLS_AGENTS=auto\` 或逗号分隔的目标替换策略。安装后 \`sync --agent <name>\` 是追加，不会移除已选目标；\`sync --agent auto\` 恢复自动检测并保留显式目标。
- \`status\` 同时报告包内 manifest、共享内容、策略和逐目标文件验证。\`ready\` 只表示文件和链接/副本有效，不代表客户端已经加载；必要时新建会话。
- 默认在 CLI 用户级数据目录维护一份共享内容，并在每个目标的各 Skill 目录建立链接；Windows 优先目录 junction，其他平台使用目录 symlink。\`--copy\` 只用于显式目标不兼容链接时，并保存该目标的复制模式以便升级继续更新。
- \`sync --agent <name> --directory <absolute-path>\` 仅允许一个具体目标，并保存该客户端实际读取的 Skills 根目录。\`--repair\` 修复 CLI 托管内容；未知或用户占用的同名目录会报告冲突而不会覆盖。
- \`remove --agent <name>\` 仅移除该目标的 CLI 托管内容，并将它加入自动检测排除列表；无 \`--agent\` 时移除全部托管内容并禁用后续自动重装，直到再次 \`sync\`。
- 同步由互斥锁保护；新共享内容先校验再发布。单个目标失败会如实报告部分失败，保留其他已验证目标和旧内容。

## 常见错误

- npm 禁用生命周期脚本时，安装完成后运行 \`hithink-finance skills sync --repair --format json\`；直接 \`npm uninstall -g\` 不能保证清理托管链接，先运行 \`hithink-finance skills remove\`。
- 目标冲突、链接权限或客户端不发现链接时，先运行 \`skills status --format json\`；确认客户端不兼容链接后可对该单一目标重新执行 \`sync --agent <name> --copy\`。
- 不要手工删除或覆盖用户自建 Skill、未知同名目录或非 \`hithink-finance-*\` 内容。
`,
};

function yamlString(value) {
  return JSON.stringify(value);
}

function lines(items) {
  return items.map((item) => `- ${item}`).join('\n');
}

function markdownCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

function normalizeLineEndings(value) {
  return value.replaceAll('\r\n', '\n');
}

function table(rows) {
  return rows.map((row) => `| ${row.map(markdownCell).join(' |')} |`).join('\n');
}

function commandSlug(command) {
  return `${command.join('-')}.md`;
}

function commandTitle(command) {
  return `hithink-finance ${command.join(' ')}`;
}

function capDomain(capability) {
  if (capability.command[0] === 'special') return 'special-data';
  if (capability.command[0] === 'db') return 'data';
  return capability.command[0];
}

function optionValue(flags) {
  const match = flags.match(/^(--[a-z0-9-]+)(?:\s+<([^>]+)>)?/u);
  if (match === null) return flags;
  return match[2] === undefined ? match[1] : `${match[1]} <${match[2]}>`;
}

function requiredArgs(capability) {
  if (!('options' in capability)) return '';
  return capability.options
    .filter((option) => option.required === true)
    .map((option) => optionValue(option.flags))
    .join(' ');
}

function schemaId(capability) {
  return capability.id;
}

function windowText(window, id) {
  if (id === 'index.history' || id === 'index.history-batch')
    return '目前仅支持查询近 5 年的指数历史数据；时间参数按接口契约提供。';
  if (id.endsWith('-batch'))
    return id === 'market.history-batch'
      ? '单次窗口最多 10 个日历年，支持 1d/1w/1mo；超限需缩小窗口。'
      : id === 'fund.history-batch'
        ? '单次窗口最多 5 个日历年，固定 1d；实际行情可用范围为近 5 年。'
        : '所有代码共享 period 以及最近 N 期或起止区间；两种模式互斥。';
  if (id === 'news.anomaly-analysis')
    return '原起止日期传给服务；按标的最多 365 天、全量最多 30 天由服务截取，以 was_truncated 判断。四个时间字段单位待核实，保持原值；成功空列表不能区分真实无数据与上游降级。';
  if (['special.limit-up-statistics', 'special.dragon-tiger-stock-institution'].includes(id))
    return '查询最近一年内的交易日；省略日期由服务解析最近可用交易日。';
  if (id === 'market.calendar')
    return '固定返回 Asia/Shanghai 今日至一年前的交易日序列，无日期参数；无法通过拆分请求获取更早范围。';
  return {
    none: '无额外时间窗口限制，仍按命令参数和上游返回为准。',
    'ten-years': '单次请求窗口最多 10 年；超过时拆分为不重叠窗口并合并去重。',
    'five-years': '单次请求窗口最多 5 年；更长范围按允许的日期参数分段并核对边界。',
    'one-year': '单次请求窗口最多 1 年；超过时拆分或缩小范围。',
    'today-only': '仅当前交易日/今日数据；不能补历史。',
  }[window];
}

function pagingText(paging, pagingEnd, id) {
  if (id === 'news.topic-hot-list')
    return '首屏省略 --cursor；后续原样回传 next_cursor，以 has_more=false 判断结束，每次命令只请求一页。';
  if (id === 'news.stock-timeline-list')
    return '首屏 --offset first，后续原样回传响应 offset，以 has_more=false 判断结束；--size 可省略。每次命令只请求一页。';
  if (id === 'news.flash-list' || id === 'news.flash-refresh')
    return 'seq 使用十进制字符串；首屏列表传 0，后续传调用方指定序号。当前只承诺单次查询，不推导 total、has_more 或刷新边界。刷新 create_time_ms 必须能整除 1000。';
  if (id === 'ipo.hk-applications')
    return '使用 `--page` 逐页查询，页码从 1 开始；分页状态以响应 pagination.has_next 为准。';
  if (
    [
      'special.dragon-tiger-department-history',
      'special.abnormal-monitor',
      'special.auction-opportunities',
    ].includes(id)
  )
    return '使用 `--page` + `--size` 请求指定页，以 pagination.has_next 判断结束；保留记录顺序和空值。';
  if (paging === 'offset' && pagingEnd === 'has-more') {
    return '使用 `--limit` + `--offset` 游标翻页；全量抓取时循环到响应 `has_more=false`，不要依赖本页条数或不存在的 total。';
  }
  return {
    none: '无分页参数；仍检查返回中的 count/数组长度。',
    json: '通过 `--page-info` 传 JSON 对象：page_begin、page_size、code_begin、code_page_size 为可选整数，起点为 0。是否实际推进须核对返回的唯一代码与 total；不能仅凭页码变化认定翻页成功。',
    offset: '使用 `--limit` + `--offset` 翻页；全量抓取时循环到返回条数小于 limit。',
    page: '使用 `--page` + `--size` 翻页；全量抓取时逐页推进。',
  }[paging];
}

function optionRows(capability) {
  const options = effectiveOptions(capability);
  if (options.length === 0)
    return '| 参数 | 必填 | 说明 |\n| --- | --- | --- |\n| 无 | 否 | 运行前仍可用全局参数 `--format json`、`--db`；`--output` 不是全局参数。 |';
  return [
    '| 参数 | 必填 | 说明 |',
    '| --- | --- | --- |',
    ...options.map((option) => {
      const extras = [];
      if (option.choices !== undefined) extras.push(`可选: ${option.choices.join(', ')}`);
      if (option.defaultValue !== undefined) extras.push(`默认: ${option.defaultValue}`);
      if (option.queryName !== undefined) extras.push(`上游参数: ${option.queryName}`);
      return `| \`${option.flags}\` | ${option.required === true ? '是' : '否'} | ${[
        option.description,
        ...extras,
      ].join('；')} |`;
    }),
  ].join('\n');
}

function effectiveOptions(capability) {
  const options = 'options' in capability ? [...capability.options] : [];
  if ('endpoint' in capability) {
    options.push(...remoteOutputOptions);
  }
  return options;
}

function localDetail(capability) {
  return localCommandDetails[capability.id] ?? {};
}

function referenceContent(capability) {
  const isRemote = 'endpoint' in capability;
  const detail = localDetail(capability);
  const required = requiredArgs(capability);
  const exampleArgs = detail.exampleArgs ?? required;
  const examples = [
    `hithink-finance schema ${schemaId(capability)} --format json`,
    `hithink-finance ${capability.command.join(' ')}${
      exampleArgs === '' ? '' : ` ${exampleArgs}`
    } --format json`,
  ];
  if (
    isRemote &&
    capability.id !== 'valuation.snapshot' &&
    capability.options.some((option) => option.flags.startsWith('--thscodes '))
  ) {
    const sharedRequired = capability.id.endsWith('-batch')
      ? capability.options
          .filter((option) => option.required === true && !option.flags.startsWith('--thscodes '))
          .map((option) => optionValue(option.flags))
          .join(' ')
      : '';
    examples.push(
      `hithink-finance ${capability.command.join(' ')} --codes-file codes.txt${sharedRequired ? ` ${sharedRequired}` : ''} --output result.json --format json`,
    );
  }
  return `# \`${commandTitle(capability.command)}\`

## 前置条件

${lines([
  '读取[本域入口](../SKILL.md)和本命令说明；需要认证、共用输出或维护指引时，再读取[共享规则](../../hithink-finance-shared/SKILL.md)。',
  `首次执行或版本变化时用 \`hithink-finance schema ${schemaId(capability)} --format json\` 确认参数，未说明的组合规则再看命令 \`--help\`。`,
  ...(isRemote
    ? capability.id === 'market.history'
      ? []
      : ['远端调用先用 `auth status` 复用当前启用的 OAuth 或 API Key；首次登录默认推荐 OAuth。']
    : []),
  ...(detail.preconditions ?? []),
])}

## 命令

\`\`\`bash
${examples.join('\n')}
\`\`\`

${exampleArgs.includes("'{") || exampleArgs.includes("'[") ? 'JSON 参数作为单个字符串传给 CLI，CLI 负责 URL 编码。示例适用于 POSIX shell 和 PowerShell 7.3+ 的标准原生参数传递；其他执行器用参数数组或其原生引用方式。\n' : ''}

## 参数选择策略

${isRemote ? optionRows(capability) : lines(detail.parameters ?? ['读取 schema/help 后选择参数。'])}

## 窗口与分页

${isRemote ? lines([windowText(capability.window, capability.id), pagingText(capability.paging, capability.pagingEnd, capability.id)]) : lines(['本地命令按目标库执行；查询大结果使用 `db export` 或 `market panel --output`。'])}

## 常见错误

${lines([
  ...(isRemote
    ? [
        '参数校验失败时按 `error.hint` 修正，不要猜字段名。',
        '认证失败时先用 `auth status` 检查当前方式，再按 shared 的认证流程恢复。',
      ]
    : []),
  ...(detail.errors ?? []),
])}

## 批量操作说明

${lines([
  ...(capability.id.endsWith('-batch')
    ? [
        '每批最多 10 个原始代码；先检查上限再规范化、稳定去重，按服务返回顺序保留代码分组。',
        'data.item 每组含 thscode、timestamp 和原记录数组；合法空组保留，无效标的由服务省略，调用成功时退出 0。CSV/NDJSON 每行导出一个代码分组。',
        '每条命令发送一个批量查询；传输或业务错误由调用方处理。OAuth 仍沿用已确认鉴权拒绝后的单次凭据恢复。',
      ]
    : []),
  ...(capability.command[0] === 'data'
    ? ['维护操作按目标库逐项执行，并检查每个结果。']
    : ['批量或全量请求必须落盘，最终只报告路径、行数和窗口。']),
  isRemote &&
  capability.id !== 'valuation.snapshot' &&
  capability.options.some((option) => option.flags.startsWith('--thscodes '))
    ? '支持 `--codes-file` 或 `--codes-stdin` 读取多 thscode；不要同时用 `--api-key-stdin` 和 `--codes-stdin`。'
    : capability.id === 'fund.snapshot'
      ? '通过原 --thscode 传最多 100 个原始代码的 CSV；先检查上限再规范化、稳定去重。服务返回平铺报价并省略未知、不支持或缺报价目标。'
      : capability.id === 'valuation.snapshot'
        ? '通过必填的 `--thscodes` 传入最多 100 个原始 token；大结果用 `--output` 落盘。'
        : capability.command[0] === 'data'
          ? '确认目标路径与影响；不要从只读查询意图推断清理、迁移或修复授权。'
          : '如果需要多标的循环，逐批执行并记录每批参数；不要把完整结果塞进上下文。',
])}
`;
}

function sharedSkillContent(name, config) {
  return `---
name: ${name}
description: ${yamlString(config.description)}
---

# ${name}

${config.identity}

## 前置条件表

| 条件 | 操作 |
| --- | --- |
| 第一次接触此 CLI 或怀疑版本漂移 | 运行 \`hithink-finance version --format json\`；需要发现未知命令时再读取 \`capabilities\` |
| 需要机器读取 | 始终加 \`--format json\` |
| 结果可能很大 | 使用命令声明的 \`--output <path>\` 落盘；远端 stdout 只返回摘要 |
| 需要远端同花顺金融数据服务 | 先用 \`auth status\` 复用当前有效凭据；首次登录默认推荐 OAuth |

## 快速决策

${table([['用户意图', '首选命令 / 路由'], ['---', '---'], ...config.decisions])}

## 业务辅助选路

明确的业务请求由宿主依据领域 Skill 的 description 直接选择。需要区分范围或选择其他业务域时，用下表补充定位；随后读取该领域 Skill 和目标命令 reference。

${table([
  ['任务范围', '领域 Skill'],
  ['---', '---'],
  ...Object.entries(domainConfigs)
    .filter(([domain]) => domain !== 'shared')
    .map(([domain, entry]) => [
      entry.identity,
      `[hithink-finance-${domain}](../hithink-finance-${domain}/SKILL.md)`,
    ]),
])}

## References

| 需要了解 | 读取 |
| --- | --- |
| JSON 输出、大结果、安全规则 | [global-rules.md](references/global-rules.md) |
| 全局凭据、一次性迁移、配置 | [auth-and-config.md](references/auth-and-config.md) |
| version、doctor、update、uninstall | [lifecycle.md](references/lifecycle.md) |
| skills status/sync/remove | [skills-management.md](references/skills-management.md) |
| 查询worker状态/停止、启动与失败处理 | [query-worker.md](references/query-worker.md) |

## 权限表

| 能力 | 凭据 |
| --- | --- |
| 本地 data/db/market panel | 本地读取和导出通常无需认证；远端初始化或同步使用当前有效凭据 |
| symbol/market remote/special/ipo/news/financials/index/fund/futures/options/valuation | 使用当前启用的 OAuth 或 API Key |
| skills/update/uninstall | 需要本机文件系统权限；不要写全局非 CLI 管理目录 |

## 边界声明

${lines(config.boundaries)}
`;
}

function domainSkillContent(domain, name, config, domainCapabilities) {
  const shortcutRows = domainCapabilities.map((capability) => [
    `[${capability.command.join(' ')}](references/${commandSlug(capability.command)})`,
    'endpoint' in capability
      ? capability.description
      : (localDetail(capability).preconditions?.[0] ?? capability.description),
  ]);
  const referenceRows =
    shortcutRows.length === 0
      ? [
          [
            '[research-workflow.md](references/research-workflow.md)',
            '组合 data/db/market panel 做中立研究数据准备',
          ],
        ]
      : shortcutRows;
  const nativeHelp =
    domain === 'research'
      ? [
          'hithink-finance data <command> --help',
          'hithink-finance db <command> --help',
          'hithink-finance market panel --help',
        ]
      : domain === 'data'
        ? ['hithink-finance data <command> --help', 'hithink-finance db <command> --help']
        : [`hithink-finance ${domain === 'special-data' ? 'special' : domain} <command> --help`];
  return `---
name: ${name}
description: ${yamlString(config.description)}
---

# ${name}

${config.identity}

## 前置条件表

| 条件 | 操作 |
| --- | --- |
| 需要认证、共用输出或维护指引 | 按需读取 [共享规则](../hithink-finance-shared/SKILL.md)，同会话已加载内容可复用 |
| 选定命令或版本变化 | 用目标 \`schema <id> --format json\` 核对参数；命令未知时再读取 \`capabilities\` |
| 需要执行下表某个命令 | 先读取对应 reference 文件，不要只凭命令名猜参数 |
| 全市场、分页、多标的或长区间 | 使用命令声明的 \`--output <path>\` 落盘，只报告摘要 |

## 快速决策

${table([['用户意图', '首选命令 / 路由'], ['---', '---'], ...config.decisions])}

## Shortcuts

| 命令 | 何时使用 |
| --- | --- |
${table(referenceRows)}

## 原生命令与 schema

\`\`\`bash
hithink-finance capabilities --format json
hithink-finance schema <capability-id> --format json
${nativeHelp.join('\n')}
\`\`\`

schema 提供当前命令选项；reference 补充业务参数关系和验收方法。全局参数、凭据与输出约定见共享规则。

## 边界声明

${lines(config.boundaries)}
`;
}

function researchReference() {
  return `# research workflow

## 前置条件

- 需要认证、共用输出或维护规则时，读取 [hithink-finance-shared](../../hithink-finance-shared/SKILL.md)。
- 确认用户要的是中立研究数据、统计或可复现实证输入，不是投资建议。
- 先用文件系统确认用户指定的数据库文件存在，并固定绝对路径。文件不存在时报告缺失；初始化由 data Skill 按用户授权执行。
- 文件存在后运行带同一 \`--db\` 的 \`data status\`，再运行 \`data migrate\` 的默认计划。版本不兼容或 \`data.versions\` 非空时停止研究前置调用，说明需要迁移；计划不带 \`--apply\`。
- 仅在迁移计划为空时运行 \`data validate\`。该命令会应用普通迁移，不能用于探测未知库。质量通过要求外层 \`ok=true\` 且 \`data.ok=true\`；否则读取 \`data.issues\` 的 code/count。

## 命令

\`\`\`bash
hithink-finance data status --db "<absolute-db-path>" --format json
hithink-finance data migrate --db "<absolute-db-path>" --format json
\`\`\`

确认计划为空后才继续：

\`\`\`bash
hithink-finance data validate --db "<absolute-db-path>" --format json
hithink-finance db query --db "<absolute-db-path>" --sql "SELECT count(*) AS rows, min(date) AS start_date, max(date) AS end_date FROM v_daily_qfq" --format json
\`\`\`

质量与请求窗口、样本核对通过后导出：

\`\`\`bash
hithink-finance market panel --db "<absolute-db-path>" --start <YYYY-MM-DD> --end <YYYY-MM-DD> --output <panel.parquet> --file-format parquet --format json
hithink-finance db export --db "<absolute-db-path>" --sql "<readonly sql>" --output <result.parquet> --file-format parquet --format json
\`\`\`

## 参数选择策略

- 小样本探索用 \`db query\`，并在 SQL 中显式 \`LIMIT\`。
- 下游分析、全市场、长区间、多因子结果用 \`db export\` 或 \`market panel\`。
- 研究报告必须记录 SQL、时间窗口、库路径或输出文件路径、行数。
- 按用户要求筛选并检查每个目标标的的日期覆盖与样本数；全库 min/max 仅是初步概览。空库也可能质量通过，不能代替样本验收。

## 常见错误

- 不要把相关性、排序或榜单解释成买卖建议。
- 不要在研究 skill 中临时取实时榜单；切到对应业务 skill 后再把结果作为证据。
- 研究 SQL 必须只读；需要表结构时通过 db query 查询 information_schema，db describe 会应用普通迁移。

## 批量操作说明

- 分批导出时给每批文件命名，最终合并前按 \`thscode/date\` 等主键去重。
- 最终回答只摘要统计结果和证据路径，不粘贴大表。
`;
}

for (const domain of domainOrder) {
  const config = domainConfigs[domain];
  const description = config.description;
  const name = `hithink-finance-${domain}`;
  const directory = path.join(root, 'skills', name);
  await rm(directory, { recursive: true, force: true });
  await mkdir(path.join(directory, 'references'), { recursive: true });
  const domainCapabilities = skillCapabilities.filter((item) => capDomain(item) === domain);
  await writeFormatted(
    path.join(directory, 'SKILL.md'),
    domain === 'shared'
      ? sharedSkillContent(name, config)
      : domainSkillContent(domain, name, config, domainCapabilities),
    'markdown',
  );
  if (domain === 'shared') {
    for (const [file, content] of Object.entries(sharedReferenceFiles))
      await writeFormatted(path.join(directory, 'references', file), content, 'markdown');
  } else if (domain === 'research') {
    await writeFormatted(
      path.join(directory, 'references', 'research-workflow.md'),
      researchReference(),
      'markdown',
    );
  } else {
    for (const capability of domainCapabilities)
      await writeFormatted(
        path.join(directory, 'references', commandSlug(capability.command)),
        referenceContent(capability),
        'markdown',
      );
  }
}

async function skillFiles(directory, current = directory) {
  const output = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) output.push(...(await skillFiles(directory, absolute)));
    else if (entry.isFile() && entry.name !== 'manifest.json')
      output.push(path.relative(directory, absolute).replaceAll(path.sep, '/'));
  }
  return output.sort();
}

const manifestFiles = {};
const skillsRoot = path.join(root, 'skills');
for (const relative of await skillFiles(skillsRoot)) {
  manifestFiles[relative] = createHash('sha256')
    .update(
      normalizeLineEndings(await readFile(path.join(skillsRoot, ...relative.split('/')), 'utf8')),
    )
    .digest('hex');
}
const packageMetadata = JSON.parse(
  await readFile(path.join(process.cwd(), 'package.json'), 'utf8'),
);
await writeFormatted(
  path.join(skillsRoot, 'manifest.json'),
  JSON.stringify({
    protocolVersion: '1',
    cliVersion: packageMetadata.version,
    files: manifestFiles,
  }),
  'json',
);
