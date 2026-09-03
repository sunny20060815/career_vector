"use client";

import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUp, BookOpen, Bot, BrainCircuit, BriefcaseBusiness, ChevronRight, CircleCheck, ClipboardCheck, Clock3, Database, GitCompareArrows, GraduationCap, LogOut, MessageSquareText, MessageSquareWarning, Plus, Radar, ShieldCheck, Smartphone, Sparkles, Target, Users } from "lucide-react";
import gsap from "gsap";

import { AboutUs } from "@/components/about-us";
import { DataMethods } from "@/components/data-methods";
import { FeedbackPanel } from "@/components/feedback-panel";
import { SkillGlobe } from "@/components/skill-globe";
import { getSessionIdentity } from "@/lib/auth-session";
import { buildEvidencePreview, buildSuggestedQuestions, type EvidencePreview } from "@/lib/career-presentation";
import { decodeChatStream } from "@/lib/chat-stream";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { ChatEvidenceEvent, ChatProgress, ChatResponse } from "@/types/api";
import type { UserAudience } from "@/types/career";

interface Conversation { id: string; title: string; updated_at: string }
interface UiMessage { id: string; role: "user" | "assistant"; content: string; evidence?: ChatResponse["evidence"]; suggestedQuestions?: string[] }

const individualExamples = [
  { icon: BookOpen, title: "课程学习建议", text: "我是首经贸2024级经济学（实验班）学生，想进入数字技术相关职业。请结合培养方案和岗位需求，给我一份分阶段学习建议。", note: "首经贸23—25级可体验 · 其他高校敬请期待" },
  { icon: BrainCircuit, title: "AI职业体检", text: "我会财务分析和 Excel，AI 更可能辅助还是替代哪些工作任务？我应该重点强化什么能力？", note: "AI暴露 · 互补替代" },
  { icon: Sparkles, title: "组合价值评估", text: "我会 TPM 和设备管理，这组技能有工资互补价值吗？未来适合哪些职业和城市，下一步还应补什么技能？", note: "工资互补 · 需求前景" },
  { icon: Radar, title: "技能组合与城市", text: "我会工业自动化和质量管理，这组技能有工资互补价值吗？未来哪些城市的需求更强？", note: "技能组合 · 城市机会" },
  { icon: Database, title: "未来趋势", text: "机器学习和 SQL 到2028年的需求、工资与城市覆盖会怎样变化？", note: "历史观测 · 未来预测" }
];

const curriculumExamples = [
  { icon: ClipboardCheck, title: "方案供需诊断", text: "请诊断首经贸2025级经济学（实验班）培养方案：培养目标和课程体系覆盖了哪些能力，与真实岗位需求相比还缺什么？", note: "培养目标 · 岗位技能" },
  { icon: GitCompareArrows, title: "历年版本比较", text: "请比较首经贸2025级经济学（实验班）与历年培养方案的变化，这些调整是否更符合招聘市场需求？", note: "2023—2025级 · 变化识别" },
  { icon: Target, title: "职业覆盖评估", text: "首经贸2025级经济学（实验班）面向哪些职业方向？课程对这些职业的高频技能覆盖如何？", note: "职业方向 · 技能缺口" },
  { icon: Bot, title: "AI适应性评估", text: "请分析首经贸2025级经济学（实验班）培养方案对AI时代的适应性，哪些课程应强化、整合或增加实践环节？", note: "AI影响 · 课程重组" },
  { icon: GraduationCap, title: "修订建议", text: "请依据招聘需求和2028年预测，为首经贸2025级经济学（实验班）提出可执行的培养方案修订建议。", note: "未来需求 · 教学行动" }
];

const localPreview = process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_LOCAL_PREVIEW === "true";
const phoneAuthBaseUrl = "https://zhivectone-auth-vrsbhqbyuj.ap-southeast-1.fcapp.run";

