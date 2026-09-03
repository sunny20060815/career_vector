"use client";

import Image from "next/image";
import { useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Cpu, GraduationCap, Users } from "lucide-react";
import gsap from "gsap";

interface Person {
  name: string;
  role: string;
  image: string;
  description: string;
  imagePosition?: string;
}

const advisors: Person[] = [
  {
    name: "姜老师",
    role: "项目指导教师",
    image: "/team/姜老师.png",
    description: "管理学博士，城市经济与公共管理学院副教授，澳大利亚莫纳什大学访问学者，中国教育经济学会理事，教育部学位与研究生教育发展中心评审专家，澳大利亚纽卡斯尔大学教育学院校外导师，中国知网2024年Top 1%高被引学者。在国内外高水平期刊发表论文多篇，其中6篇被人大复印资料全文转载，多项研究成果被地方教育局采纳。在本项目中负责总体方向把控、研究方案指导与成果质量审核。"
  },
  {
    name: "毛老师",
    role: "项目指导教师",
    image: "/team/毛老师.jpg",
    description: "理学博士，工商管理学院讲师，中国消费大数据研究院研究员、北京绿茵茵互联网科技有限公司联合创始人，研究方向为商业数据分析与文本挖掘。讲授商务数据分析、文本数据挖掘、机器学习实战等课程，出版多部Python数据分析著作。在本项目中主要指导招聘大数据处理，并为项目商业化落地提供建议。"
  }
];

const members: Person[] = [
  {
    name: "孙同学",
    role: "项目负责人",
    image: "/team/孙同学2.jpg",
    description: "经济学（实验班）本科生。曾获美国大学生数学建模竞赛M奖、“正大杯”全国大学生市场调查与分析大赛全国三等奖、全国大学生统计建模大赛北京市二等奖等奖项。合著论文入选2025年亚洲公共管理学会年会，并参与编写《京津冀发展报告（2026）》。在本项目中承担招聘大数据处理、实证分析与平台调试等工作。",
    imagePosition: "50% 36%"
  },
  {
    name: "辛同学",
    role: "核心技术负责人",
    image: "/team/辛同学.jpeg",
    description: "人工智能专业大三本科生。获CCF大模型能力认证三级、中国国际大学生创新大赛（2025年）“青年红色筑梦之旅”赛道铜奖，主持市级大学生创新创业训练计划项目。具备大语言模型构建、OCR识别、时序预测等工程实践经验，负责整体技术架构、后端逻辑与前端搭建。",
    imagePosition: "50% 28%"
  },
  {
    name: "孙同学",
    role: "技术协作与测试",
    image: "/team/孙同学.jpeg",
    description: "自动化专业大三本科生。曾获全国大学生数学建模竞赛省级二等奖，参与深度学习医疗分割项目，具备模型训练与数据分析基础。在本项目中承担辅助网站搭建与功能测试联调工作。",
    imagePosition: "50% 34%"
  },
  {
    name: "吴同学",
    role: "宣传运营",
    image: "/team/吴同学.jpg",
    description: "传播学专业大三本科生。具备文案采编与内容创作能力，擅长公众号排版、海报板绘设计，持有全媒体运营师证书，具有丰富的科研竞赛和学生工作经验。在本项目中担任宣传小组核心成员，承担宣传运营相关工作。",
    imagePosition: "50% 24%"
  },
  {
    name: "胡同学",
    role: "研究与策划",
    image: "/team/胡同学.jpg",
    description: "经济学（实验班）专业大三本科生。曾获“挑战杯”首都大学生创业计划竞赛专项赛道北京市特等奖，主持校级大学生创新训练重点项目，获中国健康与养老追踪调查优秀访员称号。在本项目中负责文献研究与策划书撰写。",
    imagePosition: "50% 28%"
  },
  {
    name: "苏同学",
    role: "市场分析与数据整理",
    image: "/team/苏同学.jpeg",
    description: "经济学专业大二本科生。曾获“挑战杯”首都大学生创业计划竞赛北京市二等奖、云泽杯校级二等奖，参与京津雄创新三角产业布局、京津冀教育协同指标监测等课题研究，获北京市三星志愿者称号。在本项目中承担市场分析撰写与数据整理工作。",
    imagePosition: "62% 30%"
  },
  {
    name: "杨同学",
    role: "展示设计与路演",
    image: "/team/杨同学.jpeg",
    description: "国际经济与贸易专业大三本科生。曾获流通业经营模拟竞赛全国三等奖、美国大学生数学建模竞赛H奖、“挑战杯”首都大学生创业计划竞赛专项赛道市级二等奖。在本项目中承担展示材料设计与路演呈现。",
    imagePosition: "50% 30%"
  },
  {
    name: "姚同学",
    role: "背景调研与展示制作",
    image: "/team/姚同学.jpeg",
    description: "经济学（实验班）专业大二本科生。曾参与人工智能科研项目及商业计划项目，具备行业调研与信息分析基础。曾获中国博望丝路定向公开赛女子组第四名、北京大学定向高校邀请赛女子公开组第二名等奖项。在本项目中负责PPT制作与背景调查。",
    imagePosition: "50% 24%"
  },
  {
    name: "王同学",
    role: "政策与文献研究",
    image: "/team/王同学.png",
    description: "国际经济与贸易专业大二本科生。曾参与京津冀产业协同课题研究，具备政策文本分析与报告撰写经验。在本项目中负责政策梳理、文献处理与PPT制作。",
    imagePosition: "50% 28%"
  },
  {
    name: "周同学",
    role: "资料整合",
    image: "/team/周同学.jpeg",
    description: "投资学专业大四本科生。曾参与大学生创新创业训练计划项目，具备资料整合与文本工作基础。在本项目中承担资料收集整理与PPT制作工作。",
    imagePosition: "50% 34%"
  },
  {
    name: "张同学",
    role: "数据处理与前端协作",
    image: "/team/张同学.jpeg",
    description: "经济统计学专业大三本科生。曾获“挑战杯”校级二等奖，参与京津冀协同活跃度监测平台前端建设项目，具备数据处理与前端开发基础。在本项目中承担数据处理与演示文稿制作工作。",
    imagePosition: "50% 28%"
  }
];

