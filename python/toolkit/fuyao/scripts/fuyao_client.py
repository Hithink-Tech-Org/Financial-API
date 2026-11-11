"""hithink finance (fuyao.aicubes.cn) API client as typed functions.

Python adapter contract:
- Every capability is a top-level function with full type annotations.
- Parameter constraints (mutual exclusion, enum ranges, window limits) are enforced
  client-side and raise ValueError before any HTTP call.
- Long historical windows (>10 years) are auto-sliced and concatenated.
- Local ticker cache (TTL 12h) backs tickers_search to avoid network round-trips.
- Returns plain list[dict] / dict — no DataFrame dependency.
- API Key comes from the unified credential resolver; never accepted as a parameter.
- Business errors (code != 0) raise FuyaoApiError(code, message, request_id).

Upstream field semantics live in the repository's ``docs/api/`` contract and at
https://fuyao.aicubes.cn/llms-full.txt; do not reproduce them in docstrings here.
"""

from __future__ import annotations

import json
import math
import re
import time
from dataclasses import dataclass
from datetime import date as Date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable, Literal, Optional

import requests

from marketdb.credentials import resolve_api_key

BASE_URL = "https://fuyao.aicubes.cn"
SKILL_ROOT = Path(__file__).resolve().parent.parent
TICKERS_CACHE_PATH = SKILL_ROOT / "docs" / "tickers-cache.json"
TICKERS_CACHE_TTL_SECONDS = 12 * 3600  # 12 hours — intraday, avoids overnight skew
TEN_YEARS_MS = int(10 * 365.25 * 86400 * 1000)
RETRY_CODES = {4001, 5001, 5002, 5003}
MAX_RETRIES = 3
RETRY_BASE_SECONDS = 1.0
DEFAULT_TIMEOUT_SECONDS = 30

AssetType = Literal[
    "a-share",
    "a-share-index",
    "forex",
    "fund-otc",
    "fund-etf",
    "fund-lof",
    "fund-reits",
    "futures",
    "options",
]
FundRange = Literal[
    "week", "month", "tmonth", "hyear", "year", "twoyear", "tyear", "fyear"
]
FundNavType = Literal["unit", "adj", "unit,adj"]
FundHolderMergeScope = Literal["all", "merged", "separate"]

_ASSET_TYPES = {
    "a-share",
    "a-share-index",
    "forex",
    "fund-otc",
    "fund-etf",
    "fund-lof",
    "fund-reits",
    "futures",
    "options",
}
_FUND_RANGES = {
    "week", "month", "tmonth", "hyear", "year", "twoyear", "tyear", "fyear"
}
_FUND_NAV_TYPES = {"unit", "adj", "unit,adj"}
_FUND_HOLDER_MERGE_SCOPES = {"all", "merged", "separate"}


# ---------------------------------------------------------------------------
# Errors / session
# ---------------------------------------------------------------------------


class FuyaoApiError(RuntimeError):
    """Raised when the Fuyao API returns a non-zero business code."""

    def __init__(self, code: int, message: str, request_id: str | None = None):
        super().__init__(f"[fuyao code={code}] {message} (request_id={request_id})")
        self.code = code
        self.message = message
        self.request_id = request_id


@dataclass
class _ClientConfig:
    base_url: str = BASE_URL
    timeout: int = DEFAULT_TIMEOUT_SECONDS
    session: Optional[requests.Session] = None


_default_config = _ClientConfig()


def _session() -> requests.Session:
    if _default_config.session is None:
        _default_config.session = requests.Session()
    return _default_config.session


def _token() -> str:
    tok = resolve_api_key()
    if not tok:
        raise RuntimeError(
            "HITHINK_FINANCE_API_KEY or the user credential file is required. "
            "Create an API key at https://fuyao.aicubes.cn/admin/. "
            "FUYAO_TOKEN and API_KEY remain legacy compatibility sources."
        )
    return tok


def _validate_batch_payload(data: Any, *, historical: bool) -> None:
    fields = {"interval", "adjust", "item"} if historical else {"item"}
    if not isinstance(data, dict) or set(data) != fields or not isinstance(data["item"], list):
        raise RuntimeError("Batch response does not match the grouped result contract")
    if historical and (data["interval"] not in ("1d", "1w", "1mo") or data["adjust"] not in (None, "none", "forward", "backward")):
        raise RuntimeError("Batch history metadata does not match the grouped result contract")
    for group in data["item"]:
        if (not isinstance(group, dict) or set(group) != {"thscode", "timestamp", "item"}
                or not isinstance(group["thscode"], str)
                or (group["timestamp"] is not None and type(group["timestamp"]) is not int)
                or not isinstance(group["item"], list)
                or any(not isinstance(row, dict) for row in group["item"])):
            raise RuntimeError("Batch group does not match the grouped result contract")


def _get(path: str, params: dict[str, Any], *, batch: bool = False) -> Any:
    """Low-level GET with retry on RETRY_CODES / network errors. Returns the
    response envelope `data` payload; raises FuyaoApiError on business failure.
    """
    url = f"{_default_config.base_url}{path}"
    clean_params = {k: v for k, v in params.items() if v is not None}
    headers = {"X-api-key": _token()}
    last_exc: Optional[Exception] = None
    attempts = 1 if batch else MAX_RETRIES
    for attempt in range(attempts):
        try:
            resp = _session().get(
                url,
                params=clean_params,
                headers=headers,
                timeout=_default_config.timeout,
            )
            resp.raise_for_status()
            payload = resp.json()
        except (requests.ConnectionError, requests.Timeout) as exc:
            if batch:
                raise
            last_exc = exc
            time.sleep(RETRY_BASE_SECONDS * (2**attempt))
            continue
        code = payload.get("code", -1)
        data = payload.get("data")
        if code == 0:
            if batch:
                _validate_batch_payload(data, historical=path.endswith("/historical-batch"))
            return {} if data is None else data
        if code in RETRY_CODES and attempt < attempts - 1:
            time.sleep(RETRY_BASE_SECONDS * (2**attempt))
            continue
        raise FuyaoApiError(
            code=code,
            message=payload.get("message", ""),
            request_id=payload.get("request_id"),
        )
    if last_exc:
        raise last_exc
    raise RuntimeError("unreachable")


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------


def _validate_thscode(thscode: str) -> None:
    if not isinstance(thscode, str) or "." not in thscode:
        raise ValueError(
            f"thscode must include exchange suffix (e.g. '600519.SH'); got {thscode!r}"
        )
    if "," in thscode:
        raise ValueError("single-thscode endpoint does not accept comma-separated input")


def _batch_codes(thscodes: str | Iterable[str], maximum: int) -> str:
    tokens = thscodes.split(",") if isinstance(thscodes, str) else list(thscodes)
    if not 1 <= len(tokens) <= maximum:
        raise ValueError(f"thscodes must contain 1 to {maximum} raw tokens")
    if any(not isinstance(token, str) or not re.fullmatch(r"[A-Z0-9]+\.[A-Z0-9]+", token.strip(), re.IGNORECASE) for token in tokens):
        raise ValueError("thscodes must be comma-separated complete security codes")
    return ",".join(dict.fromkeys(token.strip().upper() for token in tokens))


def _calendar_year_limit_ms(start_ms: int, years: int) -> int:
    start = datetime.fromtimestamp(start_ms / 1000, tz=timezone(timedelta(hours=8)))
    try:
        end = start.replace(year=start.year + years)
    except ValueError:
        end = start.replace(year=start.year + years, day=28)
    return int(end.timestamp() * 1000)


def _recent_index_lower_bound_ms() -> int:
    today = datetime.now(timezone(timedelta(hours=8))).replace(hour=0, minute=0, second=0, microsecond=0)
    return _calendar_year_limit_ms(int(today.timestamp() * 1000), -5)


def _batch_history_range(start_ms: int, end_ms: int, years: int | None) -> None:
    if type(start_ms) is not int or type(end_ms) is not int or start_ms < 0 or end_ms < start_ms:
        raise ValueError("start_ms / end_ms must be nonnegative integer milliseconds with end_ms >= start_ms")
    if years is not None and end_ms > _calendar_year_limit_ms(start_ms, years):
        raise ValueError(f"history window must not exceed {years} calendar years")
    if years is None and start_ms < _recent_index_lower_bound_ms():
        raise ValueError("index history is available for the recent five calendar years")


def _validate_period(period: str) -> None:
    if period not in ("annual", "quarterly"):
        raise ValueError(f"period must be 'annual' or 'quarterly'; got {period!r}")


def _validate_adjust(adjust: str) -> None:
    if adjust not in ("none", "forward", "backward"):
        raise ValueError(f"adjust must be one of none/forward/backward; got {adjust!r}")


def _normalize_asset_type(
    asset_type: AssetType | str | Iterable[AssetType | str] | None,
) -> str | None:
    if asset_type is None:
        return None
    raw = asset_type.split(",") if isinstance(asset_type, str) else list(asset_type)
    normalized: list[str] = []
    for value in raw:
        token = value.strip().lower() if isinstance(value, str) else ""
        if not token or token not in _ASSET_TYPES:
            raise ValueError(f"asset_type contains unsupported value: {value!r}")
        if token not in normalized:
            normalized.append(token)
    return ",".join(normalized)


def _validate_fund_target(thscode: str) -> str:
    _validate_thscode(thscode)
    return thscode.strip().upper()


def _validate_exchange_fund_code(thscode: str) -> str:
    _validate_thscode(thscode)
    normalized = thscode.strip().upper()
    if not re.fullmatch(r"[0-9]{6}\.(SH|SZ)", normalized):
        raise ValueError("exchange-traded fund thscode must end in .SH or .SZ")
    return normalized


