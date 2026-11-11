# 期货

[全部业务域](../README.md)

先确定品种或合约，再查询持仓、仓单、基差、交易日程与行情。


## 资料与标识

查询目录、搜索、合约或基本资料，取得后续请求所需标识。

| 需求 / 文档 | 接口或工具 | 使用范围 |
| --- | --- | --- |
| [期货合约详情](futures-reference.md#get_futures_contracts_detail) | `get_futures_contracts_detail` | 公开 |
| [期货合约基础信息列表](futures-reference.md#get_futures_contracts_list) | `get_futures_contracts_list` | 公开 |
| [期货品种资料](varieties-list.md#get_futures_varieties_list) | `get_futures_varieties_list` | 公开 |
| [期货品种板块](variety-plates-list.md#get_futures_variety_plates_list) | `get_futures_variety_plates_list` | 公开 |

## 行情

查询分时走势选择期货分时行情，查询日线选择期货日 K。

| 需求 / 文档 | 接口或工具 | 使用范围 |
| --- | --- | --- |
| [期货K线](futures-prices.md#get_futures_prices_daily) | `get_futures_prices_daily` | 公开 |
| [期货分时](futures-prices.md#get_futures_prices_intraday) | `get_futures_prices_intraday` | 公开 |

## 持仓

品种与公司、合约维度不同；日期查询和历史序列分别选择。

| 需求 / 文档 | 接口或工具 | 使用范围 |
| --- | --- | --- |
| [期货公司列表](futures-positions.md#get_futures_positions_company_list) | `get_futures_positions_company_list` | 公开 |
| [公司品种日持仓](futures-positions.md#get_futures_positions_company_variety_daily) | `get_futures_positions_company_variety_daily` | 公开 |
| [期货合约日持仓](futures-positions.md#get_futures_positions_contract_daily) | `get_futures_positions_contract_daily` | 公开 |
| [期货合约历史持仓](futures-positions.md#get_futures_positions_contract_historical) | `get_futures_positions_contract_historical` | 公开 |
| [期货品种日持仓](futures-positions.md#get_futures_positions_variety_daily) | `get_futures_positions_variety_daily` | 公开 |

## 基差

最新主连基差与指定合约历史基差。

| 需求 / 文档 | 接口或工具 | 使用范围 |
| --- | --- | --- |
| [期货历史基差](futures-basis.md#get_futures_basis_historical) | `get_futures_basis_historical` | 公开 |
| [期货主连最新基差](futures-basis.md#get_futures_basis_main_continuous_latest) | `get_futures_basis_main_continuous_latest` | 公开 |

## 仓单

历史仓单与变化。

| 需求 / 文档 | 接口或工具 | 使用范围 |
| --- | --- | --- |
| [期货历史仓单](warehouse-receipts-historical.md#get_futures_warehouse_receipts_historical) | `get_futures_warehouse_receipts_historical` | 公开 |

## 端内扩展资料

端内品种板块、主连、主力与次主力合约、商品指数和 F10。

| 需求 / 文档 | 接口或工具 | 使用范围 |
| --- | --- | --- |
| [期货商品指数资料](futures-contracts-extended.md#get_futures_contracts_commodity_index_list) | `get_futures_contracts_commodity_index_list` | 公开 |
| [期货主连列表](futures-contracts-extended.md#get_futures_contracts_main_continuous_list) | `get_futures_contracts_main_continuous_list` | 公开 |
| [期货主力合约列表](futures-contracts-extended.md#get_futures_contracts_main_list) | `get_futures_contracts_main_list` | 公开 |
| [期货次主力合约列表](futures-contracts-extended.md#get_futures_contracts_secondary_main_list) | `get_futures_contracts_secondary_main_list` | 公开 |