export function CareerWorkbench() {
  const [activeView, setActiveView] = useState<"planner" | "methods" | "feedback" | "about">("planner");
  const [authChecked, setAuthChecked] = useState(false);
  const [userIdentity, setUserIdentity] = useState<string | null>(null);
  const [audience, setAudience] = useState<UserAudience | null>(null);
  const [audienceLoaded, setAudienceLoaded] = useState(false);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ChatProgress | null>(null);
  const [preview, setPreview] = useState<EvidencePreview | null>(null);
  const [error, setError] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const introRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("zhivector-audience");
    if (stored === "individual" || stored === "curriculum_designer") setAudience(stored);
    setAudienceLoaded(true);
  }, []);

  useEffect(() => {
    if (localPreview) {
      setUserIdentity("本地预览模式");
      setAuthChecked(true);
      return;
    }
    const supabase = createBrowserSupabaseClient();
    void supabase.auth.getSession().then(({ data }) => {
      const identity = getSessionIdentity(data.session);
      setUserIdentity(identity);
      setAuthChecked(true);
      if (identity) void loadConversations();
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const identity = getSessionIdentity(session);
      setUserIdentity(identity);
      setAuthChecked(true);
      if (identity) void loadConversations();
    });
    return () => subscription.unsubscribe();
  }, []);

  useLayoutEffect(() => {
    if (!userIdentity || messages.length || !introRef.current) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(introRef.current!.querySelectorAll(".intro-unit"), { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.65, ease: "power2.out", stagger: 0.07 });
    });
    return () => mm.revert();
  }, [userIdentity, messages.length, audience]);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (scroll) scroll.scrollTo({ top: scroll.scrollHeight, behavior: "smooth" });
  }, [messages, loading, preview]);

  function resizeTextarea() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }

  async function loadConversations() {
    const response = await fetch("/api/conversations");
    if (!response.ok) return;
    const payload = (await response.json()) as { conversations: Conversation[] };
    setConversations(payload.conversations);
  }

  async function chooseConversation(id: string) {
    const response = await fetch(`/api/conversations/${id}`);
    if (!response.ok) return;
    const payload = (await response.json()) as { messages: Array<UiMessage & { evidence?: ChatResponse["evidence"] }> };
    setConversationId(id);
    setMessages(payload.messages.map((message) => ({
      ...message,
      suggestedQuestions: message.role === "assistant" && message.evidence ? buildSuggestedQuestions(message.evidence) : undefined
    })));
    setError("");
    setActiveView("planner");
  }

  async function signOut() {
    await createBrowserSupabaseClient().auth.signOut();
    setUserIdentity(null);
    setConversations([]);
    setMessages([]);
    setConversationId(undefined);
  }

  function chooseAudience(nextAudience: UserAudience) {
    window.localStorage.setItem("zhivector-audience", nextAudience);
    setAudience(nextAudience);
    setActiveView("planner");
    setConversationId(undefined);
    setMessages([]);
    setQuestion("");
    setError("");
  }

  async function sendQuestion(rawQuestion: string) {
    const submitted = rawQuestion.trim();
    if (!submitted || loading) return;
    if (!userIdentity) return setError("请先登录后再提交职业咨询。");
    if (!audience) return setError("请先选择使用身份。");
    setLoading(true);
    setProgress({ stage: "understanding", message: initialTaskProgress(submitted) });
    setPreview(null);
    setError("");
    setQuestion("");
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: submitted }]);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: submitted, conversationId, audience }) });
      if (!response.ok || !response.body) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "咨询失败");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;
      while (!completed) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const decoded = decodeChatStream(buffer);
        buffer = decoded.remaining;
        for (const streamEvent of decoded.events) {
          if (streamEvent.type === "status") setProgress(streamEvent.payload);
          else if (streamEvent.type === "evidence") setPreview((streamEvent.payload as unknown as ChatEvidenceEvent).preview);
          else if (streamEvent.type === "complete") {
            const payload = streamEvent.payload as unknown as ChatResponse;
            setConversationId(payload.conversationId);
            setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: payload.answer, evidence: payload.evidence, suggestedQuestions: payload.suggestedQuestions }]);
            await loadConversations();
            completed = true;
          } else if (streamEvent.type === "error") throw new Error(streamEvent.payload.message);
        }
        if (done) break;
      }
      if (!completed) throw new Error("咨询连接意外中断，请重试。");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "咨询失败，请稍后重试。");
    } finally {
      setLoading(false);
      setProgress(null);
      setPreview(null);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await sendQuestion(question);
  }

  const visibleConversations = historyExpanded ? conversations : conversations.slice(0, 7);

  return (
    <main className="app-shell h-[100dvh] min-h-0 overflow-hidden bg-[#031326] text-[#e8edf1]">
      <div className="grid h-full grid-cols-1 md:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="hidden min-h-0 flex-col border-r border-[#174366] bg-[#041a32] md:flex">
          <div className="border-b border-[#174366] px-5 py-5"><Brand /></div>
          <div className="px-4 pt-4"><button onClick={() => { setActiveView("planner"); setConversationId(undefined); setMessages([]); }} className="flex h-10 w-full items-center justify-center gap-2 border border-[#5e7d98] bg-[#072541] text-sm text-[#c5d1db] transition hover:border-[#428ecd] hover:text-white" type="button"><Plus size={15} />{audience === "curriculum_designer" ? "新建方案诊断" : "新建规划"}</button></div>
          <div className="mt-6 flex items-center gap-2 px-5 text-[11px] font-medium tracking-[0.12em] text-[#58768f]"><Clock3 size={13} />{audience === "curriculum_designer" ? "方案咨询记录" : "历史咨询"}</div>
          <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            <div className="flex flex-col gap-1">
              {visibleConversations.map((item) => <button key={item.id} title={item.title} onClick={() => void chooseConversation(item.id)} className={`group flex h-11 min-w-0 items-center gap-2 border-l px-3 text-left text-sm transition ${item.id === conversationId ? "border-[#4e9ddd] bg-[#0d355c] text-white" : "border-transparent text-[#708fa8] hover:bg-[#072541] hover:text-[#d8e0e7]"}`} type="button"><MessageSquareText size={13} className="shrink-0 opacity-60" /><span className="truncate">{item.title}</span></button>)}
              {!conversations.length && <p className="px-3 py-3 text-xs leading-5 text-[#465f73]">{audience === "curriculum_designer" ? "新的方案诊断将在这里留存。" : "新的职业规划将在这里留存。"}</p>}
              {conversations.length > 7 && <button onClick={() => setHistoryExpanded((value) => !value)} className="mt-2 flex h-9 items-center justify-center gap-1 border border-[#1a4a72] text-xs text-[#5f809b] transition hover:border-[#6a879f] hover:text-[#b4c4d1]" type="button">{historyExpanded ? "收起历史记录" : `展开其余 ${conversations.length - 7} 条`}<ChevronRight size={13} className={`transition ${historyExpanded ? "-rotate-90" : "rotate-90"}`} /></button>}
            </div>
          </div>
          <div className="border-t border-[#174366] p-4"><div className="flex items-center gap-2 text-xs text-[#6989a3]"><CircleCheck size={14} className="text-[#428ecd]" /><span className="truncate">{userIdentity ?? "等待登录"}</span></div>{userIdentity && <button onClick={() => void signOut()} className="mt-3 flex items-center gap-2 text-xs text-[#b98573] transition hover:text-[#ef9b7e]" type="button"><LogOut size={13} />退出登录</button>}</div>
        </aside>

        <section className="relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#03172d]">
          <header className="shrink-0 border-b border-[#174366] bg-[#041a32]/95">
            <div className="flex min-h-16 flex-wrap items-center justify-between gap-2 px-4 py-2 md:px-7"><div className="md:hidden"><Brand /></div><div className="hidden items-center gap-3 text-xs text-[#6686a1] md:flex"><span className="status-dot" />职业技能数据引擎已连接</div>{audience && <AudienceSwitch audience={audience} onChange={chooseAudience} />}<div className="flex items-center gap-2 text-[10px] tracking-[0.12em] text-[#526f87]"><Database size={13} />DATASET 2014—2026.03</div></div>
            <nav className="flex h-11 items-stretch gap-5 overflow-x-auto border-t border-[#12375a] px-4 md:gap-6 md:px-7" aria-label="主导航">
              <ViewTab active={activeView === "planner"} icon={Radar} label="职业规划" onClick={() => setActiveView("planner")} />
              <ViewTab active={activeView === "methods"} icon={BookOpen} label="数据与方法" onClick={() => setActiveView("methods")} />
              <ViewTab active={activeView === "about"} icon={Users} label="关于我们" onClick={() => setActiveView("about")} />
              <ViewTab active={activeView === "feedback"} icon={MessageSquareWarning} label="问题反馈" onClick={() => setActiveView("feedback")} />
            </nav>
          </header>

          {activeView === "planner" ? <>
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-48 pt-6 md:px-8 md:pb-52 lg:px-12">
              {!messages.length && !loading ? <Intro audience={audience ?? "individual"} containerRef={introRef} onExample={(value) => { setQuestion(value); requestAnimationFrame(resizeTextarea); }} /> : <div className="mx-auto max-w-5xl space-y-7">{messages.map((message, index) => <MessageBlock key={message.id} audience={audience ?? "individual"} message={message} showSuggestions={!loading && index === messages.length - 1} onSuggestedQuestion={(value) => void sendQuestion(value)} />)}{loading && <ThinkingIndicator progress={progress} preview={preview} question={[...messages].reverse().find((message) => message.role === "user")?.content ?? ""} />}</div>}
            </div>

            <div className="composer-dock pointer-events-none absolute inset-x-0 bottom-0 z-20 border-t border-[#174366] bg-[#03172d]/95 px-3 pb-3 pt-3 md:px-8 md:pb-6 lg:px-12">
            <form onSubmit={(event) => void submit(event)} className="pointer-events-auto mx-auto max-w-5xl border border-[#2b658f] bg-[#072541] shadow-[0_-16px_50px_rgba(0,0,0,0.36)] focus-within:border-[#438dc9]">
              <textarea ref={textareaRef} value={question} onChange={(event) => { setQuestion(event.target.value); resizeTextarea(); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} rows={2} placeholder={audience === "curriculum_designer" ? "输入学校、年级、专业及希望诊断的培养目标或课程问题…" : "描述你的专业、技能、经验与目标城市…"} className="block min-h-20 w-full resize-none border-0 bg-transparent px-4 py-4 text-sm leading-6 text-[#edf1f5] outline-none placeholder:text-[#486176] md:px-5" />
              <div className="flex items-center justify-between border-t border-[#174166] px-4 py-2.5"><span className="text-[11px] text-[#547188]">Enter 发送 · Shift + Enter 换行</span><button disabled={loading || !question.trim()} className="grid h-9 w-9 place-items-center bg-[#387fb9] text-[#202b3a] transition hover:bg-[#63a6dd] disabled:cursor-not-allowed disabled:bg-[#1c4567] disabled:text-[#4c677d]" type="submit" aria-label="提交咨询"><ArrowUp size={17} /></button></div>
            </form>
            {error && <p className="pointer-events-auto mx-auto mt-2 max-w-5xl border-l-2 border-[#e07c58] bg-[#251511] px-3 py-2 text-xs text-[#efaa90]">{error}</p>}
            </div>
          </> : activeView === "methods" ? <div className="min-h-0 flex-1 overflow-y-auto px-4 md:px-8 lg:px-12"><DataMethods /></div> : activeView === "feedback" ? <div className="min-h-0 flex-1 overflow-y-auto px-4 md:px-8 lg:px-12"><FeedbackPanel userIdentity={userIdentity} /></div> : <div className="min-h-0 flex-1 overflow-y-auto px-4 md:px-8 lg:px-12"><AboutUs /></div>}
        </section>
      </div>
      {authChecked && !userIdentity && <LoginOverlay />}
      {authChecked && userIdentity && audienceLoaded && !audience && <AudienceChooser onSelect={chooseAudience} />}
    </main>
  );
}

function ViewTab({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Radar; label: string; onClick: () => void }) {
  return <button onClick={onClick} type="button" className={`relative flex items-center gap-2 px-0 text-xs transition ${active ? "text-[#62a6de]" : "text-[#5e7e99] hover:text-[#c5d1db]"}`} aria-current={active ? "page" : undefined}><Icon size={14} />{label}<span className={`absolute inset-x-0 bottom-0 h-0.5 transition ${active ? "bg-[#4992cd]" : "bg-transparent"}`} /></button>;
}

function Brand() {
  return <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center border border-[#2e81c5] bg-[#0c3a67] text-[#5ca7e4]"><Radar size={19} /></span><div><p className="font-serif text-lg text-white">职向量</p><p className="text-[10px] tracking-[0.18em] text-[#62839e]">CAREER INTELLIGENCE</p></div></div>;
}

function AudienceSwitch({ audience, onChange }: { audience: UserAudience; onChange: (audience: UserAudience) => void }) {
  return <div className="order-3 flex h-9 w-full border border-[#285b83] bg-[#051d35] p-1 sm:order-none sm:w-auto" aria-label="使用身份"><button onClick={() => audience !== "individual" && onChange("individual")} className={`flex flex-1 items-center justify-center gap-1.5 px-3 text-[11px] transition sm:flex-none ${audience === "individual" ? "bg-[#246fa8] text-white" : "text-[#6788a2] hover:text-[#c8d5df]"}`} type="button"><BriefcaseBusiness size={13} /><span className="sm:hidden">个人端</span><span className="hidden sm:inline">学生／求职者</span></button><button onClick={() => audience !== "curriculum_designer" && onChange("curriculum_designer")} className={`flex flex-1 items-center justify-center gap-1.5 px-3 text-[11px] transition sm:flex-none ${audience === "curriculum_designer" ? "bg-[#246fa8] text-white" : "text-[#6788a2] hover:text-[#c8d5df]"}`} type="button"><GraduationCap size={13} /><span className="sm:hidden">培养端</span><span className="hidden sm:inline">培养方案制定者</span></button></div>;
}

function AudienceChooser({ onSelect }: { onSelect: (audience: UserAudience) => void }) {
  return <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-[#031326]/95 p-4 backdrop-blur-md"><section className="w-full max-w-3xl border border-[#285b83] bg-[#041a32] p-5 shadow-[0_28px_100px_rgba(0,0,0,0.65)] sm:p-8"><p className="text-xs font-semibold tracking-[0.18em] text-[#4f98d3]">SELECT YOUR ROLE</p><h2 className="mt-3 font-serif text-2xl text-white sm:text-3xl">你想用职向量解决什么问题？</h2><p className="mt-3 text-sm leading-6 text-[#7895ac]">不同身份调用同一套招聘数据，但分析目标与建议口径不同，之后可随时切换。</p><div className="mt-7 grid gap-3 sm:grid-cols-2"><button onClick={() => onSelect("individual")} className="group min-h-44 border border-[#285b83] bg-[#061f39] p-5 text-left transition hover:border-[#559bd3] hover:bg-[#0b3154]" type="button"><BriefcaseBusiness className="text-[#5aa2dc]" size={24} /><h3 className="mt-5 text-base font-semibold text-white">学生／求职者</h3><p className="mt-2 text-sm leading-6 text-[#7895ac]">分析个人技能、职业匹配、工资前景、城市机会与能力提升路径。</p></button><button onClick={() => onSelect("curriculum_designer")} className="group min-h-44 border border-[#285b83] bg-[#061f39] p-5 text-left transition hover:border-[#559bd3] hover:bg-[#0b3154]" type="button"><GraduationCap className="text-[#5aa2dc]" size={26} /><h3 className="mt-5 text-base font-semibold text-white">培养方案制定者</h3><p className="mt-2 text-sm leading-6 text-[#7895ac]">对照历年培养方案与真实岗位需求，诊断课程技能供给并提出修订建议。</p></button></div></section></div>;
}

function Intro({ audience, containerRef, onExample }: { audience: UserAudience; containerRef: React.RefObject<HTMLDivElement | null>; onExample: (value: string) => void }) {
  const isDesigner = audience === "curriculum_designer";
  const examples = isDesigner ? curriculumExamples : individualExamples;
  return <div ref={containerRef} className="mx-auto flex min-h-[calc(100vh-18rem)] max-w-6xl flex-col justify-center py-8"><div className="grid items-end gap-10 lg:grid-cols-[minmax(0,1fr)_360px]"><div><p className="intro-unit text-xs font-semibold tracking-[0.2em] text-[#4594d5]">{isDesigner ? "CURRICULUM INTELLIGENCE" : "LABOR MARKET SIGNAL SYSTEM"}</p><h1 className="intro-unit mt-4 max-w-3xl font-serif text-3xl leading-tight text-white md:text-4xl lg:text-[44px]">{isDesigner ? "让培养方案回应真实岗位与未来技能" : "把专业、技能与真实岗位需求连接起来"}</h1><p className="intro-unit mt-4 max-w-2xl text-sm leading-7 text-[#7f9ab0]">{isDesigner ? "将培养目标、课程体系与招聘市场中的职业、技能和人工智能影响相连接，识别培养优势、能力缺口与可执行的课程调整方向。" : "输入你的年级、专业、技能或求职偏好。职向量会从招聘数据中匹配职业方向、工资前景、城市机会与下一项能力投资。"}</p><p className="intro-unit mt-5 max-w-3xl border-l-2 border-[#e58b62] bg-[#061f39] px-4 py-3 text-sm leading-6 text-[#a6b9c8]">{isDesigner ? "当前已接入首都经济贸易大学2023、2024、2025级全部专业培养方案，可比较历年培养目标、课程能力供给与岗位需求。招聘数据用于提供市场信号，不替代学科定位与教育价值判断。" : "职向量可以结合学校培养方案，为你提供更有针对性的职业与技能规划。目前已接入首都经济贸易大学2023、2024、2025级培养方案；首经贸学生可按类似“首经贸2024级经济学（实验班）”的形式输入自己的年级和专业。如需接入其他院校，欢迎在“问题反馈”中留言。"}</p></div><SignalMatrix /></div><div className="mt-10 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{examples.map((example) => { const Icon = example.icon; return <button key={example.title} onClick={() => onExample(example.text)} type="button" className="intro-unit group min-h-48 border border-[#1a4a72] bg-[#061f39] p-4 text-left transition hover:border-[#3c80b8] hover:bg-[#0b3154]"><div className="flex items-center justify-between"><span className="grid h-8 w-8 place-items-center border border-[#285f88] text-[#519ad5]"><Icon size={16} /></span><ChevronRight className="text-[#42596b] transition group-hover:translate-x-1 group-hover:text-[#65a9e1]" size={15} /></div><p className="mt-4 text-sm font-semibold text-[#e2e8ed]">{example.title}</p><p className="mt-2 line-clamp-3 text-xs leading-5 text-[#6f8da6]">{example.text}</p><p className="mt-3 text-[10px] tracking-[0.08em] text-[#b17860]">{example.note}</p></button>; })}</div></div>;
}

function LoginOverlay() {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [cooldown, setCooldown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  useLayoutEffect(() => {
    if (!overlayRef.current || !panelRef.current) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(overlayRef.current!, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35, ease: "power1.out" });
      gsap.fromTo(panelRef.current!, { autoAlpha: 0, y: 26, scale: 0.985 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.65, ease: "power3.out", delay: 0.08 });
      gsap.fromTo(panelRef.current!.querySelectorAll(".login-unit"), { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.45, stagger: 0.06, ease: "power2.out", delay: 0.22 });
    });
    return () => mm.revert();
  }, []);

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    if (submitting || cooldown) return;
    setSubmitting(true);
    setError("");
    try {
      const challengeResponse = await fetch("/api/auth/phone/challenge", { method: "POST" });
      const challengePayload = await challengeResponse.json() as { challenge?: string; error?: string };
      if (!challengeResponse.ok || !challengePayload.challenge) throw new Error(challengePayload.error ?? "无法初始化登录");
      const sendResponse = await fetch(`${phoneAuthBaseUrl}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone })
      });
      const sendPayload = await sendResponse.json() as { error?: string };
      if (!sendResponse.ok) throw new Error(sendPayload.error ?? "验证码发送失败");
      setChallenge(challengePayload.challenge);
      setStage("code");
      setCooldown(60);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "验证码发送失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const verifyResponse = await fetch(`${phoneAuthBaseUrl}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code, challenge })
      });
      const verifyPayload = await verifyResponse.json() as { assertion?: string; error?: string };
      if (!verifyResponse.ok || !verifyPayload.assertion) throw new Error(verifyPayload.error ?? "验证码核验失败");
      const exchangeResponse = await fetch("/api/auth/phone/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assertion: verifyPayload.assertion })
      });
      const exchangePayload = await exchangeResponse.json() as { error?: string };
      if (!exchangeResponse.ok) throw new Error(exchangePayload.error ?? "登录失败");
      window.location.reload();
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "验证码核验失败");
      setSubmitting(false);
    }
  }

  return (
    <div ref={overlayRef} className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#04152b]/95 p-4 backdrop-blur-md">
      <div ref={panelRef} className="grid w-full max-w-4xl overflow-hidden border border-[#255c85] bg-[#041a32] shadow-[0_28px_100px_rgba(0,0,0,0.72)] md:grid-cols-[0.9fr_1.1fr]">
        <div className="relative hidden min-h-[520px] overflow-hidden border-r border-[#1e5078] bg-[#03172d] p-8 md:block">
          <div className="login-unit"><Brand /></div>
          <div className="login-unit mt-16"><p className="text-xs tracking-[0.18em] text-[#428ecd]">YOUR CAREER, IN SIGNALS</p><h2 className="mt-4 font-serif text-3xl leading-tight text-white">从专业培养<br />走向真实市场</h2><p className="mt-4 text-sm leading-7 text-[#708fa8]">854万余条招聘信息，连接技能、职业、城市与人工智能影响。</p></div>
          <div className="login-unit absolute inset-x-8 bottom-8"><SkillGlobe variant="login" /></div>
        </div>
        <div className="flex min-h-[460px] flex-col justify-center p-6 sm:p-10 md:p-12">
          <p className="login-unit text-xs font-semibold tracking-[0.2em] text-[#4594d5]">SECURE ACCESS</p>
          <h2 className="login-unit mt-4 font-serif text-3xl text-white">手机号登录</h2>
          <p className="login-unit mt-3 text-sm leading-6 text-[#7391a9]">使用短信验证码登录职向量，无需设置密码。</p>
          {stage === "phone" ? (
            <form onSubmit={(event) => void sendCode(event)} className="login-unit mt-8">
              <label htmlFor="login-phone" className="text-xs font-medium text-[#87a1b6]">手机号码</label>
              <div className="mt-2 flex h-12 items-center border border-[#2b658f] bg-[#072541] px-3 focus-within:border-[#4792cf]"><Smartphone size={17} className="mr-3 shrink-0 text-[#4c94cf]" /><span className="mr-2 text-sm text-[#7692a8]">+86</span><input id="login-phone" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 11))} type="tel" inputMode="numeric" autoComplete="tel" required pattern="1[3-9][0-9]{9}" placeholder="请输入11位手机号" className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm text-white outline-none placeholder:text-[#42596b]" /></div>
              <button disabled={submitting || phone.length !== 11} className="mt-4 flex h-12 w-full items-center justify-center gap-2 bg-[#3b85c2] text-sm font-semibold text-[#202b3a] transition hover:bg-[#64a8df] disabled:cursor-not-allowed disabled:bg-[#1c4567] disabled:text-[#526e85]" type="submit">{submitting ? "正在发送…" : "获取验证码"}<ArrowUp className="rotate-45" size={16} /></button>
            </form>
          ) : (
            <form onSubmit={(event) => void verifyCode(event)} className="login-unit mt-8">
              <div className="flex items-center justify-between text-xs"><span className="text-[#87a1b6]">验证码已发送至 +86 {phone.slice(0, 3)}****{phone.slice(-4)}</span><button type="button" onClick={() => { setStage("phone"); setCode(""); setError(""); }} className="flex items-center gap-1 text-[#63a3d8]"><ArrowLeft size={13} />更换号码</button></div>
              <label htmlFor="login-code" className="mt-5 block text-xs font-medium text-[#87a1b6]">短信验证码</label>
              <div className="mt-2 flex h-12 items-center border border-[#2b658f] bg-[#072541] px-3 focus-within:border-[#4792cf]"><ShieldCheck size={17} className="mr-3 shrink-0 text-[#4c94cf]" /><input id="login-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))} type="text" inputMode="numeric" autoComplete="one-time-code" required autoFocus placeholder="请输入短信验证码" className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm text-white outline-none placeholder:text-[#42596b]" /></div>
              <button disabled={submitting || code.length < 4} className="mt-4 flex h-12 w-full items-center justify-center gap-2 bg-[#3b85c2] text-sm font-semibold text-[#202b3a] transition hover:bg-[#64a8df] disabled:cursor-not-allowed disabled:bg-[#1c4567] disabled:text-[#526e85]" type="submit">{submitting ? "正在登录…" : "验证并登录"}</button>
              <button disabled={submitting || cooldown > 0} onClick={(event) => void sendCode(event)} type="button" className="mt-4 w-full text-center text-xs text-[#63a3d8] disabled:text-[#486176]">{cooldown > 0 ? `${cooldown}秒后可重新发送` : "重新发送验证码"}</button>
            </form>
          )}
          {error && <p className="login-unit mt-3 border-l-2 border-[#e07c58] bg-[#241511] px-3 py-2 text-xs leading-5 text-[#efaa90]">{error}</p>}
          <p className="login-unit mt-7 text-[11px] leading-5 text-[#486176]">登录即表示你同意将咨询记录与该账号关联，用于保存职业规划历史。</p>
        </div>
      </div>
    </div>
  );
}

