# 新股发行与认购

[业务导航](README.md)

- [港股新股递表记录 · `get_hk_share_ipo_application_list`](#get_hk_share_ipo_application_list)
- [港股认购与待上市日历 · `get_hk_share_ipo_calendar_list`](#get_hk_share_ipo_calendar_list)
- [港股新股发行详情 · `get_hk_share_ipo_issue_detail`](#get_hk_share_ipo_issue_detail)

<a id="get_hk_share_ipo_application_list"></a>
## 港股新股递表记录


工具名：`get_hk_share_ipo_application_list`

<a id="get_hk_share_ipo_application_list--工具描述"></a>
### 工具描述

分页查询港股公司递表记录，保留同一公司的重复申请。页码从 1 开始，每页 50 条；总数未知时为 `null`，以 `has_next` 判断后续页。

<a id="get_hk_share_ipo_application_list--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `page` | integer | 否 | `1` | 从1开始的页码 |

<a id="get_hk_share_ipo_application_list--调用示例"></a>
### 调用示例

```text
工具：get_hk_share_ipo_application_list
参数：
  - page: 1
```

<a id="get_hk_share_ipo_application_list--返回"></a>
### 返回

返回统一响应信封中的数据对象。详细字段见 [港股打新](#get_hk_share_ipo_application_list--返回字段)。

<a id="get_hk_share_ipo_application_list--返回字段"></a>
### 返回字段

<a id="get_hk_share_ipo_application_list--港股新股递表记录--返回字段"></a>
#### 港股新股递表记录 · 返回字段

**`data` 元数据**

| 字段 | 类型 | 说明 |
|---|---|---|
| `item` | array | 业务记录列表 |
| `pagination` | object | 分页对象，包含page、size、total和has_next |

**`data.item[]` 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `company_name` | string | 递表公司名称 |
| `application_date` | date \| null | 递表日期 |

**`data.pagination` 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `page` | integer | 从1开始的页码 |
| `size` | integer | 本页请求大小 |
| `total` | integer \| null | 结果总数；未提供时为null |
| `has_next` | boolean | 是否存在后续页 |

<a id="get_hk_share_ipo_calendar_list"></a>
## 港股认购与待上市日历


工具名：`get_hk_share_ipo_calendar_list`

<a id="get_hk_share_ipo_calendar_list--工具描述"></a>
### 工具描述

查询港股可认购或待上市列表。`issue_code` 是发行记录标识，正式证券代码未确定时为 `null`；价格区间、每手股数与入场费详情由发行详情接口查询。截止日期为公共招股日期。

<a id="get_hk_share_ipo_calendar_list--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `status` | string | 是 | — | 发行阶段：subscribable/awaiting_listing |

<a id="get_hk_share_ipo_calendar_list--调用示例"></a>
### 调用示例

```text
工具：get_hk_share_ipo_calendar_list
参数：
  - status: "subscribable"
```

<a id="get_hk_share_ipo_calendar_list--返回"></a>
### 返回

返回统一响应信封中的数据对象。详细字段见 [港股打新](#get_hk_share_ipo_calendar_list--返回字段)。

<a id="get_hk_share_ipo_calendar_list--返回字段"></a>
### 返回字段

<a id="get_hk_share_ipo_calendar_list--港股认购与待上市日历--返回字段"></a>
#### 港股认购与待上市日历 · 返回字段

**`data` 元数据**

| 字段 | 类型 | 说明 |
|---|---|---|
| `status` | enum | 当前阶段 |
| `item` | array | 业务记录列表 |

**`data.item[]` 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `issue_code` | string | 发行记录标识，保留返回HK前缀等值 |
| `thscode` | string \| null | 正式代码；尚未确认时为空 |
| `name` | string | 发行股票名称 |
| `listing_date` | date \| null | 上市日期 |
| `issue_price` | number \| null | 已定发行价；可认购仅区间时本字段null；单位：HKD |
| `currency` | string \| null | HKD |
| `subscription_end_date` | date \| null | 公共招股截止日期；不是各券商精确时点 |
| `entry_fee` | number \| null | 业务返回入场费，不拆解其中费用；单位：HKD |
| `issue_price_text` | string \| null | 返回招股价展示文本；不从文本虚构单一发行价 |

<a id="get_hk_share_ipo_issue_detail"></a>
## 港股新股发行详情


工具名：`get_hk_share_ipo_issue_detail`

<a id="get_hk_share_ipo_issue_detail--工具描述"></a>
### 工具描述

按发行记录标识查询港股招股价格区间、每手股数与入场费。金额币种为港元，区间和费用为空时保留 `null`，本接口不表示该发行记录当前可认购。

<a id="get_hk_share_ipo_issue_detail--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `issue_code` | string | 是 | — | 日历中的发行记录标识，最多32字符 |

<a id="get_hk_share_ipo_issue_detail--调用示例"></a>
### 调用示例

```text
工具：get_hk_share_ipo_issue_detail
参数：
  - issue_code: "HK2636"
```

<a id="get_hk_share_ipo_issue_detail--返回"></a>
### 返回

返回统一响应信封中的数据对象。详细字段见 [港股打新](#get_hk_share_ipo_issue_detail--返回字段)。

<a id="get_hk_share_ipo_issue_detail--返回字段"></a>
### 返回字段

<a id="get_hk_share_ipo_issue_detail--港股新股发行详情--返回字段"></a>
#### 港股新股发行详情 · 返回字段

**`data` 元数据**

| 字段 | 类型 | 说明 |
|---|---|---|
| `issue_code` | string | 返回发行标识 |
| `currency` | string | HKD |
| `issue_price_range` | object \| null | 招股价格区间对象，包含可空的lower与upper；单位：HKD |
| `lot_size` | integer \| null | 每手股数；单位：股 |
| `entry_fee` | number \| null | 业务返回入场费，不自行按价格/股数推算；单位：HKD |

**`data.issue_price_range` 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `lower` | number \| null | 报价下界；单位：HKD |
| `upper` | number \| null | 报价上界；单位：HKD |
