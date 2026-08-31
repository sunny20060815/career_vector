#!/usr/bin/env python3
"""将职业分类大典层级表整理为推荐器可直接读取的职业明细表。"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path(
    "/Users/tianyou/Desktop/Projects/2026.4.7_课题申请材料/投稿/occupation_hierarchy_full_copy.xlsx"
)
OUTPUT = ROOT / "02_关系表" / "11_职业大典职业明细表"

# 仅修正能够由描述开头明确还原的抽取错误；其余存疑记录保留原文并停止展示。
NAME_FIXES = {
    "2-02-10-06": "嵌入式系统设计工程技术人员",
    "2-02-10-08": "信息系统运行维护工程技术人员",
    "4-02-01-01": "轨道交通列车司机",
    "4-04-05-06": "区块链应用操作员",
    "4-09-08-01": "保洁员",
    "5-05-01-02": "农业经理人",
    "5-05-03-01": "沼气工",
    "5-05-03-02": "农村节能员",
    "6-28-01-08": "余热余压利用系统操作工",
    "6-28-03-02": "水供应输排工",
}
TITLE_PATTERN = re.compile(
    r"^(.{0,35}?(?:工程技术人员|专业技术人员|专业人员|工作人员|操作人员|操作工|"
    r"服务员|管理员|技术员|分析师|设计师|管理师|工作者|演奏员|演员|代表|兽医|"
    r"法医|摊商|经纪人|代理人|主持人|指挥|导播|秘书|裁缝|计调|人员|司机|员|师|工|人))"
    r"(?=\s*(?:L/S|S)?\s*(?:从事|使用|在|接受|代表|操作|运用|以|依|经|对|进行|负责|"
    r"驾驶|带领|指挥|应用|维护|从业|制作))"
)


def clean_text(value: object) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return re.sub(r"^(?:L/S|S)\s+", "", text)


def title_from_description(description: str) -> str | None:
    match = TITLE_PATTERN.search(description)
    if not match:
        return None
    title = re.sub(r"\s+", "", match.group(1))
    if len(title) < 2 or re.search(r"[,，、;；]", title) or title in {"技术人员", "程技术人员", "人员", "作工", "司机"}:
        return None
    return title


def build(source: Path) -> pd.DataFrame:
    raw = pd.read_excel(source, dtype=str).fillna("")
    columns = {
        "major_class_code": "职业大类代码",
        "major_class_name": "职业大类名称",
        "middle_class_code": "职业中类代码",
        "middle_class_name": "职业中类名称",
        "minor_class_code": "职业小类代码",
        "minor_class_name": "职业小类名称",
        "occupation_code": "具体职业代码",
        "occupation_name": "具体职业名称_原始",
        "occupation_description": "具体职业描述_原始",
    }
    missing = set(columns) - set(raw.columns)
    if missing:
        raise ValueError(f"职业大典源表缺少字段：{sorted(missing)}")

    frame = raw[list(columns)].rename(columns=columns)
    for column in frame.columns:
        frame[column] = frame[column].map(clean_text)
    frame["具体职业描述"] = frame["具体职业描述_原始"].map(clean_text)
    recovered = frame["具体职业描述"].map(title_from_description)
    frame["具体职业名称"] = recovered.fillna(frame["具体职业名称_原始"])
    for code, name in NAME_FIXES.items():
        frame.loc[frame["具体职业代码"].eq(code), "具体职业名称"] = name
    frame["质量状态"] = "通过"
    frame["质量说明"] = "职业代码、名称和描述通过基础校验"

    code_ok = frame["具体职业代码"].str.match(r"^\d-\d{2}-\d{2}-\d{2}$")
    hierarchy_ok = frame.apply(
        lambda row: row["具体职业代码"].startswith(f"{row['职业小类代码']}-"), axis=1
    )
    incomplete_name = frame["具体职业名称"].isin({"技术人员", "程技术人员", "人员", "作工", "司机"})
    incomplete_name |= frame["具体职业名称"].str.match(r"^[A-Za-z]+(?:/S)?")
    empty = frame[["具体职业名称", "具体职业描述"]].eq("").any(axis=1)

    def reject(mask: pd.Series, reason: str) -> None:
        frame.loc[mask, "质量状态"] = "需复核"
        frame.loc[mask, "质量说明"] = reason

    reject(~code_ok, "具体职业代码格式异常")
    reject(~hierarchy_ok, "具体职业代码与职业小类代码不一致")
    reject(incomplete_name, "具体职业名称疑似截断")
    reject(empty, "具体职业名称或描述为空")
    fixed = frame["具体职业名称"].ne(frame["具体职业名称_原始"])
    frame.loc[fixed, "质量状态"] = "通过（明确修正）"
    frame.loc[fixed, "质量说明"] = "依据职业描述开头的完整称谓还原被截断或错位的具体职业名称"
    frame["是否可展示"] = frame["质量状态"].str.startswith("通过").map({True: "是", False: "否"})
    frame["数据来源"] = "《中华人民共和国职业分类大典（2022年版）》结构化提取表"
    return frame.sort_values(["职业小类代码", "具体职业代码"]).reset_index(drop=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    args = parser.parse_args()
    frame = build(args.source)
    frame.to_csv(OUTPUT.with_suffix(".csv"), index=False, encoding="utf-8-sig")
    frame.to_parquet(OUTPUT.with_suffix(".parquet"), index=False)
    print(
        f"职业明细 {len(frame)} 条，覆盖 {frame['职业小类代码'].nunique()} 个职业小类；"
        f"可展示 {(frame['是否可展示'] == '是').sum()} 条，需复核 {(frame['是否可展示'] == '否').sum()} 条。"
    )


if __name__ == "__main__":
    main()
