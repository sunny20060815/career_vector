"use client";

import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUp, BookOpen, BrainCircuit, ChevronRight, CircleCheck, Clock3, Database, LogOut, Mail, MailCheck, MessageSquareText, MessageSquareWarning, Plus, Radar, Sparkles } from "lucide-react";
import gsap from "gsap";

import { DataMethods } from "@/components/data-methods";
import { FeedbackPanel } from "@/components/feedback-panel";
import { formatOtpSendError } from "@/lib/auth-error";
import { getEmailRedirectUrl } from "@/lib/auth-redirect";
import { getSessionEmail } from "@/lib/auth-session";
import { buildEvidencePreview, type EvidencePreview } from "@/lib/career-presentation";
import { decodeChatStream } from "@/lib/chat-stream";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { ChatEvidenceEvent, ChatProgress, ChatResponse } from "@/types/api";

interface Conversation { id: string; title: string; updated_at: string }
interface UiMessage { id: string; role: "user" | "assistant"; content: string; evidence?: ChatResponse["evidence"] }

const examples = [
  { icon: BrainCircuit, title: "专业供需匹配", text: "我是首经贸2024级经济学（实验班）专业的学生，我会 Python、Stata 和 R语言", note: "培养方案 · 职业路径" },
  { icon: Radar, title: "技能组合", text: "我会 Python、沟通能力和药学，适合去哪座城市找什么工作？", note: "岗位 · 城市 · AI影响" },
  { icon: Sparkles, title: "转行评估", text: "有3年数据分析经验，想去上海，月薪期望18000元，下一步该补什么技能？", note: "薪资 · 技能提升" },
  { icon: Database, title: "趋势判断", text: "机器学习和 SQL 在2028年的岗位需求和薪资趋势怎么样？", note: "历史观测 · 未来预测" }
];

const thinkingPhrases = ["正在理解您的经历", "正在匹配职业与城市", "正在分析技能组合", "正在为您生成职业规划"];
const localPreview = process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_LOCAL_PREVIEW === "true";