def _five_year_limit_ms(start_ms: int) -> int:
    start = datetime.fromtimestamp(start_ms / 1000, tz=timezone.utc)
    try:
        limit = start.replace(year=start.year + 5)
    except ValueError:
        limit = start.replace(year=start.year + 5, day=28)
    return int(limit.timestamp() * 1000)


def _validate_recent_or_range(
    limit: int | None, start_ms: int | None, end_ms: int | None,
    *, calendar_year_window: bool = False,
) -> tuple[str, dict[str, Any]]:
    """Returns ('recent', {'limit': N}) or ('range', {'start': ms, 'end': ms})."""
    has_range = (start_ms is not None) or (end_ms is not None)
    has_limit = limit is not None
    if has_range and has_limit:
        raise ValueError(
            "financials: limit and (start_ms, end_ms) are mutually exclusive"
        )
    if has_range and (start_ms is None or end_ms is None):
        raise ValueError("financials: start_ms and end_ms must be provided together")
    if has_range:
        if end_ms < start_ms:  # type: ignore[operator]
            raise ValueError("financials: end_ms must be >= start_ms")
        maximum_end = (_calendar_year_limit_ms(start_ms, 10) if calendar_year_window
                       else start_ms + TEN_YEARS_MS)
        if end_ms > maximum_end:
            raise ValueError("financials: window must be <= 10 years")
        return "range", {"start": start_ms, "end": end_ms}
    if has_limit:
        if not (1 <= limit <= 20):  # type: ignore[operator]
            raise ValueError("financials: limit must be in [1, 20]")
        return "recent", {"limit": limit}
    return "recent", {}


# ---------------------------------------------------------------------------
# 1. Tickers search (with local cache)
# ---------------------------------------------------------------------------


def _load_cache() -> tuple[list[dict] | None, float | None]:
    if not TICKERS_CACHE_PATH.exists():
        return None, None
    try:
        blob = json.loads(TICKERS_CACHE_PATH.read_text(encoding="utf-8"))
        return blob.get("item", []), float(blob.get("cached_at", 0))
    except (json.JSONDecodeError, OSError):
        return None, None


def _write_cache(items: list[dict]) -> None:
    TICKERS_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    blob = {"cached_at": time.time(), "item": items}
    TICKERS_CACHE_PATH.write_text(
        json.dumps(blob, ensure_ascii=False), encoding="utf-8"
    )


def _cache_is_fresh(cached_at: float | None) -> bool:
    if not cached_at:
        return False
    return (time.time() - cached_at) < TICKERS_CACHE_TTL_SECONDS


def _local_search(
    items: list[dict],
    q: str,
    exchange: str | None,
    asset_type: str | None,
    limit: int,
) -> list[dict]:
    q_lower = q.lower()
    out: list[dict] = []
    for it in items:
        if exchange and it.get("exchange") != exchange:
            continue
        if asset_type and it.get("asset_type") not in asset_type.split(","):
            continue
        haystack = " ".join(
            str(it.get(k) or "") for k in ("thscode", "ticker", "name")
        ).lower()
        if q_lower in haystack:
            out.append(it)
            if len(out) >= limit:
                break
    return out


def tickers_search(
    q: str,
    *,
    exchange: Literal["SH", "SZ", "BJ"] | None = None,
    asset_type: AssetType | str | Iterable[AssetType | str] | None = None,
    limit: int = 10,
    use_cache: bool = True,
    remote: bool = False,
) -> list[dict]:
    """Resolve a name/ticker/thscode fragment into TickerItem list.

    Defaults to local cache (TTL 12h, written by tickers_list(refresh_cache=True)).
    If cache is missing/stale or `remote=True`, queries the upstream search endpoint.
    """
    if not q:
        raise ValueError("q is required")
    if limit < 1 or limit > 50:
        raise ValueError("limit must be in [1, 50]")
    normalized_asset_type = _normalize_asset_type(asset_type)
    if not remote and use_cache:
        items, cached_at = _load_cache()
        if items is not None:
            if not _cache_is_fresh(cached_at):
                import sys

                print(
                    f"[fuyao] warn: tickers cache stale (>{TICKERS_CACHE_TTL_SECONDS//3600}h); "
                    "run `fuyao.py tickers-list --refresh-cache` to refresh",
                    file=sys.stderr,
                )
            hits = _local_search(items, q, exchange, normalized_asset_type, limit)
            if hits:
                return hits
            # Fall through to remote when cache misses on this query.
    data = _get(
        "/api/meta/tickers/search",
        {
            "q": q,
            "exchange": exchange,
            "asset_type": normalized_asset_type,
            "limit": limit,
        },
    )
    return data.get("item", [])


# ---------------------------------------------------------------------------
# 2. Tickers list (with paging + cache refresh)
# ---------------------------------------------------------------------------


def tickers_list(
    *,
    exchange: str = "SH,SZ",
    asset_type: AssetType | str | Iterable[AssetType | str] = "a-share",
    limit: int = 1000,
    offset: int = 0,
    fetch_all: bool = False,
    refresh_cache: bool = False,
) -> list[dict]:
    """List tickers. With `fetch_all=True`, loops offset until exhausted.

    When `refresh_cache=True`, implies `fetch_all=True` and writes
    docs/tickers-cache.json for tickers_search to consume.
    """
    if limit < 1 or limit > 10000:
        raise ValueError("limit must be in [1, 10000]")
    if offset < 0:
        raise ValueError("offset must be >= 0")
    normalized_asset_type = _normalize_asset_type(asset_type)
    if refresh_cache:
        fetch_all = True

    if not fetch_all:
        data = _get(
            "/api/meta/tickers/list",
            {
                "exchange": exchange,
                "asset_type": normalized_asset_type,
                "limit": limit,
                "offset": offset,
            },
        )
        return data.get("item", [])

    all_items: list[dict] = []
    cur_offset = offset
    while True:
        data = _get(
            "/api/meta/tickers/list",
            {
                "exchange": exchange,
                "asset_type": normalized_asset_type,
                "limit": limit,
                "offset": cur_offset,
            },
        )
        items = data.get("item", [])
        all_items.extend(items)
        if len(items) < limit:
            break
        cur_offset += limit

    if refresh_cache:
        _write_cache(all_items)
    return all_items


# ---------------------------------------------------------------------------
# 3. Prices snapshot
# ---------------------------------------------------------------------------


