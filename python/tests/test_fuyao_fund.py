from __future__ import annotations

import inspect
import sys
from pathlib import Path

import pytest


SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "toolkit" / "fuyao" / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

import fuyao as fuyao_cli  # noqa: E402
import fuyao_client  # noqa: E402


def test_fund_functions_do_not_expose_fund_type_input() -> None:
    fund_functions = (
        getattr(fuyao_client, name)
        for name in fuyao_client.__all__
        if name.startswith("fund_")
    )

    assert all("fund_type" not in inspect.signature(fn).parameters for fn in fund_functions)


@pytest.mark.parametrize(
    "function_name,args,kwargs,path,params",
    [
        (
            "fund_profile_detail",
            ("025480.OF",),
            {},
            "/api/fund/profile/detail",
            {"thscode": "025480.OF"},
        ),
        (
            "fund_portfolio_holdings",
            ("025480.OF",),
            {},
            "/api/fund/portfolio/holdings",
            {"thscode": "025480.OF"},
        ),
        (
            "fund_performance_nav",
            ("025480.OF",),
            {"range": "year", "nav_type": "unit,adj"},
            "/api/fund/performance/nav",
            {
                "thscode": "025480.OF",
                "range": "year",
                "nav_type": "unit,adj",
            },
        ),
        (
            "fund_performance_returns",
            ("025480.OF",),
            {},
            "/api/fund/performance/returns",
            {"thscode": "025480.OF"},
        ),
        (
            "fund_holders_detail",
            ("025480.OF",),
            {},
            "/api/fund/holders/detail",
            {"thscode": "025480.OF", "merge_scope": "all"},
        ),
        (
            "fund_holders_detail",
            ("025480.OF",),
            {"merge_scope": "separate"},
            "/api/fund/holders/detail",
            {
                "thscode": "025480.OF",
                "merge_scope": "separate",
            },
        ),
        (
            "fund_market_snapshot",
            ("510300.sh",),
            {},
            "/api/fund/market/snapshot",
            {"thscode": "510300.SH"},
        ),
        (
            "fund_market_historical",
            ("510300.SH", 1_700_000_000_000, 1_710_000_000_000),
            {},
            "/api/fund/market/historical",
            {
                "thscode": "510300.SH",
                "interval": "1d",
                "start": 1_700_000_000_000,
                "end": 1_710_000_000_000,
            },
        ),
        ("fund_companies_detail", ("company-1",), {}, "/api/fund/companies/detail", {"company_id": "company-1"}),
        ("fund_portfolio_industry_allocation", ("025480.OF",), {}, "/api/fund/portfolio/industry-allocation", {"thscode": "025480.OF"}),
        ("fund_performance_indicators_historical", ("025480.OF", 1, 2), {}, "/api/fund/performance/indicators-historical", {"thscode": "025480.OF", "start": 1, "end": 2}),
        ("fund_performance_drawdowns", ("025480.OF",), {}, "/api/fund/performance/drawdowns", {"thscode": "025480.OF"}),
        ("fund_holders_top", ("025480.OF",), {"limit": 10}, "/api/fund/holders/top", {"thscode": "025480.OF", "limit": 10}),
        ("fund_corporate_actions_dividends", ("025480.OF",), {}, "/api/fund/corporate-actions/dividends", {"thscode": "025480.OF"}),
        ("fund_diagnostics_detail", ("025480.OF",), {}, "/api/fund/diagnostics/detail", {"thscode": "025480.OF"}),
        ("fund_financials_indicators", ("025480.OF",), {}, "/api/fund/financials/indicators", {"thscode": "025480.OF"}),
        ("fund_financials_income_statements", ("025480.OF",), {}, "/api/fund/financials/income-statements", {"thscode": "025480.OF"}),
        ("fund_financials_balance_sheets", ("025480.OF",), {}, "/api/fund/financials/balance-sheets", {"thscode": "025480.OF"}),
        ("fund_managers_investment_style", ("manager-1",), {}, "/api/fund/managers/investment-style", {"manager_id": "manager-1"}),
        ("fund_managers_performance", ("manager-1",), {"range": "year"}, "/api/fund/managers/performance", {"manager_id": "manager-1", "range": "year"}),
        ("fund_managers_experience", ("manager-1",), {}, "/api/fund/managers/experience", {"manager_id": "manager-1"}),
        ("fund_managers_detail", ("manager-1",), {}, "/api/fund/managers/detail", {"manager_id": "manager-1"}),
        ("fund_news_article_list", ("025480.OF",), {"limit": 20, "offset": "next"}, "/api/fund/news/article-list", {"thscode": "025480.OF", "limit": 20, "offset": "next"}),
        ("fund_offerings_list", ("active",), {}, "/api/fund/offerings/list", {"subscribe": "active"}),
        ("fund_portfolio_stock_history", ("025480.OF", "quarter", "2025-12-31"), {}, "/api/fund/portfolio/stock-history", {"thscode": "025480.OF", "report_type": "quarter", "end_date": "2025-12-31"}),
        ("fund_portfolio_stock_report_dates", ("025480.OF",), {"report_type": "quarter"}, "/api/fund/portfolio/stock-report-dates", {"thscode": "025480.OF", "report_type": "quarter"}),
        ("fund_portfolio_bond_history", ("025480.OF", "quarter", "2025-12-31"), {}, "/api/fund/portfolio/bond-history", {"thscode": "025480.OF", "report_type": "quarter", "end_date": "2025-12-31"}),
        ("fund_portfolio_bond_report_dates", ("025480.OF",), {"report_type": "quarter"}, "/api/fund/portfolio/bond-report-dates", {"thscode": "025480.OF", "report_type": "quarter"}),
        ("fund_portfolio_asset_allocation", ("025480.OF",), {}, "/api/fund/portfolio/asset-allocation", {"thscode": "025480.OF"}),
        ("fund_backtest_indicators", (), {}, "/api/fund/backtest/indicators", {}),
        ("fund_backtest_result", ("000001.OF", "{}", "[]", "WEEKLY", 3, 1000.5), {}, "/api/fund/backtest/result", {"thscode": "000001.OF", "buy_conditions": "{}", "sell_conditions": "[]", "buy_frequency_type": "WEEKLY", "max_buy_times": 3, "per_buy_amount": 1000.5}),
        ("fund_indicators_line", ('[{"thscodes":["000001.OF"],"index_info":[{"index_id":"rsi_pct"}]}]', '{"time_type":"DAY_1","start":1704729600000,"end":1704902400000}'), {}, "/api/fund/indicators/line", {"indexes": '[{"thscodes":["000001.OF"],"index_info":[{"index_id":"rsi_pct"}]}]', "time_range": '{"time_type":"DAY_1","start":1704729600000,"end":1704902400000}'}),
        ("fund_indicators_table", (), {"code_selectors": '{"include":[{"type":"fund_code","thscodes":["000001.OF"]}]}', "indexes": '[{"index_id":"rsi_pct","timestamp":0}]', "page_info": '{"page_begin":0,"page_size":20}', "sort": '[{"idx":0,"type":"desc"}]'}, "/api/fund/indicators/table", {"code_selectors": '{"include":[{"type":"fund_code","thscodes":["000001.OF"]}]}', "indexes": '[{"index_id":"rsi_pct","timestamp":0}]', "page_info": '{"page_begin":0,"page_size":20}', "sort": '[{"idx":0,"type":"desc"}]'}),
        ("fund_quota_summary", ('["nazhi100"]',), {}, "/api/fund/quota/summary", {"tab": '["nazhi100"]'}),
        ("fund_quota_list", ('["nazhi100"]',), {"buy": True}, "/api/fund/quota/list", {"tab": '["nazhi100"]', "buy": True}),
    ],
)
def test_fund_functions_map_the_published_contract(
    monkeypatch, function_name, args, kwargs, path, params
):
    calls = []
    expected = {"timestamp": 1, "item": []}
    monkeypatch.setattr(
        fuyao_client,
        "_get",
        lambda actual_path, actual_params: calls.append((actual_path, actual_params))
        or expected,
    )

    assert getattr(fuyao_client, function_name)(*args, **kwargs) == expected
    assert calls == [(path, params)]


