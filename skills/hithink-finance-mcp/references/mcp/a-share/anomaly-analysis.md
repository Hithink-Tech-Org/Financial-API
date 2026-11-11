# 异动解读

[业务导航](README.md)

- [A股个股异动原因 · `get_a_share_special_data_anomaly_analysis_stock`](#get_a_share_special_data_anomaly_analysis_stock)

<a id="get_a_share_special_data_anomaly_analysis_stock"></a>
## A股个股异动原因


工具名：`get_a_share_special_data_anomaly_analysis_stock`

<a id="get_a_share_special_data_anomaly_analysis_stock--工具描述"></a>
### 工具描述

> 按同花顺代码批量查询当日个股异动原因，按请求代码首次出现顺序返回匹配记录；
> 格式合法但当日无异动的代码会被忽略。

<a id="get_a_share_special_data_anomaly_analysis_stock--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscodes` | string | 是 | — | 逗号分隔的同花顺代码列表，例如 `600519.SH,000001.SZ`；支持 `SH` / `SZ` / `BJ` 后缀，大小写不敏感，去重前最多 50 个 token。 |

<a id="get_a_share_special_data_anomaly_analysis_stock--调用示例"></a>
### 调用示例

```text
工具：get_a_share_special_data_anomaly_analysis_stock
参数：
  - thscodes: "600519.SH,000001.SZ"
```

<a id="get_a_share_special_data_anomaly_analysis_stock--返回"></a>
### 返回

返回 `{ timestamp, item: [AnomalyAnalysisItem, ...] }`。
字段含义见 返回字段说明 [按股票查询个股异动原因](#get_a_share_special_data_anomaly_analysis_stock--返回字段)。

```json
{
  "timestamp": 1751260800000,
  "item": [
    {
      "stock_name": "贵州茅台",
      "analysis_content": "公司股价出现异动，相关解读内容以服务端快照为准。",
      "keyword_list": ["白酒", "消费"],
      "thscode": "600519.SH",
      "tag_name": "大涨"
    }
  ]
}
```

<a id="get_a_share_special_data_anomaly_analysis_stock--返回字段"></a>
### 返回字段

<a id="get_a_share_special_data_anomaly_analysis_stock--按股票查询个股异动原因--响应字段"></a>
#### 按股票查询个股异动原因 · 响应字段

响应字段与 [个股异动原因列表](#get_a_share_special_data_anomaly_analysis_stock--返回字段) 一致。

<a id="get_a_share_special_data_anomaly_analysis_stock--按股票查询个股异动原因--约束与错误"></a>
#### 按股票查询个股异动原因 · 约束与错误

- 缺失或空白 `thscodes` 返回 `code=1001`。
- `thscodes` 出现空 token 或不符合 `000001.SZ` / `600519.SH` / `430001.BJ` 这类格式时返回 `code=1002`。
- 去重前 token 数超过 50 时返回 `code=1003`。
- 当日数据暂不可用时返回 `code=3002`。
- 有快照但查询无匹配时返回 `code=0`，且 `item=[]`。

<a id="get_a_share_special_data_anomaly_analysis_stock--个股异动原因列表--响应字段"></a>
#### 个股异动原因列表 · 响应字段

`data` 为 `AnomalyAnalysisData`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 数据时间戳，毫秒级 Unix 时间戳。 |
| `item` | array | 个股异动原因列表。 |

`item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `stock_name` | string | 股票名称。 |
| `analysis_content` | string | 异动解读内容。 |
| `keyword_list` | string[] | 关键词列表；无关键词时返回空数组。 |
| `thscode` | string | 带交易所后缀的同花顺代码，例如 `600519.SH`。 |
| `tag_name` | string | 异动标签展示名。 |

<a id="get_a_share_special_data_anomaly_analysis_stock--个股异动原因列表--约束与错误"></a>
#### 个股异动原因列表 · 约束与错误

- `tag_codes` 中出现未知值、连续逗号或尾逗号导致的空 token 时返回 `code=1002`。
- 当日数据暂不可用时返回 `code=3002`。
- 有快照但查询无匹配时返回 `code=0`，且 `item=[]`。
