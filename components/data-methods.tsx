"use client";

import { useLayoutEffect, useRef } from "react";
import { BriefcaseBusiness, Database, Layers3, Network, ShieldCheck, TrendingUp } from "lucide-react";
import gsap from "gsap";

const dataStats = [
  { value: "899.61万+", label: "原始招聘信息", note: "2014—2026.03" },
  { value: "854.46万+", label: "清洗后岗位观测", note: "上市公司及集团公司" },
  { value: "380", label: "职业小类", note: "职业分类大典口径" },
  { value: "830", label: "标准化技能", note: "覆盖四类能力" },
  { value: "22", label: "技能簇", note: "Leiden社区发现" }
];

const timeline = [
  { period: "2014—2015", label: "补充样本", detail: "用于扩充词典和检验早期岗位表达，不进入历史趋势估计。" },
  { period: "2016—2025", label: "历史分析", detail: "845.68万余条岗位信息，用于职业、技能与城市变化分析。" },
  { period: "2026.01—03", label: "模型校准", detail: "用于校准预测模型，不进入历史趋势估计。" },
  { period: "2026.03—2028.12", label: "未来预测", detail: "输出职业、技能、工资与城市覆盖的前景判断。" }
];

export function DataMethods() {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!rootRef.current) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(rootRef.current!.querySelectorAll(".method-unit"), { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.55, stagger: 0.055, ease: "power2.out" });
    });
    return () => mm.revert();
  }, []);

  return (
    <div ref={rootRef} className="mx-auto w-full max-w-6xl py-8 md:py-12">
      <section className="method-unit border-b border-[#1b4a70] pb-8 md:pb-10">
        <p className="text-xs font-semibold tracking-[0.2em] text-[#4594d5]">DATA &amp; METHODOLOGY</p>
        <h1 className="mt-4 font-serif text-3xl leading-tight text-white md:text-4xl">从招聘文本到职业决策信号</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-[#849eb4]">职向量将分散、非标准的招聘信息转换为统一的职业、技能和城市指标，并进一步测度技能组合价值、人工智能影响与未来市场前景。下列内容概述平台建议背后的数据基础与处理流程。</p>
      </section>

      <section className="method-unit grid border-b border-[#1b4a70] sm:grid-cols-2 lg:grid-cols-5">
        {dataStats.map((item) => <div key={item.label} className="border-b border-[#354b61] py-5 pr-5 sm:border-r lg:border-b-0 lg:pl-5 first:pl-0 last:border-r-0"><p className="font-serif text-2xl text-[#e9eef2]">{item.value}</p><p className="mt-2 text-xs font-medium text-[#8fa7bb]">{item.label}</p><p className="mt-1 text-[10px] text-[#4d687e]">{item.note}</p></div>)}
      </section>

      <section className="method-unit border-b border-[#1b4a70] py-8 md:py-10">
        <SectionHeading icon={Database} index="01" title="招聘数据库" subtitle="多平台采集、上市公司识别与统一清洗" />
        <div className="mt-6 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4 text-sm leading-7 text-[#92a9bc]"><p>招聘数据来自前程无忧、BOSS直聘、智联招聘、猎聘网、拉勾网、看准网等国内主流平台。根据上市公司及集团公司名单，平台整理公司名称、岗位名称、职位描述、薪资区间、学历和工作经验等字段，并剔除关键字段完全相同的重复广告。</p><p>学历被统一为初中及以下、高中或中职、大专、本科、硕士、博士、不限和无法识别；工作经验被统一为无经验或应届、1年以内、1至3年、3至5年、5至10年、10年以上、不限和无法识别。薪资采用招聘区间中点，并删除无法换算及明显异常的记录。</p></div>
          <div className="border-l border-[#255c85] pl-5">
            {timeline.map((item) => <div key={item.period} className="relative border-b border-[#354b61] py-3 first:pt-0 last:border-b-0"><p className="font-mono text-xs text-[#539bd5]">{item.period}</p><p className="mt-1 text-sm text-[#d2dbe3]">{item.label}</p><p className="mt-1 text-xs leading-5 text-[#5f819c]">{item.detail}</p></div>)}
          </div>
        </div>
      </section>

      <section className="method-unit border-b border-[#1b4a70] py-8 md:py-10">
        <SectionHeading icon={BriefcaseBusiness} index="02" title="职业小类匹配" subtitle="将非标准岗位名称映射至统一职业口径" />
        <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
          <p className="text-sm leading-7 text-[#92a9bc]">平台依据《中华人民共和国职业分类大典（2022年版）》将岗位映射至380个职业小类。关键词词典综合岗位名称、平台分类与职位描述，并针对“工程师”“运营”“专员”等泛化词和多义词设置业务语境、词语边界及岗位名称优先规则。大语言模型仅用于生成候选词和辅助语义判断，候选词经过验证并能够稳定指向同一职业后才会进入词典。</p>
          <QualityBlock value="98.06%" label="人工抽查分类可接受率" note="最终词典包含6,990条岗位关键词" />
        </div>
      </section>

      <section className="method-unit border-b border-[#1b4a70] py-8 md:py-10">
        <SectionHeading icon={Layers3} index="03" title="岗位技能识别" subtitle="统一中文、英文、缩写和行业术语" />
        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_1fr]">
          <p className="text-sm leading-7 text-[#92a9bc]">平台从“熟悉”“掌握”“具备……能力”等表达附近抽取技能，将其划分为技术与操作技能、非技术性技能、专业知识与行业经验、职业素养与资格要求四类。1714个常见别名与769个核心词条经术语归并后形成830项标准化技能，使不同招聘网站中的同义表达可以在同一口径下比较。</p>
          <div className="grid grid-cols-2 gap-px bg-[#1a4a72]"><QualityBlock value="87.76%" label="岗位技能识别覆盖率" note="至少识别一项技能" /><QualityBlock value="4.99项" label="岗位平均技能数" note="按全部原始岗位计算" /></div>
        </div>
      </section>

      <section className="method-unit border-b border-[#1b4a70] py-8 md:py-10">
        <SectionHeading icon={Network} index="04" title="技能网络与组合价值" subtitle="识别企业实际共同要求的能力结构" />
        <div className="mt-6 grid gap-px bg-[#1a4a72] md:grid-cols-2">
          <MethodBlock title="技能簇" body="将同一岗位中的技能视为存在共现关系，按各技能出现频率对共现强度进行标准化，再使用Leiden社区发现算法将830项技能划分为22个技能簇。" />
          <MethodBlock title="工资互补效应" body="比较岗位同时要求两项技能时的条件工资差异，并控制职业小类、月份、城市、学历与工作经验。正向交互效应表示组合回报高于两项技能单独回报的简单加总。" />
          <MethodBlock title="未来市场前景" body="将技能组合的工资互补效应与2026—2028年需求变化、需求增长率和城市覆盖相结合，区分高回报是否同时对应需求扩张与空间扩散。" />
          <MethodBlock title="多技能输入" body="用户输入任意数量的技术技能、非技术技能和专业知识后，系统同时计算单项价值、已观测组合关系及新增技能的边际价值，而不是将多项技能压缩为单一标签。" />
        </div>
      </section>

      <section className="method-unit py-8 md:py-10">
        <SectionHeading icon={ShieldCheck} index="05" title="人工智能影响测度" subtitle="结合职业暴露与招聘市场中的实际技能重组" />
        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_1fr]">
          <div><p className="text-sm font-medium text-[#d8e0e7]">职业AI能力暴露度</p><p className="mt-3 text-sm leading-7 text-[#87a1b6]">依据O*NET 30.3的52项职业能力，由Kimi、DeepSeek、文心一言、豆包、智谱清言、Gemini、ChatGPT和Grok独立评估生成式AI对各项能力的参与程度，再结合职业对能力的重要性和水平要求加权。894个O*NET职业被映射至我国1,635个具体职业，并汇总到380个职业小类；歧义映射经过人工复核。</p><div className="mt-4 border-l-2 border-[#3e89c6] bg-[#0c294a] px-4 py-3 font-mono text-xs leading-6 text-[#89a3b8]">AI暴露度 = 能力AI评分 × 能力重要性 × 水平要求的加权平均</div></div>
          <div><p className="text-sm font-medium text-[#d8e0e7]">AI与技能的互补和替代压力</p><p className="mt-3 text-sm leading-7 text-[#87a1b6]">平台比较2019—2022年与2023—2025年技能同AI技能的标准化共现强度，并使用2019—2021年职业结构作为固定权重。AI共现增强且技能需求上升，被识别为互补；AI共现增强但需求下降，被识别为潜在替代压力；共现增强而需求稳定，则进一步判断岗位内部是否发生任务重组。</p><div className="mt-4 flex items-start gap-3 border-l-2 border-[#d98560] bg-[#0d2947] px-4 py-3"><TrendingUp size={16} className="mt-0.5 shrink-0 text-[#df916c]" /><p className="text-xs leading-6 text-[#a4b7c7]">这些指标描述招聘市场中已经显现的能力组合与需求变化，不直接解释为人工智能造成的因果效应。</p></div></div>
        </div>
      </section>
    </div>
  );
}

