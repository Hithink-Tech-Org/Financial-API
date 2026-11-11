# 集合竞价可选交易日期

[业务导航](README.md)

> **info**
> 工具名：`get_a_share_special_data_auction_opportunity_dates`
>
> 对应 REST 端点：[`GET /api/a-share/special-data/auction-opportunity-dates`](../../api/a-share/auction-opportunities.md#special-data-auction-opportunity-dates)


## 工具描述

查询集合竞价可用交易日期。日期按升序返回，实际保留范围由日期集合决定。

## 参数

无业务参数。

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| — | — | 否 | — | 无业务参数。 |

## 调用示例

```text
工具：get_a_share_special_data_auction_opportunity_dates
参数：无
```

## 返回

返回统一响应信封中的数据对象。详细字段见 [集合竞价机会](../../api/a-share/auction-opportunities.md#special-data-auction-opportunity-dates)。
