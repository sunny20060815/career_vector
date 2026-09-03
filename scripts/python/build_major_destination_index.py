import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "data" / "02_关系表" / "13_专业职业先验表.csv"
OUTPUT = ROOT / "lib" / "generated" / "major-destination-priors.json"


def main() -> None:
    index: dict[str, dict[str, object]] = {}
    with SOURCE.open(encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            if row["是否用于职业排序"] != "是":
                continue
            code = row["专业代码"][:6]
            entry = index.setdefault(code, {"majorName": row["专业名称"], "rows": []})
            entry["rows"].append([
                row["职业小类代码"], row["职业小类名称"], row["去向名称"], row["去向占比"],
                row["展示顺序"], row["去向类型"], row["数据口径"], row["专业去向层级"], row["映射置信度"]
            ])
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