function SignalMatrix() {
  return <SkillGlobe />;
}

function MessageBlock({ audience, message, showSuggestions, onSuggestedQuestion }: { audience: UserAudience; message: UiMessage; showSuggestions: boolean; onSuggestedQuestion: (value: string) => void }) {
  const ref = useRef<HTMLDivElement | HTMLElement>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => { gsap.fromTo(ref.current!, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.48, ease: "power2.out" }); });
    return () => mm.revert();
  }, []);
  if (message.role === "user") return <div ref={ref as React.RefObject<HTMLDivElement>} className="ml-auto max-w-3xl border border-[#255c85] bg-[#0e3157] px-4 py-3"><p className="text-[10px] font-semibold tracking-[0.14em] text-[#5097d2]">你的问题</p><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#dbe3e9]">{message.content}</p></div>;
  return <article ref={ref as React.RefObject<HTMLElement>} className="max-w-4xl border-l-2 border-[#d98560] bg-[#061f39] px-5 py-5"><div className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.16em] text-[#d98c68]"><MessageSquareText size={14} />{audience === "curriculum_designer" ? "培养方案诊断建议" : "职业规划建议"}</div><AnswerContent content={message.content} />{message.evidence && <Evidence evidence={message.evidence} />}{showSuggestions && message.suggestedQuestions?.length ? <div className="mt-5 border-t border-[#1d4d74] pt-4"><p className="flex items-center gap-2 text-[11px] font-medium tracking-[0.08em] text-[#62a2d7]"><Sparkles size={13} />你可能还想问</p><div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">{message.suggestedQuestions.map((question) => <button key={question} onClick={() => onSuggestedQuestion(question)} className="group flex min-h-10 w-full items-center justify-between gap-3 border border-[#255c85] bg-[#072541] px-3 py-2.5 text-left text-xs leading-5 text-[#a9bccb] transition hover:border-[#458eca] hover:text-white sm:w-auto" type="button"><span>{question}</span><ChevronRight size={13} className="shrink-0 text-[#496276] transition group-hover:translate-x-0.5 group-hover:text-[#60a4db]" /></button>)}</div></div> : null}</article>;
}

