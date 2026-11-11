"""Business scope and nullable response contracts across published surfaces."""
from pathlib import Path

from .contract_doc_inventory import inventory

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = [
    ('get_a_share_special_data_anomaly_analysis_stock', '/api/a-share/special-data/anomaly-analysis-stock'),
    ('get_a_share_special_data_skyrocket_list', '/api/a-share/special-data/skyrocket-list'),
    ('get_a_share_special_data_hot_stock_list', '/api/a-share/special-data/hot-stock-list'),
    ('get_a_share_special_data_hot_stock_list_history', '/api/a-share/special-data/hot-stock-list-history'),
    ('get_a_share_special_data_hot_stock_rank_trend', '/api/a-share/special-data/hot-stock-rank-trend'),
    ('get_a_share_special_data_dragon_tiger_list', '/api/a-share/special-data/dragon-tiger-list'),
    ('get_a_share_special_data_limit_up_statistics', '/api/a-share/special-data/limit-up-statistics'),
    ('get_a_share_special_data_dragon_tiger_stock_institution', '/api/a-share/special-data/dragon-tiger-stock-institution'),
    ('get_a_share_special_data_dragon_tiger_department_classic_record', '/api/a-share/special-data/dragon-tiger-department-classic-record'),
    ('get_a_share_special_data_dragon_tiger_department_history', '/api/a-share/special-data/dragon-tiger-department-history'),
    ('get_a_share_special_data_abnormal_monitor_list', '/api/a-share/special-data/abnormal-monitor-list'),
    ('get_a_share_ipo_calendar_list', '/api/a-share/ipo/calendar-list'),
    ('get_hk_share_ipo_application_list', '/api/hk-share/ipo/application-list'),
    ('get_hk_share_ipo_calendar_list', '/api/hk-share/ipo/calendar-list'),
    ('get_a_share_special_data_auction_stock_opportunities', '/api/a-share/special-data/auction-stock-opportunities'),
    ('get_a_share_special_data_auction_opportunity_dates', '/api/a-share/special-data/auction-opportunity-dates'),
    ('get_hk_share_ipo_issue_detail', '/api/hk-share/ipo/issue-detail'),
]
RESTRICTED = [
    '/api/a-share/special-data/turnover-prediction-snapshot',
    '/api/fund/etf-flow/net-inflow-historical',
    '/api/a-share/special-data/chip-shape-dates',
    '/api/a-share/special-data/chip-shape-stocks',
    '/api/a-share-index/baseinfo/new-concepts',
]


def test_all_business_contracts_have_matching_access_and_tool_identity():
    entries = inventory()
    rest = {r['endpoint']: r for r in entries if r['kind'] == 'rest'}
    tools = {r['id']: r for r in entries if r['kind'] == 'mcp'}
    for operation, path in PUBLIC:
        assert rest[path]['access'] == 'public'
        assert tools[operation]['endpoint'] == path
    for path in RESTRICTED:
        assert rest[path]['access'] == 'client-only'
        assert not any(t['endpoint'] == path for t in tools.values())


def test_nullable_identity_fields_and_auction_projection_survive_import():
    rest = {r['endpoint']: r for r in inventory() if r['kind'] == 'rest'}
    for path in ['/api/a-share/special-data/dragon-tiger-department-history', '/api/a-share/special-data/abnormal-monitor-list']:
        text = (ROOT / rest[path]['output']).read_text(encoding='utf-8')
        assert 'null' in text and '空字符串' in text
        assert 'thscode' in text and 'name' in text
    auction = (ROOT / rest['/api/a-share/special-data/auction-stock-opportunities']['output']).read_text(encoding='utf-8')
    for field in ['bid_volume', 'previous_volume', 'explain', 'grade', 'related_block']:
        assert field in auction


def test_catalog_separates_stock_markets_and_shared_calendar():
    for category in ['api', 'mcp']:
        text = (ROOT / f'docs/{category}/README.md').read_text(encoding='utf-8')
        assert '- 股票数据\n  - [A 股]' in text
        assert '  - [港股]' in text
        meta = (ROOT / f'docs/{category}/meta/README.md').read_text(encoding='utf-8')
        assert '交易日程' in meta
        stock = (ROOT / f'docs/{category}/a-share/README.md').read_text(encoding='utf-8')
        assert '同花顺功能数据' in stock
        assert '## 交易日程' not in stock
