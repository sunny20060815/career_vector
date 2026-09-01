#!/usr/bin/env python3
"""根据一个或多个技能推荐职业、城市和下一项技能。"""

from __future__ import annotations

import argparse
import difflib
import json
import re
import unicodedata
from itertools import combinations
from pathlib import Path

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
CANONICAL_FIXES = {
    "Microsoft SQL Server": "SQL Server",
    "IATF16949": "IATF 16949",
}
SKILL_TYPE_WEIGHTS = {
    "专业知识与行业经验": 1.35,
    "具体专业技能": 1.25,
    "工具软件与技术平台": 1.15,
    "方法、标准与流程": 1.10,
    "非技术性能力": 0.65,
}
SCHOOL_ALIASES = {"首都经济贸易大学", "首经贸", "cueb"}


def _norm(value: object) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).strip().lower()
    return re.sub(r"[\s_\-—－/\\（）()]+", "", text)


def _number(series: pd.Series, default: float = 0.0) -> pd.Series:
    return pd.to_numeric(series, errors="coerce").replace([np.inf, -np.inf], np.nan).fillna(default)


def _percentile(series: pd.Series) -> pd.Series:
    values = _number(series)
    return values.rank(method="average", pct=True) if len(values) else values


def _relative(series: pd.Series) -> pd.Series:
    """按组内最大值归一化，保留绝对差异，避免小数值因排名靠前被高估。"""
    values = _number(series).clip(lower=0)
    maximum = values.max()
    return values / maximum if maximum > 0 else values


