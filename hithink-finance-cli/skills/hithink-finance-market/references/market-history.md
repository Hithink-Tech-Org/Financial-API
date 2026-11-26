# `hithink-finance market history`

## 前置条件

- 读取[本域入口](../SKILL.md)和本命令说明；需要认证、共用输出或维护指引时，再读取[共享规则](../../hithink-finance-shared/SKILL.md)。
- 首次执行或版本变化时用 `hithink-finance schema market.history --format json` 确认参数，未说明的组合规则再看命令 `--help`。
- 回源前用 `auth status` 检查连接，复用当前启用的 OAuth 或 API Key。
- `--adjust none --source auto` 在交易日历和本地日线均覆盖时使用 DuckDB，否则整段查询远端。当前复权日线由远端计算。
- `--source local` 全程只读本地。缺少日历、标的或行情覆盖时返回 `DATA_INITIALIZATION_REQUIRED`，已确认的无交易日区间返回空列表。
- 本地单标的结果的 `data` 为 DuckDB 记录数组，远端结果的记录位于 `data.item`。

## 命令

```bash
hithink-finance schema market.history --format json
hithink-finance market history --thscode <code> --start-ms <milliseconds> --end-ms <milliseconds> --format json
```

## 参数选择策略

| 参数                        | 必填 | 说明                                                                        |
| --------------------------- | ---- | --------------------------------------------------------------------------- |
| `--thscode <code>`          | 是   | single A-share thscode                                                      |
| `--start-ms <milliseconds>` | 是   | start timestamp；上游参数: start                                            |
| `--end-ms <milliseconds>`   | 是   | end timestamp；上游参数: end                                                |
| `--adjust <mode>`           | 否   | adjustment mode；可选: none, forward, backward；默认: forward               |
| `--output <path>`           | 否   | write the response or data rows to a file                                   |
| `--file-format <format>`    | 否   | output file format (requires --output)；可选: json, ndjson, csv；默认: json |

## 窗口与分页

- 单次请求窗口最多 10 年；超过时拆分为不重叠窗口并合并去重。
- 无分页参数；仍检查返回中的 count/数组长度。

## 常见错误

- 参数校验失败时按 `error.hint` 修正，不要猜字段名。
- 认证失败时先用 `auth status` 检查当前方式，再按 shared 的认证流程恢复。

## 批量操作说明

- 批量或全量请求必须落盘，最终只报告路径、行数和窗口。
- 如果需要多标的循环，逐批执行并记录每批参数；不要把完整结果塞进上下文。
