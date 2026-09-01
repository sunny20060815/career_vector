#!/usr/bin/env python3
"""技能匹配器的轻量回归测试，并保存可人工查看的试验结果。"""

from __future__ import annotations

import json
from math import comb
from pathlib import Path

import pandas as pd

from skill_recommender import SkillRecommender


OUTPUT = Path(__file__).resolve().parents[1] / "03_说明与审计" / "技能组合匹配试验_v1_20260829"
CASES = {
    "单技能": ["数据分析"],
    "直接组合证据": ["Python", "C++"],
    "多项技术技能": ["Python", "数据分析", "SQL"],
    "跨类型组合": ["PLC", "质量管理", "沟通能力", "新能源"],
    "技术非技术专业知识": ["Python", "沟通能力", "药学"],
    "五项跨类型组合": ["PLC", "质量管理", "沟通能力", "新能源", "数据分析"],
    "单字符串别名输入": ["python, 沟通, 新能源"],
}


def main() -> None:
    recommender = SkillRecommender()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    audit: list[dict[str, object]] = []

    for case, raw_skills in CASES.items():
        result = recommender.run(raw_skills, top_n=10, year=2028)
        count = len(result["skills"])
        expected_pairs = comb(count, 2) if count > 1 else 0

        assert not result["unresolved"], f"{case}存在未识别技能：{result['unresolved']}"
        assert len(result["skill_profile"]) == count, f"{case}单项技能指标缺行"
        assert len(result["combination_profile"]) == expected_pairs, f"{case}两两组合数量错误"
        assert not result["occupations"].empty, f"{case}没有职业推荐"
        assert result["occupation_catalog"], f"{case}没有职业大典明细"
        assert "职业大典包含职业" in result["occupations"], f"{case}职业推荐缺少具体职业摘要"
        assert not result["cities"].empty, f"{case}没有城市推荐"
        payload = recommender.run_payload(raw_skills)
        assert all(
            item["包含的具体职业"] for item in payload["occupation_catalog"]
        ), f"{case}职业大典明细为空"
        assert len(payload["skill_profile"]) == count, f"{case}接口结果缺失"
        required_summary_fields = {
            "核心判断",
            "识别技能数",
            "技能类型构成",
            "理论两两组合数",
            "有直接观测组合数",
            "2025年单项平均需求率_%",
            "2028年单项平均需求率预测_%",
            "2025年单项平均需求_每万岗位",
            "2028年单项平均需求预测_每万岗位",
            "单项平均需求增长率_%",
            "整体需求趋势",
            "预测需求上升技能数",
            "预测需求下降技能数",
            "需求前景判断",
            "多技能需求口径说明",
            "2025年单项平均月薪中位数_元",
            "2025年单项平均最低经验_年",
            "2025年单项平均本科及以上占比_%",
            "2025年单项平均研究生占比_%",
            "单项平均AI暴露度",
            "低AI渗透率职业关联占比_%",
            "中AI渗透率职业关联占比_%",
            "高AI渗透率职业关联占比_%",
            "主要AI渗透率职业组",
            "薪资水平建议",
            "学历建议",
            "工作年限建议",
            "AI渗透情况",
            "有与AI技能共现观测的非AI技能数",
            "输入技能与AI技能的平均共现强度",
            "与AI技能共现最强的输入技能",
            "最高与AI技能共现强度",
            "与AI技能的共现情况",
            "与AI技能的共现强度说明",
            "首选职业",
            "首选城市",
            "城市推荐口径说明",
        }
        assert required_summary_fields.issubset(payload["summary"][0]), f"{case}组合汇总指标不完整"
        assert len(result["cities"]) <= 5, f"{case}城市推荐超过5个"
        assert "技能需求综合强度_每万岗位" in result["cities"], f"{case}城市需求口径字段缺失"
        if not result["next_skills"].empty:
            assert {"推荐依据", "候选技能类型", "工资互补是否显著"}.issubset(result["next_skills"]), f"{case}下一技能证据字段缺失"
        if case == "直接组合证据":
            assert result["observed_pair_count"] > 0, "直接组合证据试验未命中组合关系表"

        outputs = {
            "技能组合画像": result["summary"],
            "单项技能指标": result["skill_profile"],
            "两两组合证据": result["combination_profile"],
            "职业推荐": result["occupations"],
            "城市推荐": result["cities"],
            "下一技能推荐": result["next_skills"],
        }
        for label, frame in outputs.items():
            frame.to_csv(OUTPUT / f"{case}_{label}.csv", index=False, encoding="utf-8-sig")
        with (OUTPUT / f"{case}_完整接口结果.json").open("w", encoding="utf-8") as file:
            json.dump(payload, file, ensure_ascii=False, indent=2)

        summary = result["summary"].iloc[0]
        audit.append({
            "试验场景": case,
            "输入技能": "、".join(raw_skills),
            "识别技能数": count,
            "技能类型构成": summary["技能类型构成"],
            "理论两两组合数": expected_pairs,
            "直接观测组合数": result["observed_pair_count"],
            "首选职业": summary["首选职业"],
            "首选城市": summary["首选城市"],
            "结果完整性": "通过",
        })

    pd.DataFrame(audit).to_csv(OUTPUT / "00_多场景试验汇总.csv", index=False, encoding="utf-8-sig")
    print(pd.DataFrame(audit).to_string(index=False))
    print(f"\n全部测试通过，结果目录：{OUTPUT}")


if __name__ == "__main__":
    main()