export function CareerWorkbench() {
  const [activeView, setActiveView] = useState<"planner" | "methods" | "feedback">("planner");
  const [email, setEmail] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ChatProgress | null>(null);
  const [preview, setPreview] = useState<EvidencePreview | null>(null);
  const [error, setError] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const introRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (localPreview) {
      setUserEmail("本地预览模式");
      setAuthChecked(true);
      return;
    }
    const supabase = createBrowserSupabaseClient();
    void supabase.auth.getSession().then(({ data }) => {
      const sessionEmail = getSessionEmail(data.session);
      setUserEmail(sessionEmail);
      setAuthChecked(true);
      if (sessionEmail) void loadConversations();
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionEmail = getSessionEmail(session);
      setUserEmail(sessionEmail);
      setAuthChecked(true);
      if (sessionEmail) void loadConversations();
    });
    return () => subscription.unsubscribe();
  }, []);

  useLayoutEffect(() => {
    if (!userEmail || messages.length || !introRef.current) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(introRef.current!.querySelectorAll(".intro-unit"), { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.65, ease: "power2.out", stagger: 0.07 });
    });
    return () => mm.revert();
  }, [userEmail, messages.length]);

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
    setMessages(payload.messages);
    setError("");
    setActiveView("planner");
  }

  async function sendMagicLink(event: FormEvent) {
    event.preventDefault();
    setAuthError("");
    const { error: signInError } = await createBrowserSupabaseClient().auth.signInWithOtp({ email, options: { emailRedirectTo: getEmailRedirectUrl(window.location.origin) } });
    if (signInError) return setAuthError(formatOtpSendError(signInError.message));
    setLinkSent(true);
  }

  async function signOut() {
    await createBrowserSupabaseClient().auth.signOut();
    setUserEmail(null);
    setLinkSent(false);
    setEmail("");
    setConversations([]);
    setMessages([]);
    setConversationId(undefined);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!question.trim() || loading) return;
    if (!userEmail) return setError("请先登录后再提交职业咨询。");
    const submitted = question.trim();
    setLoading(true);
    setProgress({ stage: "understanding", message: "正在识别技能与求职偏好..." });
    setPreview(null);
    setError("");
    setQuestion("");
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: submitted }]);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: submitted, conversationId }) });
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
            setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: payload.answer, evidence: payload.evidence }]);
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

  return (
    <main className="app-shell h-[100dvh] min-h-0 overflow-hidden bg-[#060b0c] text-[#e8f1ed]">
      <div className="grid h-full grid-cols-1 md:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="hidden min-h-0 flex-col border-r border-[#19302e] bg-[#091211] md:flex">
          <div className="border-b border-[#19302e] px-5 py-5"><Brand /></div>
          <div className="px-4 pt-4"><button onClick={() => { setActiveView("planner"); setConversationId(undefined); setMessages([]); }} className="flex h-10 w-full items-center justify-center gap-2 border border-[#2b514b] bg-[#0d1b19] text-sm text-[#c7d9d3] transition hover:border-[#42cdb0] hover:text-white" type="button"><Plus size={15} />新建规划</button></div>
          <div className="mt-6 flex items-center gap-2 px-5 text-[11px] font-medium tracking-[0.12em] text-[#66817b]"><Clock3 size={13} />历史咨询</div>
          <div className="mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3">
            {conversations.map((item) => <button key={item.id} onClick={() => void chooseConversation(item.id)} className={`truncate border-l px-3 py-2.5 text-left text-sm transition ${item.id === conversationId ? "border-[#4eddbd] bg-[#112621] text-white" : "border-transparent text-[#7f9992] hover:bg-[#0d1b19] hover:text-[#d8e7e2]"}`} type="button">{item.title}</button>)}
            {!conversations.length && <p className="px-3 py-3 text-xs leading-5 text-[#506963]">新的职业规划将在这里留存。</p>}
          </div>
          <div className="border-t border-[#19302e] p-4"><div className="flex items-center gap-2 text-xs text-[#79938c]"><CircleCheck size={14} className="text-[#42cdb0]" /><span className="truncate">{userEmail ?? "等待登录"}</span></div>{userEmail && <button onClick={() => void signOut()} className="mt-3 flex items-center gap-2 text-xs text-[#b98573] transition hover:text-[#ef9b7e]" type="button"><LogOut size={13} />退出登录</button>}</div>
        </aside>

        <section className="relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#08100f]">
          <header className="shrink-0 border-b border-[#19302e] bg-[#091211]/95">
            <div className="flex h-16 items-center justify-between px-4 md:px-7"><div className="md:hidden"><Brand /></div><div className="hidden items-center gap-3 text-xs text-[#76918a] md:flex"><span className="status-dot" />职业技能数据引擎已连接</div><div className="flex items-center gap-2 text-[10px] tracking-[0.12em] text-[#5f7a73]"><Database size={13} />DATASET 2014—2026.03</div></div>
            <nav className="flex h-11 items-stretch gap-6 border-t border-[#142724] px-4 md:px-7" aria-label="主导航">
              <ViewTab active={activeView === "planner"} icon={Radar} label="职业规划" onClick={() => setActiveView("planner")} />
              <ViewTab active={activeView === "methods"} icon={BookOpen} label="数据与方法" onClick={() => setActiveView("methods")} />
              <ViewTab active={activeView === "feedback"} icon={MessageSquareWarning} label="问题反馈" onClick={() => setActiveView("feedback")} />
            </nav>
          </header>

          {activeView === "planner" ? <>
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-48 pt-6 md:px-8 md:pb-52 lg:px-12">
              {!messages.length && !loading ? <Intro containerRef={introRef} onExample={(value) => { setQuestion(value); requestAnimationFrame(resizeTextarea); }} /> : <div className="mx-auto max-w-5xl space-y-7">{messages.map((message) => <MessageBlock key={message.id} message={message} />)}{loading && <ThinkingIndicator progress={progress} preview={preview} />}</div>}
            </div>

            <div className="composer-dock pointer-events-none absolute inset-x-0 bottom-0 z-20 border-t border-[#19302e] bg-[#08100f]/95 px-3 pb-3 pt-3 md:px-8 md:pb-6 lg:px-12">
            <form onSubmit={(event) => void submit(event)} className="pointer-events-auto mx-auto max-w-5xl border border-[#2b4b46] bg-[#0c1715] shadow-[0_-16px_50px_rgba(0,0,0,0.28)] focus-within:border-[#43c9ac]">
              <textarea ref={textareaRef} value={question} onChange={(event) => { setQuestion(event.target.value); resizeTextarea(); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} rows={2} placeholder="描述你的专业、技能、经验与目标城市…" className="block min-h-20 w-full resize-none border-0 bg-transparent px-4 py-4 text-sm leading-6 text-[#edf5f2] outline-none placeholder:text-[#526c65] md:px-5" />
              <div className="flex items-center justify-between border-t border-[#182b28] px-4 py-2.5"><span className="text-[11px] text-[#607c75]">Enter 发送 · Shift + Enter 换行</span><button disabled={loading || !question.trim()} className="grid h-9 w-9 place-items-center bg-[#38b99e] text-[#03110e] transition hover:bg-[#63ddc2] disabled:cursor-not-allowed disabled:bg-[#263d38] disabled:text-[#58716a]" type="submit" aria-label="提交咨询"><ArrowUp size={17} /></button></div>
            </form>
            {error && <p className="pointer-events-auto mx-auto mt-2 max-w-5xl border-l-2 border-[#e07c58] bg-[#251511] px-3 py-2 text-xs text-[#efaa90]">{error}</p>}
            </div>
          </> : activeView === "methods" ? <div className="min-h-0 flex-1 overflow-y-auto px-4 md:px-8 lg:px-12"><DataMethods /></div> : <div className="min-h-0 flex-1 overflow-y-auto px-4 md:px-8 lg:px-12"><FeedbackPanel userEmail={userEmail} /></div>}
        </section>
      </div>
      {authChecked && !userEmail && <LoginOverlay email={email} error={authError} linkSent={linkSent} onEmail={setEmail} onSend={sendMagicLink} onReset={() => { setLinkSent(false); setAuthError(""); }} />}
    </main>
  );
}

function ViewTab({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Radar; label: string; onClick: () => void }) {
  return <button onClick={onClick} type="button" className={`relative flex items-center gap-2 px-0 text-xs transition ${active ? "text-[#62dec3]" : "text-[#6e8982] hover:text-[#c8d8d3]"}`} aria-current={active ? "page" : undefined}><Icon size={14} />{label}<span className={`absolute inset-x-0 bottom-0 h-0.5 transition ${active ? "bg-[#49cdb0]" : "bg-transparent"}`} /></button>;
}

function Brand() {
  return <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center border border-[#2ec5a7] bg-[#0d2924] text-[#5ce4c5]"><Radar size={19} /></span><div><p className="font-serif text-lg text-white">职向量</p><p className="text-[10px] tracking-[0.18em] text-[#6f9189]">CAREER INTELLIGENCE</p></div></div>;
}

function Intro({ containerRef, onExample }: { containerRef: React.RefObject<HTMLDivElement | null>; onExample: (value: string) => void }) {
  return <div ref={containerRef} className="mx-auto flex min-h-[calc(100vh-18rem)] max-w-6xl flex-col justify-center py-8"><div className="grid items-end gap-10 lg:grid-cols-[minmax(0,1fr)_360px]"><div><p className="intro-unit text-xs font-semibold tracking-[0.2em] text-[#45d5b6]">LABOR MARKET SIGNAL SYSTEM</p><h1 className="intro-unit mt-4 max-w-3xl font-serif text-3xl leading-tight text-white md:text-4xl lg:text-[44px]">把专业、技能与真实岗位需求连接起来</h1><p className="intro-unit mt-4 max-w-2xl text-sm leading-7 text-[#8ca39d]">输入你的年级、专业、技能或求职偏好。职向量会从招聘数据中匹配职业方向、工资前景、城市机会与下一项能力投资。</p><p className="intro-unit mt-5 max-w-3xl border-l-2 border-[#e58b62] bg-[#0e1917] px-4 py-3 text-sm leading-6 text-[#aec0ba]">首都经济贸易大学23、24、25级学生可输入年级和专业，结合对应培养方案进行供需匹配。例如：首经贸2024级经济学（实验班）。</p></div><SignalMatrix /></div><div className="mt-10 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{examples.map((example) => { const Icon = example.icon; return <button key={example.title} onClick={() => onExample(example.text)} type="button" className="intro-unit group min-h-36 border border-[#1b3531] bg-[#0b1514] p-4 text-left transition hover:border-[#3cb89f] hover:bg-[#0e1e1b]"><div className="flex items-center justify-between"><span className="grid h-8 w-8 place-items-center border border-[#28584f] text-[#51d5b9]"><Icon size={16} /></span><ChevronRight className="text-[#49645e] transition group-hover:translate-x-1 group-hover:text-[#65e1c5]" size={15} /></div><p className="mt-4 text-sm font-semibold text-[#e3ece8]">{example.title}</p><p className="mt-2 line-clamp-2 text-xs leading-5 text-[#7f9690]">{example.text}</p><p className="mt-3 text-[10px] tracking-[0.08em] text-[#b17860]">{example.note}</p></button>; })}</div></div>;
}

function LoginOverlay({ email, error, linkSent, onEmail, onSend, onReset }: { email: string; error: string; linkSent: boolean; onEmail: (value: string) => void; onSend: (event: FormEvent) => Promise<void>; onReset: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
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
  return <div ref={overlayRef} className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#030706]/95 p-4 backdrop-blur-md"><div ref={panelRef} className="grid w-full max-w-4xl overflow-hidden border border-[#284b45] bg-[#091211] shadow-[0_28px_100px_rgba(0,0,0,0.65)] md:grid-cols-[0.9fr_1.1fr]"><div className="relative hidden min-h-[520px] overflow-hidden border-r border-[#203b36] bg-[#07100f] p-8 md:block"><div className="login-unit"><Brand /></div><div className="login-unit mt-16"><p className="text-xs tracking-[0.18em] text-[#42cdb0]">YOUR CAREER, IN SIGNALS</p><h2 className="mt-4 font-serif text-3xl leading-tight text-white">从专业培养<br />走向真实市场</h2><p className="mt-4 text-sm leading-7 text-[#7f9992]">854万余条招聘信息，连接技能、职业、城市与人工智能影响。</p></div><LoginMatrix /></div><div className="flex min-h-[460px] flex-col justify-center p-6 sm:p-10 md:p-12">{!linkSent ? <><p className="login-unit text-xs font-semibold tracking-[0.2em] text-[#45d5b6]">SECURE ACCESS</p><h2 className="login-unit mt-4 font-serif text-3xl text-white">登录职向量</h2><p className="login-unit mt-3 text-sm leading-6 text-[#819b94]">输入邮箱获取免密登录链接。无需设置密码，点击邮件中的确认链接即可进入。</p><form onSubmit={(event) => void onSend(event)} className="login-unit mt-8"><label htmlFor="login-email" className="text-xs font-medium text-[#93aaa4]">邮箱地址</label><div className="mt-2 flex h-12 items-center border border-[#2b4b46] bg-[#0c1715] px-3 focus-within:border-[#47cfb2]"><Mail size={17} className="mr-3 shrink-0 text-[#4ccfb3]" /><input id="login-email" value={email} onChange={(event) => onEmail(event.target.value)} type="email" autoComplete="email" required placeholder="name@example.com" className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm text-white outline-none placeholder:text-[#49645e]" /></div><button className="mt-4 flex h-12 w-full items-center justify-center gap-2 bg-[#3bc2a5] text-sm font-semibold text-[#04120f] transition hover:bg-[#64dfc4]" type="submit">发送登录链接<ArrowUp className="rotate-45" size={16} /></button></form>{error && <p className="login-unit mt-3 border-l-2 border-[#e07c58] bg-[#241511] px-3 py-2 text-xs leading-5 text-[#efaa90]">{error}</p>}<p className="login-unit mt-7 text-[11px] leading-5 text-[#526c65]">登录即表示你同意仅将咨询记录用于本账户的职业规划服务。</p></> : <div className="login-unit"><span className="grid h-12 w-12 place-items-center border border-[#3bc2a5] bg-[#0e2a25] text-[#62e4c8]"><MailCheck size={24} /></span><p className="mt-6 text-xs font-semibold tracking-[0.2em] text-[#45d5b6]">CHECK YOUR INBOX</p><h2 className="mt-4 font-serif text-3xl text-white">确认链接已发送</h2><p className="mt-4 text-sm leading-7 text-[#8da39d]">请前往 <span className="text-[#d7e6e1]">{email}</span>，点击邮件中的确认链接。验证完成后将自动返回职向量。</p><p className="mt-5 border-l-2 border-[#d98560] bg-[#151917] px-3 py-2 text-xs leading-5 text-[#9eb0aa]">没有收到？请检查垃圾邮件，或等待一分钟后重新发送。</p><button onClick={onReset} className="mt-7 flex items-center gap-2 text-sm text-[#63d8be] transition hover:text-[#91ead7]" type="button"><ArrowLeft size={15} />更换邮箱或重新发送</button></div>}</div></div></div>;
}

function SignalMatrix() {
  return <div className="intro-unit signal-matrix relative hidden h-52 overflow-hidden border border-[#1c3833] bg-[#091412] lg:block" aria-hidden="true"><span className="matrix-label left-5 top-4">SKILL GRAPH / LIVE</span><i className="matrix-line matrix-line-a" /><i className="matrix-line matrix-line-b" /><i className="matrix-line matrix-line-c" />{["AI", "DATA", "OPS", "CITY", "WAGE", "ROLE", "SKILL"].map((label, index) => <span key={label} className={`matrix-node matrix-node-${index + 1}`}><b />{label}</span>)}<span className="absolute bottom-4 left-5 text-[10px] tracking-[0.14em] text-[#54716a]">830 SKILLS · 380 OCCUPATIONS</span></div>;
}

function LoginMatrix() {
  return <div className="login-unit login-matrix absolute inset-x-8 bottom-8 h-40 border border-[#18342f]" aria-hidden="true"><span className="absolute left-3 top-3 text-[9px] tracking-[0.16em] text-[#4b6b64]">MATCHING SIGNAL</span>{[18, 36, 54, 72, 86].map((left, index) => <i key={left} className="login-node" style={{ left: `${left}%`, top: `${[66, 32, 52, 25, 70][index]}%` }} />)}<i className="login-beam beam-a" /><i className="login-beam beam-b" /><i className="login-beam beam-c" /><i className="login-scan" /></div>;
}

function MessageBlock({ message }: { message: UiMessage }) {
  const ref = useRef<HTMLDivElement | HTMLElement>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => { gsap.fromTo(ref.current!, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.48, ease: "power2.out" }); });
    return () => mm.revert();
  }, []);
  if (message.role === "user") return <div ref={ref as React.RefObject<HTMLDivElement>} className="ml-auto max-w-3xl border border-[#284b45] bg-[#0d211d] px-4 py-3"><p className="text-[10px] font-semibold tracking-[0.14em] text-[#50d2b6]">你的问题</p><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#dce8e4]">{message.content}</p></div>;
  return <article ref={ref as React.RefObject<HTMLElement>} className="max-w-4xl border-l-2 border-[#d98560] bg-[#0b1514] px-5 py-5"><div className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.16em] text-[#d98c68]"><MessageSquareText size={14} />职业规划建议</div><p className="mt-3 whitespace-pre-wrap text-sm leading-8 text-[#c9d8d3]">{message.content}</p>{message.evidence && <Evidence evidence={message.evidence} />}</article>;
}