export function AboutUs() {
  const rootRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLElement>(null);
  const [selectedMember, setSelectedMember] = useState(0);

  useLayoutEffect(() => {
    if (!rootRef.current) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(rootRef.current!.querySelectorAll(".about-reveal"), { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.55, stagger: 0.055, ease: "power2.out" });
    });
    return () => mm.revert();
  }, []);

  useLayoutEffect(() => {
    if (!profileRef.current) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(profileRef.current!.querySelectorAll(".profile-reveal"), { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.42, stagger: 0.06, ease: "power2.out" });
    });
    return () => mm.revert();
  }, [selectedMember]);

  return (
    <div ref={rootRef} className="mx-auto max-w-7xl py-10 md:py-14">
      <header className="about-reveal max-w-3xl">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-[#5ba6e3]"><Users size={15} />ABOUT US</div>
        <h1 className="mt-4 font-serif text-3xl text-white md:text-4xl">让职业选择拥有更可靠的数据坐标</h1>
        <p className="mt-4 text-sm leading-7 text-[#86a0b6]">职向量由经济学、人工智能、自动化、传播学等不同专业背景的师生共同建设。团队将招聘大数据、人工智能与人才培养方案结合，为学生提供可解释的职业匹配和技能投资建议。</p>
      </header>

      <section className="mt-12" aria-labelledby="advisor-heading">
        <SectionHeading icon={GraduationCap} id="advisor-heading" index="01" title="指导老师" subtitle="研究设计与项目指导" />
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {advisors.map((person) => <AdvisorCard key={person.name} person={person} />)}
        </div>
      </section>

      <section className="mt-14" aria-labelledby="team-heading">
        <SectionHeading icon={Cpu} id="team-heading" index="02" title="团队成员" subtitle="数据、技术、研究与传播协作" />
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,0.88fr)_minmax(440px,1.12fr)]">
          <div className="about-reveal min-w-0">
            <p className="mb-3 text-xs leading-6 text-[#66859d]">选择成员，查看其专业背景与项目分工</p>
            <div className="flex snap-x gap-2 overflow-x-auto pb-3 lg:grid lg:grid-cols-2 lg:overflow-visible lg:pb-0">
              {members.map((person, index) => (
                <button
                  key={`${person.image}-${index}`}
                  type="button"
                  onClick={() => setSelectedMember(index)}
                  aria-pressed={selectedMember === index}
                  className={`group flex w-56 shrink-0 snap-start items-center gap-3 border p-2.5 text-left transition lg:w-auto ${selectedMember === index ? "border-[#4b91c6] bg-[#0d355c]" : "border-[#1d4c71] bg-[#061f39] hover:border-[#326b95] hover:bg-[#082844]"}`}
                >
                  <span className="relative h-16 w-12 shrink-0 overflow-hidden bg-[#0d3155]">
                    <Image src={person.image} alt="" fill sizes="48px" className="object-cover" style={{ objectPosition: person.imagePosition ?? "50% 28%" }} />
                  </span>
                  <span className="min-w-0"><span className="block font-serif text-base text-[#eef3f6]">{person.name}</span><span className="mt-1 block truncate text-[11px] text-[#6f8fa8]">{person.role}</span></span>
                  <span className={`ml-auto h-1.5 w-1.5 shrink-0 transition ${selectedMember === index ? "bg-[#6db5ec] shadow-[0_0_10px_rgba(109,181,236,0.8)]" : "bg-[#244b6b]"}`} />
                </button>
              ))}
            </div>
          </div>

          <MemberProfile ref={profileRef} person={members[selectedMember]} index={selectedMember} onPrevious={() => setSelectedMember((selectedMember - 1 + members.length) % members.length)} onNext={() => setSelectedMember((selectedMember + 1) % members.length)} />
        </div>
      </section>
    </div>
  );
}

