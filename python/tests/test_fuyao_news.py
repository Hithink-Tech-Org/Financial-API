"""News routes retain opaque identities, nullable content and paging metadata."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'toolkit/fuyao/scripts'))
import fuyao_client as client
import fuyao


@pytest.mark.parametrize('function_name,path,params', [
    ('news_article_detail', '/api/news/article/detail', {'client_type': 'web', 'encoded_seq': 'opaque?x=1'}),
    ('news_flash_list', '/api/news/flash/list', {'tag_id': 1, 'seq': '9007199254740993'}),
    ('news_flash_refresh', '/api/news/flash/refresh', {'tag_id': 1, 'seq': '9223372036854775807', 'create_time_ms': 1792022400000}),
    ('news_notice_detail', '/api/news/notice/detail', {'seq': 'notice-opaque'}),
    ('news_topic_hot_list', '/api/news/topic/hot-list', {'tab_id': 1, 'cursor': 'opaque+/=', 'limit': 10, 'important_only': True}),
    ('news_anomaly_analysis', '/api/news/anomaly/analysis', {'begin_date': '2020-01-01', 'end_date': '2026-10-16', 'thscode': 'upstream-code'}),
    ('news_stock_timeline_list', '/api/news/stock/timeline-list', {'thscode': '300033.SZ', 'offset': 'first', 'size': 100}),
])
def test_news_routes_are_lossless(monkeypatch, function_name, path, params):
    expected = {'items': [{'id': '9007199254740993', 'summary': None, 'content': '<p>正文</p>'}, {'id': '2'}], 'has_more': True, 'offset': 'next+/='}
    calls = []
    monkeypatch.setattr(client, '_get', lambda p, q: calls.append((p, q)) or expected)
    assert getattr(client, function_name)(**params) is expected
    assert len(calls) == 1
    assert calls[0][0] == path
    for key, value in params.items():
        assert calls[0][1][key] == (str(value).lower() if isinstance(value, bool) else value)


@pytest.mark.parametrize('name,params', [
    ('news_article_detail', {'client_type': 'mobile', 'encoded_seq': 'id'}),
    ('news_article_detail', {'client_type': 'WEB', 'encoded_seq': '../id'}),
    ('news_notice_detail', {'seq': ' '}),
    ('news_flash_list', {'tag_id': True, 'seq': '0'}),
    ('news_flash_list', {'tag_id': 1, 'seq': '9223372036854775808'}),
    ('news_flash_list', {'tag_id': 1, 'seq': '1.0'}),
    ('news_flash_refresh', {'tag_id': 1, 'seq': '0', 'create_time_ms': 1001}),
    ('news_topic_hot_list', {'tab_id': 1, 'limit': 11}),
    ('news_topic_hot_list', {'tab_id': 1, 'important_only': 'false'}),
    ('news_anomaly_analysis', {'begin_date': '2026-02-30', 'end_date': '2026-10-16'}),
    ('news_anomaly_analysis', {'begin_date': '2026-10-16', 'end_date': '2026-10-15'}),
    ('news_stock_timeline_list', {'thscode': ' ', 'offset': 'first'}),
    ('news_stock_timeline_list', {'thscode': '300033', 'offset': 'first'}),
    ('news_stock_timeline_list', {'thscode': '300033.SZ,600519.SH', 'offset': 'first'}),
    ('news_stock_timeline_list', {'thscode': '300033.SZ', 'offset': 'first', 'size': 101}),
])
def test_invalid_news_input_prevents_http(monkeypatch, name, params):
    monkeypatch.setattr(client, '_get', lambda *_: pytest.fail('HTTP must not run'))
    with pytest.raises(ValueError):
        getattr(client, name)(**params)


def test_news_defaults_keep_omitted_size_and_cursor(monkeypatch):
    calls = []
    monkeypatch.setattr(client, '_get', lambda p, q: calls.append({k: v for k, v in q.items() if v is not None}) or {})
    client.news_stock_timeline_list(thscode='300033.SZ', offset='first')
    client.news_topic_hot_list(tab_id=1)
    assert calls == [{'thscode': '300033.SZ', 'offset': 'first'}, {'tab_id': 1, 'limit': 10, 'important_only': 'false'}]


def test_timeline_rejects_legacy_market_parameters(monkeypatch):
    monkeypatch.setattr(client, '_get', lambda *_: pytest.fail('HTTP must not run'))
    with pytest.raises(TypeError):
        client.news_stock_timeline_list(market_id='33', code='300033', offset='first')
    with pytest.raises(SystemExit):
        fuyao.build_parser().parse_args(['news-stock-timeline-list', '--market-id', '33', '--code', '300033', '--offset', 'first'])


@pytest.mark.parametrize('name,params', [
    ('special_data_limit_up_pool', {}),
    ('special_data_hot_stock_list', {}),
    ('fund_offerings_list', {'subscribe': 'active'}),
    ('fund_indicators_table', {}),
    ('fund_quota_list', {'tab': '["nazhi100"]'}),
])
def test_result_code_nulls_keep_distinct_rows_and_pagination(monkeypatch, name, params):
    class Response:
        status_code = 200
        def raise_for_status(self):
            pass
        def json(self):
            return {'code': 0, 'data': data}

    class Session:
        def get(self, *args, **kwargs):
            return Response()

    monkeypatch.setattr(client, '_session', lambda: Session())
    monkeypatch.setattr(client, '_token', lambda: 'fixture-key')
    for codes in ([None, None, '600519.SH'], [None, None]):
        rows = [{'thscode': code, 'value': i} for i, code in enumerate(codes)]
        data = {'item': rows, 'data': rows, 'sort_thscodes': codes, 'total': 9, 'pagination': {'page': 2, 'size': 3, 'total': 9, 'has_next': True}}
        if name == 'fund_quota_list':
            data = [{'tab': 'nazhi100', 'funds': rows}]
        assert getattr(client, name)(**params) == data


@pytest.mark.parametrize('command,args,name,expected', [
    ('news-article-detail', ['--client-type', 'WEB', '--encoded-seq', 'opaque'], 'news_article_detail', {'client_type': 'WEB', 'encoded_seq': 'opaque'}),
    ('news-flash-list', ['--tag-id', '1', '--seq', '9007199254740993'], 'news_flash_list', {'tag_id': 1, 'seq': '9007199254740993'}),
    ('news-flash-refresh', ['--tag-id', '1', '--seq', '0', '--create-time-ms', '1000'], 'news_flash_refresh', {'tag_id': 1, 'seq': '0', 'create_time_ms': 1000}),
    ('news-notice-detail', ['--seq', 'opaque'], 'news_notice_detail', {'seq': 'opaque'}),
    ('news-topic-hot-list', ['--tab-id', '1'], 'news_topic_hot_list', {'tab_id': 1, 'cursor': None, 'limit': 10, 'important_only': False}),
    ('news-anomaly-analysis', ['--begin-date', '2026-10-01', '--end-date', '2026-10-16'], 'news_anomaly_analysis', {'begin_date': '2026-10-01', 'end_date': '2026-10-16', 'thscode': None}),
    ('news-stock-timeline-list', ['--thscode', '300033.SZ', '--offset', 'first'], 'news_stock_timeline_list', {'thscode': '300033.SZ', 'offset': 'first', 'size': None}),
])
def test_python_news_dispatch(monkeypatch, command, args, name, expected):
    calls = []
    monkeypatch.setattr(fuyao, name, lambda **kwargs: calls.append(kwargs) or {})
    parsed = fuyao.build_parser().parse_args([command, *args])
    parsed.func(parsed)
    assert calls == [expected]