class SkillRecommender:
    """轻量匹配器：单项证据为主，已观测技能组合为加分项。"""

    def __init__(self, root: Path = ROOT):
        self.root = Path(root)
        core = self.root / "01_核心表"
        rel = self.root / "02_关系表"

        self.skills = pd.read_parquet(core / "01_技能主表.parquet")
        self.aliases = pd.read_parquet(core / "02_技能别名表.parquet")
        self.pairs = pd.read_parquet(core / "03_技能组合关系表.parquet")
        self.occ = pd.read_parquet(rel / "04_职业技能关系表.parquet")
        self.city = pd.read_parquet(rel / "05_城市技能关系表.parquet")
        self.pair_occ = pd.read_parquet(rel / "06_技能组合职业关系表.parquet")
        self.pair_city = pd.read_parquet(rel / "07_技能组合城市关系表.parquet")
        ai_cooccurrence_path = rel / "08_AI技能共现关系表.parquet"
        self.ai_cooccurrence = (
            pd.read_parquet(ai_cooccurrence_path)
            if ai_cooccurrence_path.exists()
            else pd.DataFrame(columns=["标准技能名称", "与AI共现强度_NPMI"])
        )
        program_path = rel / "09_专业培养方案主表.parquet"
        major_skill_path = rel / "10_专业技能关系表.parquet"
        self.programs = pd.read_parquet(program_path) if program_path.exists() else pd.DataFrame()
        self.major_skills = pd.read_parquet(major_skill_path) if major_skill_path.exists() else pd.DataFrame()
        occupation_catalog_path = rel / "11_职业大典职业明细表.parquet"
        self.occupation_catalog = (
            pd.read_parquet(occupation_catalog_path)
            if occupation_catalog_path.exists()
            else pd.DataFrame()
        )

        self.valid_skills = set(self.skills["标准技能名称"].dropna().astype(str))
        self.alias_map = self._build_alias_map()
        self.pair_lookup = self._build_pair_lookup()
        self.skill_index = self.skills.set_index("标准技能名称", drop=False)

    def resolve_major(self, major: str, cohort: str | int | None = None, school: str = "首都经济贸易大学") -> pd.Series:
        """Resolve a major name or a natural sentence such as '我是经济学专业的学生'."""
        if self.programs.empty:
            raise ValueError("专业培养方案关系表尚未接入")
        if _norm(school) not in {_norm(x) for x in SCHOOL_ALIASES}:
            raise ValueError(f"当前仅接入首都经济贸易大学，无法识别学校：{school}")

        frame = self.programs.copy()
        if cohort is not None:
            match = re.search(r"20\d{2}", str(cohort))
            if not match:
                raise ValueError(f"无法识别年级：{cohort}")
            frame = frame[frame["年级"].astype(str).str.startswith(match.group())]
            if frame.empty:
                raise ValueError(f"当前没有{match.group()}级培养方案")

        query = _norm(major)
        aliases: dict[int, list[str]] = {}
        for index, row in frame.iterrows():
            values = [row.get("专业"), *str(row.get("专业别名", "")).split("|")]
            aliases[index] = list(dict.fromkeys(_norm(x) for x in values if _norm(x)))

        exact = [index for index, values in aliases.items() if query in values]
        candidates = exact
        if not candidates:
            contained = [
                (index, max((len(alias) for alias in values if alias in query), default=0))
                for index, values in aliases.items()
            ]
            best = max((length for _, length in contained), default=0)
            candidates = [index for index, length in contained if length == best and best >= 2]

        if not candidates:
            names = frame["专业"].dropna().astype(str).unique().tolist()
            suggestions = difflib.get_close_matches(str(major), names, n=5, cutoff=0.35)
            raise ValueError(f"未识别专业：{major}。相近专业：{suggestions}")

        matched = frame.loc[candidates].copy()
        names = matched["专业"].dropna().astype(str).unique().tolist()
        if len(names) > 1:
            raise ValueError(f"专业名称不够具体，请从以下专业中选择：{names[:8]}")
        return matched.sort_values("年级", ascending=False).iloc[0]

    def major_skill_profile(self, program_key: str, limit: int = 12) -> pd.DataFrame:
        frame = self.major_skills[
            self.major_skills["专业主键"].astype(str).eq(str(program_key))
            & self.major_skills["是否代表性技能"].eq("是")
        ].copy()
        return frame.sort_values(["专业内排名", "技能供给区分度得分"], ascending=[True, False]).head(limit)

    def _canonical(self, value: object) -> str:
        value = CANONICAL_FIXES.get(str(value), str(value))
        return value if value in self.valid_skills else str(value)

    def _build_alias_map(self) -> dict[str, list[str]]:
        mapping: dict[str, set[str]] = {}

        def add(alias: object, canonical: object) -> None:
            key = _norm(alias)
            canonical = self._canonical(canonical)
            if key and canonical in self.valid_skills:
                mapping.setdefault(key, set()).add(canonical)

        for _, row in self.skills.iterrows():
            add(row.get("标准技能名称"), row.get("标准技能名称"))
            add(row.get("技能展示名称"), row.get("标准技能名称"))
        for _, row in self.aliases.iterrows():
            canonical = row.get("标准技能名称", row.get("canonical_skill"))
            add(row.get("技能别名", row.get("alias")), canonical)
            add(row.get("标准技能名称"), canonical)

        return {key: sorted(values) for key, values in mapping.items()}

    def _build_pair_lookup(self) -> dict[tuple[str, str], str]:
        frame = self.pairs[self.pairs["组合层级"].eq("标准技能组合")].copy()
        lookup: dict[tuple[str, str], str] = {}
        for _, row in frame.iterrows():
            left = self._canonical(row.get("标准技能名称_技能一", row.get("技能一名称")))
            right = self._canonical(row.get("标准技能名称_技能二", row.get("技能二名称")))
            if left in self.valid_skills and right in self.valid_skills and left != right:
                lookup[tuple(sorted((left, right)))] = str(row["技能组合编号"])
        return lookup

    @staticmethod
    def _split_inputs(values: list[str]) -> list[str]:
        parts: list[str] = []
        for value in values:
            parts.extend(x.strip() for x in re.split(r"[,，;；、]+|(?<!\+)\+(?!\+)", value) if x.strip())
        return list(dict.fromkeys(parts))

    def resolve_skills(self, values: list[str]) -> tuple[list[str], dict[str, list[str]]]:
        resolved: list[str] = []
        unresolved: dict[str, list[str]] = {}
        keys = list(self.alias_map)

        for raw in self._split_inputs(values):
            key = _norm(raw)
            candidates = self.alias_map.get(key, [])
            if len(candidates) == 1:
                resolved.append(candidates[0])
                continue
            if len(candidates) > 1:
                exact = [x for x in candidates if _norm(x) == key]
                if len(exact) == 1:
                    resolved.append(exact[0])
                    continue
                unresolved[raw] = candidates[:5]
                continue

            close_keys = difflib.get_close_matches(key, keys, n=8, cutoff=0.76)
            suggestions: list[str] = []
            for close_key in close_keys:
                suggestions.extend(self.alias_map[close_key])
            unresolved[raw] = list(dict.fromkeys(suggestions))[:5]

        return list(dict.fromkeys(resolved)), unresolved

    def _selected_pairs(self, skills: list[str]) -> list[str]:
        return [
            self.pair_lookup[pair]
            for pair in (tuple(sorted(x)) for x in combinations(skills, 2))
            if pair in self.pair_lookup
        ]

    @staticmethod
    def _first_numeric(frame: pd.DataFrame, columns: list[str]) -> pd.Series:
        result = pd.Series(np.nan, index=frame.index, dtype=float)
        for column in columns:
            if column in frame:
                result = result.fillna(pd.to_numeric(frame[column], errors="coerce"))
        return result

    def match_occupations(self, skills: list[str], top_n: int = 10) -> pd.DataFrame:
        frame = self.occ[self.occ["标准技能名称"].isin(skills)].copy()
        frame = frame[~frame["职业小类名称"].astype(str).str.contains("不便分类", na=False)]
        if frame.empty:
            return pd.DataFrame()

        frame["_概率"] = frame.groupby("标准技能名称")["平滑后职业匹配概率"].transform(_relative)
        frame["_集中度"] = frame.groupby("标准技能名称")["职业技能相对集中度"].transform(
            lambda x: _relative(np.log1p(_number(x)))
        )
        future_col = "2028年职业内技能需求占比预测"
        frame["_未来需求"] = frame.groupby("标准技能名称")[future_col].transform(_relative)
        # 专业集中度决定职业方向；岗位支持数用于压低极小样本产生的虚高集中度。
        support = _number(frame["关联岗位数"])
        frame["_可靠性"] = np.sqrt(support / (support + 20))
        frame["_单项证据"] = (
            0.30 * frame["_概率"] + 0.45 * frame["_集中度"] + 0.25 * frame["_未来需求"]
        ) * frame["_可靠性"]
        frame["_技能权重"] = frame["技能一级类型"].map(SKILL_TYPE_WEIGHTS).fillna(1.0)
        frame["_是否关键技能"] = ~frame["技能一级类型"].eq("非技术性能力")
        frame["_有效技能"] = frame["标准技能名称"].where(frame["_单项证据"].ge(0.12))
        frame["_有效证据"] = (frame["_单项证据"] * frame["_技能权重"]).where(
            frame["_单项证据"].ge(0.12), 0.0
        )
        frame["_有效权重"] = frame["_技能权重"].where(frame["_单项证据"].ge(0.12), 0.0)
        frame["_关键有效权重"] = frame["_技能权重"].where(
            frame["_是否关键技能"] & frame["_单项证据"].ge(0.12), 0.0
        )

        input_types = self.skill_index.loc[skills, "技能一级类型"]
        input_weights = input_types.map(SKILL_TYPE_WEIGHTS).fillna(1.0)
        total_weight = float(input_weights.sum())
        key_weight = float(input_weights[~input_types.eq("非技术性能力")].sum())

        grouped = frame.groupby(["职业小类代码", "职业小类名称"], as_index=False).agg(
            单项证据合计=("_有效证据", "sum"),
            有效技能权重=("_有效权重", "sum"),
            关键有效权重=("_关键有效权重", "sum"),
            命中技能数=("_有效技能", "nunique"),
            命中技能=("_有效技能", lambda x: "、".join(sorted(set(x.dropna())))),
        )
        grouped = grouped[grouped["命中技能数"].gt(0)].copy()
        grouped["技能覆盖率"] = grouped["命中技能数"] / len(skills)
        grouped["加权技能覆盖率"] = grouped["有效技能权重"] / total_weight
        grouped["关键技能覆盖率"] = (
            grouped["关键有效权重"] / key_weight if key_weight else grouped["加权技能覆盖率"]
        )
        grouped["单项证据得分"] = grouped["单项证据合计"] / total_weight
        grouped["_基础分"] = (
            0.55 * grouped["单项证据得分"]
            + 0.25 * grouped["加权技能覆盖率"]
            + 0.20 * grouped["关键技能覆盖率"]
        )

        pair_ids = self._selected_pairs(skills)
        grouped["组合证据得分"] = 0.0
        grouped["命中组合数"] = 0
        if pair_ids:
            pair_frame = self.pair_occ[self.pair_occ["技能组合编号"].astype(str).isin(pair_ids)].copy()
            if not pair_frame.empty:
                pair_frame["_组合证据"] = (
                    0.65 * _percentile(pair_frame["掌握组合后进入该职业概率"])
                    + 0.35 * _percentile(np.log1p(_number(pair_frame["职业组合相对集中度"])))
                )
                pair_grouped = pair_frame.groupby(["职业小类代码", "职业小类名称"], as_index=False).agg(
                    组合证据得分=("_组合证据", "mean"),
                    命中组合数=("技能组合编号", "nunique"),
                )
                grouped = grouped.drop(columns=["组合证据得分", "命中组合数"]).merge(
                    pair_grouped, on=["职业小类代码", "职业小类名称"], how="left"
                )
                grouped[["组合证据得分", "命中组合数"]] = grouped[["组合证据得分", "命中组合数"]].fillna(0)

        pair_weight = 0.20 if pair_ids else 0.0
        grouped["匹配分数"] = 100 * (
            (1 - pair_weight) * grouped["_基础分"] + pair_weight * grouped["组合证据得分"]
        ) * (0.75 + 0.25 * grouped["关键技能覆盖率"])
        result = grouped.sort_values(["匹配分数", "技能覆盖率"], ascending=False).head(top_n).copy()
        result.insert(0, "排名", range(1, len(result) + 1))
        result["匹配分数"] = result["匹配分数"].round(1)
        result["技能覆盖率"] = (100 * result["技能覆盖率"]).round(1)
        result["加权技能覆盖率"] = (100 * result["加权技能覆盖率"]).round(1)
        result["关键技能覆盖率"] = (100 * result["关键技能覆盖率"]).round(1)
        result["单项证据得分"] = (100 * result["单项证据得分"]).round(1)
        result["组合证据得分"] = (100 * result["组合证据得分"]).round(1)
        if not self.occupation_catalog.empty:
            catalog = self.occupation_catalog[self.occupation_catalog["是否可展示"].eq("是")]
            catalog_summary = catalog.groupby("职业小类代码", as_index=False).agg(
                职业大典具体职业数=("具体职业代码", "nunique"),
                职业大典包含职业=("具体职业名称", lambda x: "、".join(x.astype(str))),
            )
            result = result.merge(catalog_summary, on="职业小类代码", how="left")
            result["职业大典具体职业数"] = result["职业大典具体职业数"].fillna(0).astype(int)
            result["职业大典包含职业"] = result["职业大典包含职业"].fillna("")
        return result[[
            "排名", "职业小类代码", "职业小类名称", "匹配分数", "技能覆盖率",
            "加权技能覆盖率", "关键技能覆盖率", "命中技能", "命中组合数",
            "单项证据得分", "组合证据得分", "职业大典具体职业数", "职业大典包含职业",
        ]]

    def occupation_catalog_payload(
        self, occupations: pd.DataFrame, top_n: int = 5
    ) -> list[dict[str, object]]:
        """展开推荐职业小类所含的具体职业及职业大典职责描述。"""
        if self.occupation_catalog.empty or occupations.empty:
            return []
        available = self.occupation_catalog[self.occupation_catalog["是否可展示"].eq("是")]
        output: list[dict[str, object]] = []
        for _, occupation in occupations.head(top_n).iterrows():
            details = available[
                available["职业小类代码"].eq(str(occupation["职业小类代码"]))
            ].sort_values("具体职业代码")
            output.append({
                "职业小类代码": occupation["职业小类代码"],
                "职业小类名称": occupation["职业小类名称"],
                "推荐排名": int(occupation["排名"]),
                "具体职业数": int(len(details)),
                "包含的具体职业": [
                    {
                        "具体职业代码": row["具体职业代码"],
                        "具体职业名称": row["具体职业名称"],
                        "职业大典描述": row["具体职业描述"],
                    }
                    for _, row in details.iterrows()
                ],
                "数据来源": "《中华人民共和国职业分类大典（2022年版）》",
            })
        return output

    def match_cities(self, skills: list[str], year: int = 2028, top_n: int = 10) -> pd.DataFrame:
        frame = self.city[
            self.city["标准技能名称"].isin(skills) & self.city["预测年份"].eq(year)
        ].copy()
        if frame.empty:
            return pd.DataFrame()

        # 城市技能强度适合衡量“哪里更集中”，但会高估样本规模很小的城市。
        # 因而再加入技能主表中的预测需求量前五城市，兼顾集中度与市场容量。
        volume: dict[tuple[str, str], float] = {}
        for skill in skills:
            if skill not in self.skill_index.index:
                continue
            skill_row = self.skill_index.loc[skill]
            for rank in range(1, 6):
                city_col = f"{year}年预测需求量第{rank}城市"
                value_col = f"{year}年预测需求量第{rank}城市_需求量指数"
                city = skill_row.get(city_col)
                value = pd.to_numeric(pd.Series([skill_row.get(value_col)]), errors="coerce").iloc[0]
                if pd.notna(city) and pd.notna(value):
                    volume[(skill, str(city))] = float(value)

        frame["_市场容量原值"] = [volume.get((str(skill), str(city)), 0.0) for skill, city in zip(frame["标准技能名称"], frame["城市"])]
        frame["_需求"] = frame.groupby("标准技能名称")["每万岗位需求数预测"].transform(_relative)
        frame["_占比"] = frame.groupby("标准技能名称")["城市内技能需求占比预测"].transform(_relative)
        frame["_市场容量"] = frame.groupby("标准技能名称")["_市场容量原值"].transform(_relative)
        # 推荐“去哪里”时优先考虑预测岗位总量，避免小样本城市因局部占比高而排在首位。
        frame["_单项证据"] = 0.20 * frame["_需求"] + 0.10 * frame["_占比"] + 0.70 * frame["_市场容量"]
        grouped = frame.groupby("城市", as_index=False).agg(
            单项证据合计=("_单项证据", "sum"),
            命中技能数=("标准技能名称", "nunique"),
            命中技能=("标准技能名称", lambda x: "、".join(sorted(set(x)))),
            技能需求综合强度_每万岗位=("每万岗位需求数预测", "sum"),
            预测需求量前五城市命中技能数=("_市场容量原值", lambda x: int((_number(x) > 0).sum())),
        )
        grouped["技能覆盖率"] = grouped["命中技能数"] / len(skills)
        grouped["_基础分"] = 0.70 * grouped["单项证据合计"] / len(skills) + 0.30 * grouped["技能覆盖率"]

        pair_ids = self._selected_pairs(skills)
        grouped["组合证据得分"] = 0.0
        if pair_ids:
            pair_frame = self.pair_city[self.pair_city["技能组合编号"].astype(str).isin(pair_ids)].copy()
            if not pair_frame.empty:
                pair_frame["_组合证据"] = (
                    0.65 * _percentile(pair_frame["掌握组合后进入该城市概率"])
                    + 0.35 * _percentile(np.log1p(_number(pair_frame["城市组合相对集中度"])))
                )
                pair_grouped = pair_frame.groupby("城市", as_index=False).agg(组合证据得分=("_组合证据", "mean"))
                grouped = grouped.drop(columns="组合证据得分").merge(pair_grouped, on="城市", how="left")
                grouped["组合证据得分"] = grouped["组合证据得分"].fillna(0)

        pair_weight = 0.20 if pair_ids else 0.0
        grouped["匹配分数"] = 100 * ((1 - pair_weight) * grouped["_基础分"] + pair_weight * grouped["组合证据得分"])
        result = grouped.sort_values("匹配分数", ascending=False).head(top_n).copy()
        result.insert(0, "排名", range(1, len(result) + 1))
        result["匹配分数"] = result["匹配分数"].round(1)
        result["技能覆盖率"] = (100 * result["技能覆盖率"]).round(1)
        result["技能需求综合强度_每万岗位"] = result["技能需求综合强度_每万岗位"].round(1)
        return result[[
            "排名", "城市", "匹配分数", "技能覆盖率", "命中技能",
            "技能需求综合强度_每万岗位", "预测需求量前五城市命中技能数",
        ]]

    def skill_profile(self, skills: list[str], year: int = 2028) -> pd.DataFrame:
        """逐项返回需求、工资、人力资本门槛、AI暴露和预测指标。"""
        frame = self.skills[self.skills["标准技能名称"].isin(skills)].copy()
        if frame.empty:
            return frame

        ai_columns = [
            "标准技能名称", "与AI共现强度_NPMI", "历史AI协同占比", "AI共现提升度",
        ]
        available_ai_columns = [x for x in ai_columns if x in self.ai_cooccurrence]
        frame = frame.merge(
            self.ai_cooccurrence[available_ai_columns], on="标准技能名称", how="left"
        )
        valid_npmi = pd.to_numeric(
            self.ai_cooccurrence.get("与AI共现强度_NPMI"), errors="coerce"
        ).dropna()
        median = valid_npmi.quantile(0.50) if not valid_npmi.empty else np.nan
        upper = valid_npmi.quantile(0.75) if not valid_npmi.empty else np.nan

        def ai_cooccurrence_level(row: pd.Series) -> str:
            if str(row.get("是否AI核心技能")) == "是":
                return "AI核心技能本身"
            value = pd.to_numeric(pd.Series([row.get("与AI共现强度_NPMI")]), errors="coerce").iloc[0]
            if pd.isna(value):
                return "暂无观测"
            if value <= 0:
                return "弱或负向共现"
            if value >= upper:
                return "高"
            if value >= median:
                return "中"
            return "低"

        frame["与AI技能的共现强度等级"] = frame.apply(ai_cooccurrence_level, axis=1)
        if "历史AI协同占比" in frame:
            frame["历史AI协同占比_%"] = 100 * pd.to_numeric(frame["历史AI协同占比"], errors="coerce")

        frame["2025年本科及以上占比_%"] = 100 * sum(
            (_number(frame.get(f"2025年{x}学历占比", pd.Series(0, index=frame.index))) for x in ["本科", "硕士", "博士"]),
            start=pd.Series(0.0, index=frame.index),
        )
        frame["2025年研究生占比_%"] = 100 * sum(
            (_number(frame.get(f"2025年{x}学历占比", pd.Series(0, index=frame.index))) for x in ["硕士", "博士"]),
            start=pd.Series(0.0, index=frame.index),
        )
        frame["2025年岗位需求率_%"] = _number(frame["2025年每万岗位需求数"]) / 100
        frame[f"{year}年岗位需求率预测_%"] = 100 * _number(frame[f"{year}年岗位需求占比预测"])
        frame["2025至预测年需求增长率_%"] = 100 * (
            _number(frame[f"{year}年岗位需求每万岗位数预测"]) / _number(frame["2025年每万岗位需求数"]).replace(0, np.nan) - 1
        )
        current_salary = pd.to_numeric(frame["2025年月薪中位数"], errors="coerce").replace(0, np.nan)
        future_salary = pd.to_numeric(frame[f"{year}年月薪中位数预测"], errors="coerce")
        frame["2025至预测年工资变化_%"] = 100 * (future_salary / current_salary - 1)
        current_experience = pd.to_numeric(frame["2025年最低经验年限均值"], errors="coerce")
        future_experience = pd.to_numeric(frame[f"{year}年最低经验年限均值预测"], errors="coerce")
        frame["2025至预测年经验变化_年"] = future_experience - current_experience
        columns = [
            "标准技能名称", "技能展示名称", "技能一级类型", "技能簇名称", "是否AI核心技能",
            "2025年岗位需求率_%", f"{year}年岗位需求率预测_%",
            "2025年每万岗位需求数", f"{year}年岗位需求每万岗位数预测", "2025至预测年需求增长率_%", "需求趋势判断",
            "2025年月薪中位数", f"{year}年月薪中位数预测", "2025至预测年工资变化_%",
            "2025年最低经验年限均值", f"{year}年最低经验年限均值预测", "2025至预测年经验变化_年",
            "2025年本科及以上占比_%", "2025年研究生占比_%", "关联职业加权AI暴露度",
            "主要AI渗透率职业组", "与AI共现强度_NPMI", "与AI技能的共现强度等级",
            "历史AI协同占比_%", "AI共现提升度", "预测可信度等级", f"{year}年需求预测模型",
            f"{year}年月薪中位数预测模型", f"{year}年最低经验年限均值预测模型",
        ]
        result = frame[[x for x in columns if x in frame]].copy()
        result = result.rename(columns={"与AI共现强度_NPMI": "与AI技能的共现强度"})
        order = {skill: index for index, skill in enumerate(skills)}
        result["_order"] = result["标准技能名称"].map(order)
        result = result.sort_values("_order").drop(columns="_order")
        numeric = result.select_dtypes(include="number").columns
        result[numeric] = result[numeric].round(2)
        return result

    def combination_profile(self, skills: list[str]) -> pd.DataFrame:
        """返回输入技能的全部两两组合；无直接观测时明确标记为单项聚合。"""
        records: list[dict[str, object]] = []
        standard = self.pairs[self.pairs["组合层级"].eq("标准技能组合")].copy()
        standard["_键"] = standard.apply(
            lambda row: tuple(sorted((self._canonical(row["标准技能名称_技能一"]), self._canonical(row["标准技能名称_技能二"])))),
            axis=1,
        )
        by_key = {key: group.iloc[0] for key, group in standard.groupby("_键", sort=False)}

        for left, right in combinations(skills, 2):
            key = tuple(sorted((left, right)))
            row = by_key.get(key)
            record: dict[str, object] = {
                "技能一": left,
                "技能二": right,
                "技能组合": f"{left}+{right}",
                "有直接组合观测": "是" if row is not None else "否",
            }
            if row is not None:
                def value(columns: list[str]) -> float:
                    for column in columns:
                        number = pd.to_numeric(pd.Series([row.get(column)]), errors="coerce").iloc[0]
                        if pd.notna(number):
                            return float(number)
                    return np.nan

                p_value = value(["互补效应BH调整p值", "工资互补BH调整p值_all", "工资互补BH调整p值_recent"])
                demand_rate_2025 = value(["2025组合需求率"])
                demand_rate_future = value(["组合需求率_2028", "2028组合需求率预测"])
                demand_growth = (
                    100 * (demand_rate_future / demand_rate_2025 - 1)
                    if pd.notna(demand_rate_2025) and demand_rate_2025 > 0 and pd.notna(demand_rate_future)
                    else np.nan
                )
                if pd.isna(demand_growth):
                    demand_direction = "不可判断"
                elif demand_growth > 0:
                    demand_direction = "上升"
                elif demand_growth < 0:
                    demand_direction = "下降"
                else:
                    demand_direction = "基本稳定"
                record.update({
                    "技能组合编号": row.get("技能组合编号"),
                    "历史共现强度": value(["标准化共现强度_NPMI", "NPMI_2016_2025", "历史共现相似度"]),
                    "工资互补效应_%": value(["工资互补效应_%", "工资互补效应_all_%", "工资互补效应_recent_%", "strict_complement_pct"]),
                    "工资互补调整后p值": p_value,
                    "工资互补是否显著": "是" if pd.notna(p_value) and p_value < 0.05 else "否",
                    "2025年组合需求率_%": 100 * demand_rate_2025,
                    "2028年组合需求率预测_%": 100 * demand_rate_future,
                    "2025年组合需求强度_每万岗位": 10000 * demand_rate_2025,
                    "2028年组合需求强度预测_每万岗位": 10000 * demand_rate_future,
                    "2025至2028年需求增长率_%": demand_growth,
                    "组合需求趋势": demand_direction,
                    "覆盖职业小类数": value(["覆盖职业小类数", "有效职业广度"]),
                    "覆盖城市数": value(["覆盖城市数"]),
                    "互补证据等级": row.get("互补证据等级") or row.get("证据等级"),
                    "证据说明": "直接组合证据可用",
                })
            else:
                record.update({
                    "技能组合编号": None,
                    "历史共现强度": np.nan,
                    "工资互补效应_%": np.nan,
                    "工资互补调整后p值": np.nan,
                    "工资互补是否显著": "不可判断",
                    "2025年组合需求率_%": np.nan,
                    "2028年组合需求率预测_%": np.nan,
                    "2025年组合需求强度_每万岗位": np.nan,
                    "2028年组合需求强度预测_每万岗位": np.nan,
                    "2025至2028年需求增长率_%": np.nan,
                    "组合需求趋势": "不可判断",
                    "覆盖职业小类数": np.nan,
                    "覆盖城市数": np.nan,
                    "互补证据等级": None,
                    "证据说明": "暂无直接组合观测；职业、城市与前景采用单项证据聚合",
                })
            records.append(record)
        result = pd.DataFrame(records)
        numeric = result.select_dtypes(include="number").columns
        result[numeric] = result[numeric].round(3)
        return result

    def portfolio_summary(
        self,
        skills: list[str],
        profile: pd.DataFrame,
        combination_profile: pd.DataFrame,
        occupations: pd.DataFrame,
        cities: pd.DataFrame,
        year: int = 2028,
    ) -> pd.DataFrame:
        """将任意数量、任意类型技能汇总为一个可供大模型直接读取的组合画像。"""
        source = self.skills[self.skills["标准技能名称"].isin(skills)].copy()
        source = source.merge(
            self.ai_cooccurrence[[
                x for x in ["标准技能名称", "与AI共现强度_NPMI", "历史AI协同占比"]
                if x in self.ai_cooccurrence
            ]],
            on="标准技能名称",
            how="left",
        )
        total_pairs = len(skills) * (len(skills) - 1) // 2
        observed = int((combination_profile.get("有直接组合观测", pd.Series(dtype=str)) == "是").sum())
        types = source["技能一级类型"].fillna("未分类").value_counts().to_dict()
        clusters = source["技能簇名称"].dropna().astype(str).unique().tolist()

        def mean(column: str) -> float:
            return float(pd.to_numeric(source[column], errors="coerce").mean()) if column in source else np.nan

        salary_2025 = mean("2025年月薪中位数")
        salary_future = mean(f"{year}年月薪中位数预测")
        demand_2025 = mean("2025年每万岗位需求数")
        demand_future = mean(f"{year}年岗位需求每万岗位数预测")
        demand_change = demand_future - demand_2025
        demand_growth = 100 * demand_change / demand_2025 if demand_2025 else np.nan
        demand_rate_2025 = demand_2025 / 100
        demand_rate_future = 100 * mean(f"{year}年岗位需求占比预测")
        source["_需求变化"] = (
            pd.to_numeric(source[f"{year}年岗位需求每万岗位数预测"], errors="coerce")
            - pd.to_numeric(source["2025年每万岗位需求数"], errors="coerce")
        )
        rising_skills = source.loc[source["_需求变化"].gt(0), "标准技能名称"].astype(str).tolist()
        falling_skills = source.loc[source["_需求变化"].lt(0), "标准技能名称"].astype(str).tolist()
        if demand_change > 0:
            demand_direction = "上升"
        elif demand_change < 0:
            demand_direction = "下降"
        else:
            demand_direction = "基本稳定"
        experience_future = mean(f"{year}年最低经验年限均值预测")
        bachelor_share = float(pd.to_numeric(profile["2025年本科及以上占比_%"], errors="coerce").mean())
        graduate_share = float(pd.to_numeric(profile["2025年研究生占比_%"], errors="coerce").mean())
        ai_exposure = mean("关联职业加权AI暴露度")
        ai_group_shares = {
            group: 100 * mean(f"{group}AI渗透率职业关联占比")
            for group in ["低", "中", "高"]
        }
        main_ai_group = max(ai_group_shares, key=ai_group_shares.get)
        ai_core_count = int(source["是否AI核心技能"].astype(str).eq("是").sum())
        ai_relation = source[~source["是否AI核心技能"].astype(str).eq("是")].copy()
        ai_relation["与AI共现强度_NPMI"] = pd.to_numeric(
            ai_relation.get("与AI共现强度_NPMI"), errors="coerce"
        )
        ai_relation = ai_relation.dropna(subset=["与AI共现强度_NPMI"])
        ai_cooccurrence_count = len(ai_relation)
        ai_cooccurrence_mean = ai_relation["与AI共现强度_NPMI"].mean() if ai_cooccurrence_count else np.nan
        ai_cooccurrence_max = ai_relation["与AI共现强度_NPMI"].max() if ai_cooccurrence_count else np.nan
        ai_cooccurrence_top_skill = (
            ai_relation.loc[ai_relation["与AI共现强度_NPMI"].idxmax(), "标准技能名称"]
            if ai_cooccurrence_count else None
        )
        ai_share_mean = (
            100 * pd.to_numeric(ai_relation["历史AI协同占比"], errors="coerce").mean()
            if ai_cooccurrence_count and "历史AI协同占比" in ai_relation else np.nan
        )

        if graduate_share >= 20:
            education_advice = "建议本科及以上，研究生学历具有明显优势"
        elif bachelor_share >= 75:
            education_advice = "建议本科及以上"
        elif bachelor_share >= 60:
            education_advice = "本科岗位为主，部分岗位可接受专科"
        else:
            education_advice = "学历要求较分散，建议结合目标岗位具体要求"

        salary_advice = f"当前约{salary_2025:,.0f}元/月；{year}年预测约{salary_future:,.0f}元/月"
        demand_subject = "输入技能的单项平均" if len(skills) > 1 else "该技能的"
        demand_advice = (
            f"{demand_subject}岗位需求率由2025年的{demand_rate_2025:.2f}%变为{year}年的{demand_rate_future:.2f}%，"
            f"单项平均每万岗位需求强度由{demand_2025:.1f}变为{demand_future:.1f}，"
            f"整体{demand_direction}（相对增长率{demand_growth:+.1f}%）；"
            f"{len(rising_skills)}项技能上升，{len(falling_skills)}项技能下降"
        )
        experience_advice = f"建议具备约{experience_future:.1f}年相关经验"
        ai_advice = (
            f"主要关联{main_ai_group}AI渗透率职业；关联职业加权AI暴露度为{ai_exposure:.1f}；"
            f"输入技能中AI核心技能{ai_core_count}项"
        )
        if ai_cooccurrence_count:
            ai_cooccurrence_advice = (
                f"{ai_cooccurrence_count}项非AI技能有与AI技能的共现观测，平均共现强度为{ai_cooccurrence_mean:.3f}；"
                f"其中{ai_cooccurrence_top_skill}与AI技能联系最紧密（共现强度={ai_cooccurrence_max:.3f}）"
            )
        elif ai_core_count == len(skills):
            ai_cooccurrence_advice = "输入均为AI核心技能，无需计算技能与AI的共现强度"
        else:
            ai_cooccurrence_advice = "当前输入技能暂无与AI技能的共现观测，缺失值不作零处理"
        direct_pairs = (
            combination_profile[combination_profile["有直接组合观测"].eq("是")]
            if "有直接组合观测" in combination_profile else combination_profile.iloc[0:0]
        )

        def pair_mean(column: str) -> float:
            if direct_pairs.empty or column not in direct_pairs:
                return np.nan
            return float(pd.to_numeric(direct_pairs[column], errors="coerce").mean())

        top_occupation_coverage = (
            float(occupations.iloc[0]["技能覆盖率"]) if not occupations.empty else np.nan
        )
        if pd.isna(top_occupation_coverage):
            coherence = "不可判断"
        elif top_occupation_coverage >= 75:
            coherence = "高"
        elif top_occupation_coverage >= 50:
            coherence = "中"
        else:
            coherence = "低"
        top_occupation = occupations.iloc[0]["职业小类名称"] if not occupations.empty else None
        top_city = cities.iloc[0]["城市"] if not cities.empty else None
        core_judgement = (
            f"输入的{len(skills)}项技能覆盖{len(clusters)}个技能簇，单项平均需求前景整体{demand_direction}；"
            f"职业匹配首先指向{top_occupation or '暂无可靠结果'}"
            f"（有效技能覆盖率{top_occupation_coverage:.1f}%，组合一致性{coherence}），"
            f"城市匹配首先指向{top_city or '暂无可靠结果'}；"
            f"主要关联{main_ai_group}AI渗透率职业。"
        )
        record = {
            "核心判断": core_judgement,
            "识别技能数": len(skills),
            "标准技能": "、".join(skills),
            "技能类型构成": "；".join(f"{key}:{value}" for key, value in types.items()),
            "覆盖技能簇数": len(clusters),
            "覆盖技能簇": "、".join(clusters),
            "AI核心技能数": ai_core_count,
            "2025年单项平均需求率_%": demand_rate_2025,
            f"{year}年单项平均需求率预测_%": demand_rate_future,
            "2025年单项平均需求_每万岗位": demand_2025,
            f"{year}年单项平均需求预测_每万岗位": demand_future,
            "单项平均需求增长率_%": demand_growth,
            "整体需求趋势": demand_direction,
            "预测需求上升技能数": len(rising_skills),
            "预测需求上升技能": "、".join(rising_skills),
            "预测需求下降技能数": len(falling_skills),
            "预测需求下降技能": "、".join(falling_skills),
            "需求前景判断": demand_advice,
            "多技能需求口径说明": (
                "多技能需求率和需求强度是各项输入技能单项指标的等权平均，用于概括技能集合的总体前景，不表示同一岗位同时要求全部技能。"
                if len(skills) > 1 else "当前仅输入一项技能，需求率和需求强度均为该技能自身指标。"
            ),
            "2025年单项平均月薪中位数_元": salary_2025,
            f"{year}年单项平均月薪预测_元": salary_future,
            "单项平均工资变化_%": 100 * (salary_future / salary_2025 - 1) if salary_2025 else np.nan,
            "2025年单项平均最低经验_年": mean("2025年最低经验年限均值"),
            f"{year}年单项平均最低经验预测_年": experience_future,
            "2025年单项平均本科及以上占比_%": bachelor_share,
            "2025年单项平均研究生占比_%": graduate_share,
            "单项平均AI暴露度": ai_exposure,
            "低AI渗透率职业关联占比_%": ai_group_shares["低"],
            "中AI渗透率职业关联占比_%": ai_group_shares["中"],
            "高AI渗透率职业关联占比_%": ai_group_shares["高"],
            "主要AI渗透率职业组": f"{main_ai_group}AI渗透率",
            "有与AI技能共现观测的非AI技能数": ai_cooccurrence_count,
            "输入技能与AI技能的平均共现强度": ai_cooccurrence_mean,
            "输入技能历史平均AI协同占比_%": ai_share_mean,
            "与AI技能共现最强的输入技能": ai_cooccurrence_top_skill,
            "最高与AI技能共现强度": ai_cooccurrence_max,
            "薪资水平建议": salary_advice,
            "学历建议": f"{education_advice}（本科及以上占比{bachelor_share:.1f}%，研究生占比{graduate_share:.1f}%）",
            "工作年限建议": f"{experience_advice}（按岗位最低经验要求均值）",
            "AI渗透情况": ai_advice,
            "与AI技能的共现情况": ai_cooccurrence_advice,
            "与AI技能的共现强度说明": "它表示这项技能与AI技能是否经常同时出现在同一招聘岗位中。数值越大，说明企业越倾向于同时要求两类技能；接近0表示联系不明显；小于0表示两者较少共同出现。该指标反映岗位需求联系，不等于工资溢价，也不代表因果关系。",
            "理论两两组合数": total_pairs,
            "有直接观测组合数": observed,
            "直接组合证据覆盖率_%": 100 * observed / total_pairs if total_pairs else np.nan,
            "直接观测组合平均共现强度": pair_mean("历史共现强度"),
            "直接观测组合平均工资互补效应_%": pair_mean("工资互补效应_%"),
            "直接观测组合平均2025年需求率_%": pair_mean("2025年组合需求率_%"),
            f"直接观测组合平均{year}年需求率预测_%": pair_mean(f"{year}年组合需求率预测_%"),
            "直接观测组合平均2025年需求强度_每万岗位": pair_mean("2025年组合需求强度_每万岗位"),
            f"直接观测组合平均{year}年需求强度预测_每万岗位": pair_mean(f"{year}年组合需求强度预测_每万岗位"),
            "直接观测组合平均需求增长率_%": pair_mean("2025至2028年需求增长率_%"),
            "直接观测组合平均覆盖城市数": pair_mean("覆盖城市数"),
            "显著工资互补组合数": int((combination_profile.get("工资互补是否显著", pd.Series(dtype=str)) == "是").sum()),
            "首选职业": top_occupation,
            "首选职业匹配分数": occupations.iloc[0]["匹配分数"] if not occupations.empty else np.nan,
            "首选职业技能覆盖率_%": top_occupation_coverage,
            "技能组合职业一致性": coherence,
            "首选城市": top_city,
            "首选城市匹配分数": cities.iloc[0]["匹配分数"] if not cities.empty else np.nan,
            "城市推荐口径说明": "城市技能需求综合强度是各项输入技能在该城市预测需求强度的合计，用于城市之间的相对比较；同一岗位可能同时要求多项技能，因此不能解释为互不重叠的岗位数量。",
            "口径说明": "多技能前景为单项技能等权聚合；与AI技能的共现强度衡量两者是否比随机情况下更常出现在同一岗位：越接近1联系越紧密，接近0表示没有明显额外联系，小于0表示共同出现得比随机情况更少；缺失值不作零处理；两两组合仅在数据库存在直接观测时报告共现和工资互补证据",
        }
        result = pd.DataFrame([record])
        numeric = result.select_dtypes(include="number").columns
        result[numeric] = result[numeric].round(2)
        return result

    def recommend_next_skills(self, skills: list[str], top_n: int = 10) -> pd.DataFrame:
        frame = self.pairs[self.pairs["组合层级"].eq("标准技能组合")].copy()
        frame["_左"] = frame["标准技能名称_技能一"].map(self._canonical)
        frame["_右"] = frame["标准技能名称_技能二"].map(self._canonical)
        frame = frame[frame["_左"].isin(skills) | frame["_右"].isin(skills)].copy()
        frame["候选技能"] = np.where(frame["_左"].isin(skills), frame["_右"], frame["_左"])
        frame["主要关联的已有技能"] = np.where(frame["_左"].isin(skills), frame["_左"], frame["_右"])
        frame = frame[frame["候选技能"].isin(self.valid_skills) & ~frame["候选技能"].isin(skills)]
        if frame.empty:
            return pd.DataFrame()

        def first_available(columns: list[str], fill_value: float | None = 0) -> pd.Series:
            result = pd.Series(np.nan, index=frame.index, dtype=float)
            for column in columns:
                if column in frame:
                    result = result.fillna(pd.to_numeric(frame[column], errors="coerce"))
            return result if fill_value is None else result.fillna(fill_value)

        frame["_共现展示"] = first_available(["标准化共现强度_NPMI", "NPMI_2016_2025", "历史共现相似度", "AI共现强度_NPMI"], None)
        frame["_工资展示"] = first_available(["工资互补效应_%", "工资互补效应_all_%", "工资互补效应_recent_%", "strict_complement_pct"], None)
        frame["_工资调整后p值"] = first_available(["互补效应BH调整p值", "工资互补BH调整p值_all", "工资互补BH调整p值_recent"], None)
        rate_2025 = first_available(["2025组合需求率"], None).replace(0, np.nan)
        rate_future = first_available(["组合需求率_2028", "2028组合需求率预测"], None).replace(0, np.nan)
        frame["_需求增长率"] = 100 * (rate_future / rate_2025 - 1)
        frame["_需求展示"] = frame["_需求增长率"].fillna(
            first_available(["2025_2028需求增长_%"], None)
        )
        future = self.skills.set_index("标准技能名称")["2028年岗位需求每万岗位数预测"].to_dict()
        frame["_未来水平"] = pd.to_numeric(frame["候选技能"].map(future), errors="coerce")
        frame["候选技能类型"] = frame["候选技能"].map(self.skill_index["技能一级类型"])

        def ranked(values: pd.Series) -> pd.Series:
            result = pd.Series(np.nan, index=values.index, dtype=float)
            valid = pd.to_numeric(values, errors="coerce").dropna()
            result.loc[valid.index] = valid.rank(method="average", pct=True)
            return result

        components = [
            (frame["_共现展示"].where(frame["_共现展示"].gt(0)), 0.45),
            (frame["_工资展示"].where(frame["_工资展示"].gt(0) & frame["_工资调整后p值"].lt(0.05)), 0.25),
            (frame["_需求展示"].where(frame["_需求展示"].gt(0)), 0.20),
            (frame["_未来水平"], 0.10),
        ]
        numerator = pd.Series(0.0, index=frame.index)
        denominator = pd.Series(0.0, index=frame.index)
        for values, weight in components:
            score = ranked(values)
            numerator += weight * score.fillna(0)
            denominator += weight * score.notna()
        frame["边际推荐分数"] = 100 * numerator / denominator.replace(0, np.nan)

        input_types = set(self.skill_index.loc[skills, "技能一级类型"].dropna())
        new_type = ~frame["候选技能类型"].isin(input_types)
        repeated_soft_skill = frame["候选技能类型"].eq("非技术性能力") & ("非技术性能力" in input_types)
        frame.loc[new_type, "边际推荐分数"] *= 1.05
        frame.loc[repeated_soft_skill, "边际推荐分数"] *= 0.90
        frame["边际推荐分数"] = frame["边际推荐分数"].clip(upper=100)
        result = frame.sort_values("边际推荐分数", ascending=False).drop_duplicates("候选技能").head(top_n).copy()
        result.insert(0, "排名", range(1, len(result) + 1))
        result["边际推荐分数"] = result["边际推荐分数"].round(1)
        result["与已有技能的共现强度"] = result["_共现展示"].round(3)
        result["工资互补效应_%"] = result["_工资展示"].round(1)
        result["工资互补是否显著"] = np.select(
            [
                result["_工资展示"].isna() | result["_工资调整后p值"].isna(),
                result["_工资展示"].gt(0) & result["_工资调整后p值"].lt(0.05),
            ],
            ["不可判断", "是"],
            default="否",
        )
        result["2025年组合需求率_%"] = (100 * rate_2025.loc[result.index]).round(3)
        result["2028年组合需求率预测_%"] = (100 * rate_future.loc[result.index]).round(3)
        result["2025年组合需求强度_每万岗位"] = (10000 * rate_2025.loc[result.index]).round(2)
        result["2028年组合需求强度预测_每万岗位"] = (10000 * rate_future.loc[result.index]).round(2)
        result["未来需求增长率_%"] = result["_需求展示"].round(1)

        def evidence_label(row: pd.Series) -> str:
            evidence: list[str] = []
            if pd.notna(row["_共现展示"]) and row["_共现展示"] > 0:
                evidence.append("技能共现")
            if pd.notna(row["_工资展示"]) and row["_工资展示"] > 0 and row["_工资调整后p值"] < 0.05:
                evidence.append("显著工资互补")
            if pd.notna(row["_需求展示"]) and row["_需求展示"] > 0:
                evidence.append("组合需求增长")
            if pd.notna(row["_未来水平"]):
                evidence.append("候选技能市场需求")
            return "、".join(evidence) if evidence else "证据有限"

        result["推荐依据"] = result.apply(evidence_label, axis=1)
        return result[[
            "排名", "候选技能", "候选技能类型", "主要关联的已有技能", "边际推荐分数", "推荐依据",
            "与已有技能的共现强度", "工资互补效应_%", "工资互补是否显著",
            "2025年组合需求率_%", "2028年组合需求率预测_%",
            "2025年组合需求强度_每万岗位", "2028年组合需求强度预测_每万岗位",
            "未来需求增长率_%",
        ]]

    def run(self, raw_skills: list[str], top_n: int = 10, year: int = 2028) -> dict[str, object]:
        skills, unresolved = self.resolve_skills(raw_skills)
        if not skills:
            raise ValueError(f"没有识别出有效技能。相近候选：{unresolved}")
        profile = self.skill_profile(skills, year)
        pair_profile = self.combination_profile(skills)
        occupations = self.match_occupations(skills, top_n)
        cities = self.match_cities(skills, year, min(top_n, 5))
        summary = self.portfolio_summary(skills, profile, pair_profile, occupations, cities, year)
        return {
            "skills": skills,
            "unresolved": unresolved,
            "summary": summary,
            "skill_profile": profile,
            "combination_profile": pair_profile,
            "occupations": occupations,
            "occupation_catalog": self.occupation_catalog_payload(occupations),
            "cities": cities,
            "next_skills": self.recommend_next_skills(skills, top_n),
            "observed_pair_count": len(self._selected_pairs(skills)),
        }

    def run_for_major(
        self,
        major: str,
        cohort: str | int | None = None,
        school: str = "首都经济贸易大学",
        confirmed_skills: list[str] | None = None,
        top_n: int = 10,
        year: int = 2028,
    ) -> dict[str, object]:
        """Infer skills from a curriculum, then reuse the standard market matcher."""
        program = self.resolve_major(major, cohort, school)
        major_profile = self.major_skill_profile(program["专业主键"])
        inferred = major_profile["标准技能名称"].astype(str).tolist()
        confirmed, unresolved = self.resolve_skills(confirmed_skills or [])
        combined = list(dict.fromkeys([*confirmed, *inferred]))
        baseline = self.run(inferred, top_n, year)
        result = self.run(combined, top_n, year) if confirmed else baseline
        result["unresolved"] = unresolved
        result["program"] = program
        result["major_profile"] = major_profile
        result["inferred_skills"] = inferred
        result["confirmed_skills"] = confirmed
        result["baseline"] = baseline
        return result

    @staticmethod
    def compare_major_paths(
        baseline: dict[str, object], enhanced: dict[str, object], confirmed_skills: list[str], year: int
    ) -> dict[str, object]:
        base = baseline["summary"].iloc[0]
        new = enhanced["summary"].iloc[0]

        def number(row: pd.Series, key: str) -> float:
            value = pd.to_numeric(pd.Series([row.get(key)]), errors="coerce").iloc[0]
            return round(float(value), 2) if pd.notna(value) else np.nan

        def change(key: str) -> float:
            left, right = number(base, key), number(new, key)
            return round(right - left, 2) if pd.notna(left) and pd.notna(right) else np.nan

        base_jobs = baseline["occupations"]["职业小类名称"].head(5).astype(str).tolist()
        new_jobs = enhanced["occupations"]["职业小类名称"].head(5).astype(str).tolist()
        base_cities = baseline["cities"]["城市"].head(5).astype(str).tolist()
        new_cities = enhanced["cities"]["城市"].head(5).astype(str).tolist()
        salary_change = change(f"{year}年单项平均月薪预测_元")
        demand_change = change(f"{year}年单项平均需求预测_每万岗位")
        interpretation = (
            f"加入{'、'.join(confirmed_skills)}后，首选职业由{base.get('首选职业')}变为{new.get('首选职业')}；"
            f"{year}年单项平均预测工资变化{salary_change:+.0f}元，单项平均需求强度变化{demand_change:+.2f}个/万岗位。"
            "需求强度变化来自新增技能与原技能的等权构成差异，不表示掌握新增技能会因果性地增加或减少个人就业机会。"
        ) if confirmed_skills else "未加入用户确认技能，专业基础路径与个人增强路径相同。"
        return {
            "新增确认技能": "、".join(confirmed_skills) if confirmed_skills else "无",
            "专业基础路径首选职业": base.get("首选职业"),
            "个人增强路径首选职业": new.get("首选职业"),
            "首选职业是否变化": "是" if base.get("首选职业") != new.get("首选职业") else "否",
            "新增进入前五职业": "、".join(x for x in new_jobs if x not in base_jobs) or "无",
            "退出前五职业": "、".join(x for x in base_jobs if x not in new_jobs) or "无",
            "2025年单项平均月薪变化_元": change("2025年单项平均月薪中位数_元"),
            f"{year}年单项平均月薪预测变化_元": salary_change,
            f"{year}年单项平均需求率变化_百分点": change(f"{year}年单项平均需求率预测_%"),
            f"{year}年单项平均需求强度变化_每万岗位": demand_change,
            "本科及以上占比变化_百分点": change("2025年单项平均本科及以上占比_%"),
            "研究生占比变化_百分点": change("2025年单项平均研究生占比_%"),
            f"{year}年平均最低经验变化_年": change(f"{year}年单项平均最低经验预测_年"),
            "关联职业AI暴露度变化": change("单项平均AI暴露度"),
            "专业基础路径首选城市": base.get("首选城市"),
            "个人增强路径首选城市": new.get("首选城市"),
            "首选城市是否变化": "是" if base.get("首选城市") != new.get("首选城市") else "否",
            "新增进入前五城市": "、".join(x for x in new_cities if x not in base_cities) or "无",
            "退出前五城市": "、".join(x for x in base_cities if x not in new_cities) or "无",
            "变化解读": interpretation,
            "比较口径说明": "比较专业培养方案推断技能与加入用户确认技能后的描述性结果，不表示新增技能产生了因果工资回报或就业效应。",
        }

    def run_payload(self, raw_skills: list[str], top_n: int = 10, year: int = 2028) -> dict[str, object]:
        """返回可直接交给网站、Dify或其他大模型工作流的JSON兼容结果。"""
        result = self.run(raw_skills, top_n, year)
        payload: dict[str, object] = {
            "识别技能": result["skills"],
            "未识别输入及候选": result["unresolved"],
            "已观测两两组合数": result["observed_pair_count"],
            "预测年份": year,
        }
        for key in ["summary", "skill_profile", "combination_profile", "occupations", "cities", "next_skills"]:
            payload[key] = json.loads(result[key].to_json(orient="records", force_ascii=False))
        payload["occupation_catalog"] = result["occupation_catalog"]
        return payload

    def run_major_payload(
        self,
        major: str,
        cohort: str | int | None = None,
        school: str = "首都经济贸易大学",
        confirmed_skills: list[str] | None = None,
        top_n: int = 10,
        year: int = 2028,
    ) -> dict[str, object]:
        """Return a JSON-compatible curriculum-to-market matching result."""
        result = self.run_for_major(major, cohort, school, confirmed_skills, top_n, year)
        program = result["program"]
        overview_fields = {
            "培养目标": "培养目标概括",
            "主要能力要求": "主要能力要求概括",
            "核心课程": "核心课程概括",
            "培养特色": "培养特色概括",
            "学制与学位": "学制与学位概括",
        }
        overview = {
            label: str(program.get(column)).strip()
            for label, column in overview_fields.items()
            if pd.notna(program.get(column)) and str(program.get(column)).strip()
        }
        baseline = result["baseline"]
        comparison = self.compare_major_paths(baseline, result, result["confirmed_skills"], year)
        payload: dict[str, object] = {
            "学校": program["学校"],
            "学院": program["学院"],
            "专业": program["专业"],
            "年级": program["年级"],
            "培养方案推断技能": result["inferred_skills"],
            "用户确认技能": result["confirmed_skills"],
            "未识别的用户技能及候选": result["unresolved"],
            "用于市场匹配的技能": result["skills"],
            "已观测两两组合数": result["observed_pair_count"],
            "预测年份": year,
            "培养方案概况": overview,
            "专业基础路径": {
                "技能": result["inferred_skills"],
                "summary": json.loads(baseline["summary"].to_json(orient="records", force_ascii=False)),
                "occupations": json.loads(baseline["occupations"].head(5).to_json(orient="records", force_ascii=False)),
                "occupation_catalog": baseline["occupation_catalog"],
                "cities": json.loads(baseline["cities"].head(5).to_json(orient="records", force_ascii=False)),
            },
            "个人增强路径": {
                "新增确认技能": result["confirmed_skills"],
                "技能": result["skills"],
                "summary": json.loads(result["summary"].to_json(orient="records", force_ascii=False)),
                "occupations": json.loads(result["occupations"].head(5).to_json(orient="records", force_ascii=False)),
                "occupation_catalog": result["occupation_catalog"],
                "cities": json.loads(result["cities"].head(5).to_json(orient="records", force_ascii=False)),
            },
            "新增技能带来的变化": comparison,
            "推断口径说明": "培养方案推断技能表示课程和培养要求覆盖的能力，不等于用户已经掌握；用户确认技能优先保留。",
        }
        payload["专业技能依据"] = json.loads(
            result["major_profile"][[
                "标准技能名称", "技能一级类型", "技能簇名称", "技能供给区分度得分",
                "专业内排名", "证据摘要", "映射依据",
            ]].to_json(orient="records", force_ascii=False)
        )
        for key in ["summary", "skill_profile", "combination_profile", "occupations", "cities", "next_skills"]:
            payload[key] = json.loads(result[key].to_json(orient="records", force_ascii=False))
        payload["occupation_catalog"] = result["occupation_catalog"]
        return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="输入技能或专业，推荐职业、城市和下一项技能")
    parser.add_argument("skills", nargs="*", help="已掌握技能；可用空格、逗号、顿号或加号分隔")
    parser.add_argument("--major", help="专业名称，也可输入“我是经济学专业的学生”等自然表述")
    parser.add_argument("--school", default="首都经济贸易大学", help="学校名称")
    parser.add_argument("--cohort", help="培养方案年级，如2025或2025级；不填则使用最新年级")
    parser.add_argument("--top", type=int, default=10, help="返回数量")
    parser.add_argument("--year", type=int, default=2028, help="城市推荐使用的预测年份")
    parser.add_argument("--output-dir", type=Path, help="可选：保存组合画像及五张明细表")
    args = parser.parse_args()

    recommender = SkillRecommender()
    if args.major:
        result = recommender.run_for_major(
            args.major, args.cohort, args.school, args.skills, args.top, args.year
        )
        program = result["program"]
        print(f"培养方案：{program['学校']}·{program['学院']}·{program['专业']}（{program['年级']}）")
        print(f"培养方案推断技能：{'、'.join(result['inferred_skills'])}")
        if result["confirmed_skills"]:
            print(f"用户确认技能：{'、'.join(result['confirmed_skills'])}")
        print("提示：培养方案推断技能不等于用户已经掌握。")
        overview_fields = {
            "培养目标": "培养目标概括", "主要能力要求": "主要能力要求概括",
            "核心课程": "核心课程概括", "培养特色": "培养特色概括",
            "学制与学位": "学制与学位概括",
        }
        print("\n【培养方案概况】")
        for label, column in overview_fields.items():
            value = program.get(column)
            if pd.notna(value) and str(value).strip():
                print(f"{label}：{value}")
        if result["confirmed_skills"]:
            comparison = recommender.compare_major_paths(
                result["baseline"], result, result["confirmed_skills"], args.year
            )
            print("\n【新增技能带来的变化】")
            for key, value in comparison.items():
                print(f"{key}：{value}")
    else:
        if not args.skills:
            parser.error("请至少输入一项技能，或使用 --major 输入专业")
        result = recommender.run(args.skills, args.top, args.year)
    print(f"识别技能：{'、'.join(result['skills'])}")
    print(f"命中已观测技能组合：{result['observed_pair_count']}组")
    if result["unresolved"]:
        print(f"未识别输入及候选：{result['unresolved']}")
    for title, key in [
        ("技能组合画像", "summary"),
        ("单项技能指标", "skill_profile"),
        ("两两组合证据", "combination_profile"),
        ("职业推荐", "occupations"),
        ("城市推荐", "cities"),
        ("下一技能推荐", "next_skills"),
    ]:
        print(f"\n【{title}】")
        print(result[key].to_string(index=False) if not result[key].empty else "无结果")

    if args.output_dir:
        args.output_dir.mkdir(parents=True, exist_ok=True)
        stem = "_".join(result["skills"])
        outputs = {
            "技能组合画像": result["summary"],
            "单项技能指标": result["skill_profile"],
            "两两组合证据": result["combination_profile"],
            "职业推荐": result["occupations"],
            "城市推荐": result["cities"],
            "下一技能推荐": result["next_skills"],
        }
        for label, frame in outputs.items():
            frame.to_csv(args.output_dir / f"{stem}_{label}.csv", index=False, encoding="utf-8-sig")
        payload = (
            recommender.run_major_payload(args.major, args.cohort, args.school, args.skills, args.top, args.year)
            if args.major else recommender.run_payload(args.skills, args.top, args.year)
        )
        (args.output_dir / f"{stem}_完整结果.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )


if __name__ == "__main__":
    main()
