import fs from "node:fs";
import path from "node:path";

import { parse } from "csv-parse/sync";

const root = process.cwd();
const skillsPath = path.join(root, "data", "01_核心表", "01_技能主表.csv");
const pairsPath = path.join(root, "data", "01_核心表", "03_技能组合关系表.csv");
const outputPath = path.join(root, "public", "data", "skill-network.json");

const clusterCenters = [
  [-250, -85], [-410, -45], [400, 120], [-540, 80], [-245, 185], [-450, 310],
  [300, 175], [-240, 350], [10, 365], [555, 325], [160, 455], [-410, -305],
  [485, -25], [-520, -405], [300, -315], [-650, 220], [-515, -205], [-690, -75],
  [470, -255], [-625, 370], [350, 280], [320, 45]
];

const pendingCenter = [0, -500];

const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const hash = (value) => {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.codePointAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
};

const skills = parse(fs.readFileSync(skillsPath), {
  bom: true,
  columns: true,
  skip_empty_lines: true
});
const pairs = parse(fs.readFileSync(pairsPath), {
  bom: true,
  columns: true,
  skip_empty_lines: true
});

const validPairs = pairs.filter((row) => {
  const weight = number(row["历史共现相似度"]);
  return row["技能一名称"] && row["技能二名称"] && weight !== null && weight > 0;
});
const groupedSkills = new Map();

for (const row of skills) {
  const id = row["标准技能名称"];
  const cluster = Number(row["技能簇编号"]);
  if (!id || !Number.isInteger(cluster) || cluster < 0 || cluster > 22) continue;
  const group = groupedSkills.get(cluster) ?? [];
  group.push(row);
  groupedSkills.set(cluster, group);
}

const nodes = [];
for (const [cluster, rows] of [...groupedSkills.entries()].sort((a, b) => a[0] - b[0])) {
  rows.sort((a, b) => Number(b["词典命中岗位数"] || 0) - Number(a["词典命中岗位数"] || 0));
  const [centerX, centerY] = cluster === 0 ? pendingCenter : clusterCenters[cluster - 1];
  rows.forEach((row, index) => {
    const angle = index * 2.399963 + (hash(row["标准技能名称"]) % 628) / 100;
    const radius = index === 0 ? 0 : 10.5 * Math.sqrt(index);
    nodes.push({
      id: row["标准技能名称"],
      label: row["技能显示名称"] || row["技能展示名称"] || row["标准技能名称"],
      cluster,
      clusterName: row["技能簇名称"] || (cluster === 0 ? "待复核稀有技能" : `技能簇${cluster}`),
      type: row["规范技能类型"] || row["技能一级类型"] || "其他技能",
      jobs: Math.round(number(row["词典命中岗位数"]) ?? 0),
      demand2025: round(number(row["2025年每万岗位需求数"]), 1),
      salary2025: round(number(row["2025年月薪中位数"]), 0),
      forecast2028: round(number(row["2028年岗位需求每万岗位数预测"]), 1),
      trend: row["需求趋势判断"] || null,
      occupation: row["第1相关职业_职业小类名称"] || null,
      x: round(centerX + Math.cos(angle) * radius, 1),
      y: round(centerY + Math.sin(angle) * radius * 0.72, 1)
    });
  });
}

const nodeIds = new Set(nodes.map((node) => node.id));
const edgeKeys = new Set();
const edges = [];
for (const row of validPairs) {
  const source = row["技能一名称"];
  const target = row["技能二名称"];
  if (!nodeIds.has(source) || !nodeIds.has(target) || source === target) continue;
  const key = [source, target].sort().join("\u0000");
  if (edgeKeys.has(key)) continue;
  edgeKeys.add(key);
  edges.push({ source, target, weight: round(Number(row["历史共现相似度"]), 3) });
}

const clusters = [...groupedSkills.entries()]
  .sort((a, b) => a[0] - b[0])
  .map(([id, rows]) => ({
    id,
    name: rows[0]["技能簇名称"] || (id === 0 ? "待复核稀有技能" : `技能簇${id}`),
    count: rows.length
  }));

function round(value, digits) {
  if (value === null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify({
  meta: { nodeCount: nodes.length, edgeCount: edges.length, clusterCount: clusters.filter((cluster) => cluster.id > 0).length },
  clusters,
  nodes,
  edges
}));

console.log(`Wrote ${nodes.length} nodes and ${edges.length} edges to ${outputPath}`);
