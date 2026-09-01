"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import * as THREE from "three";

const SKILL_COUNT = 830;
const CLUSTER_COUNT = 22;
const GLOBE_RADIUS = 1.18;
const FEATURED_SKILLS = [
  { name: "人工智能", index: 18 },
  { name: "Python", index: 56 },
  { name: "数据分析", index: 94 },
  { name: "Java", index: 132 },
  { name: "质量管理", index: 170 },
  { name: "工业自动化", index: 208 },
  { name: "软件测试", index: 246 },
  { name: "网络安全", index: 284 },
  { name: "云计算", index: 322 },
  { name: "大数据", index: 360 },
  { name: "机械设计", index: 398 },
  { name: "供应链管理", index: 436 },
  { name: "沟通能力", index: 474 },
  { name: "项目管理", index: 512 },
  { name: "财务管理", index: 550 },
  { name: "风险管理", index: 588 },
  { name: "医药研发", index: 626 },
  { name: "视觉设计", index: 664 },
  { name: "人力资源", index: 702 },
  { name: "安全管理", index: 740 },
  { name: "数据库技术", index: 778 },
  { name: "统计分析", index: 816 }
];

function buildSkillPositions() {
  const positions = new Float32Array(SKILL_COUNT * 3);
  const points: THREE.Vector3[] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let index = 0; index < SKILL_COUNT; index += 1) {
    const y = 1 - (index / (SKILL_COUNT - 1)) * 2;
    const ringRadius = Math.sqrt(1 - y * y);
    const angle = goldenAngle * index;
    const point = new THREE.Vector3(
      Math.cos(angle) * ringRadius * GLOBE_RADIUS,
      y * GLOBE_RADIUS,
      Math.sin(angle) * ringRadius * GLOBE_RADIUS
    );
    point.toArray(positions, index * 3);
    points.push(point);
  }

  return { points, positions };
}

function buildNetworkLines(points: THREE.Vector3[]) {
  const linePositions: number[] = [];

  for (let index = 0; index < points.length; index += 3) {
    const nearest: Array<{ distance: number; point: THREE.Vector3 }> = [];
    for (let candidate = 0; candidate < points.length; candidate += 1) {
      if (candidate === index) continue;
      const distance = points[index].distanceToSquared(points[candidate]);
      if (nearest.length < 2 || distance < nearest[nearest.length - 1].distance) {
        nearest.push({ distance, point: points[candidate] });
        nearest.sort((a, b) => a.distance - b.distance);
        nearest.length = Math.min(nearest.length, 2);
      }
    }
    nearest.forEach(({ point }) => linePositions.push(...points[index].toArray(), ...point.toArray()));
  }

  for (let cluster = 0; cluster < CLUSTER_COUNT; cluster += 1) {
    const start = points[Math.floor((cluster * SKILL_COUNT) / CLUSTER_COUNT)];
    const end = points[Math.floor((((cluster + 7) % CLUSTER_COUNT) * SKILL_COUNT) / CLUSTER_COUNT)];
    linePositions.push(...start.toArray(), ...end.toArray());
  }

  return new Float32Array(linePositions);
}

function createPointTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext("2d");
  if (context) {
    context.beginPath();
    context.arc(16, 16, 10, 0, Math.PI * 2);
    context.fillStyle = "#ffffff";
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export function SkillGlobe() {
  const panelRef = useRef<HTMLElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!panelRef.current) return;
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(
        panelRef.current!,
        { autoAlpha: 0, scale: 0.97 },
        { autoAlpha: 1, scale: 1, duration: 0.8, ease: "power3.out" }
      );
      gsap.fromTo(
        panelRef.current!.querySelectorAll(".globe-copy"),
        { autoAlpha: 0, y: 8 },
        { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.08, delay: 0.35, ease: "power2.out" }
      );
    });
    return () => media.revert();
  }, []);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, 3.55);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    host.appendChild(renderer.domElement);

    const globe = new THREE.Group();
    globe.rotation.x = -0.16;
    globe.rotation.z = 0.08;
    scene.add(globe);

    const pointTexture = createPointTexture();
    const { points, positions } = buildSkillPositions();
    const labels = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(".globe-skill-label") ?? []);
    const skillGeometry = new THREE.BufferGeometry();
    skillGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const skillMaterial = new THREE.PointsMaterial({
      color: 0x79c8ff,
      map: pointTexture,
      alphaTest: 0.12,
      opacity: 0.82,
      size: 0.021,
      sizeAttenuation: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    globe.add(new THREE.Points(skillGeometry, skillMaterial));

    const clusterPositions = new Float32Array(CLUSTER_COUNT * 3);
    for (let cluster = 0; cluster < CLUSTER_COUNT; cluster += 1) {
      const index = Math.floor((cluster * SKILL_COUNT) / CLUSTER_COUNT);
      points[index].clone().multiplyScalar(1.012).toArray(clusterPositions, cluster * 3);
    }
    const clusterGeometry = new THREE.BufferGeometry();
    clusterGeometry.setAttribute("position", new THREE.BufferAttribute(clusterPositions, 3));
    const clusterMaterial = new THREE.PointsMaterial({
      color: 0xd8efff,
      map: pointTexture,
      alphaTest: 0.1,
      opacity: 1,
      size: 0.052,
      sizeAttenuation: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    globe.add(new THREE.Points(clusterGeometry, clusterMaterial));

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(buildNetworkLines(points), 3));
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x58b8ff,
      opacity: 0.2,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    globe.add(new THREE.LineSegments(lineGeometry, lineMaterial));

    const shellGeometry = new THREE.SphereGeometry(GLOBE_RADIUS * 0.995, 30, 18);
    const shellMaterial = new THREE.MeshBasicMaterial({
      color: 0x397cc2,
      opacity: 0.045,
      transparent: true,
      wireframe: true,
      depthWrite: false
    });
    globe.add(new THREE.Mesh(shellGeometry, shellMaterial));

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointerTarget = { x: 0, y: 0 };
    const onPointerMove = (event: PointerEvent) => {
      const bounds = host.getBoundingClientRect();
      pointerTarget.x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 0.24;
      pointerTarget.y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 0.14;
    };
    const onPointerLeave = () => { pointerTarget.x = 0; pointerTarget.y = 0; };
    host.addEventListener("pointermove", onPointerMove);
    host.addEventListener("pointerleave", onPointerLeave);

    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      renderer.setSize(width, height, true);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let animationFrame = 0;
    const projectedPoint = new THREE.Vector3();
    const render = () => {
      if (!reducedMotion.matches) globe.rotation.y += 0.0018;
      globe.rotation.x += ((-0.16 - pointerTarget.y) - globe.rotation.x) * 0.035;
      globe.rotation.z += ((0.08 + pointerTarget.x) - globe.rotation.z) * 0.025;
      globe.updateMatrixWorld();
      const candidates = labels.map((label, labelIndex) => {
        const skill = FEATURED_SKILLS[labelIndex];
        const worldPoint = points[skill.index].clone().multiplyScalar(1.035).applyMatrix4(globe.matrixWorld);
        projectedPoint.copy(worldPoint).project(camera);
        const x = (projectedPoint.x * 0.5 + 0.5) * host.clientWidth;
        const y = (-projectedPoint.y * 0.5 + 0.5) * host.clientHeight;
        const inFrame = x > 28 && x < host.clientWidth - 28 && y > 35 && y < host.clientHeight - 42;
        const frontOpacity = THREE.MathUtils.clamp((worldPoint.z - 0.02) * 2.2, 0, 1);
        label.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
        label.style.opacity = "0";
        return { label, name: skill.name, x, y, opacity: inFrame ? frontOpacity : 0 };
      });
      const placed: Array<{ x: number; y: number; width: number }> = [];
      const maxLabels = host.clientWidth < 400 ? 6 : 8;
      candidates.sort((a, b) => b.opacity - a.opacity).forEach((candidate) => {
        if (candidate.opacity < 0.16 || placed.length >= maxLabels) return;
        const width = candidate.name.length * 9 + 12;
        const overlaps = placed.some((item) => Math.abs(item.x - candidate.x) < (item.width + width) / 2 && Math.abs(item.y - candidate.y) < 18);
        if (overlaps) return;
        candidate.label.style.opacity = String(candidate.opacity);
        placed.push({ x: candidate.x, y: candidate.y, width });
      });
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(render);
    };
    render();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerleave", onPointerLeave);
      skillGeometry.dispose();
      clusterGeometry.dispose();
      lineGeometry.dispose();
      shellGeometry.dispose();
      skillMaterial.dispose();
      clusterMaterial.dispose();
      lineMaterial.dispose();
      shellMaterial.dispose();
      pointTexture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <section ref={panelRef} className="intro-unit skill-globe relative h-60 overflow-hidden border border-[#23466f] sm:h-64 lg:h-60" aria-label="技能共现网络三维动态图">
      <div className="globe-copy pointer-events-none absolute inset-x-4 top-3 z-10 flex items-center justify-between sm:inset-x-5 sm:top-4">
        <span className="font-mono text-[9px] tracking-[0.16em] text-[#83bdea]">SKILL CO-OCCURRENCE GLOBE</span>
        <span className="flex items-center gap-2 text-[9px] tracking-[0.12em] text-[#789bbd]"><i className="globe-live-dot" />LIVE</span>
      </div>
      <div ref={canvasHostRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 z-[3] overflow-hidden" aria-hidden="true">
        {FEATURED_SKILLS.map((skill) => <span key={skill.name} className="globe-skill-label"><i />{skill.name}</span>)}
      </div>
      <div className="globe-copy pointer-events-none absolute inset-x-4 bottom-3 z-10 flex items-end justify-between gap-3 sm:inset-x-5 sm:bottom-4">
        <div><p className="text-[10px] tracking-[0.1em] text-[#c5dcf1]">830项标准化技能 · 22个技能簇</p><p className="mt-1 text-[9px] text-[#6585a6]">每个光点代表一项技能</p></div>
        <p className="max-w-32 text-right text-[9px] leading-4 text-[#6585a6]">浅蓝连线表示技能共现关系</p>
      </div>
    </section>
  );
}
