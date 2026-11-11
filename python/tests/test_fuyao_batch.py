from __future__ import annotations

import json
import sys
from pathlib import Path
from uuid import uuid4

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'toolkit' / 'fuyao' / 'scripts'))
import fuyao as cli
import fuyao_client as client

_API_KEY = str(uuid4())
START = 1790784000000
END = 1790870400000

BATCHES = [
    ('prices_historical_batch', '/api/a-share/prices/historical-batch', True),
    ('index_prices_historical_batch', '/api/a-share-index/prices/historical-batch', True),
    ('fund_market_historical_batch', '/api/fund/market/historical-batch', True),
    ('financials_income_statements_batch', '/api/a-share/financials/income-statements-batch', False),
    ('financials_balance_sheets_batch', '/api/a-share/financials/balance-sheets-batch', False),
    ('financials_cash_flow_statements_batch', '/api/a-share/financials/cash-flow-statements-batch', False),
]


def grouped(history):
    payload = {'item': [
        {'thscode': '600519.SH', 'timestamp': START, 'item': [
            {'date_ms': START, 'close_price': None} if history else
            {'thscode': '600519.SH', 'ticker': '600519', 'period': 'annual', 'fiscal_year': 2025,
             'fiscal_period': 'FY', 'period_end_ms': START, 'currency': 'CNY', 'net_profit': None}
        ]},
        {'thscode': '000001.SZ', 'timestamp': None, 'item': []},
    ]}
    if history:
        payload.update(interval='1d', adjust='forward')
    return payload


@pytest.mark.parametrize('name,path,history', BATCHES)
def test_batch_routes_limits_and_compact_groups(monkeypatch, name, path, history):
    calls = []
    data = grouped(history)
    def get(endpoint, params, **kwargs):
        calls.append((endpoint, params, kwargs))
        return data
    monkeypatch.setattr(client, '_get', get)
    fn = getattr(client, name)
    kwargs = {'start_ms': START, 'end_ms': END} if history else {}
    assert fn(' 600519.sh,600519.SH ', **kwargs) == data
    assert calls[0] == (path, {
        'thscodes': '600519.SH',
        **({'start': START, 'end': END, 'interval': '1d',
            **({'adjust': 'forward'} if name == 'prices_historical_batch' else {})} if history else {'period': 'annual'}),
    }, {'batch': True})
    fn(['600519.SH'] * 10, **kwargs)
    for codes in (['600519.SH'] * 11, '600519.SH,', ''):
        with pytest.raises(ValueError):
            fn(codes, **kwargs)
    assert len(calls) == 2


@pytest.mark.parametrize('code', [3001, 3004, 5003])
def test_batch_failure_uses_regular_error_without_retry(monkeypatch, code):
    calls = []
    class Response:
        def raise_for_status(self): pass
        def json(self): return {'code': code, 'message': 'failed', 'request_id': 'id', 'data': None}
    class Session:
        def get(self, *args, **kwargs):
            calls.append(1)
            return Response()
    monkeypatch.setattr(client, '_session', lambda: Session())
    monkeypatch.setattr(client, '_token', lambda: _API_KEY)
    with pytest.raises(client.FuyaoApiError) as error:
        client.prices_historical_batch(['999999.SH'], START, END)
    assert error.value.code == code
    assert error.value.request_id == 'id'
    assert calls == [1]


@pytest.mark.parametrize('history', [True, False])
def test_batch_http_keeps_compact_groups_and_empty_targets(monkeypatch, history):
    data = grouped(history)
    calls = []
    class Response:
        def raise_for_status(self): pass
        def json(self): return {'code': 0, 'message': 'ok', 'data': data}
    class Session:
        def get(self, *args, **kwargs):
            calls.append(1)
            return Response()
    monkeypatch.setattr(client, '_session', lambda: Session())
    monkeypatch.setattr(client, '_token', lambda: _API_KEY)
    result = (client.prices_historical_batch('600519.SH,000001.SZ,999999.SH', START, END) if history
              else client.financials_income_statements_batch('600519.SH,000001.SZ,999999.SH'))
    assert result == data
    assert result['item'][1] == {'thscode': '000001.SZ', 'timestamp': None, 'item': []}
    assert calls == [1]


def test_batch_cli_succeeds_for_returned_groups_and_errors_normally(capsys, monkeypatch):
    data = grouped(True)
    monkeypatch.setattr(cli, 'prices_historical_batch', lambda *args, **kwargs: data)
    args = ['prices-historical-batch', '--thscodes', '600519.SH,000001.SZ,999999.SH',
            '--start-ms', str(START), '--end-ms', str(END)]
    assert cli.main(args) == 0
    captured = capsys.readouterr()
    assert json.loads(captured.out) == data and captured.err == ''
    def fail(*args, **kwargs):
        raise client.FuyaoApiError(3001, 'Target not found', 'id')
    monkeypatch.setattr(cli, 'prices_historical_batch', fail)
    assert cli.main(args) == 2
    captured = capsys.readouterr()
    assert captured.out == '' and 'code=3001' in captured.err


def test_fund_snapshot_uses_existing_csv_parameter_and_flat_output(monkeypatch):
    calls = []
    data = {'timestamp': START, 'item': [{'thscode': '510300.SH', 'last_price': 1, 'extra': None}]}
    def get(path, params, **kwargs):
        calls.append((path, params, kwargs))
        return data
    monkeypatch.setattr(client, '_get', get)
    assert client.fund_market_snapshot('510300.sh,161725.SZ,999999.SH') == data
    assert calls[0] == ('/api/fund/market/snapshot', {'thscode': '510300.SH,161725.SZ,999999.SH'}, {})
    assert client.fund_market_snapshot(','.join(['510300.SH'] * 100)) == data
    assert calls[1][1] == {'thscode': '510300.SH'}
    for codes in (','.join(['510300.SH'] * 101), '510300.SH,', ''):
        with pytest.raises(ValueError):
            client.fund_market_snapshot(codes)
    assert len(calls) == 2


