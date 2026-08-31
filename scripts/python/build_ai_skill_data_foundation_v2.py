from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd


ROOT = Path("/Users/tianyou/Desktop/Projects/2026.07.25创新创业大赛/AI职业技能智能推荐数据底座_v2_20260828")
CORE = ROOT / "01_核心表"
REL = ROOT / "02_关系表"
DOC = ROOT / "03_说明与审计"

V1 = Path("/Users/tianyou/Desktop/Projects/2026.07.25创新创业大赛/AI职业技能智能推荐数据底座_v1_20260821")
TREND = Path("/Users/tianyou/Desktop/Projects/2026.4.7_课题申请材料/投稿/全国招聘趋势与技能预测_v1_20260820")
CLUSTER = Path("/Users/tianyou/Desktop/Projects/2026.4.7_课题申请材料/投稿/全国招聘技能共现网络与聚类_v1_20260821")
CLUSTER_PAIR = Path("/Users/tianyou/Desktop/Projects/2026.4.7_课题申请材料/投稿/技能簇组合价值与职业前景_v1_20260823")
SKILL_PAIR = Path("/Users/tianyou/Desktop/Projects/2026.4.7_课题申请材料/投稿/重点技能簇子技能互补关系_v1_20260824")
AI_PAIR = Path("/Users/tianyou/Desktop/Projects/2026.4.7_课题申请材料/投稿/AI协同技能价值与未来前景_v1_20260826")
DICT = Path("/Users/tianyou/Desktop/Projects/2026.4.7_课题申请材料/投稿/招聘技能抽取_全国全量_v1r9_20260820/00_配置与代码/招聘技能词典_v1r9_零技能长尾修订.xlsx")

JOB_SKILLS = TREND / "01_标准化数据/job_skills.parquet"
JOBS = TREND / "01_标准化数据/jobs_standardized.parquet"

AI_CORE_SKILLS = {
    "机器学习", "人工智能技术", "深度学习", "计算机视觉", "自然语言处理", "TensorFlow",
    "PyTorch", "大语言模型", "AI工具应用", "大模型开发", "智能体应用与开发", "生成式人工智能",
    "Prompt工程", "HuggingFace", "大模型工程工具链",
}


def normalize_key(value: object) -> str:
    if pd.isna(value):
        return ""
    text = unicodedata.normalize("NFKC", str(value)).strip().lower()
    return re.sub(r"\s+", "", text)


def save_table(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path.with_suffix(".csv"), index=False, encoding="utf-8-sig")
    df.to_parquet(path.with_suffix(".parquet"), index=False)


def coalesce(df: pd.DataFrame, candidates: list[str], default=np.nan) -> pd.Series:
    found = [c for c in candidates if c in df.columns]
    if not found:
        return pd.Series(default, index=df.index)
    result = df[found[0]].copy()
    for col in found[1:]:
        result = result.combine_first(df[col])
    return result


def first_present(columns: list[str], candidates: list[str]) -> str | None:
    return next((c for c in candidates if c in columns), None)