function ThinkingIndicator({ progress, preview }: { progress: ChatProgress | null; preview: EvidencePreview | null }) {
  const [index, setIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const phraseRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { const timer = window.setInterval(() => setIndex((current) => (current + 1) % thinkingPhrases.length), 1800); return () => window.clearInterval(timer); }, []);
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
  return <div ref={rootRef} className="max-w-4xl overflow-hidden border border-[#24453f] bg-[#0b1715]"><div className="relative h-0.5 overflow-hidden bg-[#132823]"><i className="thinking-scan absolute left-0 top-0 h-full w-1/4 bg-[#4bd6b8]" /></div><div className="flex items-center gap-4 px-5 py-5"><span className="flex h-7 items-end gap-1">{[0, 1, 2, 3].map((item) => <i key={item} className="thinking-bar block h-6 w-1 bg-[#4bd6b8]" />)}</span><div><p ref={phraseRef} className="text-sm font-medium text-[#d9e6e2]">{thinkingPhrases[index]}</p><p className="mt-1 text-xs text-[#65817a]">{progress?.message ?? "正在检索招聘数据与技能关系..."}</p></div></div>{preview && <div className="border-t border-[#19302c] px-5 pb-4"><ReferencePreview preview={preview} /></div>}</div>;
}

function Evidence({ evidence }: { evidence: ChatResponse["evidence"] }) {
  return <div className="mt-5"><div className="grid gap-px border border-[#1f3934] bg-[#1f3934] sm:grid-cols-3"><div className="bg-[#0a1413] p-3"><p className="text-[10px] tracking-[0.1em] text-[#607c75]">识别技能</p><p className="mt-2 text-xs leading-5 text-[#b9ccc6]">{evidence.recognizedSkills.join("、") || "暂无"}</p></div><div className="bg-[#0a1413] p-3"><p className="text-[10px] tracking-[0.1em] text-[#607c75]">预测目标年</p><p className="mt-2 text-xs text-[#b9ccc6]">{evidence.forecastYear}年</p></div><div className="bg-[#0a1413] p-3"><p className="text-[10px] tracking-[0.1em] text-[#607c75]">直接观测组合</p><p className="mt-2 text-xs text-[#b9ccc6]">{evidence.observedPairCount}组</p></div></div><ReferencePreview preview={buildEvidencePreview(evidence)} /></div>;
}

function ReferencePreview({ preview }: { preview: EvidencePreview }) {
  return <div className="mt-4 border-t border-[#1d3732] pt-3 text-xs leading-5 text-[#728d86]"><p className="font-medium text-[#56cdb4]">本次已检索到的依据</p><p>技能：{preview.skills.join("、") || "暂无"}</p><p>职业：{preview.occupations.join("、") || "暂无"}</p><p>城市：{preview.cities.join("、") || "暂无"}</p><p className="mt-1 text-[#536d67]">引用表：{preview.sources.join("、")}</p></div>;
}