@pytest.mark.parametrize(
    "call,message",
    [
        (
            lambda: fuyao_client.fund_performance_nav(
                "025480.OF", range="fiveyear"
            ),
            "range",
        ),
        (
            lambda: fuyao_client.fund_performance_nav(
                "025480.OF", nav_type="all"
            ),
            "nav_type",
        ),
        (
            lambda: fuyao_client.fund_holders_detail(
                "025480.OF", merge_scope="combined"
            ),
            "merge_scope",
        ),
        (lambda: fuyao_client.fund_market_snapshot("510300.SH,"), "complete"),
        (lambda: fuyao_client.fund_market_snapshot(",".join(["510300.SH"] * 101)), "raw tokens"),
        (
            lambda: fuyao_client.fund_market_historical(
                "510300.SH", 1_700_000_000_000, 1_700_000_000_000 - 1
            ),
            "end_ms",
        ),
        (
            lambda: fuyao_client.fund_market_historical(
                "510300.SH", 1_700_000_000_000, 1_900_000_000_000
            ),
            "five years",
        ),
        (lambda: fuyao_client.fund_companies_detail(""), "company_id"),
        (lambda: fuyao_client.fund_performance_indicators_historical("025480.OF", 2, 1), "end_ms"),
        (lambda: fuyao_client.fund_holders_top("025480.OF", limit=11), "limit"),
        (lambda: fuyao_client.fund_managers_performance("manager-1", range="invalid"), "range"),
        (lambda: fuyao_client.fund_news_article_list("025480.OF", limit=101), "limit"),
        (lambda: fuyao_client.fund_offerings_list("closed"), "subscribe"),
        (lambda: fuyao_client.fund_backtest_result("000001", "{}", "[]", "WEEKLY", 3, 1000), "thscode"),
        (lambda: fuyao_client.fund_backtest_result("000001.OF", "{} trailing", "[]", "WEEKLY", 3, 1000), "buy_conditions"),
        (lambda: fuyao_client.fund_indicators_line('[{"thscodes":["000001"]}]', '{"time_type":"DAY_1"}'), "indexes"),
        (lambda: fuyao_client.fund_indicators_line('[]', '{"time_type":"DAY_1","start":2,"end":1}'), "time_range"),
        (lambda: fuyao_client.fund_indicators_table(code_selectors='{"include":[{"type":"fund_code","values":["000001"]}]}'), "code_selectors"),
        (lambda: fuyao_client.fund_quota_list('[1]'), "tab"),
        (lambda: fuyao_client.fund_quota_list('[""]'), "tab"),
    ],
)
def test_fund_functions_reject_invalid_input_before_http(monkeypatch, call, message):
    monkeypatch.setattr(
        fuyao_client,
        "_get",
        lambda *_args, **_kwargs: pytest.fail("HTTP must not be called"),
    )

    with pytest.raises(ValueError, match=message):
        call()


