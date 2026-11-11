# 财务指标数据

[业务导航](README.md)

- [财务指标数据 · `get_a_share_financials_indicators`](#get_a_share_financials_indicators)

<a id="get_a_share_financials_indicators"></a>
## 财务指标数据


工具名：`get_a_share_financials_indicators`

<a id="get_a_share_financials_indicators--工具描述"></a>
### 工具描述

获取单只 A 股在指定报告期的财务指标数据，一次返回成长、盈利、偿债、营运、现金流五类能力下的指标 ID 与本期值。

`report` 格式为 `yyyy-1`、`yyyy-2`、`yyyy-3`、`yyyy-4`，其中 `1` 一季报、`2` 中报、`3` 三季报、`4` 年报。

<a id="get_a_share_financials_indicators--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | `300033.SZ` | 单只标的 thscode，含交易所后缀。 |
| `report` | string | 是 | `2025-1` | 报告期，格式见上方说明。 |

<a id="get_a_share_financials_indicators--调用示例"></a>
### 调用示例

```text
工具：get_a_share_financials_indicators
参数：
  - thscode: "300033.SZ"
  - report: "2025-1"
```

<a id="get_a_share_financials_indicators--返回"></a>
### 返回

返回 `{ thscode, report, abilities }`。`abilities[]` 按 `growth`、`profitability`、`solvency`、`operation`、`cash-flow` 顺序排列；每个能力块的 `indicators[]` 仅含 `index_id` / `value`。

`index_id` 使用 返回字段说明列出的接口契约字段名；`value` 为 `string | null`。服务端保留数据源原始数值字符串，不承诺固定小数位；上游空值或缺失值标准化为 `null`。百分比类指标按百分数值表达，周转率、比率、倍数类指标按指标名称对应单位解释。

字段含义见 返回字段说明 [财务指标数据](#get_a_share_financials_indicators--返回字段)。

<a id="get_a_share_financials_indicators--返回字段"></a>
### 返回字段

<a id="get_a_share_financials_indicators--财务指标数据--响应字段"></a>
#### 财务指标数据 · 响应字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `code` | integer | 业务状态码，`0` 表示成功。 |
| `message` | string | 业务状态说明。 |
| `request_id` | string | 请求追踪 ID。 |
| `data.thscode` | string | 入参 thscode 回显。 |
| `data.report` | string | 入参 report 回显。 |
| `data.abilities[]` | array | 五类能力块，固定顺序为 `growth`、`profitability`、`solvency`、`operation`、`cash-flow`。 |
| `data.abilities[].ability` | string | 能力标识。 |
| `data.abilities[].indicators[]` | array | 当前能力下的指标列表。 |
| `data.abilities[].indicators[].index_id` | string | 指标 ID，取值见下方表格。 |
| `data.abilities[].indicators[].value` | string \| null | 本期指标值。服务端保留数据源原始数值字符串，不承诺固定小数位；上游空值或缺失值标准化为 `null`。百分比类指标按百分数值表达，例如 `89.12000000` 表示 `89.12%`；周转率、比率、倍数类指标按指标名称对应单位解释。 |

> **note 数值口径**
> `value` 暂不转为 JSON number，是为了保留数据源精度和尾随小数位。调用方展示时应按 `index_id` 识别单位：名称含“增长率”“毛利率”“净利率”“收益率”“资产负债率”“现金比率”等的指标按百分比展示；“周转率”通常按次展示；“已获利息倍数”按倍展示；缺失值展示为 `--` 或空值。

<a id="get_a_share_financials_indicators--财务指标数据--错误与约束"></a>
#### 财务指标数据 · 错误与约束

| 场景 | `code` | 说明 |
|---|---|---|
| 缺少 `thscode` 或 `report` | `1001` | 必填参数缺失。 |
| `report` 格式非法 | `1002` | 必须匹配 `yyyy-1`、`yyyy-2`、`yyyy-3`、`yyyy-4`。 |
| 上游服务超时 | `5002` | Arsenal 财务指标数据源超时。 |
| 上游服务不可用 | `5003` | Arsenal 财务指标数据源返回异常或非 0 状态码。 |
