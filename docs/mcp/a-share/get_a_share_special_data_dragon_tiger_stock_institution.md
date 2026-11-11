# 个股龙虎榜机构金额详情

[业务导航](README.md)

> **info**
> 工具名：`get_a_share_special_data_dragon_tiger_stock_institution`
>
> 对应 REST 端点：[`GET /api/a-share/special-data/dragon-tiger-stock-institution`](../../api/a-share/special-data-dragon-tiger-stock-institution.md)


## 工具描述

按股票和交易日查询机构买入、卖出、净买入金额，以及机构数量、比例和营业部身份。同一股票的一日与三日上榜区间分别保留；省略区间参数时返回实际记录。

## 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 单个A股标准代码 |
| `date` | string | 否 | — | 查询日期，YYYY-MM-DD；默认日期与有效范围见接口说明；省略使用最近已完成交易日，查询范围为一年 |
| `range_days` | integer | 否 | — | 上榜区间，1或3；省略返回两类实际记录 |

## 调用示例

```text
工具：get_a_share_special_data_dragon_tiger_stock_institution
参数：
  - thscode: "301052.SZ"
  - date: "2026-10-12"
```

## 返回

返回统一响应信封中的数据对象。详细字段见 [个股机构交易详情](../../api/a-share/special-data-dragon-tiger-stock-institution.md)。
