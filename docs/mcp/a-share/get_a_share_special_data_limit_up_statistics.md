# 涨停市场汇总与连板统计

[业务导航](README.md)

> **info**
> 工具名：`get_a_share_special_data_limit_up_statistics`
>
> 对应 REST 端点：[`GET /api/a-share/special-data/limit-up-statistics`](../../api/a-share/special-data-limit-up-statistics.md)


## 工具描述

查询封板率、涨停打开家数、页面板数档位及精确连板家数。二、三、四和五板以上的晋级率为页面档位口径；五板以上为合并档位，精确家数仅包含实际返回的板数。

## 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `date` | string | 否 | — | 查询日期，YYYY-MM-DD；默认日期与有效范围见接口说明；省略使用当天或最近交易日，范围为一年 |

## 调用示例

```text
工具：get_a_share_special_data_limit_up_statistics
参数：
  - date: "2026-10-12"
```

## 返回

返回统一响应信封中的数据对象。详细字段见 [涨停市场统计](../../api/a-share/special-data-limit-up-statistics.md)。