def prices_snapshot(
    thscodes: Iterable[str] | None = None,
    *,
    fetch_all_market: bool = False,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    """Snapshot prices. Three modes:

    - thscodes given: batch by codes (no paging).
    - fetch_all_market=True: page through entire A-share universe until exhausted.
    - neither: single page (default limit=100).
    """
    if thscodes is not None and fetch_all_market:
        raise ValueError("pass either thscodes or fetch_all_market, not both")

    if thscodes is not None:
        joined = ",".join(thscodes)
        data = _get("/api/a-share/prices/snapshot", {"thscodes": joined})
        return data.get("item", [])

    if not fetch_all_market:
        data = _get(
            "/api/a-share/prices/snapshot", {"limit": limit, "offset": offset}
        )
        return data.get("item", [])

    if limit < 1 or limit > 10000:
        raise ValueError("limit must be in [1, 10000]")
    all_items: list[dict] = []
    cur = offset
    while True:
        data = _get(
            "/api/a-share/prices/snapshot", {"limit": limit, "offset": cur}
        )
        items = data.get("item", [])
        all_items.extend(items)
        if len(items) < limit:
            break
        cur += limit
    return all_items


# ---------------------------------------------------------------------------
# 4. Prices historical (with auto-slicing for >10y windows)
# ---------------------------------------------------------------------------


def prices_historical(
    thscode: str,
    start_ms: int,
    end_ms: int,
    *,
    interval: Literal["1d"] = "1d",
    adjust: Literal["none", "forward", "backward"] = "forward",
) -> list[dict]:
    """Daily K-line for a single thscode. Windows > 10 years are auto-sliced
    and concatenated in chronological order, transparently to the caller.
    """
    _validate_thscode(thscode)
    _validate_adjust(adjust)
    if interval != "1d":
        raise ValueError("interval: only '1d' is supported currently")
    if not isinstance(start_ms, int) or not isinstance(end_ms, int):
        raise ValueError("start_ms / end_ms must be int milliseconds")
    if end_ms < start_ms:
        raise ValueError("end_ms must be >= start_ms")

    slices: list[tuple[int, int]] = []
    cur_start = start_ms
    while cur_start < end_ms:
        cur_end = min(cur_start + TEN_YEARS_MS, end_ms)
        slices.append((cur_start, cur_end))
        cur_start = cur_end + 1

    all_bars: list[dict] = []
    seen_dates: set[int] = set()
    for s, e in slices:
        data = _get(
            "/api/a-share/prices/historical",
            {
                "thscode": thscode,
                "interval": interval,
                "start": s,
                "end": e,
                "adjust": adjust,
            },
        )
        for bar in data.get("item", []):
            d = bar.get("date_ms")
            if d in seen_dates:
                continue
            seen_dates.add(d)
            all_bars.append(bar)
    all_bars.sort(key=lambda b: b.get("date_ms", 0))
    return all_bars


# ---------------------------------------------------------------------------
# 5. Corporate actions (adjustment factors)
# ---------------------------------------------------------------------------


def corp_actions_adjustment_factors(
    thscode: str,
    *,
    from_date: str | None = None,
    to_date: str | None = None,
) -> dict[str, Any]:
    """Returns the full envelope {thscode, ticker, item: [...]}."""
    _validate_thscode(thscode)
    return _get(
        "/api/a-share/corporate-actions/adjustment-factors",
        {"thscode": thscode, "from": from_date, "to": to_date},
    )


# ---------------------------------------------------------------------------
# 6/7/8. Financials (income / balance / cash-flow)
# ---------------------------------------------------------------------------


def _financials(
    endpoint: str,
    thscode: str,
    period: str,
    limit: int | None,
    start_ms: int | None,
    end_ms: int | None,
) -> list[dict]:
    _validate_thscode(thscode)
    _validate_period(period)
    _, mode_params = _validate_recent_or_range(limit, start_ms, end_ms)
    data = _get(
        endpoint,
        {"thscode": thscode, "period": period, **mode_params},
    )
    return data.get("item", [])


def financials_income_statements(
    thscode: str,
    *,
    period: Literal["annual", "quarterly"] = "annual",
    limit: int | None = None,
    start_ms: int | None = None,
    end_ms: int | None = None,
) -> list[dict]:
    """Modes are mutually exclusive: (limit) XOR (start_ms+end_ms)."""
    return _financials(
        "/api/a-share/financials/income-statements",
        thscode,
        period,
        limit,
        start_ms,
        end_ms,
    )


def financials_balance_sheets(
    thscode: str,
    *,
    period: Literal["annual", "quarterly"] = "annual",
    limit: int | None = None,
    start_ms: int | None = None,
    end_ms: int | None = None,
) -> list[dict]:
    return _financials(
        "/api/a-share/financials/balance-sheets",
        thscode,
        period,
        limit,
        start_ms,
        end_ms,
    )


def financials_cash_flow_statements(
    thscode: str,
    *,
    period: Literal["annual", "quarterly"] = "annual",
    limit: int | None = None,
    start_ms: int | None = None,
    end_ms: int | None = None,
) -> list[dict]:
    return _financials(
        "/api/a-share/financials/cash-flow-statements",
        thscode,
        period,
        limit,
        start_ms,
        end_ms,
    )


# ---------------------------------------------------------------------------
# 9. Financial indicators
# ---------------------------------------------------------------------------


_FINANCIAL_REPORT_PATTERN = re.compile(r"^[0-9]{4}-[1-4]$")


def financials_indicators(thscode: str, report: str) -> dict[str, Any]:
    """Aggregated financial indicators for one stock and report quarter."""
    _validate_thscode(thscode)
    if not isinstance(report, str) or not _FINANCIAL_REPORT_PATTERN.fullmatch(report):
        raise ValueError("report must match YYYY-[1-4] (e.g. '2025-1')")
    return _get(
        "/api/a-share/financials/indicators",
        {"thscode": thscode, "report": report},
    )


# ---------------------------------------------------------------------------
# 10. A-share valuation snapshot
# ---------------------------------------------------------------------------


_VALUATION_MAX_RAW_THSCODES = 100


def a_share_valuations_snapshot(
    thscodes: Iterable[str] | str,
) -> dict[str, Any]:
    """Return the current valuation snapshot for 1..100 raw A-share code tokens."""
    raw_codes = (
        thscodes.split(",") if isinstance(thscodes, str) else list(thscodes or [])
    )
    if not raw_codes:
        raise ValueError("thscodes must be non-empty")
    if len(raw_codes) > _VALUATION_MAX_RAW_THSCODES:
        raise ValueError("thscodes accepts at most 100 raw tokens")

    normalized: list[str] = []
    seen: set[str] = set()
    for raw in raw_codes:
        code = raw.strip().upper() if isinstance(raw, str) else ""
        if not _A_SHARE_THSCODE_PATTERN.fullmatch(code):
            raise ValueError(f"thscodes must contain valid A-share codes; got {raw!r}")
        if code not in seen:
            seen.add(code)
            normalized.append(code)

    return _get(
        "/api/a-share/valuations/snapshot",
        {"thscodes": ",".join(normalized)},
    )


def a_share_auction_snapshot(
    thscodes: Iterable[str] | str,
    *,
    stage: Literal["live", "final"] = "final",
) -> dict[str, Any]:
    """Return auction snapshots; data.timestamp is the response assembly timestamp."""
    if stage not in ("live", "final"):
        raise ValueError("stage must be live or final")
    raw_codes = (
        thscodes.split(",") if isinstance(thscodes, str) else list(thscodes or [])
    )
    if not raw_codes or len(raw_codes) > 100:
        raise ValueError("thscodes must contain 1..100 raw tokens")
    normalized: list[str] = []
    for raw in raw_codes:
        code = _normalize_a_share_thscode(raw)
        if code not in normalized:
            normalized.append(code)
    return _get(
        "/api/a-share/auction/snapshot",
        {"thscodes": ",".join(normalized), "stage": stage},
    )


def a_share_auction_short_term_benchmark(
    *, date: str | None = None
) -> dict[str, Any]:
    """Return the benchmark; omit date for the Asia/Shanghai current date.

    The response data includes the resolved date/date_ms and an assembly timestamp.
    """
    if date is not None:
        _parse_iso_date(date, "date")
    return _get("/api/a-share/auction/short-term-benchmark", {"date": date})


# ---------------------------------------------------------------------------
# 11. Calendar
# ---------------------------------------------------------------------------


def calendar_trading_days() -> list[dict]:
    data = _get("/api/a-share/calendar/trading-days", {})
    return data.get("item", [])


# ---------------------------------------------------------------------------
# 11/12. A-share index — catalog & constituents
# ---------------------------------------------------------------------------


_THS_INDEX_TAGS = ("cn_concept", "region", "tszs", "industry")


def index_catalog_ths_index_list(
    tag: Literal["cn_concept", "region", "tszs", "industry"] = "cn_concept",
) -> list[dict]:
    """List 同花顺指数 (whole tag dump, no paging)."""
    if tag.lower() not in _THS_INDEX_TAGS:
        raise ValueError(f"tag must be one of {_THS_INDEX_TAGS}; got {tag!r}")
    data = _get(
        "/api/a-share-index/catalog/ths-index-list", {"tag": tag.lower()}
    )
    return data.get("item", [])


def index_constituents_ths_stock_list(thscode: str) -> list[dict]:
    """Current constituents of a single index (THS block or standard index like 000300.SH)."""
    _validate_thscode(thscode)
    data = _get(
        "/api/a-share-index/constituents/ths-stock-list", {"thscode": thscode}
    )
    return data.get("item", [])


# ---------------------------------------------------------------------------
# 13/14. A-share index — prices snapshot & historical
# ---------------------------------------------------------------------------


def index_prices_snapshot(thscodes: Iterable[str]) -> list[dict]:
    """Index snapshot — batch by thscodes ONLY. Empty input is rejected upstream
    (unlike a-share snapshot, there is no full-market mode for indices).
    """
    codes = list(thscodes) if thscodes is not None else []
    if not codes:
        raise ValueError("index_prices_snapshot requires non-empty thscodes")
    data = _get(
        "/api/a-share-index/prices/snapshot", {"thscodes": ",".join(codes)}
    )
    return data.get("item", [])


def index_prices_historical(
    thscode: str,
    start_ms: int,
    end_ms: int,
    *,
    interval: Literal["1d"] = "1d",
) -> list[dict]:
    """Index historical K-line for a single thscode within the recent five years.

    Indices have no adjust / offset semantics; both are absent from the upstream contract.
    """
    _validate_thscode(thscode)
    if interval != "1d":
        raise ValueError(f"index interval must be 1d; got {interval!r}")
    _batch_history_range(start_ms, end_ms, None)
    data = _get(
        "/api/a-share-index/prices/historical",
        {"thscode": thscode, "interval": interval, "start": start_ms, "end": end_ms},
    )
    seen: set[int] = set()
    bars: list[dict] = []
    for bar in data.get("item", []):
        date_ms = bar.get("date_ms")
        if date_ms not in seen:
            seen.add(date_ms)
            bars.append(bar)
    bars.sort(key=lambda bar: bar.get("date_ms", 0))
    return bars


# ---------------------------------------------------------------------------
# 15-21. Fund profile, performance, holders, and exchange market data
# ---------------------------------------------------------------------------


def prices_historical_batch(
    thscodes: str | Iterable[str], start_ms: int, end_ms: int, *,
    interval: Literal["1d", "1w", "1mo"] = "1d",
    adjust: Literal["none", "forward", "backward"] = "forward",
) -> dict[str, Any]:
    """Return grouped A-share history from one batch request (at most ten raw codes)."""
    codes = _batch_codes(thscodes, 10)
    _batch_history_range(start_ms, end_ms, 10)
    _validate_adjust(adjust)
    if interval not in ("1d", "1w", "1mo"):
        raise ValueError("interval must be one of 1d/1w/1mo")
    return _get("/api/a-share/prices/historical-batch", {
        "thscodes": codes, "start": start_ms, "end": end_ms, "interval": interval, "adjust": adjust,
    }, batch=True)


def index_prices_historical_batch(
    thscodes: str | Iterable[str], start_ms: int, end_ms: int, *, interval: Literal["1d"] = "1d",
) -> dict[str, Any]:
    """Return grouped daily index history for the recent five calendar years."""
    codes = _batch_codes(thscodes, 10)
    _batch_history_range(start_ms, end_ms, None)
    if interval != "1d":
        raise ValueError("interval must be 1d")
    return _get("/api/a-share-index/prices/historical-batch", {
        "thscodes": codes, "start": start_ms, "end": end_ms, "interval": interval,
    }, batch=True)


def fund_market_historical_batch(
    thscodes: str | Iterable[str], start_ms: int, end_ms: int, *, interval: Literal["1d"] = "1d",
) -> dict[str, Any]:
    """Return grouped daily ETF history in a window of at most five calendar years."""
    codes = _batch_codes(thscodes, 10)
    _batch_history_range(start_ms, end_ms, 5)
    if interval != "1d":
        raise ValueError("interval must be 1d")
    return _get("/api/fund/market/historical-batch", {
        "thscodes": codes, "start": start_ms, "end": end_ms, "interval": interval,
    }, batch=True)


def _financials_batch(
    endpoint: str, thscodes: str | Iterable[str], period: str,
    limit: int | None, start_ms: int | None, end_ms: int | None,
) -> dict[str, Any]:
    codes = _batch_codes(thscodes, 10)
    _validate_period(period)
    _, mode = _validate_recent_or_range(limit, start_ms, end_ms, calendar_year_window=True)
    return _get(endpoint, {"thscodes": codes, "period": period, **mode}, batch=True)


def financials_income_statements_batch(
    thscodes: str | Iterable[str], *, period: Literal["annual", "quarterly"] = "annual",
    limit: int | None = None, start_ms: int | None = None, end_ms: int | None = None,
) -> dict[str, Any]:
    return _financials_batch("/api/a-share/financials/income-statements-batch", thscodes, period, limit, start_ms, end_ms)


def financials_balance_sheets_batch(
    thscodes: str | Iterable[str], *, period: Literal["annual", "quarterly"] = "annual",
    limit: int | None = None, start_ms: int | None = None, end_ms: int | None = None,
) -> dict[str, Any]:
    return _financials_batch("/api/a-share/financials/balance-sheets-batch", thscodes, period, limit, start_ms, end_ms)


def financials_cash_flow_statements_batch(
    thscodes: str | Iterable[str], *, period: Literal["annual", "quarterly"] = "annual",
    limit: int | None = None, start_ms: int | None = None, end_ms: int | None = None,
) -> dict[str, Any]:
    return _financials_batch("/api/a-share/financials/cash-flow-statements-batch", thscodes, period, limit, start_ms, end_ms)


def _fund_detail(path: str, thscode: str) -> dict[str, Any]:
    return _get(path, {"thscode": _validate_fund_target(thscode)})


def fund_profile_detail(thscode: str) -> dict[str, Any]:
    """Fund profile for one fund thscode."""
    return _fund_detail("/api/fund/profile/detail", thscode)


def fund_portfolio_holdings(thscode: str) -> dict[str, Any]:
    """Fund portfolio holdings for one fund thscode."""
    return _fund_detail("/api/fund/portfolio/holdings", thscode)


def fund_performance_nav(
    thscode: str,
    *,
    range: FundRange | None = None,
    nav_type: FundNavType = "unit,adj",
) -> dict[str, Any]:
    """Fund NAV; omit range for the latest point."""
    normalized_code = _validate_fund_target(thscode)
    if range is not None and range not in _FUND_RANGES:
        raise ValueError(f"range must be one of {sorted(_FUND_RANGES)}; got {range!r}")
    if nav_type not in _FUND_NAV_TYPES:
        raise ValueError(
            f"nav_type must be one of unit/adj/unit,adj; got {nav_type!r}"
        )
    return _get(
        "/api/fund/performance/nav",
        {
            "thscode": normalized_code,
            "range": range,
            "nav_type": nav_type,
        },
    )


def fund_performance_returns(thscode: str) -> dict[str, Any]:
    """Fund interval-return summary for one fund thscode."""
    return _fund_detail("/api/fund/performance/returns", thscode)


def fund_holders_detail(
    thscode: str,
    *,
    merge_scope: FundHolderMergeScope | str = "all",
) -> dict[str, Any]:
    """Fund holder structure by merged, separate, or all disclosure scopes."""
    normalized_code = _validate_fund_target(thscode)
    normalized_scope = (
        merge_scope.strip().lower() if isinstance(merge_scope, str) else ""
    )
    if normalized_scope not in _FUND_HOLDER_MERGE_SCOPES:
        raise ValueError(
            "merge_scope must be one of all/merged/separate; "
            f"got {merge_scope!r}"
        )
    return _get(
        "/api/fund/holders/detail",
        {
            "thscode": normalized_code,
            "merge_scope": normalized_scope,
        },
    )


def fund_market_snapshot(thscode: str) -> dict[str, Any]:
    """Flat market snapshots for up to 100 raw ETF/LOF codes in thscode CSV."""
    normalized = _batch_codes(thscode, 100)
    return _get("/api/fund/market/snapshot", {"thscode": normalized})


def fund_market_historical(
    thscode: str,
    start_ms: int,
    end_ms: int,
    *,
    interval: Literal["1d"] = "1d",
) -> dict[str, Any]:
    """Daily ETF price history for a single target and a maximum five-year window."""
    normalized = _validate_exchange_fund_code(thscode)
    if interval != "1d":
        raise ValueError("interval must be 1d")
    if not isinstance(start_ms, int) or not isinstance(end_ms, int):
        raise ValueError("start_ms / end_ms must be int milliseconds")
    if end_ms < start_ms:
        raise ValueError("end_ms must be >= start_ms")
    if end_ms > _five_year_limit_ms(start_ms):
        raise ValueError("fund history window must not exceed five years")
    return _get(
        "/api/fund/market/historical",
        {
            "thscode": normalized,
            "interval": interval,
            "start": start_ms,
            "end": end_ms,
        },
    )


def _required_identifier(value: str, field_name: str) -> str:
    normalized = value.strip() if isinstance(value, str) else ""
    if not normalized:
        raise ValueError(f"{field_name} must be non-empty")
    return normalized


def fund_companies_detail(company_id: str) -> dict[str, Any]:
    return _get(
        "/api/fund/companies/detail",
        {"company_id": _required_identifier(company_id, "company_id")},
    )


def fund_portfolio_industry_allocation(thscode: str) -> dict[str, Any]:
    return _fund_detail("/api/fund/portfolio/industry-allocation", thscode)


def fund_performance_indicators_historical(
    thscode: str,
    start_ms: int,
    end_ms: int,
) -> dict[str, Any]:
    """Return DataPayload data with timestamp and item only; no top-level thscode/interval."""
    normalized_code = _validate_fund_target(thscode)
    if not isinstance(start_ms, int) or not isinstance(end_ms, int):
        raise ValueError("start_ms / end_ms must be int milliseconds")
    if end_ms < start_ms:
        raise ValueError("end_ms must be >= start_ms")
    if end_ms > _five_year_limit_ms(start_ms):
        raise ValueError("indicator history window must not exceed five years")
    return _get(
        "/api/fund/performance/indicators-historical",
        {
            "thscode": normalized_code,
            "start": start_ms,
            "end": end_ms,
        },
    )


def fund_performance_drawdowns(thscode: str) -> dict[str, Any]:
    return _fund_detail("/api/fund/performance/drawdowns", thscode)


def fund_holders_top(
    thscode: str, *, limit: int | None = None
) -> dict[str, Any]:
    normalized_code = _validate_fund_target(thscode)
    if limit is not None and (not isinstance(limit, int) or not 1 <= limit <= 10):
        raise ValueError("limit must be in [1, 10]")
    return _get(
        "/api/fund/holders/top",
        {"thscode": normalized_code, "limit": limit},
    )


def fund_corporate_actions_dividends(thscode: str) -> dict[str, Any]:
    return _fund_detail("/api/fund/corporate-actions/dividends", thscode)


def fund_diagnostics_detail(thscode: str) -> dict[str, Any]:
    return _fund_detail("/api/fund/diagnostics/detail", thscode)


def fund_financials_indicators(thscode: str) -> dict[str, Any]:
    return _fund_detail("/api/fund/financials/indicators", thscode)


def fund_financials_income_statements(thscode: str) -> dict[str, Any]:
    return _fund_detail("/api/fund/financials/income-statements", thscode)


def fund_financials_balance_sheets(thscode: str) -> dict[str, Any]:
    return _fund_detail("/api/fund/financials/balance-sheets", thscode)


def _fund_manager(path: str, manager_id: str) -> dict[str, Any]:
    return _get(path, {"manager_id": _required_identifier(manager_id, "manager_id")})


def fund_managers_investment_style(manager_id: str) -> dict[str, Any]:
    return _fund_manager("/api/fund/managers/investment-style", manager_id)


def fund_managers_performance(
    manager_id: str,
    *,
    range: Literal["month", "tmonth", "year", "nowyear", "now"],
) -> dict[str, Any]:
    if range not in ("month", "tmonth", "year", "nowyear", "now"):
        raise ValueError("range must be month/tmonth/year/nowyear/now")
    return _get(
        "/api/fund/managers/performance",
        {
            "manager_id": _required_identifier(manager_id, "manager_id"),
            "range": range,
        },
    )


def fund_managers_experience(manager_id: str) -> dict[str, Any]:
    return _fund_manager("/api/fund/managers/experience", manager_id)


def fund_managers_detail(manager_id: str) -> dict[str, Any]:
    return _fund_manager("/api/fund/managers/detail", manager_id)


def fund_news_article_list(
    thscode: str,
    *,
    limit: int = 20,
    offset: str | None = None,
) -> dict[str, Any]:
    """Return cursor-paginated news data with has_more and no total field."""
    normalized_code = _validate_fund_target(thscode)
    if not isinstance(limit, int) or not 1 <= limit <= 100:
        raise ValueError("limit must be in [1, 100]")
    if offset is not None and (not isinstance(offset, str) or not offset):
        raise ValueError("offset must be a non-empty opaque cursor")
    return _get(
        "/api/fund/news/article-list",
        {
            "thscode": normalized_code,
            "limit": limit,
            "offset": offset,
        },
    )


def fund_offerings_list(
    subscribe: Literal["active", "upcoming"],
) -> dict[str, Any]:
    if subscribe not in ("active", "upcoming"):
        raise ValueError("subscribe must be active or upcoming")
    return _get("/api/fund/offerings/list", {"subscribe": subscribe})


def _fund_portfolio_history(
    path: str,
    thscode: str,
    report_type: str,
    end_date: str,
) -> dict[str, Any]:
    normalized_code = _validate_fund_target(thscode)
    return _get(
        path,
        {
            "thscode": normalized_code,
            "report_type": _required_identifier(report_type, "report_type"),
            "end_date": _required_identifier(end_date, "end_date"),
        },
    )


def fund_portfolio_stock_history(
    thscode: str, report_type: str, end_date: str
) -> dict[str, Any]:
    return _fund_portfolio_history(
        "/api/fund/portfolio/stock-history",
        thscode,
        report_type,
        end_date,
    )


def fund_portfolio_bond_history(
    thscode: str, report_type: str, end_date: str
) -> dict[str, Any]:
    return _fund_portfolio_history(
        "/api/fund/portfolio/bond-history",
        thscode,
        report_type,
        end_date,
    )


def _fund_report_dates(
    path: str,
    thscode: str,
    report_type: str | None,
) -> dict[str, Any]:
    normalized_code = _validate_fund_target(thscode)
    if report_type is not None:
        report_type = _required_identifier(report_type, "report_type")
    return _get(
        path,
        {
            "thscode": normalized_code,
            "report_type": report_type,
        },
    )


def fund_portfolio_stock_report_dates(
    thscode: str, *, report_type: str | None = None
) -> dict[str, Any]:
    return _fund_report_dates(
        "/api/fund/portfolio/stock-report-dates", thscode, report_type
    )


def fund_portfolio_bond_report_dates(
    thscode: str, *, report_type: str | None = None
) -> dict[str, Any]:
    return _fund_report_dates(
        "/api/fund/portfolio/bond-report-dates", thscode, report_type
    )


def fund_portfolio_asset_allocation(thscode: str) -> dict[str, Any]:
    return _fund_detail("/api/fund/portfolio/asset-allocation", thscode)


def _json_query(value: str, field: str, expected: type | tuple[type, ...]) -> Any:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a non-empty JSON string")
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{field} must be valid JSON") from exc
    if not isinstance(parsed, expected):
        raise ValueError(f"{field} has an invalid JSON structure")
    return parsed


def _json_integer(value: Any, field: str) -> None:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{field} must be an integer")


def _validate_index_info(values: Any, field: str) -> None:
    if not isinstance(values, list):
        raise ValueError(f"{field} must contain an index array")
    for item in values:
        if not isinstance(item, dict) or not isinstance(item.get("index_id"), str) or not item["index_id"]:
            raise ValueError(f"{field} contains an invalid index_id")


def fund_backtest_indicators() -> list[dict[str, Any] | None]:
    return _get("/api/fund/backtest/indicators", {})


def fund_backtest_result(
    thscode: str,
    buy_conditions: str,
    sell_conditions: str,
    buy_frequency_type: str,
    max_buy_times: int | float,
    per_buy_amount: int | float,
) -> dict[str, Any]:
    normalized_code = _validate_fund_target(thscode)
    for value, field in ((buy_conditions, "buy_conditions"), (sell_conditions, "sell_conditions")):
        _json_query(value, field, (dict, list))
    frequency = _required_identifier(buy_frequency_type, "buy_frequency_type")
    for value, field in ((max_buy_times, "max_buy_times"), (per_buy_amount, "per_buy_amount")):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError(f"{field} must be a finite number")
    return _get(
        "/api/fund/backtest/result",
        {
            "thscode": normalized_code,
            "buy_conditions": buy_conditions,
            "sell_conditions": sell_conditions,
            "buy_frequency_type": frequency,
            "max_buy_times": max_buy_times,
            "per_buy_amount": per_buy_amount,
        },
    )


def fund_indicators_line(indexes: str, time_range: str) -> dict[str, Any]:
    groups = _json_query(indexes, "indexes", list)
    for group in groups:
        if not isinstance(group, dict) or not isinstance(group.get("thscodes"), list):
            raise ValueError("indexes contains an invalid thscodes array")
        for thscode in group["thscodes"]:
            try:
                _validate_fund_target(thscode)
            except ValueError as exc:
                raise ValueError("indexes contains an invalid thscode") from exc
        _validate_index_info(group.get("index_info"), "indexes")
    period = _json_query(time_range, "time_range", dict)
    if not isinstance(period.get("time_type"), str) or not period["time_type"]:
        raise ValueError("time_range requires time_type")
    for field in ("start", "end", "offset"):
        if field in period:
            _json_integer(period[field], f"time_range.{field}")
    if "start" in period and "end" in period and period["start"] > period["end"]:
        raise ValueError("time_range end must be >= start")
    return _get("/api/fund/indicators/line", {"indexes": indexes, "time_range": time_range})


def fund_indicators_table(
    *,
    code_selectors: str | None = None,
    indexes: str | None = None,
    page_info: str | None = None,
    sort: str | None = None,
) -> dict[str, Any]:
    if code_selectors is not None:
        selectors = _json_query(code_selectors, "code_selectors", dict)
        include = selectors.get("include")
        if include is not None and not isinstance(include, list):
            raise ValueError("code_selectors.include must be an array")
        for selector in include or []:
            if not isinstance(selector, dict) or not isinstance(selector.get("type"), str):
                raise ValueError("code_selectors contains an invalid selector")
            securities = selector["type"] in ("stock_code", "fund_code")
            values = selector.get("thscodes" if securities else "values")
            if not isinstance(values, list) or (securities and "values" in selector):
                raise ValueError("code_selectors contains an invalid selector")
            if securities:
                for thscode in values:
                    _validate_fund_target(thscode)
    if indexes is not None:
        parsed_indexes = _json_query(indexes, "indexes", list)
        _validate_index_info(parsed_indexes, "indexes")
        for item in parsed_indexes:
            if "timestamp" in item:
                _json_integer(item["timestamp"], "indexes.timestamp")
    if page_info is not None:
        page = _json_query(page_info, "page_info", dict)
        for field in ("page_begin", "page_size", "code_begin", "code_page_size"):
            if field in page:
                _json_integer(page[field], f"page_info.{field}")
    if sort is not None:
        orders = _json_query(sort, "sort", list)
        for order in orders:
            if not isinstance(order, dict) or not isinstance(order.get("type"), str):
                raise ValueError("sort contains an invalid order")
            _json_integer(order.get("idx"), "sort.idx")
    return _get(
        "/api/fund/indicators/table",
        {"code_selectors": code_selectors, "indexes": indexes, "page_info": page_info, "sort": sort},
    )


def _fund_quota(
    path: str, tab: str, buy: bool | None = None
) -> list[dict[str, Any] | None]:
    tabs = _json_query(tab, "tab", list)
    if any(not isinstance(value, str) or not value.strip() for value in tabs):
        raise ValueError("tab must be a non-empty JSON string array")
    if buy is not None and not isinstance(buy, bool):
        raise ValueError("buy must be boolean")
    params: dict[str, Any] = {"tab": tab}
    if buy is not None:
        params["buy"] = buy
    return _get(path, params)


def fund_quota_summary(tab: str) -> list[dict[str, Any] | None]:
    return _fund_quota("/api/fund/quota/summary", tab)


def fund_quota_list(
    tab: str, *, buy: bool | None = None
) -> list[dict[str, Any] | None]:
    return _fund_quota("/api/fund/quota/list", tab, buy)


# ---------------------------------------------------------------------------
# 22/23. Special data — limit-up pool & limit-up ladder
# ---------------------------------------------------------------------------


_LIMIT_UP_SORT_FIELDS = ("last_price", "continue_day_cnt", "seal_money", "limit_up_time")


def special_data_limit_up_pool(
    *,
    date_ms: int | None = None,
    page: int = 1,
    size: int = 50,
    sort_field: Literal[
        "last_price", "continue_day_cnt", "seal_money", "limit_up_time"
    ] = "last_price",
    sort_dir: Literal["asc", "desc"] = "desc",
) -> dict[str, Any]:
    """涨停股票池 — returns the full envelope {timestamp, pagination, item: [...]}.

    Pagination is exposed (size 1-200) so callers can drive their own loop.
    Omit date_ms to fall back to today (Asia/Shanghai).
    """
    if page < 1:
        raise ValueError("page must be >= 1")
    if not (1 <= size <= 200):
        raise ValueError("size must be in [1, 200]")
    if sort_field not in _LIMIT_UP_SORT_FIELDS:
        raise ValueError(
            f"sort_field must be one of {_LIMIT_UP_SORT_FIELDS}; got {sort_field!r}"
        )
    if sort_dir not in ("asc", "desc"):
        raise ValueError("sort_dir must be 'asc' or 'desc'")
    return _get(
        "/api/a-share/special-data/limit-up-pool",
        {
            "date_ms": date_ms,
            "page": page,
            "size": size,
            "sort_field": sort_field,
            "sort_dir": sort_dir,
        },
    )


def _special_data_pool(
    path: str,
    sort_fields: tuple[str, ...],
    *,
    date_ms: int | None,
    page: int,
    size: int,
    sort_field: str,
    sort_dir: str,
) -> dict[str, Any]:
    if page < 1:
        raise ValueError("page must be >= 1")
    if not 1 <= size <= 200:
        raise ValueError("size must be in [1, 200]")
    if sort_field not in sort_fields:
        raise ValueError(f"sort_field must be one of {sort_fields}")
    if sort_dir not in ("asc", "desc"):
        raise ValueError("sort_dir must be asc or desc")
    return _get(
        path,
        {
            "date_ms": date_ms,
            "page": page,
            "size": size,
            "sort_field": sort_field,
            "sort_dir": sort_dir,
        },
    )


def special_data_limit_down_pool(
    *,
    date_ms: int | None = None,
    page: int = 1,
    size: int = 50,
    sort_field: str = "last_limit_time",
    sort_dir: Literal["asc", "desc"] = "desc",
) -> dict[str, Any]:
    return _special_data_pool(
        "/api/a-share/special-data/limit-down-pool",
        (
            "last_limit_time",
            "first_limit_time",
            "last_price",
            "price_change_ratio_pct",
            "turnover_ratio_pct",
        ),
        date_ms=date_ms,
        page=page,
        size=size,
        sort_field=sort_field,
        sort_dir=sort_dir,
    )


def special_data_limit_break_pool(
    *,
    date_ms: int | None = None,
    page: int = 1,
    size: int = 50,
    sort_field: str = "price_change_ratio_pct",
    sort_dir: Literal["asc", "desc"] = "desc",
) -> dict[str, Any]:
    return _special_data_pool(
        "/api/a-share/special-data/limit-break-pool",
        (
            "price_change_ratio_pct",
            "open_times",
            "last_price",
            "turnover_ratio_pct",
            "turnover",
        ),
        date_ms=date_ms,
        page=page,
        size=size,
        sort_field=sort_field,
        sort_dir=sort_dir,
    )


def special_data_limit_up_ladder() -> dict[str, Any]:
    """连板天梯 — returns full envelope {timestamp, window, item: [...]}.

    No input params; upstream fixes the window at 30 trading days, board cap 4 each.
    """
    return _get("/api/a-share/special-data/limit-up-ladder", {})


# ---------------------------------------------------------------------------
# 17/18. Special data — same-day anomaly analysis
# ---------------------------------------------------------------------------


_ANOMALY_TAG_CODES = (
    "LIMIT_UP",
    "LIMIT_DOWN",
    "SHARP_RISE",
    "SHARP_FALL",
    "RAPID_RALLY",
    "RAPID_DECLINE",
)
_A_SHARE_THSCODE_PATTERN = re.compile(r"^[0-9]{6}\.(SH|SZ|BJ)$")
_ANOMALY_STOCK_MAX_THSCODES = 50


def special_data_anomaly_analysis_list(
    tag_codes: Iterable[str] | None = None,
) -> dict[str, Any]:
    """Same-day anomaly list; optional tags are combined with OR semantics."""
    raw_codes = [tag_codes] if isinstance(tag_codes, str) else list(tag_codes or [])
    normalized: list[str] = []
    seen: set[str] = set()
    for raw in raw_codes:
        code = raw.strip().upper() if isinstance(raw, str) else ""
        if not code:
            raise ValueError("tag_codes contains an empty token")
        if code not in _ANOMALY_TAG_CODES:
            raise ValueError(
                f"tag_codes must contain only {_ANOMALY_TAG_CODES}; got {raw!r}"
            )
        if code not in seen:
            seen.add(code)
            normalized.append(code)
    return _get(
        "/api/a-share/special-data/anomaly-analysis-list",
        {"tag_codes": ",".join(normalized) if normalized else None},
    )


def special_data_anomaly_analysis_stock(
    thscodes: Iterable[str],
) -> dict[str, Any]:
    """Same-day anomaly rows for 1..50 raw A-share thscode tokens."""
    raw_codes = [thscodes] if isinstance(thscodes, str) else list(thscodes or [])
    if not raw_codes:
        raise ValueError("thscodes must contain at least one code")
    if len(raw_codes) > _ANOMALY_STOCK_MAX_THSCODES:
        raise ValueError(
            f"thscodes count must not exceed {_ANOMALY_STOCK_MAX_THSCODES}"
        )

    normalized: list[str] = []
    seen: set[str] = set()
    for raw in raw_codes:
        code = raw.strip().upper() if isinstance(raw, str) else ""
        if not code:
            raise ValueError("thscodes contains an empty token")
        if not _A_SHARE_THSCODE_PATTERN.fullmatch(code):
            raise ValueError(f"Invalid thscode: {raw!r}")
        if code not in seen:
            seen.add(code)
            normalized.append(code)

    return _get(
        "/api/a-share/special-data/anomaly-analysis-stock",
        {"thscodes": ",".join(normalized)},
    )


# ---------------------------------------------------------------------------
# 19-23. Special data — hot lists, rank trend & dragon-tiger list
# ---------------------------------------------------------------------------


_HOT_LIST_PERIODS = ("day", "hour")
_DRAGON_TIGER_BOARD_TYPES = ("all", "org", "hot_money")


def _normalize_hot_list_period(period: str) -> str:
    normalized = period.strip().lower() if isinstance(period, str) else ""
    if normalized not in _HOT_LIST_PERIODS:
        raise ValueError(f"period must be one of {_HOT_LIST_PERIODS}; got {period!r}")
    return normalized


def _parse_iso_date(value: str, field_name: str) -> Date:
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError(f"{field_name} must use YYYY-MM-DD format")
    try:
        return Date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"{field_name} must be a valid calendar date") from exc


