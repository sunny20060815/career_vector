#!/usr/bin/env python3
"""提取学职平台公开展示的普通本科专业及就业方向。"""

from __future__ import annotations

import argparse
import csv
import json
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen


BASE_URL = "https://xz.chsi.com.cn"
ROOT = Path(__file__).resolve().parents[2]
OUTPUT_DIR = ROOT / "data" / "02_关系表"
CACHE_DIR = ROOT / ".cache" / "chsi-major-destinations"
DETAIL_OUTPUT = OUTPUT_DIR / "12_专业就业去向表.csv"
AUDIT_OUTPUT = OUTPUT_DIR / "12_专业就业去向采集审计表.csv"
USER_AGENT = "CareerVectorResearch/1.0 (+https://www.zhivector.com/)"


def fetch(url: str, retries: int = 3) -> str:
    request = Request(url, headers={"User-Agent": USER_AGENT, "X-Requested-With": "XMLHttpRequest"})
    for attempt in range(retries):
        try:
            with urlopen(request, timeout=30) as response:
                return response.read().decode("utf-8")
        except Exception:
            if attempt + 1 == retries:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError("unreachable")


def fetch_json(path: str, params: dict[str, object]) -> dict:
    return json.loads(fetch(f"{BASE_URL}{path}?{urlencode(params)}"))


def extract_embedded_json(html: str) -> dict:
    marker = "resultJson: "
    start = html.find(marker)
    if start < 0:
        raise ValueError("页面中未找到 resultJson")
    result, _ = json.JSONDecoder().raw_decode(html[start + len(marker) :])
    return result


def load_catalog() -> list[dict]:
    first = fetch_json(
        "/speciality/list.action",
        {"start": 0, "phbType": 1, "cc": 1050, "ml": "", "xk": "", "zymc": ""},
    )["data"]
    majors = list(first["pageArray"])
    for start in range(first["pageCount"], first["totalCount"], first["pageCount"]):
        page = fetch_json(
            "/speciality/list.action",
            {"start": start, "phbType": 1, "cc": 1050, "ml": "", "xk": "", "zymc": ""},
        )["data"]
        majors.extend(page["pageArray"])
    return majors


def load_detail(major: dict, delay: float) -> dict:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = CACHE_DIR / f"{major['specId']}.json"
    if cache_path.exists():
        return json.loads(cache_path.read_text(encoding="utf-8"))
    url = f"{BASE_URL}/speciality/detail.action?{urlencode({'specId': major['specId']})}"
    detail = extract_embedded_json(fetch(url))
    cache_path.write_text(json.dumps(detail, ensure_ascii=False), encoding="utf-8")
    time.sleep(delay)
    return detail


def direction_rows(major: dict, detail: dict, direction_type: str, key: str) -> list[dict]:
    byfz = detail.get("byfzVo") or {}
    directions = byfz.get(key) or {}
    items = directions.values() if isinstance(directions, dict) else directions
    scope_name = byfz.get("occXkmc", "") if direction_type == "已毕业人员从业方向" else ""
    scope = "专业类" if scope_name else "专业"
    rows: list[dict] = []
    for rank, item in enumerate(items, 1):
        parent = item.get("specOccName", "")
        common = {
            "专业代码": detail.get("zydm") or major.get("zydm", ""),
            "专业名称": detail.get("zymc") or major.get("zymc", ""),
            "专业门类": detail.get("mlmc") or major.get("mlmc", ""),
            "专业类": detail.get("xkmc") or major.get("xk", ""),
            "学历层次": detail.get("ccmc") or major.get("cc", ""),
            "去向类型": direction_type,
            "数据口径": scope,
            "口径名称": scope_name or detail.get("zymc") or major.get("zymc", ""),
            "展示顺序": rank,
            "父级去向": "",
            "去向名称": parent,
            "去向占比": item.get("specOccProportion", ""),
            "职业页面ID": item.get("zhiyId", ""),
            "职业词典ID": item.get("dicZyId", ""),
            "是否细分去向": "否",
            "专业页面ID": major["specId"],
            "来源页面": f"{BASE_URL}/speciality/detail.action?specId={major['specId']}",
            "采集日期": date.today().isoformat(),
        }
        rows.append(common)
        for child in item.get("specOccInfoVoList") or []:
            rows.append(
                {
                    **common,
                    "父级去向": parent,
                    "去向名称": child.get("specOccName", ""),
                    "去向占比": "",
                    "职业页面ID": child.get("zhiyId", ""),
                    "职业词典ID": child.get("dicZyId", ""),
                    "是否细分去向": "是",
                }
            )
    return rows


