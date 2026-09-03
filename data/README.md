# 数据文件说明

运行时导入使用 `skills_full.csv`、`skill_aliases.csv`、`skill_pairs.csv`、`occupation_skill_stats.csv`、`city_skill_forecasts.csv`、`pair_occupation_stats.csv` 与 `pair_city_stats.csv`。

`skill_yearly_trends.csv`、`skill_monthly_trends.csv`、`skill_ai_exposure.csv` 与 `skill_normalization.csv` 为后续趋势图、AI 指标和审计扩展保留。三个 `*_top20.csv` 和 `skill_profile_public.csv` 是对外展示用的派生副本，不参与主导入，避免与完整关系表重复。

`02_关系表/12_专业就业去向表.csv` 来自学职平台公开专业页面，区分“已毕业人员从业方向”和“在校生期望从业方向”，并保留专业/专业类数据口径。`12_专业就业去向采集审计表.csv` 用于检查专业覆盖与采集失败情况。运行 `python3 scripts/python/extract_chsi_major_destinations.py` 可断点更新。

`02_关系表/13_专业职业先验表.csv` 将可用就业去向映射至《职业分类大典》职业小类，并区分核心、延伸和通用去向。系统先据此限定专业相关职业，再使用用户确认技能细分排序；培养方案推断技能不作为用户已掌握技能参与等权竞争。