def build_master_and_aliases() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    master = pd.read_csv(V1 / "01_核心宽表/AI技能知识总表.csv", low_memory=False)
    taxonomy = pd.read_csv(CLUSTER / "02_共现网络与聚类/技能聚类明细.csv", low_memory=False)
    tax_keep = [
        c for c in ["标准技能", "技能簇编号", "技能簇规范名称", "技能显示名称", "规范技能类型", "分析口径"]
        if c in taxonomy.columns
    ]
    taxonomy = taxonomy[tax_keep].drop_duplicates("标准技能")
    master = master.merge(taxonomy, left_on="标准技能名称", right_on="标准技能", how="left", suffixes=("", "_聚类"))
    master.drop(columns=[c for c in ["标准技能"] if c in master.columns], inplace=True)
    if "技能簇规范名称" in master.columns:
        master.rename(columns={"技能簇规范名称": "技能簇名称"}, inplace=True)
    master["是否AI核心技能"] = master["标准技能名称"].isin(AI_CORE_SKILLS).map({True: "是", False: "否"})
    master["数据版本"] = "v2_20260828"
    master.insert(0, "技能主键", master["技能编号"].astype(str))
    save_table(master, CORE / "01_技能主表")

    dictionary = pd.read_excel(DICT, sheet_name="技能词典_v1")
    aliases = dictionary.rename(columns={
        "standard_skill": "标准技能名称", "alias": "技能别名", "skill_group": "技能大组",
        "skill_subgroup": "技能子组", "skill_nature": "技能性质", "match_policy": "匹配策略",
        "confidence": "词典置信度", "source_basis": "来源依据", "notes": "备注",
    })
    aliases = aliases[[c for c in [
        "标准技能名称", "技能别名", "技能大组", "技能子组", "技能性质", "匹配策略", "词典置信度", "来源依据", "备注"
    ] if c in aliases.columns]].copy()
    self_alias = master[["标准技能名称"]].drop_duplicates().assign(技能别名=lambda x: x["标准技能名称"])
    self_alias["来源依据"] = "标准技能名称"
    aliases = pd.concat([aliases, self_alias], ignore_index=True, sort=False)
    aliases["技能别名"] = aliases["技能别名"].astype(str).str.strip()
    aliases["别名标准化键"] = aliases["技能别名"].map(normalize_key)
    aliases = aliases[(aliases["别名标准化键"] != "") & aliases["标准技能名称"].notna()].copy()
    aliases = aliases.drop_duplicates(["别名标准化键", "标准技能名称"])
    aliases = aliases.merge(master[[
        "标准技能名称", "技能编号", "技能展示名称", "技能一级类型", "技能簇编号", "技能簇名称", "是否AI核心技能"
    ]], on="标准技能名称", how="left")
    aliases["同名候选技能数"] = aliases.groupby("别名标准化键")["标准技能名称"].transform("nunique")
    aliases["别名映射状态"] = np.where(aliases["同名候选技能数"].eq(1), "唯一映射", "一词多义需结合语境")
    aliases.insert(0, "技能别名主键", [f"BM{i:05d}" for i in range(1, len(aliases) + 1)])
    aliases = aliases.sort_values(["别名映射状态", "标准技能名称", "技能别名"]).reset_index(drop=True)
    save_table(aliases, CORE / "02_技能别名表")
    return master, aliases, taxonomy