def _normalize_a_share_thscode(thscode: str) -> str:
    normalized = thscode.strip().upper() if isinstance(thscode, str) else ""
    if not _A_SHARE_THSCODE_PATTERN.fullmatch(normalized):
        raise ValueError(f"Invalid thscode: {thscode!r}")
    return normalized


def special_data_skyrocket_list(
    period: Literal["day", "hour"] = "day",
    limit: int = 30,
) -> dict[str, Any]:
    """Current skyrocket ranking for the day or hour period."""
    return _get(
        "/api/a-share/special-data/skyrocket-list",
        {"period": _normalize_hot_list_period(period), "limit": _business_integer(limit, "limit", 1, 100)},
    )


def special_data_hot_stock_list(
    period: Literal["day", "hour"] = "day",
    limit: int = 30,
) -> dict[str, Any]:
    """Current hot-stock ranking for the day or hour period."""
    return _get(
        "/api/a-share/special-data/hot-stock-list",
        {"period": _normalize_hot_list_period(period), "limit": _business_integer(limit, "limit", 1, 100)},
    )


def special_data_hot_stock_list_history(date: str) -> dict[str, Any]:
    """Historical hot-stock ranking for one date within the server's window."""
    _parse_iso_date(date, "date")
    return _get(
        "/api/a-share/special-data/hot-stock-list-history",
        {"date": date},
    )