const answerSectionTitles = new Set(["建议", "为什么", "下一步", "直接判断", "比较结果", "数据依据", "AI影响", "应强化的能力", "课程学习建议", "学习顺序", "课程外补充", "AI辅助方式", "诊断结论", "岗位需求对应", "历年方案变化", "修订建议", "证据边界"]);

function renderInlineMarkdown(value: string) {
  const parts = value.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)]+\))/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={`${part}-${index}`} className="font-semibold text-[#eef3f7]">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={`${part}-${index}`} className="bg-[#12375a] px-1.5 py-0.5 font-mono text-xs text-[#82b9e4]">{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    if (link) return <a key={`${part}-${index}`} href={link[2]} target="_blank" rel="noreferrer" className="text-[#69ade2] underline decoration-[#376d96] underline-offset-4 hover:text-white">{link[1]}</a>;
    return part;
  });
}

function AnswerContent({ content }: { content: string }) {
  const normalized = content
    .replace(/\\+n/g, "\n")
    .replace(/\\+([*_`#])/g, "$1")
    .replace(/^(\s*\d+)\\+\.\s*/gm, "$1. ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const blocks = normalized.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return <div className="mt-3 space-y-2 text-sm leading-8 text-[#c5d2dc]">{blocks.map((line, index) => {
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) return <h3 key={`${line}-${index}`} className="pt-2 text-sm font-semibold text-[#e8edf2] first:pt-0">{renderInlineMarkdown(heading[2])}</h3>;
    const strongHeading = line.match(/^\*\*([^*]+)\*\*[:：]?$/);
    if (strongHeading || answerSectionTitles.has(line.replace(/[：:]$/, ""))) return <h3 key={`${line}-${index}`} className="pt-2 text-sm font-semibold text-[#e8edf2] first:pt-0">{strongHeading ? strongHeading[1] : line.replace(/[：:]$/, "")}</h3>;
    const numbered = line.match(/^(\d+)[.、]\s*(.+)$/);
    if (numbered) return <div key={`${line}-${index}`} className="grid grid-cols-[20px_minmax(0,1fr)] gap-2"><span className="font-mono text-xs text-[#579bd3]">{numbered[1]}.</span><p>{renderInlineMarkdown(numbered[2])}</p></div>;
    const bullet = line.match(/^[-*+]\s+(.+)$/);
    if (bullet) return <div key={`${line}-${index}`} className="grid grid-cols-[10px_minmax(0,1fr)] gap-2"><span className="pt-px text-[#579bd3]">•</span><p>{renderInlineMarkdown(bullet[1])}</p></div>;
    return <p key={`${line}-${index}`}>{renderInlineMarkdown(line)}</p>;
  })}</div>;
}

function taskKind(question: string) {
  if (/培养方案|课程学习|学习规划|课程.*建议/.test(question)) return "curriculum";
  if (/(?:AI|人工智能).{0,16}(?:辅助|替代|影响|冲击|任务|渗透|暴露)/i.test(question)) return "ai";
  if (/下一步.{0,12}(?:补|学)|补什么技能|提升什么技能|下一项技能/.test(question)) return "skill_growth";
  if (/比较|对比|相比|哪个|哪项|更值得|还是/.test(question)) return "comparison";
  if (/城市|哪里|哪座/.test(question)) return "city";
  if (/组合|互补|共现/.test(question)) return "combination";
  if (/202[678]|趋势|未来|增长|下降/.test(question)) return "trend";
  return "career";
}

function initialTaskProgress(question: string) {
  const copy = {
    curriculum: "正在识别学校、年级、专业与目标方向...",
    ai: "正在识别技能、职业与AI影响焦点...",
    comparison: "正在识别比较对象与判断标准...",
    skill_growth: "正在识别现有能力与下一技能目标...",
    city: "正在识别目标职业与地域偏好...",
    combination: "正在识别技能组合与评价重点...",
    trend: "正在识别技能及需要预测的指标...",
    career: "正在识别专业、技能与求职目标..."
  } as const;
  return copy[taskKind(question)];
}

function taskThinkingPhrases(question: string, stage: ChatProgress["stage"] | undefined): string[] {
  const kind = taskKind(question);
  const copy = {
    curriculum: {
      understanding: ["正在定位你的年级与专业培养方案"],
      searching: ["正在提取相关课程与培养能力", "正在关联课程训练与岗位需求"],
      writing: ["正在生成分阶段课程学习建议"],
      fallback: ["正在依据培养方案整理学习路径"]
    },
    ai: {
      understanding: ["正在识别你关心的AI影响场景"],
      searching: ["正在调取AI暴露与技能共现证据", "正在区分可辅助任务与潜在替代压力"],
      writing: ["正在形成针对性的AI协作策略"],
      fallback: ["正在依据现有证据整理AI应对建议"]
    },
    comparison: {
      understanding: ["正在识别需要比较的选项"],
      searching: ["正在对齐两项选择的可比指标", "正在比较需求、工资与未来趋势"],
      writing: ["正在判断更值得优先投入的方向"],
      fallback: ["正在依据可用指标完成比较"]
    },
    skill_growth: {
      understanding: ["正在梳理现有技能与能力缺口"],
      searching: ["正在比较候选技能的边际价值", "正在重算职业、工资与城市匹配"],
      writing: ["正在形成下一技能投入建议"],
      fallback: ["正在依据市场证据整理技能提升方案"]
    },
    city: {
      understanding: ["正在识别你的职业与地域偏好"],
      searching: ["正在比较不同城市的岗位容量", "正在匹配城市产业与技能需求"],
      writing: ["正在生成城市选择建议"],
      fallback: ["正在依据城市数据整理建议"]
    },
    combination: {
      understanding: ["正在识别你的技能组合"],
      searching: ["正在检索技能共现与工资互补证据", "正在评估组合需求与城市覆盖"],
      writing: ["正在判断技能组合的市场价值"],
      fallback: ["正在依据组合证据整理建议"]
    },
    trend: {
      understanding: ["正在识别需要观察的预测指标"],
      searching: ["正在调取历史需求与预测序列", "正在比较需求、工资和城市变化"],
      writing: ["正在形成未来趋势判断"],
      fallback: ["正在依据预测结果整理趋势"]
    },
    career: {
      understanding: ["正在梳理你的专业、技能与目标"],
      searching: ["正在匹配职业需求与技能证据", "正在评估岗位前景与能力缺口"],
      writing: ["正在生成个性化职业建议"],
      fallback: ["正在依据现有证据整理职业建议"]
    }
  } as const;
  return [...copy[kind][stage ?? "understanding"]];
}

function ThinkingIndicator({ progress, preview, question }: { progress: ChatProgress | null; preview: EvidencePreview | null; question: string }) {
  const [index, setIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const phraseRef = useRef<HTMLParagraphElement>(null);
  const phrases = taskThinkingPhrases(question, progress?.stage);
  const phraseKey = `${taskKind(question)}-${progress?.stage ?? "understanding"}`;
  const phraseCount = phrases.length;
  useEffect(() => {
    setIndex(0);
    if (phraseCount < 2) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % phraseCount), 1800);
    return () => window.clearInterval(timer);
  }, [phraseKey, phraseCount]);
  useLayoutEffect(() => {
    if (!rootRef.current) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(rootRef.current!, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: "power2.out" });
      gsap.to(rootRef.current!.querySelectorAll(".thinking-bar"), { scaleY: 0.3, duration: 0.52, repeat: -1, yoyo: true, stagger: 0.12, ease: "power1.inOut" });
      gsap.to(rootRef.current!.querySelector(".thinking-scan"), { xPercent: 360, duration: 1.8, repeat: -1, ease: "none" });
    });
    return () => mm.revert();
  }, []);
  useLayoutEffect(() => { if (phraseRef.current) gsap.fromTo(phraseRef.current, { autoAlpha: 0, y: 5 }, { autoAlpha: 1, y: 0, duration: 0.32, ease: "power1.out" }); }, [index]);
  return <div ref={rootRef} className="max-w-4xl overflow-hidden border border-[#22577f] bg-[#072541]"><div className="relative h-0.5 overflow-hidden bg-[#12375a]"><i className="thinking-scan absolute left-0 top-0 h-full w-1/4 bg-[#4b97d6]" /></div><div className="flex items-center gap-4 px-5 py-5"><span className="flex h-7 items-end gap-1">{[0, 1, 2, 3].map((item) => <i key={item} className="thinking-bar block h-6 w-1 bg-[#4b97d6]" />)}</span><div><p ref={phraseRef} className="text-sm font-medium text-[#d8e0e7]">{phrases[index] ?? phrases[0]}</p><p className="mt-1 text-xs text-[#57768f]">{progress?.message ?? "正在确定本轮问题所需的数据..."}</p></div></div>{preview && <div className="border-t border-[#174366] px-5 pb-4"><ReferencePreview preview={preview} /></div>}</div>;
}

function Evidence({ evidence }: { evidence: ChatResponse["evidence"] }) {
  return <div className="mt-5"><div className="grid gap-px border border-[#1d4d74] bg-[#1d4d74] sm:grid-cols-3"><div className="bg-[#061f39] p-3"><p className="text-[10px] tracking-[0.1em] text-[#547188]">识别技能</p><p className="mt-2 text-xs leading-5 text-[#b4c4d1]">{evidence.recognizedSkills.join("、") || "暂无"}</p></div><div className="bg-[#061f39] p-3"><p className="text-[10px] tracking-[0.1em] text-[#547188]">预测目标年</p><p className="mt-2 text-xs text-[#b4c4d1]">{evidence.forecastYear}年</p></div><div className="bg-[#061f39] p-3"><p className="text-[10px] tracking-[0.1em] text-[#547188]">直接观测组合</p><p className="mt-2 text-xs text-[#b4c4d1]">{evidence.observedPairCount}组</p></div></div><ReferencePreview preview={buildEvidencePreview(evidence)} /></div>;
}

function ReferencePreview({ preview }: { preview: EvidencePreview }) {
  return <div className="mt-4 border-t border-[#1b4a70] pt-3 text-xs leading-5 text-[#61839e]"><p className="font-medium text-[#5697cd]">本次已检索到的依据</p><p>技能：{preview.skills.join("、") || "暂无"}</p><p>职业：{preview.occupations.join("、") || "暂无"}</p><p>城市：{preview.cities.join("、") || "暂无"}</p><p className="mt-1 text-[#496277]">引用表：{preview.sources.join("、")}</p></div>;
}