@pytest.mark.parametrize(
    "call",
    [
        lambda: fuyao_client.fund_backtest_indicators(),
        lambda: fuyao_client.fund_quota_summary('["nazhi100"]'),
        lambda: fuyao_client.fund_quota_list('["nazhi100"]'),
    ],
)
@pytest.mark.parametrize("payload_data", [[], [None]])
def test_array_fund_functions_preserve_array_response(monkeypatch, call, payload_data):
    class EmptyArrayResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"code": 0, "data": payload_data}

    class EmptyArraySession:
        def get(self, *_args, **_kwargs):
            return EmptyArrayResponse()

    monkeypatch.setattr(fuyao_client, "_session", lambda: EmptyArraySession())
    monkeypatch.setattr(fuyao_client, "_token", lambda: "test-placeholder")

    assert call() == payload_data


def test_ticker_asset_types_accept_normalized_multi_values(monkeypatch):
    calls = []
    monkeypatch.setattr(
        fuyao_client,
        "_get",
        lambda path, params: calls.append((path, params)) or {"item": []},
    )

    fuyao_client.tickers_search(
        "基金", asset_type=["fund-otc", "fund-etf", "fund-otc"], remote=True
    )
    fuyao_client.tickers_list(asset_type="fund-lof,fund-reits")

    assert calls[0][1]["asset_type"] == "fund-otc,fund-etf"
    assert calls[1][1]["asset_type"] == "fund-lof,fund-reits"


def test_ticker_asset_types_reject_unknown_value_before_http(monkeypatch):
    monkeypatch.setattr(
        fuyao_client,
        "_get",
        lambda *_args, **_kwargs: pytest.fail("HTTP must not be called"),
    )

    with pytest.raises(ValueError, match="asset_type"):
        fuyao_client.tickers_search("基金", asset_type="fund", remote=True)


def test_fund_cli_commands_are_registered_and_map_arguments(monkeypatch):
    calls = []
    monkeypatch.setattr(
        fuyao_cli,
        "fund_performance_nav",
        lambda thscode, **kwargs: calls.append((thscode, kwargs)) or {},
    )
    parser = fuyao_cli.build_parser()

    args = parser.parse_args(
        [
            "fund-nav",
            "--thscode",
            "025480.OF",
            "--range",
            "year",
            "--nav-type",
            "unit,adj",
        ]
    )
    args.func(args)

    assert calls == [
        (
            "025480.OF",
            {"range": "year", "nav_type": "unit,adj"},
        )
    ]


def test_fund_functional_cli_commands_map_complex_arguments(monkeypatch):
    calls = []
    monkeypatch.setattr(
        fuyao_cli,
        "fund_backtest_result",
        lambda *args: calls.append(args) or {},
    )
    parser = fuyao_cli.build_parser()
    args = parser.parse_args(
        [
            "fund-backtest-result",
            "--thscode",
            "000001.OF",
            "--buy-conditions",
            "{}",
            "--sell-conditions",
            "[]",
            "--buy-frequency-type",
            "WEEKLY",
            "--max-buy-times",
            "3",
            "--per-buy-amount",
            "1000.5",
        ]
    )
    args.func(args)

    assert calls == [("000001.OF", "{}", "[]", "WEEKLY", 3.0, 1000.5)]


def test_fund_holders_cli_maps_merge_scope(monkeypatch):
    calls = []
    monkeypatch.setattr(
        fuyao_cli,
        "fund_holders_detail",
        lambda thscode, **kwargs: calls.append((thscode, kwargs)) or {},
    )
    parser = fuyao_cli.build_parser()

    args = parser.parse_args(
        [
            "fund-holders",
            "--thscode",
            "025480.OF",
            "--merge-scope",
            "separate",
        ]
    )
    args.func(args)

    assert calls == [("025480.OF", {"merge_scope": "separate"})]


def test_fund_function_docs_explain_narrow_payloads_and_cursor_end() -> None:
    indicators_doc = fuyao_client.fund_performance_indicators_historical.__doc__ or ""
    news_doc = fuyao_client.fund_news_article_list.__doc__ or ""

    assert "timestamp and item only" in indicators_doc
    assert "no top-level thscode/interval" in indicators_doc
    assert "has_more" in news_doc
    assert "no total" in news_doc
