"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Search, ZoomIn, ZoomOut } from "lucide-react";
import gsap from "gsap";

type SkillNode = {
  id: string;
  label: string;
  cluster: number;
  clusterName: string;
  type: string;
  jobs: number;
  demand2025: number | null;
  salary2025: number | null;
  forecast2028: number | null;
  trend: string | null;
  occupation: string | null;
  x: number;
  y: number;
};

type SkillEdge = { source: string; target: string; weight: number };
type SkillCluster = { id: number; name: string; count: number };
type NetworkData = {
  meta: { nodeCount: number; edgeCount: number; clusterCount: number };
  clusters: SkillCluster[];
  nodes: SkillNode[];
  edges: SkillEdge[];
};

type ViewState = { scale: number; x: number; y: number };
type PointerState = { id: number; x: number; y: number; moved: boolean } | null;

const clusterColors = [
  "#7e91a8", "#57c7e8", "#45b8cf", "#f3ca78", "#d7bf65", "#8ea7ef", "#a790e8", "#ff8c78",
  "#66aee5", "#4d92d0", "#f1a964", "#e48e50", "#9bd65d", "#78c9a1", "#f09bc2", "#a9b5c3",
  "#6fcad2", "#ba7bd0", "#d38ac8", "#91d19c", "#70c28d", "#f0bd55", "#f3d864"
];

const money = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });

export function SkillNetwork() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef<NetworkData | null>(null);
  const viewRef = useRef<ViewState>({ scale: 1, x: 0, y: 0 });
  const pointerRef = useRef<PointerState>(null);
  const hoveredRef = useRef<string | null>(null);
  const animationRef = useRef<number | null>(null);
  const reducedMotionRef = useRef(false);
  const [data, setData] = useState<NetworkData | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [clusterId, setClusterId] = useState("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState(false);

  const nodeMap = useMemo(() => new Map(data?.nodes.map((node) => [node.id, node]) ?? []), [data]);
  const adjacency = useMemo(() => {
    const result = new Map<string, { id: string; weight: number }[]>();
    for (const edge of data?.edges ?? []) {
      result.set(edge.source, [...(result.get(edge.source) ?? []), { id: edge.target, weight: edge.weight }]);
      result.set(edge.target, [...(result.get(edge.target) ?? []), { id: edge.source, weight: edge.weight }]);
    }
    for (const items of result.values()) items.sort((a, b) => b.weight - a.weight);
    return result;
  }, [data]);
  const selectedNode = selectedId ? nodeMap.get(selectedId) ?? null : null;
  const related = useMemo(() => {
    if (!selectedId) return [];
    return (adjacency.get(selectedId) ?? [])
      .map((item) => ({ node: nodeMap.get(item.id), weight: item.weight }))
      .filter((item): item is { node: SkillNode; weight: number } => Boolean(item.node))
      .slice(0, 5);
  }, [adjacency, nodeMap, selectedId]);

  useLayoutEffect(() => {
    if (!rootRef.current) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(rootRef.current, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.65, ease: "power2.out" });
    });
    mm.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set(rootRef.current, { autoAlpha: 1, y: 0 });
    });
    return () => mm.revert();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/skill-network.json", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("network data unavailable");
        return response.json() as Promise<NetworkData>;
      })
      .then((nextData) => {
        dataRef.current = nextData;
        setData(nextData);
        setSelectedId(nextData.nodes.find((node) => node.id === "人工智能技术")?.id ?? nextData.nodes[0]?.id ?? null);
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(true);
      });
    return () => controller.abort();
  }, []);

  const resetView = useCallback(() => {
    const frame = frameRef.current;
    const network = dataRef.current;
    if (!frame || !network) return;
    const xs = network.nodes.map((node) => node.x);
    const ys = network.nodes.map((node) => node.y);
    const minX = Math.min(...xs) - 70;
    const maxX = Math.max(...xs) + 70;
    const minY = Math.min(...ys) - 70;
    const maxY = Math.max(...ys) + 70;
    const width = frame.clientWidth;
    const height = frame.clientHeight;
    const scale = Math.min(width / (maxX - minX), height / (maxY - minY));
    viewRef.current = {
      scale,
      x: width / 2 - ((minX + maxX) / 2) * scale,
      y: height / 2 - ((minY + maxY) / 2) * scale
    };
  }, []);

  const zoom = useCallback((factor: number) => {
    const frame = frameRef.current;
    if (!frame) return;
    const view = viewRef.current;
    const cx = frame.clientWidth / 2;
    const cy = frame.clientHeight / 2;
    const nextScale = Math.min(2.8, Math.max(0.35, view.scale * factor));
    const ratio = nextScale / view.scale;
    viewRef.current = { scale: nextScale, x: cx - (cx - view.x) * ratio, y: cy - (cy - view.y) * ratio };
  }, []);

  useEffect(() => {
    if (!data || !frameRef.current) return;
    resetView();
    const frame = frameRef.current;
    const resize = new ResizeObserver(() => resetView());
    resize.observe(frame);
    return () => resize.disconnect();
  }, [data, resetView]);

  useEffect(() => {
    if (!data || !frameRef.current || !canvasRef.current) return;
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = reducedQuery.matches;

    const draw = (time = 0) => {
      const context = canvas.getContext("2d");
      if (!context) return;
      const width = frame.clientWidth;
      const height = frame.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      const view = viewRef.current;
      const selectedCluster = clusterId === "all" ? null : Number(clusterId);
      const queryKey = query.trim().toLocaleLowerCase("zh-CN");
      const selected = selectedId;
      const hovered = hoveredRef.current;
      const selectedNeighbors = new Set((selected ? adjacency.get(selected) ?? [] : []).slice(0, 8).map((item) => item.id));
      const hoveredNeighbors = new Set((hovered ? adjacency.get(hovered) ?? [] : []).slice(0, 6).map((item) => item.id));

      context.lineCap = "round";
      for (const edge of data.edges) {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) continue;
        if (selectedCluster !== null && (source.cluster !== selectedCluster || target.cluster !== selectedCluster)) continue;
        const selectedLink = Boolean(selected && ((source.id === selected && selectedNeighbors.has(target.id)) || (target.id === selected && selectedNeighbors.has(source.id))));
        const hoveredLink = Boolean(hovered && ((source.id === hovered && hoveredNeighbors.has(target.id)) || (target.id === hovered && hoveredNeighbors.has(source.id))));
        const touchesActive = selectedLink || hoveredLink;
        context.beginPath();
        context.moveTo(source.x * view.scale + view.x, source.y * view.scale + view.y);
        context.lineTo(target.x * view.scale + view.x, target.y * view.scale + view.y);
        context.strokeStyle = touchesActive ? "rgba(101, 199, 244, 0.58)" : "rgba(103, 164, 207, 0.075)";
        context.lineWidth = touchesActive ? 1.35 : 0.45;
        context.stroke();
      }

      const ranked = [...data.nodes].sort((a, b) => b.jobs - a.jobs);
      const labelLimit = width < 640 ? 10 : selectedCluster === null ? 22 : 30;
      const labelIds = new Set<string>();
      for (const node of ranked) {
        if (selectedCluster !== null && node.cluster !== selectedCluster) continue;
        if (selectedCluster === null && [...labelIds].some((id) => nodeMap.get(id)?.cluster === node.cluster)) continue;
        labelIds.add(node.id);
        if (labelIds.size >= labelLimit) break;
      }

      for (const node of data.nodes) {
        const inCluster = selectedCluster === null || node.cluster === selectedCluster;
        const matchesQuery = !queryKey || node.id.toLocaleLowerCase("zh-CN").includes(queryKey) || node.label.toLocaleLowerCase("zh-CN").includes(queryKey);
        const isSelected = node.id === selected;
        const isHovered = node.id === hovered;
        const isNeighbor = selectedNeighbors.has(node.id);
        const x = node.x * view.scale + view.x;
        const y = node.y * view.scale + view.y;
        const baseRadius = 2.1 + Math.min(4.2, Math.log10(node.jobs + 1) * 0.72);
        const radius = baseRadius + (isSelected ? 2.4 : isHovered ? 1.5 : 0);
        const color = clusterColors[node.cluster] ?? clusterColors[0];

        context.globalAlpha = inCluster && matchesQuery ? 0.92 : inCluster && queryKey ? 0.14 : 0.08;
        if (isSelected && !reducedMotionRef.current) {
          const pulse = 6 + Math.sin(time / 420) * 2;
          context.beginPath();
          context.arc(x, y, radius + pulse, 0, Math.PI * 2);
          context.strokeStyle = "rgba(128, 213, 255, 0.32)";
          context.lineWidth = 1;
          context.stroke();
        }
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fillStyle = color;
        context.fill();
        if (isSelected || isHovered) {
          context.strokeStyle = "#eaf7ff";
          context.lineWidth = 1.3;
          context.stroke();
        }
        context.globalAlpha = 1;

      }
      context.globalAlpha = 1;

      const labelCandidates = data.nodes
        .filter((node) => {
          const inCluster = selectedCluster === null || node.cluster === selectedCluster;
          const matchesQuery = !queryKey || node.id.toLocaleLowerCase("zh-CN").includes(queryKey) || node.label.toLocaleLowerCase("zh-CN").includes(queryKey);
          return inCluster && matchesQuery && (node.id === selected || node.id === hovered || labelIds.has(node.id) || selectedNeighbors.has(node.id) || Boolean(queryKey));
        })
        .sort((a, b) => labelPriority(b, selected, hovered, selectedNeighbors) - labelPriority(a, selected, hovered, selectedNeighbors));
      const occupied: Array<{ left: number; top: number; right: number; bottom: number }> = [];
      for (const node of labelCandidates) {
        const isSelected = node.id === selected;
        const isHovered = node.id === hovered;
        const x = node.x * view.scale + view.x;
        const y = node.y * view.scale + view.y;
        const radius = 2.1 + Math.min(4.2, Math.log10(node.jobs + 1) * 0.72) + (isSelected ? 2.4 : isHovered ? 1.5 : 0);
        const fontSize = width < 640 ? 10 : 11;
        context.font = `${isSelected ? 600 : 500} ${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
        const textWidth = context.measureText(node.id).width;
        const drawLeft = x > width - textWidth - 28;
        const textX = drawLeft ? x - radius - textWidth - 5 : x + radius + 5;
        const textY = y - radius - 2;
        const bounds = { left: textX - 3, top: textY - fontSize - 3, right: textX + textWidth + 3, bottom: textY + 4 };
        const mustShow = isHovered || (isSelected && !hovered);
        if (!mustShow && occupied.some((item) => rectanglesOverlap(item, bounds))) continue;
        occupied.push(bounds);
        context.fillStyle = mustShow ? "#f4fbff" : "rgba(193, 222, 240, 0.82)";
        context.fillText(node.id, textX, textY);
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    };
  }, [adjacency, clusterId, data, nodeMap, query, selectedId]);

  const screenToWorld = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const view = viewRef.current;
    return { x: (clientX - rect.left - view.x) / view.scale, y: (clientY - rect.top - view.y) / view.scale };
  };

  const findNode = (clientX: number, clientY: number) => {
    if (!data) return null;
    const point = screenToWorld(clientX, clientY);
    if (!point) return null;
    const selectedCluster = clusterId === "all" ? null : Number(clusterId);
    let closest: SkillNode | null = null;
    let distance = 14 / viewRef.current.scale;
    for (const node of data.nodes) {
      if (selectedCluster !== null && node.cluster !== selectedCluster) continue;
      const nextDistance = Math.hypot(node.x - point.x, node.y - point.y);
      if (nextDistance < distance) {
        closest = node;
        distance = nextDistance;
      }
    }
    return closest;
  };

  const handleSearch = () => {
    if (!data || !query.trim()) return;
    const key = query.trim().toLocaleLowerCase("zh-CN");
    const match = data.nodes.find((node) => node.id.toLocaleLowerCase("zh-CN") === key || node.label.toLocaleLowerCase("zh-CN") === key)
      ?? data.nodes.find((node) => node.id.toLocaleLowerCase("zh-CN").includes(key) || node.label.toLocaleLowerCase("zh-CN").includes(key));
    if (!match) return;
    setSelectedId(match.id);
    setClusterId("all");
    const frame = frameRef.current;
    if (frame) {
      viewRef.current = { ...viewRef.current, x: frame.clientWidth / 2 - match.x * viewRef.current.scale, y: frame.clientHeight / 2 - match.y * viewRef.current.scale };
    }
  };

  return (
    <div ref={rootRef} className="mt-7 border border-[#23557c] bg-[#041b31]">
      <div className="flex flex-col gap-3 border-b border-[#214e72] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#e4f1fa]">交互式技能共现网络</p>
          <p className="mt-1 text-xs text-[#6f91aa]">搜索、筛选或点击节点，查看技能的市场指标及组合关系</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <form className="flex h-9 min-w-0 border border-[#2a5b80] bg-[#061f38] focus-within:border-[#55a7de]" onSubmit={(event) => { event.preventDefault(); handleSearch(); }}>
            <label className="sr-only" htmlFor="skill-network-search">搜索技能</label>
            <input id="skill-network-search" list="skill-network-options" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索技能" className="min-w-0 flex-1 bg-transparent px-3 text-xs text-[#dcebf5] outline-none placeholder:text-[#50718b] sm:w-36" />
            <datalist id="skill-network-options">{data?.nodes.map((node) => <option key={node.id} value={node.id} />)}</datalist>
            <button type="submit" className="grid w-9 place-items-center border-l border-[#2a5b80] text-[#72b8e8] transition-colors hover:bg-[#103655]" aria-label="搜索"><Search size={15} /></button>
          </form>
          <label className="sr-only" htmlFor="skill-cluster-filter">筛选技能簇</label>
          <select id="skill-cluster-filter" value={clusterId} onChange={(event) => setClusterId(event.target.value)} className="h-9 min-w-0 border border-[#2a5b80] bg-[#061f38] px-3 text-xs text-[#a9c1d2] outline-none focus:border-[#55a7de] sm:max-w-52">
            <option value="all">全部技能簇</option>
            {data?.clusters.map((cluster) => <option key={cluster.id} value={cluster.id}>{cluster.id === 0 ? "待复核稀有技能" : `${String(cluster.id).padStart(2, "0")} · ${cluster.name}`}（{cluster.count}）</option>)}
          </select>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
        <div ref={frameRef} className="relative h-[430px] overflow-hidden bg-[#03182b] sm:h-[520px] lg:h-[600px]">
          {error ? <div className="grid h-full place-items-center px-6 text-center text-sm text-[#8fa8ba]">技能网络数据暂时无法加载</div> : !data ? <div className="grid h-full place-items-center text-sm text-[#6e8da4]">正在载入830项技能关系…</div> : null}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 cursor-crosshair touch-none"
            role="img"
            aria-label="830项标准化技能及其共现关系的交互网络图"
            onPointerDown={(event) => {
              pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const pointer = pointerRef.current;
              if (pointer?.id === event.pointerId) {
                const dx = event.clientX - pointer.x;
                const dy = event.clientY - pointer.y;
                if (Math.abs(dx) + Math.abs(dy) > 2) pointer.moved = true;
                viewRef.current = { ...viewRef.current, x: viewRef.current.x + dx, y: viewRef.current.y + dy };
                pointer.x = event.clientX;
                pointer.y = event.clientY;
                return;
              }
              const node = findNode(event.clientX, event.clientY);
              const nextId = node?.id ?? null;
              if (nextId !== hoveredRef.current) {
                hoveredRef.current = nextId;
                setHoveredId(nextId);
              }
            }}
            onPointerUp={(event) => {
              const pointer = pointerRef.current;
              if (pointer && !pointer.moved) {
                const node = findNode(event.clientX, event.clientY);
                if (node) setSelectedId(node.id);
              }
              pointerRef.current = null;
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerLeave={() => {
              hoveredRef.current = null;
              setHoveredId(null);
            }}
            onWheel={(event) => {
              event.preventDefault();
              const rect = event.currentTarget.getBoundingClientRect();
              const view = viewRef.current;
              const px = event.clientX - rect.left;
              const py = event.clientY - rect.top;
              const nextScale = Math.min(2.8, Math.max(0.35, view.scale * (event.deltaY < 0 ? 1.12 : 0.89)));
              const ratio = nextScale / view.scale;
              viewRef.current = { scale: nextScale, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio };
            }}
          />
          {hoveredId && nodeMap.get(hoveredId) ? <div className="pointer-events-none absolute bottom-4 left-4 border border-[#326b94] bg-[#05213beF] px-3 py-2 text-xs text-[#dcecf6] shadow-xl">{nodeMap.get(hoveredId)!.label}</div> : null}
          <div className="absolute right-3 top-3 flex border border-[#285b82] bg-[#061f38e6]">
            <ToolButton label="放大" onClick={() => zoom(1.2)}><ZoomIn size={15} /></ToolButton>
            <ToolButton label="缩小" onClick={() => zoom(0.82)}><ZoomOut size={15} /></ToolButton>
            <ToolButton label="适应画布" onClick={resetView}><Maximize2 size={15} /></ToolButton>
          </div>
          <div className="pointer-events-none absolute bottom-3 right-3 bg-[#041a2fe6] px-2.5 py-1.5 font-mono text-[10px] text-[#63859e]">拖拽移动 · 滚轮缩放 · 点击查看</div>
        </div>

        <aside className="border-t border-[#214e72] bg-[#062039] p-5 lg:border-l lg:border-t-0" aria-live="polite">
          {selectedNode ? (
            <>
              <div className="flex items-start gap-3">
                <span className="mt-1 h-2.5 w-2.5 shrink-0" style={{ backgroundColor: clusterColors[selectedNode.cluster] ?? clusterColors[0] }} />
                <div className="min-w-0"><h3 className="text-lg font-semibold leading-6 text-[#f0f7fb]">{selectedNode.label}</h3><p className="mt-1 text-xs leading-5 text-[#7192aa]">{selectedNode.type}</p></div>
              </div>
              <div className="mt-5 border-y border-[#234e6f] py-4">
                <DetailRow label="所属技能簇" value={selectedNode.cluster === 0 ? "待复核稀有技能" : `${String(selectedNode.cluster).padStart(2, "0")} · ${selectedNode.clusterName}`} />
                <DetailRow label="2025年需求强度" value={formatDemand(selectedNode.demand2025)} />
                <DetailRow label="2025年月薪中位数" value={selectedNode.salary2025 === null ? "暂无" : `${money.format(selectedNode.salary2025)}元`} />
                <DetailRow label="2028年需求预测" value={formatDemand(selectedNode.forecast2028)} />
                <DetailRow label="需求趋势" value={selectedNode.trend ?? "暂无判断"} accent />
                <DetailRow label="主要相关职业" value={selectedNode.occupation ?? "暂无"} />
              </div>
              <div className="mt-5">
                <p className="text-[10px] font-semibold tracking-[0.16em] text-[#5e829c]">最紧密关联技能</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {related.length ? related.map((item) => <button key={item.node.id} type="button" onClick={() => { setClusterId("all"); setSelectedId(item.node.id); }} className="border border-[#2a5f86] bg-[#082946] px-2.5 py-1.5 text-left text-xs text-[#a9c8dc] transition-colors hover:border-[#5ba8dc] hover:text-white"><span>{item.node.label}</span><span className="ml-1.5 font-mono text-[9px] text-[#527995]">{item.weight.toFixed(3)}</span></button>) : <p className="text-xs leading-5 text-[#64839a]">暂无达到展示阈值的共现关系</p>}
                </div>
              </div>
            </>
          ) : <p className="text-sm text-[#7191a8]">点击任一节点查看技能详情。</p>}
        </aside>
      </div>

      <div className="flex flex-col gap-2 border-t border-[#214e72] px-4 py-3 text-[10px] leading-5 text-[#5d7e96] sm:flex-row sm:items-center sm:justify-between">
        <p>节点越大，历史招聘出现频率越高；连线表示两项技能在同一岗位中的标准化共现关系。</p>
        <p className="shrink-0 font-mono">{data ? `${data.meta.nodeCount} SKILLS · ${data.meta.edgeCount} LINKS · 22 CLUSTERS` : "LOADING NETWORK"}</p>
      </div>
    </div>
  );
}

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className="grid h-9 w-9 place-items-center border-r border-[#285b82] text-[#77b9e5] transition-colors last:border-r-0 hover:bg-[#103857] hover:text-white" aria-label={label} title={label}>{children}</button>;
}

function DetailRow({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 py-1.5 text-xs"><span className="text-[#66869d]">{label}</span><span className={`text-right leading-5 ${accent ? "text-[#73c6ef]" : "text-[#c5d6e2]"}`}>{value}</span></div>;
}

function formatDemand(value: number | null) {
  return value === null ? "暂无" : `${value.toFixed(1)}个/万岗位`;
}

function labelPriority(node: SkillNode, selected: string | null, hovered: string | null, neighbors: Set<string>) {
  if (node.id === selected) return Number.MAX_SAFE_INTEGER;
  if (node.id === hovered) return Number.MAX_SAFE_INTEGER - 1;
  if (neighbors.has(node.id)) return 1_000_000 + node.jobs;
  return node.jobs;
}

function rectanglesOverlap(a: { left: number; top: number; right: number; bottom: number }, b: { left: number; top: number; right: number; bottom: number }) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
