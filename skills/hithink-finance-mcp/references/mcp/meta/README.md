# 公共基础数据

[全部业务域](../README.md)

标的目录与搜索、交易日历和交易时段。


## 资料与标识

查询目录、搜索、合约或基本资料，取得后续请求所需标识。

| 需求 / 文档 | 接口或工具 | 使用范围 |
| --- | --- | --- |
| [标的目录（代码表浏览）](tickers-list.md#get_meta_tickers_list) | `get_meta_tickers_list` | 公开 |
| [标的检索（跨市场消歧）](tickers-search.md#get_meta_tickers_search) | `get_meta_tickers_search` | 公开 |

## 交易日程

交易日、交易时段与会话时间。

| 需求 / 文档 | 接口或工具 | 使用范围 |
| --- | --- | --- |
| [A股交易日历](../a-share/calendar-trading-days.md#get_a_share_calendar_trading_days) | `get_a_share_calendar_trading_days` | 公开 |
| [期货会话时间轴](../futures/calendar-session-timeline.md#get_futures_calendar_session_timeline) | `get_futures_calendar_session_timeline` | 公开 |
| [期货交易日日程](../futures/calendar-trading-schedule.md#get_futures_calendar_trading_schedule) | `get_futures_calendar_trading_schedule` | 公开 |
| [期权会话时间轴](../options/calendar-session-timeline.md#get_options_calendar_session_timeline) | `get_options_calendar_session_timeline` | 公开 |
