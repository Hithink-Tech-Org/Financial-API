"""Public business data routes, validation and lossless transport."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'toolkit/fuyao/scripts'))
import fuyao_client as client
import fuyao


@pytest.mark.parametrize('function_name,path,params', [
    ('special_data_limit_up_statistics', '/api/a-share/special-data/limit-up-statistics', {'date': '2026-10-12'}),
    ('special_data_dragon_tiger_stock_institution', '/api/a-share/special-data/dragon-tiger-stock-institution', {'thscode': '600519.SH', 'range_days': 3}),
    ('special_data_dragon_tiger_department_classic_record', '/api/a-share/special-data/dragon-tiger-department-classic-record', {'department_id': 'abc'}),
    ('special_data_dragon_tiger_department_history', '/api/a-share/special-data/dragon-tiger-department-history', {'department_id': 'abc', 'page': 2, 'size': 30, 'min_net_buy_amount': 5000000, 'sort_field': 'change_ratio', 'sort_dir': 'asc'}),
    ('special_data_abnormal_monitor_list', '/api/a-share/special-data/abnormal-monitor-list', {'state': 'history', 'page': 2, 'size': 30}),
    ('special_data_auction_stock_opportunities', '/api/a-share/special-data/auction-stock-opportunities', {'date': '2026-10-12', 'warn_types': '68710,68727', 'exclude_st': True, 'thscodes': ['600519.SH'], 'market': 'a_share', 'sort_by': 'warn_type', 'sort_order': 'asc', 'page': 1, 'size': 20}),
    ('special_data_auction_opportunity_dates', '/api/a-share/special-data/auction-opportunity-dates', {}),
    ('a_share_ipo_calendar_list', '/api/a-share/ipo/calendar-list', {'market': 'bj', 'status': 'subscribable'}),
    ('hk_share_ipo_application_list', '/api/hk-share/ipo/application-list', {'page': 2}),
    ('hk_share_ipo_calendar_list', '/api/hk-share/ipo/calendar-list', {'status': 'awaiting_listing'}),
    ('hk_share_ipo_issue_detail', '/api/hk-share/ipo/issue-detail', {'issue_code': 'HK2636'}),
])
def test_business_routes_preserve_records_and_pagination(monkeypatch, function_name, path, params):
    calls = []
    expected = {'item': [{'thscode': None, 'name': ''}, {'thscode': '', 'name': None}], 'pagination': {'page': 2, 'size': 30, 'total': 61, 'has_next': True}}
    monkeypatch.setattr(client, '_get', lambda p, q: calls.append((p, q)) or expected)
    assert getattr(client, function_name)(**params) is expected
    assert len(calls) == 1
    assert calls[0][0] == path
    sent = {k: v for k, v in calls[0][1].items() if v is not None}
    for key, value in params.items():
        assert sent[key] == (','.join(value) if isinstance(value, list) else str(value).lower() if isinstance(value, bool) else value)


@pytest.mark.parametrize('name,params', [
    ('special_data_skyrocket_list', {'limit': 0}),
    ('special_data_hot_stock_list', {'limit': 101}),
    ('special_data_hot_stock_list', {'limit': True}),
    ('special_data_dragon_tiger_department_history', {'department_id': 'abc', 'size': 31}),
    ('special_data_dragon_tiger_department_history', {'department_id': '', 'page': 1}),
    ('special_data_dragon_tiger_department_history', {'department_id': 'abc', 'min_net_buy_amount': 1}),
    ('special_data_dragon_tiger_stock_institution', {'thscode': '600519.SH', 'range_days': 2}),
    ('special_data_abnormal_monitor_list', {'state': 'unknown'}),
    ('special_data_auction_stock_opportunities', {'size': 21}),
    ('special_data_auction_stock_opportunities', {'page': 2147483648}),
    ('special_data_auction_stock_opportunities', {'warn_types': '68728'}),
    ('special_data_auction_stock_opportunities', {'exclude_st': 'false'}),
    ('special_data_auction_stock_opportunities', {'thscodes': ['600519.SH'] * 51}),
    ('special_data_auction_stock_opportunities', {'date': '2026-02-30'}),
    ('a_share_ipo_calendar_list', {'market': 'hk', 'status': 'upcoming'}),
    ('hk_share_ipo_calendar_list', {'status': 'upcoming'}),
    ('hk_share_ipo_issue_detail', {'issue_code': 'a' * 33}),
])
def test_invalid_business_parameters_fail_before_http(monkeypatch, name, params):
    monkeypatch.setattr(client, '_get', lambda *_: pytest.fail('HTTP must not run'))
    with pytest.raises(ValueError):
        getattr(client, name)(**params)


@pytest.mark.parametrize('name', ['special_data_skyrocket_list', 'special_data_hot_stock_list'])
def test_hot_list_limit_is_bounded_and_defaulted(monkeypatch, name):
    calls = []
    monkeypatch.setattr(client, '_get', lambda p, q: calls.append(q) or {})
    getattr(client, name)()
    getattr(client, name)(limit=100)
    assert calls == [{'period': 'day', 'limit': 30}, {'period': 'day', 'limit': 100}]


@pytest.mark.parametrize('command,args,name,expected', [
    ('limit-up-statistics', ['--date', '2026-10-12'], 'special_data_limit_up_statistics', {'date': '2026-10-12'}),
    ('dragon-tiger-department-history', ['--department-id', 'abc', '--page', '2'], 'special_data_dragon_tiger_department_history', {'department_id': 'abc', 'page': 2, 'size': 30, 'min_net_buy_amount': None, 'sort_field': 'trade_date', 'sort_dir': 'desc'}),
    ('hk-ipo-issue-detail', ['--issue-code', 'HK2636'], 'hk_share_ipo_issue_detail', {'issue_code': 'HK2636'}),
])
def test_python_command_dispatch(monkeypatch, command, args, name, expected):
    calls = []
    monkeypatch.setattr(fuyao, name, lambda **kwargs: calls.append(kwargs) or {})
    parsed = fuyao.build_parser().parse_args([command, *args])
    parsed.func(parsed)
    assert calls == [expected]
