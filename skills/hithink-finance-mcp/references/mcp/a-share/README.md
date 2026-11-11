# A 股

[全部业务域](../README.md)

股票价格、财务、估值、竞价与特色数据。指数走势进入指数域，基金净值进入基金域。


## 新股

按市场与发行阶段查询新股，使用发行标识查询港股发行详情。

| 需求 / 文档 | 接口或工具 | 使用范围 |
| --- | --- | --- |
| [A股新股发行与申购日历](ipo-calendar-list.md#get_a_share_ipo_calendar_list) | `get_a_share_ipo_calendar_list` | 公开 |

## 行情

查询当前价格选择行情快照，查询历史价格序列选择历史 K 线。

| 需求 / 文档 | 接口或工具 | 使用范围 |
| --- | --- | --- |
| [A股历史K线](prices.md#get_a_share_prices_historical) | `get_a_share_prices_historical` | 公开 |
| [A股行情快照](prices.md#get_a_share_prices_snapshot) | `get_a_share_prices_snapshot` | 公开 |
| [A股批量历史K线](prices.md#get_a_share_prices_historical_batch) | `get_a_share_prices_historical_batch` | 公开 |

## 财务报表与指标

明确报告期、报表类型与指标含义。

| 需求 / 文档 | 接口或工具 | 使用范围 |
| --- | --- | --- |
| [资产负债表](financials.md#get_a_share_financials_balance_sheets) | `get_a_share_financials_balance_sheets` | 公开 |
| [现金流量表](financials.md#get_a_share_financials_cash_flow_statements) | `get_a_share_financials_cash_flow_statements` | 公开 |
| [利润表](financials.md#get_a_share_financials_income_statements) | `get_a_share_financials_income_statements` | 公开 |
| [财务指标数据](financials-indicators.md#get_a_share_financials_indicators) | `get_a_share_financials_indicators` | 公开 |
| [批量资产负债表](financials.md#get_a_share_financials_balance_sheets_batch) | `get_a_share_financials_balance_sheets_batch` | 公开 |
| [批量现金流量表](financials.md#get_a_share_financials_cash_flow_statements_batch) | `get_a_share_financials_cash_flow_statements_batch` | 公开 |
| [批量利润表](financials.md#get_a_share_financials_income_statements_batch) | `get_a_share_financials_income_statements_batch` | 公开 |

## 同花顺功能数据

竞价机会、涨跌停与连板统计、龙虎榜、热榜和异动；先确认是否支持历史。

| 需求 / 文档 | 接口或工具 | 使用范围 |
| --- | --- | --- |
| [短线风向标竞价基准](auction.md#get_a_share_auction_short_term_benchmark) | `get_a_share_auction_short_term_benchmark` | 公开 |
| [A股集合竞价快照](auction.md#get_a_share_auction_snapshot) | `get_a_share_auction_snapshot` | 公开 |
| [严重异动与重点监控记录](special-data-abnormal-monitor-list.md#get_a_share_special_data_abnormal_monitor_list) | `get_a_share_special_data_abnormal_monitor_list` | 公开 |
| [A股个股异动原因](anomaly-analysis.md#get_a_share_special_data_anomaly_analysis_stock) | `get_a_share_special_data_anomaly_analysis_stock` | 公开 |
| [集合竞价可选交易日期](auction-opportunities.md#get_a_share_special_data_auction_opportunity_dates) | `get_a_share_special_data_auction_opportunity_dates` | 公开 |
| [集合竞价个股机会筛选](auction-opportunities.md#get_a_share_special_data_auction_stock_opportunities) | `get_a_share_special_data_auction_stock_opportunities` | 公开 |
| [营业部经典战绩](dragon-tiger-department.md#get_a_share_special_data_dragon_tiger_department_classic_record) | `get_a_share_special_data_dragon_tiger_department_classic_record` | 公开 |
| [营业部历史上榜记录](dragon-tiger-department.md#get_a_share_special_data_dragon_tiger_department_history) | `get_a_share_special_data_dragon_tiger_department_history` | 公开 |
| [A股龙虎榜](special-data-dragon-tiger-list.md#get_a_share_special_data_dragon_tiger_list) | `get_a_share_special_data_dragon_tiger_list` | 公开 |
| [个股龙虎榜机构金额详情](special-data-dragon-tiger-stock-institution.md#get_a_share_special_data_dragon_tiger_stock_institution) | `get_a_share_special_data_dragon_tiger_stock_institution` | 公开 |
| [A股热股榜](hot-list-data.md#get_a_share_special_data_hot_stock_list) | `get_a_share_special_data_hot_stock_list` | 公开 |
| [A股历史热股榜](hot-list-data.md#get_a_share_special_data_hot_stock_list_history) | `get_a_share_special_data_hot_stock_list_history` | 公开 |
| [A股热股排名趋势](hot-list-data.md#get_a_share_special_data_hot_stock_rank_trend) | `get_a_share_special_data_hot_stock_rank_trend` | 公开 |
| [A股炸板池](limit-up-data.md#get_a_share_special_data_limit_break_pool) | `get_a_share_special_data_limit_break_pool` | 公开 |
| [A股跌停池](limit-up-data.md#get_a_share_special_data_limit_down_pool) | `get_a_share_special_data_limit_down_pool` | 公开 |
| [A股涨停天梯](limit-up-data.md#get_a_share_special_data_limit_up_ladder) | `get_a_share_special_data_limit_up_ladder` | 公开 |
| [A股涨停池](limit-up-data.md#get_a_share_special_data_limit_up_pool) | `get_a_share_special_data_limit_up_pool` | 公开 |
| [涨停市场汇总与连板统计](special-data-limit-up-statistics.md#get_a_share_special_data_limit_up_statistics) | `get_a_share_special_data_limit_up_statistics` | 公开 |
| [A股飙升榜](hot-list-data.md#get_a_share_special_data_skyrocket_list) | `get_a_share_special_data_skyrocket_list` | 公开 |

## 估值

查询估值快照，保留空值及负值。

| 需求 / 文档 | 接口或工具 | 使用范围 |
| --- | --- | --- |
| [A股估值快照](valuations-snapshot.md#get_a_share_valuations_snapshot) | `get_a_share_valuations_snapshot` | 公开 |

## 公司行动

查询 A 股复权因子和除权除息事件。

| 需求 / 文档 | 接口或工具 | 使用范围 |
| --- | --- | --- |
| [复权因子事件流](corporate-actions-adjustment-factors.md#get_a_share_corporate_actions_adjustment_factors) | `get_a_share_corporate_actions_adjustment_factors` | 公开 |
