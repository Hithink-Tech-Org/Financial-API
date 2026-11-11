"""The news domain exposes seven public contracts and one client-only route."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_news_public_contracts_and_common_null_semantics():
    rest_index = (ROOT / "docs/api/news/README.md").read_text(encoding="utf-8")
    for page, operation in [
        ("article-detail", "get_news_article_detail"),
        ("news-flash", "get_news_flash_list"),
        ("news-flash", "get_news_flash_refresh"),
        ("notice-detail", "get_news_notice_detail"),
        ("topic-hot-list", "get_news_topic_hot_list"),
        ("anomaly-analysis", "get_news_anomaly_analysis"),
        ("stock-timeline-list", "get_news_stock_timeline_list"),
    ]:
        assert page + ".md" in rest_index
        assert (ROOT / f"docs/mcp/news/{operation}.md").is_file()
    common = (ROOT / "docs/api/README.md").read_text(encoding="utf-8")
    assert "代码" in common and "`null`" in common
    skill = (ROOT / "skills/hithink-finance/SKILL.md").read_text(encoding="utf-8")
    assert "快讯" in skill and "专题" in skill
    assert "新闻公告原文、研报" not in skill


def test_timeline_uses_thscode_in_generated_contracts():
    for relative in (
        "docs/api/news/stock-timeline-list.md",
        "docs/mcp/news/get_news_stock_timeline_list.md",
        "skills/hithink-finance/references/api/news/stock-timeline-list.md",
        "skills/hithink-finance-mcp/references/mcp/news/stock-timeline-list.md",
    ):
        text = (ROOT / relative).read_text(encoding="utf-8")
        assert "| `thscode` | string | 是 |" in text
        assert "| `market_id` |" not in text
        assert "| `code` | string |" not in text
    reference = (
        ROOT
        / "hithink-finance-cli/skills/hithink-finance-news/references/news-stock-timeline-list.md"
    ).read_text(encoding="utf-8")
    assert "--thscode" in reference
    assert "--market-id" not in reference and "--code " not in reference
