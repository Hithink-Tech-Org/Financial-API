# A股批量历史K线

[业务导航](README.md)

> **info**
> 工具名：`get_a_share_prices_historical_batch`
>
> 对应 REST 端点：[`GET /api/a-share/prices/historical-batch`](../../api/a-share/prices.md#prices-historical-batch--historical-batch)


## 工具描述

> 在同一时间窗口比较多只 A 股的历史走势。单次最多 10 个代码，支持 `1d` / `1w` / `1mo`，窗口跨度最长 10 个自然年；复权方式为 `forward` / `none` / `backward`，默认 `forward`。
> 原生批量查询，所有代码共用查询条件；代码规范化后去重并保留首次出现顺序，上限按去重前代码项数检查。

## 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscodes` | string | 是 | — | 英文逗号分隔的完整代码，如 `600519.SH,000001.SZ`；最多 10 个，按去重前数量计数。 |
| `interval` | string | 是 | — | K 线周期：`1d`（日线）/ `1w`（周线）/ `1mo`（月线）。 |
| `start` | long | 是 | - | 起始时间，毫秒 Unix 时间戳。缺失返回 `code=1001`；须为非负毫秒时间戳。 |
| `end` | long | 是 | - | 结束时间，毫秒 Unix 时间戳。`end - start` 超过 10 年返回 `code=1003`；须为非负毫秒时间戳。 |
| `adjust` | string | 否 | `forward` | 复权方式：`none` / `forward`(前复权) / `backward`(后复权)。 |

## 调用示例

```text
工具：get_a_share_prices_historical_batch
参数：
  - thscodes: "600519.SH,000001.SZ"
  - interval: "1d"
  - start: 1735660800000
  - end: 1767196800000
  - adjust: "forward"
```

## 返回

返回 `{ interval, adjust, item: [{ thscode, timestamp, item[] }] }`。
有效标的按规范化代码首次出现顺序返回；未知或资产类型不匹配的代码省略其组，保留有效目标组并返回外层 `code=0`。有效标的无记录时保留 `{thscode,timestamp:null,item:[]}`。去重后仅一个目标且类型不支持返回 `3004`；其它全部无有效目标返回 `3001`。参数、整体上游或协议错误返回普通非零信封，`data=null`；目录不可用或身份歧义按整体错误处理。

详细字段与错误处理见[批量历史 K 线](../../api/a-share/prices.md#prices-historical-batch--historical-batch)。