def build_combination_table(master: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    skill_meta = master[["标准技能名称", "技能编号", "技能展示名称", "技能一级类型", "技能簇编号", "技能簇名称"]].drop_duplicates()
    meta_a = skill_meta.add_suffix("_技能一")
    meta_b = skill_meta.add_suffix("_技能二")

    edges = pd.read_parquet(CLUSTER / "02_共现网络与聚类/技能共现网络边.parquet")
    edges = edges.rename(columns={"技能一": "技能一名称", "技能二": "技能二名称", "余弦相似度": "历史共现相似度"})
    edges["组合层级"] = "标准技能组合"
    edges = edges.merge(meta_a, left_on="技能一名称", right_on="标准技能名称_技能一", how="left")
    edges = edges.merge(meta_b, left_on="技能二名称", right_on="标准技能名称_技能二", how="left")

    detail = pd.read_csv(SKILL_PAIR / "02_互补关系结果/重点技能簇子技能互补关系总表.csv", low_memory=False)
    ca = first_present(detail.columns.tolist(), ["skill_a", "技能一", "子技能一", "skill_1"])
    cb = first_present(detail.columns.tolist(), ["skill_b", "技能二", "子技能二", "skill_2"])
    if ca and cb:
        detail["组合键"] = detail.apply(lambda r: "||".join(sorted([str(r[ca]), str(r[cb])])), axis=1)
        edges["组合键"] = edges.apply(lambda r: "||".join(sorted([str(r["技能一名称"]), str(r["技能二名称"])])), axis=1)
        useful = [c for c in detail.columns if any(k in c.lower() for k in ["npmi", "wage", "工资", "demand", "需求", "city", "城市", "evidence", "证据", "pair_jobs"])]
        detail_small = detail[["组合键"] + useful].drop_duplicates("组合键")
        edges = edges.merge(detail_small, on="组合键", how="left", suffixes=("", "_子技能结果"))

    ai = pd.read_csv(AI_PAIR / "03_未来前景/02_AI协同技能价值与未来前景总表.csv", low_memory=False)
    skill_col = first_present(ai.columns.tolist(), ["skill", "标准技能", "canonical_skill", "技能"])
    ai_rows = pd.DataFrame({"技能一名称": "AI核心技能组合", "技能二名称": ai[skill_col]})
    ai_rows["组合层级"] = "AI协同技能组合"
    for col in ai.columns:
        if col != skill_col:
            ai_rows[col] = ai[col].values
    ai_rows = ai_rows.merge(meta_b, left_on="技能二名称", right_on="标准技能名称_技能二", how="left")
    ai_rows["技能一编号_技能一"] = "AI_CORE"
    ai_rows["技能展示名称_技能一"] = "AI核心技能"
    ai_rows["技能一级类型_技能一"] = "人工智能技能集合"
    ai_rows["技能簇名称_技能一"] = "人工智能核心技能"

    cp = pd.read_csv(CLUSTER_PAIR / "04_推荐查询表/技能簇组合价值总表_无方向.csv", low_memory=False)
    cpa = first_present(cp.columns.tolist(), ["cluster_name_a", "cluster_a_name", "技能簇一", "技能簇A", "cluster_a"])
    cpb = first_present(cp.columns.tolist(), ["cluster_name_b", "cluster_b_name", "技能簇二", "技能簇B", "cluster_b"])
    cluster_rows = pd.DataFrame({"技能一名称": cp[cpa], "技能二名称": cp[cpb]})
    cluster_rows["组合层级"] = "技能簇组合"
    for col in cp.columns:
        if col not in {cpa, cpb}:
            cluster_rows[col] = cp[col].values

    combo = pd.concat([edges, ai_rows, cluster_rows], ignore_index=True, sort=False)
    combo["技能组合编号"] = [
        ("JZ" if level == "技能簇组合" else "AI" if level == "AI协同技能组合" else "ZH") + f"{i:05d}"
        for i, level in enumerate(combo["组合层级"], 1)
    ]
    combo["技能组合名称"] = combo["技能一名称"].astype(str) + "+" + combo["技能二名称"].astype(str)
    front = ["技能组合编号", "技能组合名称", "组合层级", "技能一名称", "技能二名称"]
    combo = combo[front + [c for c in combo.columns if c not in front]]
    save_table(combo, CORE / "03_技能组合关系表")

    selected = combo.loc[
        combo["组合层级"].eq("标准技能组合"),
        ["技能组合编号", "技能一名称", "技能二名称"],
    ].dropna().copy()
    selected["技能一标准化键"] = selected["技能一名称"].map(normalize_key)
    selected["技能二标准化键"] = selected["技能二名称"].map(normalize_key)
    selected[["技能一标准化键", "技能二标准化键"]] = np.sort(selected[["技能一标准化键", "技能二标准化键"]].values, axis=1)
    return combo, selected.drop_duplicates(["技能一标准化键", "技能二标准化键"])


def build_skill_relations(master: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    meta = master[["标准技能名称", "技能编号", "技能展示名称", "技能一级类型", "技能簇编号", "技能簇名称"]].drop_duplicates()
    # 统一旧关系表中的同义写法，确保全部记录映射到830项标准技能。
    legacy_skill_names = {
        "IATF16949": "IATF 16949",
        "Microsoft SQL Server": "SQL Server",
    }

    occ = pd.read_parquet(TREND / "02_月度面板/skill_occupation_recent.parquet")
    occ["canonical_skill"] = occ["canonical_skill"].replace(legacy_skill_names)
    occ = occ.merge(meta, left_on="canonical_skill", right_on="标准技能名称", how="left")
    occ_fore = pd.read_csv(TREND / "03_预测结果/skill_occupation_annual_forecast.csv", low_memory=False)
    occ_fore["canonical_skill"] = occ_fore["canonical_skill"].replace(legacy_skill_names)
    occ_fore = occ_fore.pivot_table(index=["canonical_skill", "minor_class_name"], columns="year", values="prediction", aggfunc="first").reset_index()
    occ_fore = occ_fore.rename(columns={2026: "2026年职业内技能需求占比预测", 2027: "2027年职业内技能需求占比预测", 2028: "2028年职业内技能需求占比预测"})
    occ = occ.merge(occ_fore, on=["canonical_skill", "minor_class_name"], how="left")
    occ = occ.rename(columns={
        "minor_class_code": "职业小类代码", "minor_class_name": "职业小类名称", "pair_jobs": "关联岗位数",
        "skill_jobs": "技能岗位总数", "occupation_jobs": "职业岗位总数", "all_jobs": "全样本岗位数",
        "occupation_probability_given_skill": "掌握技能后进入该职业概率",
        "skill_demand_rate_within_occupation": "职业内技能需求占比",
        "occupation_specialization_lq": "职业技能相对集中度",
        "smoothed_occupation_probability": "平滑后职业匹配概率",
    })
    occ["职业排名"] = occ.groupby("标准技能名称")["掌握技能后进入该职业概率"].rank(method="first", ascending=False).astype("Int64")
    occ.insert(0, "职业技能关系主键", [f"GJ{i:07d}" for i in range(1, len(occ) + 1)])
    save_table(occ, REL / "04_职业技能关系表")

    city = pd.read_csv(TREND / "03_预测结果/skill_city_annual_forecast.csv", low_memory=False)
    city["canonical_skill"] = city["canonical_skill"].replace(legacy_skill_names)
    city = city.merge(meta, left_on="canonical_skill", right_on="标准技能名称", how="left")
    city = city.rename(columns={
        "city_std": "城市", "year": "预测年份", "prediction": "城市内技能需求占比预测",
        "lower_90": "预测下限90%", "upper_90": "预测上限90%", "selected_model": "预测模型",
        "mean_trend_weight": "趋势模型平均权重",
    })
    city["每万岗位需求数预测"] = city["城市内技能需求占比预测"] * 10000
    city["城市排名"] = city.groupby(["标准技能名称", "预测年份"])["城市内技能需求占比预测"].rank(method="first", ascending=False).astype("Int64")
    city.insert(0, "城市技能关系主键", [f"CS{i:07d}" for i in range(1, len(city) + 1)])
    save_table(city, REL / "05_城市技能关系表")
    return occ, city


def build_pair_relations(master: pd.DataFrame, selected_pairs: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    mapping = master[["标准技能名称"]].drop_duplicates().copy()
    mapping["标准化键"] = mapping["标准技能名称"].map(normalize_key)
    pairs = selected_pairs[["技能组合编号", "技能一标准化键", "技能二标准化键"]].copy()

    con = duckdb.connect(str(ROOT / "00_代码与口径/关系表构建缓存.duckdb"))
    con.execute("PRAGMA threads=6")
    con.execute("PRAGMA memory_limit='10GB'")
    con.register("skill_map", mapping)
    con.register("selected_pairs", pairs)
    con.execute(f"""
        CREATE OR REPLACE TABLE js_std AS
        SELECT DISTINCT j.job_id, lower(regexp_replace(trim(j.canonical_skill), '\\s+', '', 'g')) AS skill_key,
               j.minor_class_code, j.minor_class_name, j.city_std
        FROM read_parquet('{JOB_SKILLS}') j
        WHERE j.canonical_skill IS NOT NULL
    """)
    con.execute("CREATE INDEX IF NOT EXISTS idx_js_job_skill ON js_std(job_id, skill_key)")
    con.execute("CREATE OR REPLACE TABLE selected_pairs_local AS SELECT * FROM selected_pairs")
    con.execute("CREATE INDEX IF NOT EXISTS idx_pair_keys ON selected_pairs_local(技能一标准化键, 技能二标准化键)")
    con.execute("""
        CREATE OR REPLACE TABLE matched_pairs AS
        SELECT DISTINCT p.技能组合编号, a.job_id, a.minor_class_code, a.minor_class_name, a.city_std
        FROM js_std a
        JOIN js_std b ON a.job_id=b.job_id AND a.skill_key < b.skill_key
        JOIN selected_pairs_local p
          ON a.skill_key=p.技能一标准化键 AND b.skill_key=p.技能二标准化键
    """)
    pair_totals = con.execute("SELECT 技能组合编号, count(DISTINCT job_id) 组合岗位总数 FROM matched_pairs GROUP BY 1").df()
    occ_totals = con.execute(f"SELECT minor_class_code, minor_class_name, count(*) 职业岗位总数 FROM read_parquet('{JOBS}') GROUP BY 1,2").df()
    city_totals = con.execute(f"SELECT city_std, count(*) 城市岗位总数 FROM read_parquet('{JOBS}') WHERE city_std IS NOT NULL GROUP BY 1").df()
    all_jobs = int(con.execute(f"SELECT count(*) FROM read_parquet('{JOBS}')").fetchone()[0])

    pair_occ = con.execute("""
        SELECT 技能组合编号, minor_class_code, minor_class_name, count(DISTINCT job_id) 组合职业关联岗位数
        FROM matched_pairs WHERE minor_class_name IS NOT NULL GROUP BY 1,2,3 HAVING count(DISTINCT job_id)>=3
    """).df()
    pair_city = con.execute("""
        SELECT 技能组合编号, city_std, count(DISTINCT job_id) 组合城市关联岗位数
        FROM matched_pairs WHERE city_std IS NOT NULL GROUP BY 1,2 HAVING count(DISTINCT job_id)>=3
    """).df()
    con.close()

    pair_occ = pair_occ.merge(pair_totals, on="技能组合编号", how="left").merge(occ_totals, on=["minor_class_code", "minor_class_name"], how="left")
    pair_occ["掌握组合后进入该职业概率"] = pair_occ["组合职业关联岗位数"] / pair_occ["组合岗位总数"]
    pair_occ["职业内组合需求占比"] = pair_occ["组合职业关联岗位数"] / pair_occ["职业岗位总数"]
    pair_occ["职业组合相对集中度"] = pair_occ["职业内组合需求占比"] / (pair_occ["组合岗位总数"] / all_jobs)
    pair_occ["职业排名"] = pair_occ.groupby("技能组合编号")["掌握组合后进入该职业概率"].rank(method="first", ascending=False).astype("Int64")
    pair_occ.rename(columns={"minor_class_code": "职业小类代码", "minor_class_name": "职业小类名称"}, inplace=True)
    pair_occ.insert(0, "组合职业关系主键", [f"ZG{i:08d}" for i in range(1, len(pair_occ) + 1)])
    save_table(pair_occ, REL / "06_技能组合职业关系表")

    pair_city = pair_city.merge(pair_totals, on="技能组合编号", how="left").merge(city_totals, left_on="city_std", right_on="city_std", how="left")
    pair_city["掌握组合后进入该城市概率"] = pair_city["组合城市关联岗位数"] / pair_city["组合岗位总数"]
    pair_city["城市内组合需求占比"] = pair_city["组合城市关联岗位数"] / pair_city["城市岗位总数"]
    pair_city["城市组合相对集中度"] = pair_city["城市内组合需求占比"] / (pair_city["组合岗位总数"] / all_jobs)
    pair_city["城市排名"] = pair_city.groupby("技能组合编号")["掌握组合后进入该城市概率"].rank(method="first", ascending=False).astype("Int64")
    pair_city.rename(columns={"city_std": "城市"}, inplace=True)
    pair_city.insert(0, "组合城市关系主键", [f"ZC{i:08d}" for i in range(1, len(pair_city) + 1)])
    save_table(pair_city, REL / "07_技能组合城市关系表")
    return pair_occ, pair_city


def write_docs(tables: dict[str, pd.DataFrame]) -> None:
    audit_rows = []
    primary_keys = {
        "技能主表": "技能主键", "技能别名表": "技能别名主键", "技能组合关系表": "技能组合编号",
        "职业技能关系表": "职业技能关系主键", "城市技能关系表": "城市技能关系主键",
        "技能组合职业关系表": "组合职业关系主键", "技能组合城市关系表": "组合城市关系主键",
    }
    for name, df in tables.items():
        pk = primary_keys[name]
        audit_rows.append({
            "数据表": name, "记录数": len(df), "字段数": len(df.columns), "主键字段": pk,
            "主键缺失数": int(df[pk].isna().sum()), "主键重复数": int(df[pk].duplicated().sum()),
            "标准技能缺失数": int(df["标准技能名称"].isna().sum()) if "标准技能名称" in df.columns else np.nan,
            "审计结论": "通过" if df[pk].notna().all() and not df[pk].duplicated().any() else "需复核",
        })
    audit = pd.DataFrame(audit_rows)
    audit.to_csv(DOC / "数据质量审计.csv", index=False, encoding="utf-8-sig")

    fields = []
    for name, df in tables.items():
        for col in df.columns:
            fields.append({"数据表": name, "字段名称": col, "数据类型": str(df[col].dtype), "非空记录数": int(df[col].notna().sum())})
    pd.DataFrame(fields).to_csv(DOC / "字段说明.csv", index=False, encoding="utf-8-sig")

    catalog = pd.DataFrame([
        ["01_技能主表", "一项标准技能一行", "用户技能画像、单项技能趋势与工资前景"],
        ["02_技能别名表", "一个别名与一个标准技能一行", "将自然语言输入统一至标准技能"],
        ["03_技能组合关系表", "一组技能组合一行", "共现、互补工资与未来前景"],
        ["04_职业技能关系表", "一个职业小类与一项技能一行", "职业推荐与匹配概率"],
        ["05_城市技能关系表", "一个城市、技能、预测年份一行", "城市推荐与需求预测"],
        ["06_技能组合职业关系表", "一个技能组合与职业小类一行", "多技能输入的职业推荐"],
        ["07_技能组合城市关系表", "一个技能组合与城市一行", "多技能输入的城市推荐"],
    ], columns=["数据表", "统计单位", "核心用途"])
    catalog.to_csv(DOC / "数据表目录.csv", index=False, encoding="utf-8-sig")

    readme = """# AI职业技能智能推荐数据底座 v2

本版本面向用户同时输入一项或多项技能的推荐场景。核心表保留单项技能及其别名，关系表分别连接技能、职业、城市和技能组合。

## 使用顺序
1. 使用技能别名表标准化用户输入。
2. 单项技能从职业技能关系表和城市技能关系表检索。
3. 多项技能先从技能组合关系表检索已有组合，再从技能组合职业关系表和技能组合城市关系表取得联合推荐。
4. 未出现的三项及以上组合，可将其中两两组合的证据按岗位数或共现强度加权汇总，并用各单项技能关系作为回退。

## 关系表口径
技能组合职业表和技能组合城市表仅保留历史关联岗位数不少于3条的关系，以减少极小样本噪声。该阈值不改变技能组合主表中的组合清单。
"""
    (DOC / "README.md").write_text(readme, encoding="utf-8")
    (DOC / "构建摘要.json").write_text(json.dumps({name: {"rows": len(df), "columns": len(df.columns)} for name, df in tables.items()}, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    master, aliases, _ = build_master_and_aliases()
    combo, selected_pairs = build_combination_table(master)
    occ, city = build_skill_relations(master)
    pair_occ, pair_city = build_pair_relations(master, selected_pairs)
    tables = {
        "技能主表": master, "技能别名表": aliases, "技能组合关系表": combo,
        "职业技能关系表": occ, "城市技能关系表": city,
        "技能组合职业关系表": pair_occ, "技能组合城市关系表": pair_city,
    }
    write_docs(tables)
    print(json.dumps({name: list(df.shape) for name, df in tables.items()}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