def special_data_hot_stock_rank_trend(
    thscode: str,
    start_date: str,
    end_date: str,
) -> dict[str, Any]:
    """Daily hot-stock rank trend for one A-share code over at most one year."""
    normalized_thscode = _normalize_a_share_thscode(thscode)
    start = _parse_iso_date(start_date, "start_date")
    end = _parse_iso_date(end_date, "end_date")
    if start > end:
        raise ValueError("start_date must be before or equal to end_date")
    try:
        one_year_later = start.replace(year=start.year + 1)
    except ValueError:
        one_year_later = start.replace(year=start.year + 1, day=28)
    if end > one_year_later:
        raise ValueError("date range must not exceed one year")
    return _get(
        "/api/a-share/special-data/hot-stock-rank-trend",
        {
            "thscode": normalized_thscode,
            "start_date": start_date,
            "end_date": end_date,
        },
    )


def special_data_dragon_tiger_list(
    *,
    board_type: Literal["all", "org", "hot_money"] = "all",
    date: str | None = None,
) -> dict[str, Any]:
    """Dragon-tiger list, optionally filtered by board type and trade date."""
    normalized_board_type = (
        board_type.strip().lower() if isinstance(board_type, str) else ""
    )
    if normalized_board_type not in _DRAGON_TIGER_BOARD_TYPES:
        raise ValueError(
            f"board_type must be one of {_DRAGON_TIGER_BOARD_TYPES}; got {board_type!r}"
        )
    if date is not None:
        _parse_iso_date(date, "date")
    return _get(
        "/api/a-share/special-data/dragon-tiger-list",
        {"board_type": normalized_board_type, "date": date},
    )