def write_csv(path: Path, rows: list[dict], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def deduplicate(rows: list[dict]) -> list[dict]:
    unique: list[dict] = []
    seen: set[tuple[str, str, str, str]] = set()
    for row in rows:
        key = (row["专业代码"], row["去向类型"], row["父级去向"], row["去向名称"])
        if key not in seen:
            seen.add(key)
            unique.append(row)
    return unique


def process_major(major: dict, delay: float) -> tuple[list[dict], dict]:
    error = ""
    detail: dict = {}
    try:
        detail = load_detail(major, delay)
        actual = direction_rows(major, detail, "已毕业人员从业方向", "occList")
        expected = direction_rows(major, detail, "在校生期望从业方向", "expOccList")
    except Exception as exc:
        actual, expected = [], []
        error = f"{type(exc).__name__}: {exc}"
    byfz = detail.get("byfzVo") or {}
    audit = {
        "专业代码": detail.get("zydm") or major.get("zydm", ""),
        "专业名称": detail.get("zymc") or major.get("zymc", ""),
        "专业类": detail.get("xkmc") or major.get("xk", ""),
        "已毕业去向数": sum(row["是否细分去向"] == "否" for row in actual),
        "期望去向数": sum(row["是否细分去向"] == "否" for row in expected),
        "已毕业数据口径": "专业类" if byfz.get("occXkmc") else "专业",
        "口径名称": byfz.get("occXkmc") or detail.get("zymc") or major.get("zymc", ""),
        "采集状态": "失败" if error else "成功",
        "错误信息": error,
        "专业页面ID": major["specId"],
    }
    return actual + expected, audit


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--delay", type=float, default=0.8, help="专业详情请求间隔秒数")
    parser.add_argument("--limit", type=int, default=0, help="仅采集前 N 个专业，0 表示全部")
    parser.add_argument("--workers", type=int, default=3, help="并发请求数")
    args = parser.parse_args()

    majors = load_catalog()
    if args.limit:
        majors = majors[: args.limit]
    print(f"目录包含 {len(majors)} 个普通本科专业", flush=True)

    rows: list[dict] = []
    audits: list[dict] = []
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        results = executor.map(lambda major: process_major(major, args.delay), majors)
        for index, (major_rows, audit) in enumerate(results, 1):
            rows.extend(major_rows)
            audits.append(audit)
            if index % 25 == 0 or index == len(majors):
                print(f"已处理 {index}/{len(majors)}，累计 {len(rows)} 条去向记录", flush=True)

    detail_fields = [
        "专业代码", "专业名称", "专业门类", "专业类", "学历层次", "去向类型", "数据口径",
        "口径名称", "展示顺序", "父级去向", "去向名称", "去向占比", "职业页面ID", "职业词典ID",
        "是否细分去向", "专业页面ID", "来源页面", "采集日期",
    ]
    audit_fields = [
        "专业代码", "专业名称", "专业类", "已毕业去向数", "期望去向数", "已毕业数据口径",
        "口径名称", "采集状态", "错误信息", "专业页面ID",
    ]
    raw_count = len(rows)
    rows = deduplicate(rows)
    write_csv(DETAIL_OUTPUT, rows, detail_fields)
    write_csv(AUDIT_OUTPUT, audits, audit_fields)
    failures = sum(row["采集状态"] == "失败" for row in audits)
    print(
        f"完成：{len(rows)} 条去向记录，去除源页面重复 {raw_count - len(rows)} 条；"
        f"{len(audits)} 个专业，失败 {failures} 个",
        flush=True,
    )


if __name__ == "__main__":
    main()
