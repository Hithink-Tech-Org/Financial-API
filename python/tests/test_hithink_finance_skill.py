from pathlib import Path
import re
import shutil
import subprocess
import sys


REPO_ROOT = Path(__file__).resolve().parents[2]
SKILL_ROOT = REPO_ROOT / "skills" / "hithink-finance"
MCP_ROOT = REPO_ROOT / "skills" / "hithink-finance-mcp"


def _skill_text() -> str:
    return (SKILL_ROOT / "SKILL.md").read_text(encoding="utf-8")


def _api_capability_text() -> str:
    return "\n".join(
        p.read_text(encoding="utf-8")
        for p in (SKILL_ROOT / "references/api").glob("*/README.md")
    )


def _mcp_domain_text(domain: str) -> str:
    references = MCP_ROOT / "references"
    files = [references / "mcp.md", references / "mcp" / domain / "README.md"]
    files += sorted(
        path
        for path in (references / "mcp" / domain).glob("*.md")
        if path.name != "README.md"
    )
    return "\n".join(path.read_text(encoding="utf-8") for path in files)


def test_hithink_finance_skill_is_api_wiki_and_api_router() -> None:
    skill = _skill_text()
    assert "API Wiki" in skill and "API Router" in skill
    assert "REST API" in skill and "按需" in skill
    assert "hithink-finance-mcp" in skill
    assert not (SKILL_ROOT / "references/mcp.md").exists()
    assert not list((SKILL_ROOT / "references/mcp").glob("*.md"))


def test_hithink_finance_skill_covers_recent_remote_capabilities() -> None:
    capability_map = _api_capability_text()

    for capability in (
        "financials/indicators",
        "anomaly-analysis",
        "skyrocket-list",
        "hot-stock-list",
        "hot-stock-rank-trend",
        "dragon-tiger-list",
        "/api/a-share/valuations/snapshot",
        "/api/fund/profile/detail",
        "/api/fund/market/historical",
        "/api/a-share/auction/snapshot",
        "/api/a-share/special-data/limit-down-pool",
        "/api/fund/managers/detail",
        "/api/fund/news/article-list",
    ):
        assert capability in capability_map


def test_hithink_finance_skill_defines_safe_agent_execution_contract() -> None:
    skill = _skill_text()

    assert "消歧" in skill
    assert "JSON" in skill
    assert "落盘" in skill
    assert "环境变量" in skill
    assert "不得强制用户" in skill and "API Key" in skill
    assert "线上" in skill and "离线" in skill
    assert "模拟数据" in skill


def test_hithink_finance_mcp_entry_routes_all_managed_services() -> None:
    entry = (MCP_ROOT / "references/mcp.md").read_text(encoding="utf-8")
    for domain in (
        "meta",
        "a-share",
        "hk-share",
        "a-share-index",
        "fund",
        "futures",
        "options",
        "news",
    ):
        assert f"https://fuyao.aicubes.cn/mcp/{domain}" in entry
    tools = [
        source
        for source in (REPO_ROOT / "docs/mcp").glob("*/get_*.md")
        if source.parent.name != "planned"
    ]
    assert tools
    pages = [
        path.read_text(encoding="utf-8")
        for path in (MCP_ROOT / "references/mcp").glob("*/*.md")
        if path.name != "README.md"
    ]
    identities = re.findall(r"^工具名：`([^`]+)`$", "\n".join(pages), re.M)
    assert sorted(identities) == sorted(source.stem for source in tools)
    for source in tools:
        page = next(
            text for text in pages if f'<a id="{source.stem}"></a>\n## ' in text
        )
        text = page.split(f'<a id="{source.stem}"></a>')[1]
        text = re.split(r'<a id="get_[a-z0-9_]+"></a>\n## ', text)[0]
        original = source.read_text(encoding="utf-8")
        for heading in ("工具描述", "参数", "调用示例"):
            section = re.search(
                rf"^## {heading}\n(.*?)(?=^## |\Z)", original, re.M | re.S
            )
            if section:
                # Links move to grouped pages while the contract text stays intact.
                original_body = re.sub(r"\]\([^)]+\)", "]", section[1]).strip()
                grouped_body = re.sub(r"\]\([^)]+\)", "]", text)
                assert original_body in grouped_body
        assert f"工具名：`{source.stem}`" in text
        assert "### 参数" in text and "### 返回字段" in text
        assert "../../api/" not in text
    assert not list((MCP_ROOT / "references/mcp/planned").rglob("*.md"))
    skill = (MCP_ROOT / "SKILL.md").read_text(encoding="utf-8")
    assert "tools/list" in skill and "schema" in skill
    assert "references/mcp/meta/README.md" in skill