def test_fund_snapshot_csv_keeps_original_client_recovery(monkeypatch):
    calls = []
    data = {'timestamp': START, 'item': [{'thscode': '510300.SH', 'last_price': 1}]}
    class Response:
        def raise_for_status(self): pass
        def json(self):
            return {'code': 5003, 'message': 'temporary', 'data': None} if len(calls) == 1 else {'code': 0, 'data': data}
    class Session:
        def get(self, *args, **kwargs):
            calls.append(1)
            return Response()
    monkeypatch.setattr(client, '_session', lambda: Session())
    monkeypatch.setattr(client, '_token', lambda: _API_KEY)
    monkeypatch.setattr(client.time, 'sleep', lambda _seconds: None)
    assert client.fund_market_snapshot('510300.SH,161725.SZ') == data
    assert calls == [1, 1]


def test_index_batch_accepts_directory_code_syntax(monkeypatch):
    calls = []
    def get(path, params, **kwargs):
        calls.append(params['thscodes'])
        return grouped(True)
    monkeypatch.setattr(client, '_get', get)
    client.index_prices_historical_batch('000860.CSI,000510.csi,H30269.CSI,CI005001.CI', START, END)
    assert calls == ['000860.CSI,000510.CSI,H30269.CSI,CI005001.CI']
    for code in ['000860', '.CSI', '000860.', '000860.CSI.EXTRA', 'H30 269.CSI']:
        with pytest.raises(ValueError):
            client.index_prices_historical_batch(code, START, END)
    assert len(calls) == 1


def test_batch_network_failure_does_not_retry(monkeypatch):
    import requests
    calls = []
    class Session:
        def get(self, *args, **kwargs):
            calls.append(1)
            raise requests.ConnectionError('unavailable')
    monkeypatch.setattr(client, '_session', lambda: Session())
    monkeypatch.setattr(client, '_token', lambda: _API_KEY)
    with pytest.raises(requests.ConnectionError):
        client.prices_historical_batch(['600519.SH'], START, END)
    assert calls == [1]


def test_batch_rejects_malformed_compact_groups(monkeypatch):
    class Response:
        def raise_for_status(self): pass
        def json(self):
            return {'code': 0, 'message': 'ok', 'data': {'interval': '1d', 'adjust': 'forward',
                    'item': [{'timestamp': None, 'item': []}]}}
    class Session:
        def get(self, *args, **kwargs): return Response()
    monkeypatch.setattr(client, '_session', lambda: Session())
    monkeypatch.setattr(client, '_token', lambda: _API_KEY)
    with pytest.raises(RuntimeError, match='group'):
        client.prices_historical_batch(['600519.SH'], START, END)


def test_batch_index_shanghai_day_boundary_and_calendar_year_windows(monkeypatch):
    boundary = 1635868800000  # 2021-11-03 00:00 Asia/Shanghai
    monkeypatch.setattr(client, '_recent_index_lower_bound_ms', lambda: boundary)
    monkeypatch.setattr(client, '_get', lambda *args, **kwargs: {'item': []})
    assert client.index_prices_historical_batch(['000300.SH'], boundary, boundary)['item'] == []
    with pytest.raises(ValueError, match='recent five'):
        client.index_prices_historical_batch(['000300.SH'], boundary - 1, boundary)
    with pytest.raises(ValueError, match='recent five'):
        client.index_prices_historical('000300.SH', boundary - 1, boundary)
    start = 1456675200000  # 2016-02-29 00:00 Asia/Shanghai
    end = 1772208000000  # 2026-02-28 00:00 Asia/Shanghai
    assert client.prices_historical_batch(['600519.SH'] * 10, start, end)['item'] == []
    with pytest.raises(ValueError, match='10 calendar years'):
        client.prices_historical_batch(['600519.SH'], start, end + 1)


@pytest.mark.parametrize('interval', ['1w', '1mo'])
def test_single_index_rejects_unsupported_period_before_request(monkeypatch, interval):
    calls = []
    monkeypatch.setattr(client, '_get', lambda *args, **kwargs: calls.append(args) or {'item': []})
    with pytest.raises(ValueError, match='1d'):
        client.index_prices_historical('000300.SH', 1790784000000, 1790870400000, interval=interval)
    assert calls == []
    with pytest.raises(SystemExit) as error:
        cli.main(['index-historical', '--thscode', '000300.SH', '--start-ms', '1790784000000',
                  '--end-ms', '1790870400000', '--interval', interval])
    assert error.value.code == 2


@pytest.mark.parametrize('name', [
    'financials_income_statements_batch',
    'financials_balance_sheets_batch',
    'financials_cash_flow_statements_batch',
])
def test_statement_batch_uses_calendar_year_boundary(monkeypatch, name):
    from datetime import datetime
    from zoneinfo import ZoneInfo
    calls = []
    monkeypatch.setattr(client, '_get', lambda path, params, **kwargs: calls.append(params) or {'item': []})
    zone = ZoneInfo('Asia/Shanghai')
    start = int(datetime(2016, 1, 1, tzinfo=zone).timestamp() * 1000)
    end = int(datetime(2026, 1, 1, tzinfo=zone).timestamp() * 1000)
    query = getattr(client, name)
    query('600519.SH', start_ms=start, end_ms=end)
    assert calls == [{'thscodes': '600519.SH', 'period': 'annual', 'start': start, 'end': end}]
    with pytest.raises(ValueError, match='10'):
        query('600519.SH', start_ms=start, end_ms=end + 1)
    assert len(calls) == 1
