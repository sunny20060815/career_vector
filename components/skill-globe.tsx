"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import * as THREE from "three";

const SKILL_COUNT = 830;
const CLUSTER_COUNT = 22;
const GLOBE_RADIUS = 1.18;
const FEATURED_SKILLS = [
  { name: "人工智能", index: 539 },
  { name: "Python", index: 7 },
  { name: "数据分析", index: 786 },
  { name: "SQL", index: 302 },
  { name: "质量管理", index: 752 },
  { name: "工业自动化", index: 702 },
  { name: "软件测试", index: 361 },
  { name: "网络安全", index: 97 },
  { name: "云计算", index: 459 },
  { name: "机器学习", index: 676 },
  { name: "机械设计", index: 189 },
  { name: "电气控制", index: 805 },
  { name: "生产工艺", index: 334 },
  { name: "供应链管理", index: 251 },
  { name: "沟通能力", index: 570 },
  { name: "团队合作", index: 424 },
  { name: "项目管理", index: 397 },
  { name: "财务管理", index: 165 },
  { name: "风险管理", index: 493 },
  { name: "金融分析", index: 231 },
  { name: "医药研发", index: 650 },
  { name: "统计分析", index: 120 },
  { name: "视觉设计", index: 613 },
  { name: "学习能力", index: 60 }
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

function createLabelTexture(name: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.beginPath();
    context.arc(18, 32, 5, 0, Math.PI * 2);
    context.fillStyle = "#8bd5ff";
    context.shadowColor = "#5ab8ff";
    context.shadowBlur = 12;
    context.fill();
    context.shadowBlur = 8;
    context.font = '500 24px "PingFang SC", "Microsoft YaHei", sans-serif';
    context.textBaseline = "middle";
    context.fillStyle = "#d8eaff";
    context.fillText(name, 34, 33);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function SkillGlobe({ variant = "default" }: { variant?: "default" | "login" }) {
  const panelRef = useRef<HTMLElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const compact = variant === "login";

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
    camera.position.set(0, 0, compact ? 3.75 : 3.55);

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
    const labelTextures: THREE.CanvasTexture[] = [];
    const labelMaterials: THREE.SpriteMaterial[] = [];
    const labelSprites: THREE.Sprite[] = [];
    const labelEligible = FEATURED_SKILLS.map(() => true);
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

    const occluderGeometry = new THREE.SphereGeometry(GLOBE_RADIUS * 0.975, 40, 24);
    const occluderMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    occluderMaterial.colorWrite = false;
    const occluder = new THREE.Mesh(occluderGeometry, occluderMaterial);
    occluder.renderOrder = -1;
    globe.add(occluder);

    FEATURED_SKILLS.forEach((skill) => {
      const texture = createLabelTexture(skill.name);
      const material = new THREE.SpriteMaterial({
        map: texture,
        opacity: 0.92,
        transparent: true,
        depthTest: true,
        depthWrite: false
      });
      const label = new THREE.Sprite(material);
      label.position.copy(points[skill.index]).multiplyScalar(1.075);
      label.scale.set(Math.max(0.4, skill.name.length * 0.1 + 0.18), compact ? 0.13 : 0.145, 1);
      label.center.set(0.05, 0.5);
      label.renderOrder = 3;
      globe.add(label);
      labelTextures.push(texture);
      labelMaterials.push(material);
      labelSprites.push(label);
    });

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
      const labelStep = compact ? (width >= 280 ? 1 : 2) : (width >= 320 ? 1 : 2);
      labelEligible.forEach((_eligible, index) => { labelEligible[index] = index % labelStep === 0; });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let animationFrame = 0;
    const worldPosition = new THREE.Vector3();
    const projectedPosition = new THREE.Vector3();
    const render = () => {
      if (!reducedMotion.matches) globe.rotation.y += 0.0018;
      globe.rotation.x += ((-0.16 - pointerTarget.y) - globe.rotation.x) * 0.035;
      globe.rotation.z += ((0.08 + pointerTarget.x) - globe.rotation.z) * 0.025;
      globe.updateMatrixWorld(true);
      const occupied: Array<{ left: number; right: number; top: number; bottom: number }> = [];
      labelSprites.forEach((label, index) => {
        label.getWorldPosition(worldPosition);
        if (!labelEligible[index] || worldPosition.z < 0.08) {
          label.visible = false;
          return;
        }
        projectedPosition.copy(worldPosition).project(camera);
        const x = (projectedPosition.x * 0.5 + 0.5) * host.clientWidth;
        const y = (-projectedPosition.y * 0.5 + 0.5) * host.clientHeight;
        const halfWidth = Math.max(24, FEATURED_SKILLS[index].name.length * (compact ? 5 : 6) + 10);
        const box = { left: x - halfWidth, right: x + halfWidth, top: y - 9, bottom: y + 9 };
        const outsideCopyArea = y < 32 || y > host.clientHeight - (compact ? 30 : 42);
        const overlaps = occupied.some((item) => box.left < item.right + 5 && box.right > item.left - 5 && box.top < item.bottom + 4 && box.bottom > item.top - 4);
        label.visible = !outsideCopyArea && !overlaps;
        if (label.visible) occupied.push(box);
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
      occluderGeometry.dispose();
      skillMaterial.dispose();
      clusterMaterial.dispose();
      lineMaterial.dispose();
      shellMaterial.dispose();
      occluderMaterial.dispose();
      labelMaterials.forEach((material) => material.dispose());
      labelTextures.forEach((texture) => texture.dispose());
      pointTexture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [compact]);

  return (
    <section ref={panelRef} className={`${compact ? "h-44" : "intro-unit h-60 sm:h-64 lg:h-60"} skill-globe relative overflow-hidden border border-[#23466f]`} aria-label="技能共现网络三维动态图">
      <div className="globe-copy pointer-events-none absolute inset-x-4 top-3 z-10 flex items-center justify-between sm:inset-x-5 sm:top-4">
        <span className="font-mono text-[9px] tracking-[0.16em] text-[#83bdea]">{compact ? "SKILL GRAPH" : "SKILL CO-OCCURRENCE GLOBE"}</span>
        <span className="flex items-center gap-2 text-[9px] tracking-[0.12em] text-[#789bbd]"><i className="globe-live-dot" />LIVE</span>
      </div>
      <div ref={canvasHostRef} className="absolute inset-0" />
      <div className="globe-copy pointer-events-none absolute inset-x-4 bottom-3 z-10 flex items-end justify-between gap-3 sm:inset-x-5 sm:bottom-4">
        <div><p className="text-[10px] tracking-[0.1em] text-[#c5dcf1]">830项标准化技能 · 22个技能簇</p>{!compact && <p className="mt-1 text-[9px] text-[#6585a6]">每个光点代表一项技能或专业知识</p>}</div>
        {!compact && <p className="max-w-32 text-right text-[9px] leading-4 text-[#6585a6]">浅蓝连线表示技能共现关系</p>}
      </div>
    </section>
  );
}
