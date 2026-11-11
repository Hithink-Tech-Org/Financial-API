# QDII 额度

[业务导航](README.md)

- [QDII额度列表 · `get_fund_quota_list`](#get_fund_quota_list)
- [QDII额度汇总 · `get_fund_quota_summary`](#get_fund_quota_summary)

<a id="get_fund_quota_list"></a>
## QDII额度列表


工具名：`get_fund_quota_list`

<a id="get_fund_quota_list--工具描述"></a>
### 工具描述

> 返回分类、子分类和基金列表，保留可空额度、收益率与共享基金额度类别列表。

<a id="get_fund_quota_list--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `tab` | string | 是 | — | 分类字符串数组的 JSON，例如 `["remen"]`。 |
| `buy` | boolean | 否 | — | 可购状态过滤；省略时不设置该过滤。 |

<a id="get_fund_quota_list--调用示例"></a>
### 调用示例

```text
工具：get_fund_quota_list
参数：
  - tab: "[\"remen\"]"
  - buy: true
```

<a id="get_fund_quota_list--返回"></a>
### 返回

返回分类下的完整基金 `thscode`、名称、额度、近一年收益率和可空 `classify` 类别列表；详见[QDII额度列表](#get_fund_quota_list--返回字段)。

<a id="get_fund_quota_list--返回字段"></a>
### 返回字段

<a id="get_fund_quota_list--qdii额度列表--返回字段"></a>
#### QDII额度列表 · 返回字段

`data[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | string | 分类名称。 |
| `sub_tab` | array | 子分类列表。 |

`data[].sub_tab[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | string | 子分类名称。 |
| `fund_list` | array | 当前子分类下的基金列表。 |

`data[].sub_tab[].fund_list[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 含市场后缀的完整基金代码。 |
| `fund_name` | string | 基金名称。 |
| `quota` | string \| null | 基金额度；`null` 表示无限额。 |
| `year` | string \| null | 近一年收益率。 |
| `classify` | string[] \| null | 共享基金额度类别列表。 |

<a id="get_fund_quota_summary"></a>
## QDII额度汇总


工具名：`get_fund_quota_summary`

<a id="get_fund_quota_summary--工具描述"></a>
### 工具描述

> 返回指定分类的无限额、限额、基金与可购数量。

<a id="get_fund_quota_summary--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `tab` | string | 是 | — | 分类字符串数组的 JSON，例如 `["nazhi100"]`。 |

<a id="get_fund_quota_summary--调用示例"></a>
### 调用示例

```text
工具：get_fund_quota_summary
参数：
  - tab: "[\"nazhi100\"]"
```

<a id="get_fund_quota_summary--返回"></a>
### 返回

返回分类额度汇总；详见[QDII额度汇总](#get_fund_quota_summary--返回字段)。

<a id="get_fund_quota_summary--返回字段"></a>
### 返回字段

<a id="get_fund_quota_summary--qdii额度汇总--返回字段"></a>
#### QDII额度汇总 · 返回字段

`data[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | string | 分类名称。 |
| `unlimited` | string | 无额度限制的基金数。 |
| `total_limit` | string | 限额合计。 |
| `total` | string | 基金总数。 |
| `buy` | string | 可购基金数。 |

数值以字符串原样返回，不作单位转换。
