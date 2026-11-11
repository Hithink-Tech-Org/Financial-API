# 集合竞价个股机会筛选

[业务导航](README.md)

> **info**
> 工具名：`get_a_share_special_data_auction_stock_opportunities`
>
> 对应 REST 端点：[`GET /api/a-share/special-data/auction-stock-opportunities`](../../api/a-share/auction-opportunities.md#special-data-auction-stock-opportunities)


## 工具描述

筛选实时或历史集合竞价机会，一个股票可包含多条机会记录。涨幅为小数比例，数量保持返回尺度；数量单位尚未定义。说明和评级保留原值，关联板块保留 JSON 或 `null`。

## 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `date` | string | 否 | — | 查询日期，YYYY-MM-DD；默认日期与有效范围见接口说明；须属于可用日期集合 |
| `warn_types` | string | 否 | — | 逗号分隔的机会类型码；省略查询全部；当前类型为68710/68711/68712/68713/68714/68715/68716/68717/68718/68719/68720/68721/68722/68723/68724/68725/68726/68727 |
| `market` | string | 否 | `a_share` | 适用市场：a_share/sh_sz_main/sh_a/sz_a/gem/star |
| `exclude_st` | boolean | 否 | `false` | 是否排除ST股票，默认false |
| `thscodes` | string | 否 | — | 逗号分隔A股标准代码，最多50个token |
| `sort_by` | string | 否 | `warn_time` | warn_time或warn_type |
| `sort_order` | string | 否 | `desc` | desc或asc |
| `page` | integer | 否 | `1` | 从1开始的页码 |
| `size` | integer | 否 | `20` | 每页1至20条，默认20 |

## 调用示例

```text
工具：get_a_share_special_data_auction_stock_opportunities
参数：
  - date: "2026-10-12"
  - warn_types: "68710"
  - page: 1
  - size: 20
```

## 返回

返回统一响应信封中的数据对象。详细字段见 [集合竞价机会](../../api/a-share/auction-opportunities.md#special-data-auction-stock-opportunities)。
