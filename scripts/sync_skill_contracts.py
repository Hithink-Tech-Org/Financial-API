"""Generate standalone REST API and MCP Skills from canonical documents."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
REFERENCES = REPO_ROOT / "skills" / "hithink-finance" / "references"
MCP_REFERENCES = REPO_ROOT / "skills" / "hithink-finance-mcp" / "references"
API_SOURCE = REPO_ROOT / "docs" / "api"
API_ENTRY_TARGET = REFERENCES / "api.md"
API_DETAIL_TARGET = REFERENCES / "api"
MCP_ENTRY_SOURCE = REPO_ROOT / "docs" / "mcp.md"
MCP_ENTRY_TARGET = MCP_REFERENCES / "mcp.md"
MCP_DETAIL_SOURCE = REPO_ROOT / "docs" / "mcp"
MCP_DETAIL_TARGET = MCP_REFERENCES / "mcp"
MCP_ROUTE_DOMAINS = (
    "meta",
    "a-share",
    "hk-share",
    "index",
    "fund",
    "futures",
    "options",
    "news",
)
MCP_TOOL_ROW = re.compile(r"^\| \[[^]]+\]\(([^)]+\.md)\) \| `(get_[^`]+)` \|", re.M)
MCP_ENDPOINT = re.compile(r"> 对应 REST 端点：\[`(GET /api/[a-z0-9/-]+)`\]")


def response_sections(content: str) -> list[tuple[str, str]]:
    headings = list(
        re.finditer(
            r"^(#{2,6}) (.+)$|^\*\*(共有响应字段|共有请求参数|通用请求参数|取数模式|接口列表)\*\*\s*$",
            content,
            re.M,
        )
    )
    sections = []
    for index, heading in enumerate(headings):
        title = heading[2] or heading[3]
        if not any(
            word in title
            for word in ("响应字段", "返回字段", "约束与错误", "错误与约束")
        ):
            continue
        level = len(heading[1] or "##")
        end = next(
            (
                item.start()
                for item in headings[index + 1 :]
                if len(item[1] or "##") <= level
            ),
            len(content),
        )
        body = re.sub(
            r'<a id="[^"]+"></a>\s*', "", content[heading.end() : end]
        ).strip()
        if not body:
            raise ValueError(f"empty MCP response fields: {title}")
        sections.append((title, body))
    return sections


def render_mcp_tools(tools: set[Path]) -> dict[str, str]:
    records = json.loads((API_SOURCE / "page-map.json").read_text(encoding="utf-8"))[
        "entries"
    ]
    by_id = {record["id"]: record for record in records}
    by_page: dict[Path, list[dict]] = {}
    for record in records:
        by_page.setdefault((REPO_ROOT / record["output"]).resolve(), []).append(record)
    by_endpoint = {}
    for tool in tools:
        match = MCP_ENDPOINT.search(tool.read_text(encoding="utf-8"))
        if not match or match[1] not in by_id:
            raise ValueError(f"missing MCP response mapping: {tool.name}")
        by_endpoint[match[1]] = tool

    def rewrite_links(
        content: str, source: Path, tool: Path, pending: list[str]
    ) -> str:
        def replace(match: re.Match) -> str:
            label = match[1]
            href = match[2]
            if "://" in href or href.startswith("mailto:"):
                return match[0]
            filename, _, fragment = href.partition("#")
            target = (
                (source.parent / filename).resolve() if filename else source.resolve()
            )
            if not target.is_relative_to(API_SOURCE.resolve()):
                return match[0]
            if target.name == "README.md":
                destination = MCP_REFERENCES.parent / "SKILL.md"
                anchor = "调用规则"
            else:
                candidates = by_page.get(target, [])
                if fragment:
                    candidates = [
                        record
                        for record in candidates
                        if not record["section_anchor"]
                        or fragment == record["section_anchor"]
                        or fragment.startswith(record["section_anchor"] + "--")
                    ]
                if len(candidates) != 1:
                    raise ValueError(
                        f"unresolved MCP response link: {source.name}: {href}"
                    )
                dependency = candidates[0]["id"]
                destination = MCP_DETAIL_TARGET / tool.relative_to(MCP_DETAIL_SOURCE)
                anchor = "返回字段"
                if "/api/" in label and dependency in by_endpoint:
                    label = f"`{by_endpoint[dependency].stem}`"
                    destination = MCP_DETAIL_TARGET / by_endpoint[
                        dependency
                    ].relative_to(MCP_DETAIL_SOURCE)
                elif dependency not in pending:
                    pending.append(dependency)
            current = MCP_DETAIL_TARGET / tool.relative_to(MCP_DETAIL_SOURCE)
            relative = (
                ""
                if destination == current
                else Path(os.path.relpath(destination, current.parent)).as_posix()
            )
            return f"[{label}]({relative}#{anchor})"

        return re.sub(r"\[([^\]\n]+)\]\(([^)]+)\)", replace, content)

    outputs = {}
    for endpoint, tool in by_endpoint.items():
        pending = [endpoint]
        text = tool.read_text(encoding="utf-8")
        text = re.sub(r"^> 对应 REST 端点：.*\n", "", text, flags=re.M)
        text = re.sub(
            r"> \*\*info\*\*\n> 工具名：`([^`]+)`\n>\n\s*", r"工具名：`\1`\n\n", text
        )
        text = text.replace("REST 端点", "返回字段说明").replace(
            "REST 文档", "返回字段说明"
        )
        text = rewrite_links(text, tool, tool, pending)
        fields = []
        included = set()
        for dependency in pending:
            record = by_id[dependency]
            source = REPO_ROOT / record["output"]
            content = source.read_text(encoding="utf-8")
            siblings = [
                item
                for item in records
                if item["output"] == record["output"] and item["section_anchor"]
            ]
            starts = {
                item["id"]: content.index(f'<a id="{item["section_anchor"]}"></a>')
                for item in siblings
            }
            start = starts.get(dependency, 0)
            end = min(
                (position for position in starts.values() if position > start),
                default=len(content),
            )
            common = content[: min(starts.values())] if starts else ""
            sections = response_sections(common) + response_sections(content[start:end])
            if not sections:
                raise ValueError(
                    f"missing MCP response fields: {tool.name}: {dependency}"
                )
            for title, body in sections:
                if (source, title, body) in included:
                    continue
                included.add((source, title, body))
                fields.append(
                    f"### {record['title']} · {title}\n\n{rewrite_links(body, source, tool, pending)}"
                )
        outputs[tool.relative_to(MCP_DETAIL_SOURCE).as_posix()] = (
            text.rstrip() + "\n\n## 返回字段\n\n" + "\n\n".join(fields) + "\n"
        )
    return outputs


def markdown_files(root: Path) -> dict[str, Path]:
    return {
        path.relative_to(root).as_posix(): path for path in sorted(root.rglob("*.md"))
    }


def api_entry_content() -> str:
    content = (API_SOURCE / "README.md").read_text(encoding="utf-8")
    content = "\n".join(
        line
        for line in content.splitlines()
        if "llms-full" not in line and "llms.txt" not in line
    ).replace("本目录是", "本 Skill 内置契约是")
    content = re.sub(r"\]\((?!https?://|#)([^)]+)\)", r"](api/\1)", content)
    return content.rstrip() + "\n"


def api_grouped_content() -> dict[str, str]:
    return {
        name: source.read_text(encoding="utf-8")
        for name, source in markdown_files(API_SOURCE).items()
    }


def mcp_entry_content() -> str:
    return MCP_ENTRY_SOURCE.read_text(encoding="utf-8").replace(
        "返回字段通过文档中的 REST 链接按需读取",
        "按业务文档中的工具名小节读取参数、返回字段与关联结构",
    )


def group_mcp_documents(documents: dict[str, str], tools: set[Path]) -> dict[str, str]:
    records = {
        record["id"]: record
        for record in json.loads(
            (API_SOURCE / "page-map.json").read_text(encoding="utf-8")
        )["entries"]
    }
    locations = {}
    titles = {}
    for tool in sorted(tools):
        endpoint = MCP_ENDPOINT.search(tool.read_text(encoding="utf-8"))[1]
        record = records[endpoint]
        name = tool.relative_to(MCP_DETAIL_SOURCE).as_posix()
        group = (REPO_ROOT / record["output"]).relative_to(API_SOURCE).as_posix()
        locations[name] = group
        titles[group] = record.get("page_title", record["title"])

    def rewrite_links(content: str, source: str, destination: str) -> str:
        def replace(match: re.Match) -> str:
            href = match[2]
            if "://" in href or href.startswith("mailto:"):
                return match[0]
            filename, _, fragment = href.partition("#")
            target = (
                (MCP_DETAIL_SOURCE / source).parent / filename
                if filename
                else MCP_DETAIL_SOURCE / source
            )
            relative = (
                target.resolve().relative_to(MCP_DETAIL_SOURCE.resolve()).as_posix()
                if target.resolve().is_relative_to(MCP_DETAIL_SOURCE.resolve())
                else None
            )
            if relative not in locations:
                return match[0]
            anchor = Path(relative).stem + ("--" + fragment if fragment else "")
            filename = (
                ""
                if locations[relative] == destination
                else Path(
                    os.path.relpath(
                        MCP_DETAIL_TARGET / locations[relative],
                        (MCP_DETAIL_TARGET / destination).parent,
                    )
                ).as_posix()
            )
            return f"[{match[1]}]({filename}#{anchor})"

        return re.sub(r"\[([^\]\n]+)\]\(([^)]+)\)", replace, content)

    groups: dict[str, list[tuple[str, str, str]]] = {}
    result = {}
    for name, content in sorted(documents.items()):
        if name not in locations:
            result[name] = rewrite_links(content, name, name)
            continue
        group = locations[name]
        content = rewrite_links(content, name, group)
        tool = Path(name).stem
        title = re.search(r"^# (.+)$", content, re.M)[1]
        lines = []
        fenced = False
        for line in content.splitlines():
            if line.startswith("```"):
                fenced = not fenced
            heading = re.match(r"^(#{1,5}) (.+)$", line) if not fenced else None
            if heading:
                slug = re.sub(r"[^\w\-\u4e00-\u9fff ]", "", heading[2].lower()).replace(
                    " ", "-"
                )
                anchor = tool if len(heading[1]) == 1 else tool + "--" + slug
                lines.extend([f'<a id="{anchor}"></a>', "#" + line])
            elif line != "[业务导航](README.md)":
                lines.append(line)
        groups.setdefault(group, []).append((tool, title, "\n".join(lines).strip()))
    for group, sections in groups.items():
        toc = "\n".join(
            f"- [{title} · `{tool}`](#{tool})" for tool, title, _ in sections
        )
        result[group] = (
            f"# {titles[group]}\n\n[业务导航](README.md)\n\n{toc}\n\n"
            + "\n\n".join(body for _, _, body in sections)
            + "\n"
        )
    return result


def mcp_documents() -> dict[str, str]:
    """Preserve tool-level contracts and validate the business-domain inventory."""
    routed: list[Path] = []
    for domain in MCP_ROUTE_DOMAINS:
        route = MCP_DETAIL_SOURCE / domain / "README.md"
        for filename, name in MCP_TOOL_ROW.findall(route.read_text(encoding="utf-8")):
            tool = (route.parent / filename).resolve()
            if (
                not tool.is_relative_to(MCP_DETAIL_SOURCE.resolve())
                or tool.name != f"{name}.md"
            ):
                raise ValueError(f"invalid MCP route target: {domain}/{filename}")
            routed.append(tool)
    actual = {
        tool.resolve()
        for tool in MCP_DETAIL_SOURCE.glob("*/get_*.md")
        if tool.parent.name != "planned"
    }
    if len(routed) != len(set(routed)) or set(routed) != actual:
        raise ValueError("MCP route inventory mismatch")
    for tool in sorted(actual):
        content = tool.read_text(encoding="utf-8")
        identity = re.search(r"工具名：`([^`]+)`", content)
        if (
            not re.search(r"^# .+$", content, re.M)
            or not identity
            or identity.group(1) != tool.stem
        ):
            raise ValueError(f"invalid MCP tool identity: {tool.name}")
        sections = re.split(r"^## (.+)$", content, flags=re.M)
        blocks = dict(zip(sections[1::2], sections[2::2]))
        if any(
            not blocks.get(heading, "").strip()
            for heading in ("工具描述", "参数", "返回")
        ):
            raise ValueError(f"incomplete MCP tool sections: {tool.name}")
    documents = {
        name: source.read_text(encoding="utf-8")
        for name, source in markdown_files(MCP_DETAIL_SOURCE).items()
        if not name.startswith("planned/")
    }
    if "README.md" in documents:
        documents["README.md"] = (
            "\n".join(
                line
                for line in documents["README.md"].splitlines()
                if "planned/" not in line
            ).rstrip()
            + "\n"
        )
    documents.update(render_mcp_tools(actual))
    return group_mcp_documents(documents, actual)


def tree_drift(outputs: dict[str, str], target: Path, label: str) -> list[str]:
    actual = markdown_files(target)
    problems = [
        f"missing {label}: {name}" for name in sorted(outputs.keys() - actual.keys())
    ]
    problems += [
        f"unexpected {label}: {name}" for name in sorted(actual.keys() - outputs.keys())
    ]
    problems += [
        f"stale {label}: {name}"
        for name in sorted(outputs.keys() & actual.keys())
        if outputs[name] != actual[name].read_text(encoding="utf-8")
    ]
    return problems


def drift() -> list[str]:
    api_outputs = api_grouped_content()
    problems = tree_drift(api_outputs, API_DETAIL_TARGET, "API Skill mirror")
    problems += tree_drift({}, MCP_REFERENCES / "api", "MCP API mirror")
    problems += tree_drift(mcp_documents(), MCP_DETAIL_TARGET, "MCP tool contract")
    for target, expected in (
        (API_ENTRY_TARGET, api_entry_content()),
        (MCP_ENTRY_TARGET, mcp_entry_content()),
    ):
        if not target.is_file() or target.read_text(encoding="utf-8") != expected:
            problems.append(
                f"missing or stale Skill entry: {target.relative_to(REPO_ROOT)}"
            )
    return problems


def sync_api_tree(outputs: dict[str, str], target_root: Path) -> None:
    if not outputs and not target_root.exists():
        return
    target_root.mkdir(parents=True, exist_ok=True)
    for path in target_root.rglob("*.md"):
        if path.relative_to(target_root).as_posix() not in outputs:
            path.unlink()
    for name, content in outputs.items():
        (target_root / name).parent.mkdir(parents=True, exist_ok=True)
        (target_root / name).write_text(content, encoding="utf-8")
    for directory in sorted(
        target_root.rglob("*"), key=lambda p: len(p.parts), reverse=True
    ):
        if (
            directory.resolve().is_relative_to(target_root.resolve())
            and directory.is_dir()
            and not any(directory.iterdir())
        ):
            directory.rmdir()
    if not outputs and not any(target_root.iterdir()):
        target_root.rmdir()


def sync() -> None:
    api_outputs = api_grouped_content()
    tool_outputs = mcp_documents()
    REFERENCES.mkdir(parents=True, exist_ok=True)
    MCP_REFERENCES.mkdir(parents=True, exist_ok=True)
    API_ENTRY_TARGET.write_text(api_entry_content(), encoding="utf-8")
    MCP_ENTRY_TARGET.write_text(mcp_entry_content(), encoding="utf-8")
    sync_api_tree(api_outputs, API_DETAIL_TARGET)
    sync_api_tree({}, MCP_REFERENCES / "api")
    sync_api_tree(tool_outputs, MCP_DETAIL_TARGET)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Synchronize REST API and MCP Skill contracts."
    )
    parser.add_argument(
        "--check", action="store_true", help="report drift without writing files"
    )
    args = parser.parse_args()
    try:
        if not args.check:
            sync()
        problems = drift()
    except ValueError as error:
        print(error, file=sys.stderr)
        return 1
    if problems:
        print("\n".join(problems), file=sys.stderr)
        return 1
    print("REST API and MCP Skills are synchronized")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