# ---------------------------------------------------------------------------
# Public futures and options capabilities
# ---------------------------------------------------------------------------


def _derivative_date_range(start_date: str, end_date: str) -> tuple[str, str]:
    start = _parse_iso_date(start_date, "start_date")
    end = _parse_iso_date(end_date, "end_date")
    if start > end:
        raise ValueError("start_date must be before or equal to end_date")
    return start_date, end_date


def _business_integer(value: int, field: str, minimum: int = 1, maximum: int = 2147483647) -> int:
    if type(value) is not int or not minimum <= value <= maximum:
        raise ValueError(f"{field} must be an integer between {minimum} and {maximum}")
    return value


def _business_choice(value: Any, field: str, choices: tuple[Any, ...]) -> Any:
    if value not in choices or isinstance(value, bool):
        raise ValueError(f"{field} must be one of {choices}")
    return value


def _business_text(value: str, field: str, maximum: int) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise ValueError(f"{field} must contain 1 to {maximum} characters")
    return value


def _business_date(value: str | None) -> str | None:
    if value is not None:
        _parse_iso_date(value, "date")
    return value


def special_data_limit_up_statistics(date: str | None = None) -> dict[str, Any]:
    """Market summary and board counts for one trading date."""
    return _get("/api/a-share/special-data/limit-up-statistics", {"date": _business_date(date)})


