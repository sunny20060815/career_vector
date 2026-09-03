#!/usr/bin/env python3
"""用既有职业大典匹配流水线将专业去向映射到职业小类。"""

from __future__ import annotations

import argparse
import csv
import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "data" / "02_关系表" / "12_专业就业去向表.csv"
OUTPUT = ROOT / "data" / "02_关系表" / "13_专业职业先验表.csv"
DEFAULT_MATCHER = Path(
    "/Users/tianyou/Desktop/Projects/2026.4.7_课题申请材料/投稿/职业大典匹配流水线/"
    "match_to_occupation_minor.py"
)
DEFAULT_CATALOG = Path(
    "/Users/tianyou/Desktop/Projects/2026.4.7_课题申请材料/投稿/occupation_hierarchy_full_copy.xlsx"
)

NON_OCCUPATION_ROUTES = {
    "考研": "升学",
    "出国": "升学或出国",
    "公务员": "公共部门",
    "事业单位人员": "公共部门",
    "参军": "参军入伍",
}
GENERIC_DESTINATIONS = {
    "公务员", "事业单位人员", "销售代表", "行政专员/助理", "助理/秘书/文员",
    "人力资源专员/助理", "项目专员/助理", "市场专员/助理", "采购专员/助理",
    "客户代表", "大客户销售代表", "后勤人员",
}
DIRECT_OVERRIDES = {
    "小学教师": ("2-08-02", "中小学教师"),
    "初中教师": ("2-08-02", "中小学教师"),
    "高中教师": ("2-08-02", "中小学教师"),
    "中学教师": ("2-08-02", "中小学教师"),
    "职业技术教师": ("2-08-02", "中小学教师"),
    "中等职业学校教师": ("2-08-02", "中小学教师"),
    "幼教": ("2-08-03", "幼儿园教师"),
    "幼儿园教师": ("2-08-03", "幼儿园教师"),
    "特殊教育教师": ("2-08-04", "特殊教育教师"),
    "大学教师": ("2-08-01", "高等学校教师"),
    "会计人员": ("2-06-03", "会计专业人员"),
    "会计/会计师": ("2-06-03", "会计专业人员"),
    "会计助理/文员": ("2-06-03", "会计专业人员"),
    "财务助理": ("2-06-03", "会计专业人员"),
    "出纳员": ("2-06-03", "会计专业人员"),
    "审计人员": ("2-06-04", "审计专业人员"),
    "审计专员/助理": ("2-06-04", "审计专业人员"),
    "证券分析师": ("2-06-11", "证券期货基金专业人员"),
}


def load_matcher(path: Path):
    spec = importlib.util.spec_from_file_location("occupation_matcher", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"无法加载职业匹配流水线：{path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def tier(row: dict[str, str]) -> str:
    name = row["去向名称"]
    if name in NON_OCCUPATION_ROUTES or name in GENERIC_DESTINATIONS:
        return "通用去向"
    rank = int(row["展示顺序"] or 999)
    if row["去向类型"] == "已毕业人员从业方向" and rank <= 5:
        return "核心去向"
    return "延伸去向"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--matcher", type=Path, default=DEFAULT_MATCHER)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    args = parser.parse_args()
    matcher = load_matcher(args.matcher)
    candidates = matcher.load_occupation_candidates(args.catalog)
    records = matcher.build_occupation_records(candidates)
    idf, inverted = matcher.build_tfidf(candidates)
    desc_idf, desc_inverted = matcher.build_description_tfidf(candidates)
    occ_idf, occ_inverted = matcher.build_occupation_tfidf(records)
    matchers = matcher.build_rule_matchers(candidates, [])

    source_rows = [
        row for row in csv.DictReader(SOURCE.open(encoding="utf-8-sig"))
        if row["是否细分去向"] == "否"
    ]
    output_rows: list[dict[str, object]] = []
    for row in source_rows:
        name = row["去向名称"]
        route = NON_OCCUPATION_ROUTES.get(name, "就业")
        mapped_code = ""
        mapped_name = ""
        score = ""
        basis = "非具体职业路径"
        confidence = "不适用"
        usable = "否"
        if name in DIRECT_OVERRIDES:
            mapped_code, mapped_name = DIRECT_OVERRIDES[name]
            score, basis, confidence, usable = "100", "人工明确规则", "高", "是"
        elif route == "就业":
            result = matcher.rank_row(
                {
                    matcher.JOB_COL: name,
                    matcher.PRIMARY_COL: row["专业类"],
                    matcher.DESC_COL: f"{row['专业名称']} {row['专业门类']} {row['专业类']}",
                },
                candidates,
                idf,
                inverted,
                desc_idf,
                desc_inverted,
                records,
                occ_idf,
                occ_inverted,
                matchers,
            )
            mapped_code = result["minor_class_code"]
            mapped_name = result["minor_class_name"]
            score = result["职业大典匹配分数"]
            basis = result["职业大典匹配依据"]
            review = result["职业大典是否需要人工复核"] == "1"
            fallback = mapped_name == "不便分类的其他从业人员"
            confidence = "低" if review or fallback else "高" if float(score) >= 32 else "中"
            usable = "是" if confidence in {"高", "中"} else "否"
        output_rows.append(
            {
                **row,
                "发展路径类型": route,
                "专业去向层级": tier(row),
                "职业小类代码": mapped_code,
                "职业小类名称": mapped_name,
                "映射分数": score,
                "映射依据": basis,
                "映射置信度": confidence,
                "是否用于职业排序": usable,
            }
        )

    fields = list(output_rows[0])
    with OUTPUT.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(output_rows)
    usable_count = sum(row["是否用于职业排序"] == "是" for row in output_rows)
    low_count = sum(row["映射置信度"] == "低" for row in output_rows)
    print(f"生成 {len(output_rows)} 条专业职业先验，可用于排序 {usable_count} 条，低置信待复核 {low_count} 条")


if __name__ == "__main__":
    main()
