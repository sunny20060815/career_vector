#!/usr/bin/env python3
"""专业培养方案接入主推荐器的最小回归测试。"""

import json
from pathlib import Path

from skill_recommender import SkillRecommender


OUTPUT = Path(__file__).resolve().parents[1] / "03_说明与审计" / "专业培养供需匹配试验_v1_20260831"
CASES = [
    ("自然语言专业", "我是经济学专业的学生", None, []),
    ("指定专业年级", "数据科学与大数据技术（信息技术）", "2025", []),
    ("专业加确认技能", "会计学（数智化国际会计）", "2025级", ["Python", "沟通能力"]),
]


def main() -> None:
    recommender = SkillRecommender()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for label, major, cohort, confirmed in CASES:
        payload = recommender.run_major_payload(
            major, cohort=cohort, confirmed_skills=confirmed, top_n=5
        )
        assert payload["培养方案推断技能"]
        assert payload["用于市场匹配的技能"]
        assert payload["专业技能依据"]
        assert payload["培养方案概况"].get("培养目标")
        assert payload["培养方案概况"].get("核心课程")
        assert payload["专业基础路径"]["occupations"]
        assert payload["专业基础路径"]["occupation_catalog"]
        assert payload["个人增强路径"]["occupations"]
        assert payload["个人增强路径"]["occupation_catalog"]
        assert payload["occupation_catalog"][0]["包含的具体职业"]
        assert payload["新增技能带来的变化"]["比较口径说明"]
        assert payload["个人增强路径"]["新增确认技能"] == payload["用户确认技能"]
        assert payload["occupations"] and payload["cities"]
        assert len(payload["cities"]) <= 5
        assert set(confirmed).issubset(payload["用户确认技能"])
        assert "工程造价" not in payload["培养方案推断技能"] or payload["专业"] != "经济学"
        (OUTPUT / f"{label}_完整接口结果.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(
            f"{label}: {payload['年级']} {payload['专业']} -> "
            f"{payload['occupations'][0]['职业小类名称']} / {payload['cities'][0]['城市']}"
        )
    print(f"专业入口测试通过，结果目录：{OUTPUT}")


if __name__ == "__main__":
    main()