def special_data_dragon_tiger_stock_institution(
    thscode: str, date: str | None = None, range_days: Literal[1, 3] | None = None,
) -> dict[str, Any]:
    return _get("/api/a-share/special-data/dragon-tiger-stock-institution", {
        "thscode": _normalize_a_share_thscode(thscode), "date": _business_date(date),
        "range_days": None if range_days is None else _business_choice(_business_integer(range_days, "range_days", 1, 3), "range_days", (1, 3)),
    })


def special_data_dragon_tiger_department_classic_record(department_id: str) -> dict[str, Any]:
    return _get("/api/a-share/special-data/dragon-tiger-department-classic-record", {
        "department_id": _business_text(department_id, "department_id", 128),
    })


def special_data_dragon_tiger_department_history(
    department_id: str, page: int = 1, size: int = 30,
    min_net_buy_amount: int | None = None,
    sort_field: Literal["trade_date", "change_ratio", "net_buy_amount"] = "trade_date",
    sort_dir: Literal["asc", "desc"] = "desc",
) -> dict[str, Any]:
    """Return one source page, preserving nullable codes/names and row order."""
    return _get("/api/a-share/special-data/dragon-tiger-department-history", {
        "department_id": _business_text(department_id, "department_id", 128),
        "page": _business_integer(page, "page"), "size": _business_integer(size, "size", 1, 30),
        "min_net_buy_amount": None if min_net_buy_amount is None else _business_choice(_business_integer(min_net_buy_amount, "min_net_buy_amount"), "min_net_buy_amount", (5000000, 30000000, 50000000, 100000000)),
        "sort_field": _business_choice(sort_field, "sort_field", ("trade_date", "change_ratio", "net_buy_amount")),
        "sort_dir": _business_choice(sort_dir, "sort_dir", ("asc", "desc")),
    })


def special_data_abnormal_monitor_list(
    state: Literal["current", "history"] = "current", page: int = 1, size: int = 30,
) -> dict[str, Any]:
    """Severe anomaly records; codes and names may be null or empty."""
    return _get("/api/a-share/special-data/abnormal-monitor-list", {
        "state": _business_choice(state, "state", ("current", "history")),
        "page": _business_integer(page, "page"), "size": _business_integer(size, "size", 1, 30),
    })


def special_data_auction_stock_opportunities(
    date: str | None = None, warn_types: str | None = None,
    market: Literal["a_share", "sh_sz_main", "sh_a", "sz_a", "gem", "star"] = "a_share",
    exclude_st: bool = False, thscodes: Iterable[str] | None = None,
    sort_by: Literal["warn_time", "warn_type"] = "warn_time", sort_order: Literal["asc", "desc"] = "desc",
    page: int = 1, size: int = 20,
) -> dict[str, Any]:
    """Real-time/history opportunities for an available date, without stock deduplication."""
    if type(exclude_st) is not bool:
        raise ValueError("exclude_st must be a boolean")
    if warn_types is not None:
        if not isinstance(warn_types, str) or any(not re.fullmatch(r"687(?:1[0-9]|2[0-7])", token.strip()) for token in warn_types.split(',')):
            raise ValueError("warn_types must contain types 68710 through 68727")
    codes = None
    if thscodes is not None:
        raw = thscodes.split(',') if isinstance(thscodes, str) else list(thscodes)
        if not 1 <= len(raw) <= 50:
            raise ValueError("thscodes must contain 1 to 50 raw tokens")
        codes = ','.join(dict.fromkeys(_normalize_a_share_thscode(code) for code in raw))
    return _get("/api/a-share/special-data/auction-stock-opportunities", {
        "date": _business_date(date), "warn_types": warn_types,
        "market": _business_choice(market, "market", ("a_share", "sh_sz_main", "sh_a", "sz_a", "gem", "star")),
        "exclude_st": str(exclude_st).lower(), "thscodes": codes,
        "sort_by": _business_choice(sort_by, "sort_by", ("warn_time", "warn_type")),
        "sort_order": _business_choice(sort_order, "sort_order", ("asc", "desc")),
        "page": _business_integer(page, "page"), "size": _business_integer(size, "size", 1, 20),
    })


def special_data_auction_opportunity_dates() -> dict[str, Any]:
    return _get("/api/a-share/special-data/auction-opportunity-dates", {})


def a_share_ipo_calendar_list(
    market: Literal["sh_sz", "bj"], status: Literal["upcoming", "subscribable", "awaiting_listing"],
) -> dict[str, Any]:
    return _get("/api/a-share/ipo/calendar-list", {
        "market": _business_choice(market, "market", ("sh_sz", "bj")),
        "status": _business_choice(status, "status", ("upcoming", "subscribable", "awaiting_listing")),
    })


def hk_share_ipo_application_list(page: int = 1) -> dict[str, Any]:
    return _get("/api/hk-share/ipo/application-list", {"page": _business_integer(page, "page")})


def hk_share_ipo_calendar_list(status: Literal["subscribable", "awaiting_listing"]) -> dict[str, Any]:
    return _get("/api/hk-share/ipo/calendar-list", {
        "status": _business_choice(status, "status", ("subscribable", "awaiting_listing")),
    })


def hk_share_ipo_issue_detail(issue_code: str) -> dict[str, Any]:
    return _get("/api/hk-share/ipo/issue-detail", {
        "issue_code": _business_text(issue_code, "issue_code", 32),
    })


def _derivative_session(session: str) -> str:
    if session not in ("pre_market", "intraday", "post_market"):
        raise ValueError("session must be pre_market, intraday, or post_market")
    return session


def _derivative_daily(path: str, thscode: str, start: int | None, end: int | None) -> dict[str, Any]:
    if (start is None) != (end is None):
        raise ValueError("start and end must be provided together")
    if start is not None and (start <= 0 or end <= 0 or start > end):
        raise ValueError("start and end must be positive and start must be <= end")
    return _get(path, {"thscode": thscode, "start": start, "end": end})


def futures_varieties() -> dict[str, Any]:
    return _get("/api/futures/varieties/list", {})


def futures_variety_plates() -> dict[str, Any]:
    return _get("/api/futures/variety-plates/list", {})


def _derivative_contracts(path: str, limit: int = 100, offset: int = 0) -> dict[str, Any]:
    if not 1 <= limit <= 1000:
        raise ValueError("limit must be between 1 and 1000")
    if offset < 0:
        raise ValueError("offset must be non-negative")
    return _get(path, {"limit": limit, "offset": offset})


def futures_contract_detail(thscode: str) -> dict[str, Any]:
    return _get("/api/futures/contracts/detail", {"thscode": thscode})


def futures_contracts(*, limit: int = 100, offset: int = 0) -> dict[str, Any]:
    return _derivative_contracts("/api/futures/contracts/list", limit, offset)


def futures_main_continuous() -> dict[str, Any]:
    return _get("/api/futures/contracts/main-continuous-list", {})


def futures_main() -> dict[str, Any]:
    return _get("/api/futures/contracts/main-list", {})


def futures_secondary_main() -> dict[str, Any]:
    return _get("/api/futures/contracts/secondary-main-list", {})


def futures_commodity_indexes() -> dict[str, Any]:
    return _get("/api/futures/contracts/commodity-index-list", {})


def futures_variety_positions(date: str) -> dict[str, Any]:
    _parse_iso_date(date, "date")
    return _get("/api/futures/positions/variety-daily", {"date": date})


def futures_company_variety_positions(date: str, varieties: str) -> dict[str, Any]:
    _parse_iso_date(date, "date")
    tokens = [value.strip() for value in varieties.split(",")]
    if not 1 <= len(tokens) <= 5 or any(not value for value in tokens):
        raise ValueError("varieties must contain 1 to 5 non-empty values")
    return _get("/api/futures/positions/company-variety-daily", {"date": date, "varieties": varieties})


def futures_contract_positions(thscode: str, variety: str, date: str) -> dict[str, Any]:
    _parse_iso_date(date, "date")
    return _get("/api/futures/positions/contract-daily", {"thscode": thscode, "variety": variety, "date": date})


def futures_contract_position_history(thscode: str, variety: str, company: str, start_date: str) -> dict[str, Any]:
    _parse_iso_date(start_date, "start_date")
    return _get("/api/futures/positions/contract-historical", {"thscode": thscode, "variety": variety, "company": company, "start_date": start_date})


def futures_position_companies() -> dict[str, Any]:
    return _get("/api/futures/positions/company-list", {})


def futures_warehouse_receipts(thscode: str, start_date: str, end_date: str) -> dict[str, Any]:
    _derivative_date_range(start_date, end_date)
    return _get("/api/futures/warehouse-receipts/historical", {"thscode": thscode, "start_date": start_date, "end_date": end_date})


def futures_latest_basis() -> dict[str, Any]:
    return _get("/api/futures/basis/main-continuous-latest", {})


def futures_basis_history(thscode: str, *, spot_indicator_id: str | None = None) -> dict[str, Any]:
    return _get("/api/futures/basis/historical", {"thscode": thscode, "spot_indicator_id": spot_indicator_id})