def test_public_checkout_can_check_skill_without_internal_sync_state(
    tmp_path: Path,
) -> None:
    for relative in (
        "docs/api",
        "docs/mcp",
        "skills/hithink-finance",
        "skills/hithink-finance-mcp",
    ):
        shutil.copytree(
            REPO_ROOT / relative,
            tmp_path / relative,
            ignore=shutil.ignore_patterns("*.zip", "__pycache__"),
        )
    shutil.copyfile(REPO_ROOT / "docs/mcp.md", tmp_path / "docs/mcp.md")
    script = tmp_path / "scripts/sync_skill_contracts.py"
    script.parent.mkdir()
    shutil.copyfile(REPO_ROOT / "scripts/sync_skill_contracts.py", script)
    assert not (tmp_path / ".agents").exists()

    result = subprocess.run(
        [sys.executable, str(script), "--check"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_hithink_finance_skill_routes_confirmed_client_only_capabilities() -> None:
    skill = _skill_text()
    client_only = (SKILL_ROOT / "references" / "client-only-capabilities.md").read_text(
        encoding="utf-8"
    )

    assert "references/client-only-capabilities.md" in skill
    assert "先按公开能力完成当前任务" in skill
    for required in (
        "单只 A 股的资金流向",
        "单只 A 股",
        "高频动向",
        "A 股个股或指数",
        "最近 30 个 A 股交易日",
        "期货 F10 宏观指标历史",
        "资讯事件",
        "api/README.md#端内能力说明",
        "使用范围",
        "这项进一步数据能力已内置于同花顺AI客户端",
        "暂不通过公开 API、MCP、CLI 或 Python SDK 提供",
    ):
        assert required in client_only
    assert "同花顺AI客户端已接入当前数据源" in skill
    assert "尚未发布接入本项目数据源" not in skill + client_only
    assert "敬请期待" not in skill + client_only
    for public_only in ("期货品种板块", "期货交易时段", "期权会话时间轴"):
        assert public_only not in client_only


def test_api_skill_only_introduces_cli_and_delegates_its_use() -> None:
    intro = (SKILL_ROOT / "references/cli.md").read_text(encoding="utf-8")
    assert "npm install -g @hithink-tech/hithink-finance-cli" in intro
    assert "OAuth" in intro and "description" in intro
    assert "hithink-finance-shared" in intro
    assert "## 功能简述" not in intro
    setup = intro
    for required in (
        "node --version",
        "npm install -g",
        "auth login --method oauth",
        "skills status",
        "canonical",
        "实际Agent标识",
        "有界真实请求",
    ):
        assert required in setup
    assert "## 1. 环境与版本" in intro
    assert not (SKILL_ROOT / "references/cli/setup.md").exists()
    assert "hithink-finance-market" not in setup
    assert not (SKILL_ROOT / "references/cli/builtin-skills.md").exists()


def test_cli_owned_guidance_recommends_oauth_and_reads_connection_state() -> None:
    shared = REPO_ROOT / "hithink-finance-cli/skills/hithink-finance-shared"
    auth = (shared / "references/auth-and-config.md").read_text(encoding="utf-8")
    output = (shared / "references/global-rules.md").read_text(encoding="utf-8")
    assert "CLI 默认推荐 OAuth" in auth and "当前有效凭据" in auth
    assert "auth login --method oauth" in auth
    for text in (auth, output):
        for required in (
            "auth status",
            "退出 0",
            "退出 3",
            "data.connected",
            "ok=true",
        ):
            assert required in text


def test_cli_skill_contract_keeps_execution_rules_in_the_cli_package() -> None:
    base = REPO_ROOT / "hithink-finance-cli/skills"
    management = (
        base / "hithink-finance-shared/references/skills-management.md"
    ).read_text(encoding="utf-8")
    assert "目录建立链接" in management and "用户占用" in management
    init = (base / "hithink-finance-data/references/data-init.md").read_text(
        encoding="utf-8"
    )
    for required in (
        "data init",
        "不少于 15 分钟",
        "存活 PID",
        "不得在该 DB 上继续执行",
    ):
        assert required in init


def test_api_skill_reuses_key_sources_and_preserves_secure_configuration() -> None:
    combined = _skill_text() + (
        SKILL_ROOT / "references/api-key-onboarding.md"
    ).read_text(encoding="utf-8")
    for required in (
        "HITHINK_FINANCE_API_KEY",
        "credentials.env",
        "找到后复用",
        "不得强制用户",
        "API Key",
    ):
        assert required in combined
    for platform in ("%APPDATA%", "Application Support", "XDG_CONFIG_HOME"):
        assert platform in combined
    assert "Read-Host" in combined and "read -s" in combined


def test_skill_routes_fund_tasks_across_all_access_modes() -> None:
    skill = _skill_text()
    api = _api_capability_text()
    mcp = _mcp_domain_text("fund")
    builtin = (
        REPO_ROOT / "hithink-finance-cli/skills/hithink-finance-fund/SKILL.md"
    ).read_text(encoding="utf-8")

    for phrase in ("基金", "净值", "持仓", "持有人", "ETF"):
        assert phrase in skill + api + mcp + builtin
    assert "hithink-finance-fund" in mcp
    assert "hithink-finance-fund" in builtin


def test_skill_routes_auction_and_extended_fund_tasks() -> None:
    skill = _skill_text()
    mcp_a_share = _mcp_domain_text("a-share")
    mcp_fund = _mcp_domain_text("fund")

    for phrase in (
        "集合竞价",
        "跌停",
        "炸板",
        "基金经理",
        "基金公司",
        "基金资讯",
        "基金回测",
        "基金指标",
        "QDII 额度",
    ):
        assert phrase in skill
    assert "get_a_share_auction_snapshot" in mcp_a_share
    assert "get_a_share_special_data_limit_break_pool" in mcp_a_share
    assert "get_fund_managers_detail" in mcp_fund
    assert "get_fund_news_article_list" in mcp_fund
    assert "get_fund_backtest_result" in mcp_fund
    assert "get_fund_indicators_table" not in mcp_fund
    assert "get_fund_indicators_line" not in mcp_fund
    assert "get_fund_quota_list" in mcp_fund


def test_skill_routes_valuation_tasks_across_all_access_modes() -> None:
    skill = _skill_text()
    api = _api_capability_text()
    mcp = _mcp_domain_text("a-share")
    builtin = (
        REPO_ROOT / "hithink-finance-cli/skills/hithink-finance-valuation/SKILL.md"
    ).read_text(encoding="utf-8")

    assert "估值" in skill
    assert "/api/a-share/valuations/snapshot" in api
    assert "get_a_share_valuations_snapshot" in mcp
    assert "hithink-finance-valuation" in builtin


def test_skill_never_routes_agents_to_remote_llms_contract() -> None:
    combined = "\n".join(
        path.read_text(encoding="utf-8")
        for path in SKILL_ROOT.rglob("*")
        if path.is_file() and path.suffix in {".md", ".yaml"}
    )
    assert "llms-full" not in combined
    assert "python-sdk" not in combined
