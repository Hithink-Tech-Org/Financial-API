# 港股新股发行详情

[业务导航](README.md)

> **info**
> 工具名：`get_hk_share_ipo_issue_detail`
>
> 对应 REST 端点：[`GET /api/hk-share/ipo/issue-detail`](../../api/hk-share/hk-share-ipo.md#ipo-issue-detail)


## 工具描述

按发行记录标识查询港股招股价格区间、每手股数与入场费。金额币种为港元，区间和费用为空时保留 `null`，本接口不表示该发行记录当前可认购。

## 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `issue_code` | string | 是 | — | 日历中的发行记录标识，最多32字符 |

## 调用示例

```text
工具：get_hk_share_ipo_issue_detail
参数：
  - issue_code: "HK2636"
```

## 返回

返回统一响应信封中的数据对象。详细字段见 [港股打新](../../api/hk-share/hk-share-ipo.md#ipo-issue-detail)。