function SectionHeading({ icon: Icon, id, index, title, subtitle }: { icon: typeof Users; id: string; index: string; title: string; subtitle: string }) {
  return <div className="about-reveal flex items-end justify-between gap-4 border-b border-[#1c4a70] pb-3"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center border border-[#2c6896] bg-[#0c3157] text-[#65ace3]"><Icon size={17} /></span><div><h2 id={id} className="text-lg font-semibold text-[#e8eef3]">{title}</h2><p className="mt-0.5 text-xs text-[#617f98]">{subtitle}</p></div></div><span className="font-mono text-xs text-[#416987]">{index}</span></div>;
}

function AdvisorCard({ person }: { person: Person }) {
  return (
    <article className="about-reveal grid overflow-hidden border border-[#245578] bg-[#0a2747] sm:grid-cols-[168px_1fr]">
      <div className="relative aspect-[4/3] overflow-hidden bg-[#0e345c] sm:m-5 sm:mr-0 sm:aspect-[3/4]">
        <span className="absolute inset-x-0 top-0 aspect-[3/4] sm:inset-0 sm:aspect-auto">
          <Image src={person.image} alt={`${person.name}照片`} fill sizes="(max-width: 640px) 100vw, 168px" className="object-cover" style={{ objectPosition: person.imagePosition ?? "50% 24%" }} />
        </span>
        <span className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#03172d]/80 to-transparent sm:hidden" />
      </div>
      <div className="p-5 md:p-6">
        <p className="text-[10px] font-semibold tracking-[0.14em] text-[#5ca6df]">ACADEMIC ADVISOR</p>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1"><h3 className="font-serif text-2xl text-white">{person.name}</h3><span className="text-xs text-[#7f9ab1]">{person.role}</span></div>
        <p className="mt-4 text-sm leading-7 text-[#9aafbf]">{person.description}</p>
      </div>
    </article>
  );
}

function MemberProfile({ ref, person, index, onPrevious, onNext }: { ref: React.Ref<HTMLElement>; person: Person; index: number; onPrevious: () => void; onNext: () => void }) {
  return (
    <article ref={ref} className="about-reveal sticky top-5 min-w-0 overflow-hidden border border-[#326d98] bg-[#0a2949] shadow-[0_20px_60px_rgba(2,12,28,0.22)]">
      <div className="grid md:grid-cols-[minmax(210px,0.9fr)_minmax(0,1.1fr)]">
        <div className="profile-reveal relative aspect-[4/3] overflow-hidden bg-[#0d3155] md:aspect-[3/4]">
          <span className="absolute inset-x-0 top-0 aspect-[3/4] md:inset-0 md:aspect-auto">
            <Image key={person.image} src={person.image} alt={`${person.name}照片`} fill priority={index < 2} sizes="(max-width: 768px) 100vw, 38vw" className="object-cover" style={{ objectPosition: person.imagePosition ?? "50% 28%" }} />
          </span>
          <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#03172d]/85 to-transparent md:hidden" />
          <span className="absolute left-4 top-4 border border-[#5ca1d4]/50 bg-[#03172d]/85 px-2 py-1 font-mono text-[10px] text-[#8bc2e8]">TEAM {String(index + 1).padStart(2, "0")}</span>
        </div>
        <div className="flex min-h-0 flex-col p-5 md:p-7">
          <div className="profile-reveal flex items-start justify-between gap-4">
            <div><p className="text-[10px] font-semibold tracking-[0.14em] text-[#5ca6df]">CURRENT PROFILE</p><h3 className="mt-3 font-serif text-3xl text-white">{person.name}</h3><p className="mt-1 text-xs text-[#7fa0b9]">{person.role}</p></div>
            <span className="font-mono text-xs text-[#426b8a]">{String(index + 1).padStart(2, "0")} / {members.length}</span>
          </div>
          <div className="profile-reveal mt-6 h-px bg-[#1c4d73]" />
          <p className="profile-reveal mt-5 flex-1 text-sm leading-7 text-[#9bb0c0]">{person.description}</p>
          <div className="profile-reveal mt-7 flex items-center justify-between border-t border-[#1c4d73] pt-4">
            <span className="text-[10px] tracking-[0.12em] text-[#52748f]">切换成员</span>
            <div className="flex gap-2">
              <button type="button" onClick={onPrevious} aria-label="上一位成员" title="上一位成员" className="grid h-9 w-9 place-items-center border border-[#2a648f] text-[#75acd4] transition hover:border-[#64a9dc] hover:bg-[#10375e] hover:text-white"><ArrowLeft size={16} /></button>
              <button type="button" onClick={onNext} aria-label="下一位成员" title="下一位成员" className="grid h-9 w-9 place-items-center bg-[#347fb8] text-white transition hover:bg-[#4b98d1]"><ArrowRight size={16} /></button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