function SectionHeading({ icon: Icon, index, title, subtitle }: { icon: typeof Database; index: string; title: string; subtitle: string }) {
  return <div className="flex items-start gap-4"><span className="grid h-9 w-9 shrink-0 place-items-center border border-[#285f88] text-[#549dd8]"><Icon size={17} /></span><div><p className="font-mono text-[10px] tracking-[0.16em] text-[#4e6980]">MODULE {index}</p><h2 className="mt-1 text-lg font-semibold text-[#e1e8ed]">{title}</h2><p className="mt-1 text-xs text-[#5f809b]">{subtitle}</p></div></div>;
}

function QualityBlock({ value, label, note }: { value: string; label: string; note: string }) {
  return <div className="bg-[#0c294a] p-5"><p className="font-serif text-2xl text-[#589ed8]">{value}</p><p className="mt-2 text-xs font-medium text-[#bdcbd7]">{label}</p><p className="mt-1 text-[10px] leading-4 text-[#537087]">{note}</p></div>;
}

function MethodBlock({ title, body }: { title: string; body: string }) {
  return <div className="bg-[#092441] p-5 md:p-6"><p className="text-sm font-medium text-[#d4dde5]">{title}</p><p className="mt-3 text-xs leading-6 text-[#7290a8]">{body}</p></div>;
}
