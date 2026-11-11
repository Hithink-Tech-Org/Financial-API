"""Grouped MCP contracts retain tool-level sections and catalog ownership."""

import importlib.util
import json
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location(
    "skill_contracts",
    Path(__file__).resolve().parents[2] / "scripts/sync_skill_contracts.py",
)
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


@pytest.fixture
def routes(tmp_path, monkeypatch):
    root = tmp_path / "mcp"
    for domain in ["meta", "a-share"]:
        (root / domain).mkdir(parents=True)
    monkeypatch.setattr(sync, "MCP_DETAIL_SOURCE", root)
    monkeypatch.setattr(sync, "MCP_ROUTE_DOMAINS", ("meta", "a-share"))
    monkeypatch.setattr(sync, "REPO_ROOT", tmp_path)
    api = tmp_path / "api"
    (api / "a-share").mkdir(parents=True)
    monkeypatch.setattr(sync, "API_SOURCE", api)
    (api / "a-share/prices.md").write_text(
        '# Prices\n<a id="calendar"></a>\n## Calendar\n'
        "### 请求参数\nHTTP-only parameter\n### 返回字段\n**`data` 字段**\n| `date` | string | Date |\n"
        '<a id="prices"></a>\n## Prices\n### 返回字段\n'
        "| `last_price` | number | Price |\n[Details](#details)\n"
        '<a id="details"></a>\n## Details\n### 返回字段\n'
        "| `unit` | string | Currency unit |\n[Prices](#prices)\n",
        encoding="utf-8",
    )
    (api / "page-map.json").write_text(
        json.dumps(
            {
                "entries": [
                    {
                        "id": f"GET /api/{name}",
                        "title": name,
                        "output": "api/a-share/prices.md",
                        "section_anchor": name,
                    }
                    for name in ("calendar", "prices", "details")
                ]
            }
        ),
        encoding="utf-8",
    )
    for name in ["get_calendar", "get_prices"]:
        (root / "a-share" / f"{name}.md").write_text(
            f"# {name}\n工具名：`{name}`\n"
            f"> 对应 REST 端点：[`GET /api/{name[4:]}`](../../api/a-share/prices.md#{name[4:]})\n"
            f"## 工具描述\nDescription\n## 参数\nParams\n## 返回\n[Fields](../../api/a-share/prices.md#{name[4:]})\n",
            encoding="utf-8",
        )
    (root / "meta/README.md").write_text(
        "# 公共基础数据\n## 交易日程\n| [日历](../a-share/get_calendar.md) | `get_calendar` | 公开 |\n",
        encoding="utf-8",
    )
    (root / "a-share/README.md").write_text(
        "# A 股\n## 行情\n| [价格](get_prices.md) | `get_prices` | 公开 |\n",
        encoding="utf-8",
    )
    return root


def test_tool_documents_embed_only_needed_response_fields_and_resolve_dependencies(
    routes,
):
    documents = sync.mcp_documents()
    assert "get_calendar" in documents["meta/README.md"]
    assert "get_prices" not in documents["meta/README.md"]
    assert set(documents) == {
        "meta/README.md",
        "a-share/README.md",
        "a-share/prices.md",
    }
    grouped = documents["a-share/prices.md"]
    calendar = grouped.split('<a id="get_calendar"></a>')[1].split(
        '<a id="get_prices"></a>'
    )[0]
    prices = grouped.split('<a id="get_prices"></a>')[1]
    assert "| `date` |" in calendar and "last_price" not in calendar
    assert "| `last_price` |" in prices and "| `unit` |" in prices
    assert "`date`" not in prices
    for text in (calendar, prices):
        assert "### 参数\nParams" in text
        assert "HTTP-only parameter" not in text
        assert "../../api/" not in text
        assert "GET /api/" not in text
    assert "(#get_calendar--返回字段)" in calendar
    assert "(#get_prices--返回字段)" in prices
    assert "../a-share/prices.md#get_calendar" in documents["meta/README.md"]
    assert "prices.md#get_prices" in documents["a-share/README.md"]
    assert prices.count("| `unit` |") == 1


def test_missing_response_fields_fails_closed(routes):
    page = sync.API_SOURCE / "a-share/prices.md"
    page.write_text(
        page.read_text(encoding="utf-8").replace("### 返回字段", "### 未定义"),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="missing MCP response fields"):
        sync.mcp_documents()


def test_unknown_response_link_fails_closed(routes):
    page = sync.API_SOURCE / "a-share/prices.md"
    page.write_text(
        page.read_text(encoding="utf-8").replace("(#details)", "(#missing)"),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="unresolved MCP response link"):
        sync.mcp_documents()


def test_duplicate_tool_route_fails_closed(routes):
    with (routes / "a-share/README.md").open("a", encoding="utf-8") as file:
        file.write("| [日历](get_calendar.md) | `get_calendar` | 公开 |\n")
    with pytest.raises(ValueError, match="inventory mismatch"):
        sync.mcp_documents()


def test_missing_tool_route_fails_closed(routes):
    (routes / "a-share/get_prices.md").unlink()
    with pytest.raises(ValueError, match="inventory mismatch"):
        sync.mcp_documents()


def test_mismatched_tool_identity_fails_closed(routes):
    tool = routes / "a-share/get_calendar.md"
    tool.write_text(
        tool.read_text(encoding="utf-8").replace(
            "工具名：`get_calendar`", "工具名：`get_other`"
        ),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="invalid MCP tool identity"):
        sync.mcp_documents()


def test_standalone_mcp_skill_resolves_contracts_without_the_api_skill():
    root = Path(__file__).resolve().parents[2] / "skills/hithink-finance-mcp"
    import re

    assert not (root / "references/api").exists()
    for page in root.rglob("*.md"):
        text = re.sub(r"```.*?```", "", page.read_text(encoding="utf-8"), flags=re.S)
        explicit = re.findall(r'<a id="([^"]+)"', text)
        assert len(explicit) == len(set(explicit)), page
        for href in re.findall(r"\]\(([^\s)]+)\)", text):
            if "://" in href or href.startswith("mailto:"):
                continue
            filename, _, fragment = href.partition("#")
            target = (page.parent / filename).resolve() if filename else page.resolve()
            assert target.is_relative_to(root.resolve()), (page, href)
            assert target.is_file(), (page, href)
            if fragment:
                body = target.read_text(encoding="utf-8")
                anchors = set(re.findall(r'<a id="([^"]+)"', body))
                anchors.update(
                    re.sub(r"[^\w\-\u4e00-\u9fff ]", "", title.lower()).replace(
                        " ", "-"
                    )
                    for title in re.findall(r"^#{1,6} (.+)$", body, re.M)
                )
                assert fragment in anchors, (page, href)


def test_root_skill_packages_stay_within_file_limit():
    skills = Path(__file__).resolve().parents[2] / "skills"
    for root in skills.iterdir():
        if root.is_dir():
            files = [path for path in root.rglob("*") if path.is_file()]
            assert len(files) <= 100, (root.name, len(files))