def futures_trading_schedule(thscode: str, start_date: str, end_date: str) -> dict[str, Any]:
    _derivative_date_range(start_date, end_date)
    return _get("/api/futures/calendar/trading-schedule", {"thscode": thscode, "start_date": start_date, "end_date": end_date})


def futures_session_timeline(thscode: str) -> dict[str, Any]:
    return _get("/api/futures/calendar/session-timeline", {"thscode": thscode})


def futures_intraday(thscode: str, *, session: str = "intraday") -> dict[str, Any]:
    return _get("/api/futures/prices/intraday", {"thscode": thscode, "session": _derivative_session(session)})


def futures_daily(thscode: str, *, start: int | None = None, end: int | None = None) -> dict[str, Any]:
    return _derivative_daily("/api/futures/prices/daily", thscode, start, end)


def options_varieties() -> dict[str, Any]:
    return _get("/api/options/varieties/list", {})


def options_contract_detail(thscode: str) -> dict[str, Any]:
    return _get("/api/options/contracts/detail", {"thscode": thscode})


def options_contracts(*, limit: int = 100, offset: int = 0) -> dict[str, Any]:
    return _derivative_contracts("/api/options/contracts/list", limit, offset)


def options_session_timeline(thscode: str) -> dict[str, Any]:
    return _get("/api/options/calendar/session-timeline", {"thscode": thscode})


def options_intraday(thscode: str, *, session: str = "intraday") -> dict[str, Any]:
    return _get("/api/options/prices/intraday", {"thscode": thscode, "session": _derivative_session(session)})


def options_daily(thscode: str, *, start: int | None = None, end: int | None = None) -> dict[str, Any]:
    return _derivative_daily("/api/options/prices/daily", thscode, start, end)


def _news_text(value: str, field: str, *, segment: bool = False) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be non-empty text")
    if segment and ('/' in value or '\\' in value):
        raise ValueError(f"{field} must be one path segment")
    return value


def _news_integer(value: int, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not -(2**63) <= value < 2**63:
        raise ValueError(f"{field} must be a signed 64-bit integer")
    return value


def _news_seq(value: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]+", value) or int(value) >= 2**63:
        raise ValueError("seq must be a decimal string within signed 64-bit range")
    return value


def news_article_detail(client_type: str, encoded_seq: str) -> dict[str, Any]:
    """Query article detail by an opaque identifier; preserve HTML and nulls."""
    _news_text(client_type, "client_type", segment=True)
    _news_text(encoded_seq, "encoded_seq", segment=True)
    if client_type.upper() not in {"WEB", "WEB_ENCRYPTED", "PC", "PC_LIST"}:
        raise ValueError("client_type must be WEB, WEB_ENCRYPTED, PC or PC_LIST")
    return _get("/api/news/article/detail", {"client_type": client_type, "encoded_seq": encoded_seq})


def news_flash_list(tag_id: int, seq: str) -> dict[str, Any]:
    """Query one flash page; seq is an exact decimal string, initially '0'."""
    _news_integer(tag_id, "tag_id")
    _news_seq(seq)
    return _get("/api/news/flash/list", {"tag_id": tag_id, "seq": seq})


def news_flash_refresh(tag_id: int, seq: str, create_time_ms: int) -> dict[str, Any]:
    """Refresh flashes using a millisecond creation time divisible by 1000."""
    _news_integer(tag_id, "tag_id")
    _news_seq(seq)
    _news_integer(create_time_ms, "create_time_ms")
    if create_time_ms % 1000:
        raise ValueError("create_time_ms must be divisible by 1000")
    return _get("/api/news/flash/refresh", {"tag_id": tag_id, "seq": seq, "create_time_ms": create_time_ms})


def news_notice_detail(seq: str) -> dict[str, Any]:
    """Query announcement detail and its structured interpretation."""
    _news_text(seq, "seq", segment=True)
    return _get("/api/news/notice/detail", {"seq": seq})


def news_topic_hot_list(tab_id: int, cursor: str | None = None, limit: int = 10,
                        important_only: bool = False) -> dict[str, Any]:
    """Query one topic page; pass next_cursor unchanged for subsequent pages."""
    _news_integer(tab_id, "tab_id")
    _news_integer(limit, "limit")
    if not 1 <= limit <= 10:
        raise ValueError("limit must be within 1..10")
    if cursor is not None and not isinstance(cursor, str):
        raise ValueError("cursor must be text")
    if not isinstance(important_only, bool):
        raise ValueError("important_only must be boolean")
    return _get("/api/news/topic/hot-list", {"tab_id": tab_id, "cursor": cursor, "limit": limit, "important_only": str(important_only).lower()})


def news_anomaly_analysis(begin_date: str, end_date: str, thscode: str | None = None) -> dict[str, Any]:
    """Query a date range unchanged; retain was_truncated and source time values."""
    first = _parse_iso_date(begin_date, "begin_date")
    last = _parse_iso_date(end_date, "end_date")
    if first > last:
        raise ValueError("begin_date must not exceed end_date")
    if thscode is not None:
        _news_text(thscode, "thscode")
    return _get("/api/news/anomaly/analysis", {"begin_date": begin_date, "end_date": end_date, "thscode": thscode})


def news_stock_timeline_list(thscode: str, offset: str,
                             size: int | None = None) -> dict[str, Any]:
    """Query one timeline page; omit size to use the service's default behavior."""
    for field, value in (("thscode", thscode), ("offset", offset)):
        _news_text(value, field)
    if not re.fullmatch(r"[0-9A-Za-z]+\.[A-Za-z]+", thscode):
        raise ValueError("thscode must be a single complete security code")
    if size is not None:
        _news_integer(size, "size")
        if not 1 <= size <= 100:
            raise ValueError("size must be within 1..100")
    return _get("/api/news/stock/timeline-list", {"thscode": thscode, "offset": offset, "size": size})


__all__ = [
    "prices_historical_batch",
    "index_prices_historical_batch",
    "fund_market_historical_batch",
    "financials_income_statements_batch",
    "financials_balance_sheets_batch",
    "financials_cash_flow_statements_batch",
    "news_article_detail", "news_flash_list", "news_flash_refresh", "news_notice_detail",
    "news_topic_hot_list", "news_anomaly_analysis", "news_stock_timeline_list",
    "FuyaoApiError",
    "tickers_search",
    "tickers_list",
    "prices_snapshot",
    "prices_historical",
    "corp_actions_adjustment_factors",
    "financials_income_statements",
    "financials_balance_sheets",
    "financials_cash_flow_statements",
    "financials_indicators",
    "a_share_valuations_snapshot",
    "a_share_auction_snapshot",
    "a_share_auction_short_term_benchmark",
    "calendar_trading_days",
    "index_catalog_ths_index_list",
    "index_constituents_ths_stock_list",
    "index_prices_snapshot",
    "index_prices_historical",
    "fund_profile_detail",
    "fund_portfolio_holdings",
    "fund_performance_nav",
    "fund_performance_returns",
    "fund_holders_detail",
    "fund_market_snapshot",
    "fund_market_historical",
    "fund_companies_detail",
    "fund_portfolio_industry_allocation",
    "fund_performance_indicators_historical",
    "fund_performance_drawdowns",
    "fund_holders_top",
    "fund_corporate_actions_dividends",
    "fund_diagnostics_detail",
    "fund_financials_indicators",
    "fund_financials_income_statements",
    "fund_financials_balance_sheets",
    "fund_managers_investment_style",
    "fund_managers_performance",
    "fund_managers_experience",
    "fund_managers_detail",
    "fund_news_article_list",
    "fund_offerings_list",
    "fund_portfolio_stock_history",
    "fund_portfolio_stock_report_dates",
    "fund_portfolio_bond_history",
    "fund_portfolio_bond_report_dates",
    "fund_portfolio_asset_allocation",
    "fund_backtest_indicators",
    "fund_backtest_result",
    "fund_indicators_line",
    "fund_indicators_table",
    "fund_quota_summary",
    "fund_quota_list",
    "special_data_limit_up_pool",
    "special_data_limit_down_pool",
    "special_data_limit_break_pool",
    "special_data_limit_up_ladder",
    "special_data_anomaly_analysis_list",
    "special_data_anomaly_analysis_stock",
    "special_data_skyrocket_list",
    "special_data_limit_up_statistics",
    "special_data_dragon_tiger_stock_institution",
    "special_data_dragon_tiger_department_classic_record",
    "special_data_dragon_tiger_department_history",
    "special_data_abnormal_monitor_list",
    "special_data_auction_stock_opportunities",
    "special_data_auction_opportunity_dates",
    "a_share_ipo_calendar_list",
    "hk_share_ipo_application_list",
    "hk_share_ipo_calendar_list",
    "hk_share_ipo_issue_detail",
    "special_data_hot_stock_list",
    "special_data_hot_stock_list_history",
    "special_data_hot_stock_rank_trend",
    "special_data_dragon_tiger_list",
    "futures_varieties",
    "futures_variety_plates",
    "futures_contract_detail",
    "futures_contracts",
    "futures_main_continuous",
    "futures_main",
    "futures_secondary_main",
    "futures_commodity_indexes",
    "futures_variety_positions",
    "futures_company_variety_positions",
    "futures_contract_positions",
    "futures_contract_position_history",
    "futures_position_companies",
    "futures_warehouse_receipts",
    "futures_latest_basis",
    "futures_basis_history",
    "futures_trading_schedule",
    "futures_session_timeline",
    "futures_intraday",
    "futures_daily",
    "options_varieties",
    "options_contract_detail",
    "options_contracts",
    "options_session_timeline",
    "options_intraday",
    "options_daily",
]
