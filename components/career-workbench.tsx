"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronRight, CircleHelp, Clock3, LoaderCircle, LogOut, MessageSquareText, Plus, Sparkles } from "lucide-react";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { formatOtpSendError } from "@/lib/auth-error";
import { getEmailRedirectUrl } from "@/lib/auth-redirect";
import { getSessionEmail } from "@/lib/auth-session";
import { buildEvidencePreview, type EvidencePreview } from "@/lib/career-presentation";
import { decodeChatStream } from "@/lib/chat-stream";
import type { ChatEvidenceEvent, ChatProgress, ChatResponse } from "@/types/api";

interface Conversation { id: string; title: string; updated_at: string }
interface UiMessage { id: string; role: "user" | "assistant"; content: string; evidence?: ChatResponse["evidence"] }

const examples = [
  { title: "技能组合", text: "我会 Python、沟通能力和药学，适合去哪座城市找什么工作？", note: "岗位、城市、AI 渗透率" },
  { title: "转行评估", text: "有 3 年数据分析经验，想去上海，月薪期望 18000 元，下一步该补什么技能？", note: "薪资差距与技能路径" },
  { title: "趋势判断", text: "机器学习和 SQL 在 2028 年的岗位需求和薪资趋势怎么样？", note: "历史观测与预测" }
];

export function CareerWorkbench() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
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

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionEmail = getSessionEmail(session);
      setUserEmail(sessionEmail);

      if (sessionEmail) {
        void loadConversations();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  function resizeTextarea() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 340)}px`;
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
  }

  async function sendOtp(event: FormEvent) {
    event.preventDefault();
    setAuthError("");
    const { error: signInError } = await createBrowserSupabaseClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: getEmailRedirectUrl(window.location.origin) }
    });
    if (signInError) return setAuthError(formatOtpSendError(signInError.message));
    setOtpSent(true);
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault();
    setAuthError("");
    const { data, error: verifyError } = await createBrowserSupabaseClient().auth.verifyOtp({ email, token: otp, type: "email" });
    if (verifyError || !data.user?.email) return setAuthError("验证码无效或已过期，请重新获取。");
    setUserEmail(data.user.email);
    setOtp("");
    await loadConversations();
  }

  async function signOut() {
    await createBrowserSupabaseClient().auth.signOut();
    setUserEmail(null);
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
        for (const event of decoded.events) {
          if (event.type === "status") {
            setProgress(event.payload);
          } else if (event.type === "evidence") {
            setPreview((event.payload as unknown as ChatEvidenceEvent).preview);
          } else if (event.type === "complete") {
            const payload = event.payload as unknown as ChatResponse;
            setConversationId(payload.conversationId);
            setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: payload.answer, evidence: payload.evidence }]);
            await loadConversations();
            completed = true;
          } else if (event.type === "error") {
            throw new Error(event.payload.message);
          }
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
    <main className="min-h-screen p-3 md:p-5">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-[1540px] grid-cols-1 overflow-hidden border border-[#d9ddd8] bg-[#fbfcfa] md:min-h-[calc(100vh-2.5rem)] md:grid-cols-[260px_1fr]">
        <aside className="flex min-h-[150px] flex-col border-b border-[#d9ddd8] bg-[#f0f2ee] p-4 md:min-h-0 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between">
            <div className="font-serif text-xl tracking-[0.14em] text-[#19473e]">职向量</div>
            <Sparkles size={17} className="text-[#d16f3c]" aria-hidden="true" />
          </div>
          <p className="mt-3 text-xs leading-5 text-[#67706a]">让每一次职业选择，都有招聘数据可以追溯。</p>
          <button onClick={() => { setConversationId(undefined); setMessages([]); }} className="mt-5 flex h-10 items-center justify-center gap-2 border border-[#b9c1ba] bg-[#fbfcfa] text-sm text-[#294138] transition hover:border-[#257565]" type="button"><Plus size={16} />新建咨询</button>
          <div className="mt-7 flex items-center gap-2 text-xs font-medium text-[#657069]"><Clock3 size={14} />最近会话</div>
          <div className="mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            {conversations.map((item) => <button key={item.id} onClick={() => void chooseConversation(item.id)} className={`truncate px-2 py-2 text-left text-sm transition ${item.id === conversationId ? "bg-[#dce9df] text-[#174237]" : "text-[#57635c] hover:bg-[#e5e9e4]"}`} type="button">{item.title}</button>)}
            {!conversations.length && <span className="px-2 py-3 text-xs leading-5 text-[#879088]">登录后，这里会保存你的职业咨询记录。</span>}
          </div>
          {userEmail ? <div className="mt-4 border-t border-[#d9ddd8] pt-3"><p className="truncate text-xs text-[#5f6b63]">{userEmail}</p><button onClick={() => void signOut()} className="mt-2 flex items-center gap-1 text-xs text-[#8b4b2c] hover:text-[#5e301c]" type="button"><LogOut size={13} />退出登录</button></div> : <AuthForms email={email} otp={otp} otpSent={otpSent} error={authError} onEmail={setEmail} onOtp={setOtp} onSend={sendOtp} onVerify={verifyOtp} />}
        </aside>

        <section className="flex min-w-0 flex-col p-5 md:p-10">
          <header className="max-w-4xl"><p className="text-xs font-semibold tracking-[0.18em] text-[#d16f3c]">CAREER DATA LAB</p><h1 className="mt-3 font-serif text-3xl leading-tight text-[#202b25] md:text-5xl">把你的经历，放进真实的就业市场。</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-[#667069]">输入技能、专业知识、薪资期待或理想城市。系统会检索已观测的招聘聚合证据，再生成可追溯的建议。</p></header>
          <div className="mt-8 grid max-w-5xl gap-2 md:grid-cols-3">{examples.map((example) => <button key={example.title} onClick={() => { setQuestion(example.text); requestAnimationFrame(resizeTextarea); }} type="button" className="group border border-[#d9ddd8] p-4 text-left transition hover:border-[#257565] hover:bg-[#f5faf5]"><p className="text-xs font-semibold text-[#257565]">{example.title}</p><p className="mt-2 text-sm leading-5 text-[#303933]">{example.text}</p><p className="mt-3 text-xs text-[#8b928d]">{example.note}<ChevronRight className="inline align-text-bottom transition group-hover:translate-x-1" size={13} /></p></button>)}</div>
          <form onSubmit={(event) => void submit(event)} className="mt-6 max-w-5xl border border-[#cbd2cb] bg-white p-1 shadow-[0_12px_30px_rgba(30,45,35,0.06)]">
            <textarea ref={textareaRef} value={question} onChange={(event) => { setQuestion(event.target.value); resizeTextarea(); }} rows={5} placeholder="例如：我掌握 Python、药学和沟通能力，想去上海，期望月薪 15000 元，未来应该往哪个方向发展？" className="block min-h-40 w-full resize-none border-0 bg-transparent p-5 text-lg leading-8 text-[#27302b] outline-none placeholder:text-[#a0a7a1]" />
            <div className="flex items-center justify-between border-t border-[#eef0ed] px-4 py-3"><span className="flex items-center gap-2 text-xs text-[#7e8780]"><CircleHelp size={14} />仅依据已入库的招聘聚合证据回答</span><button disabled={loading || !question.trim()} className="grid h-10 w-10 place-items-center bg-[#1d5f51] text-white transition hover:bg-[#164a3f] disabled:cursor-not-allowed disabled:bg-[#aab6ae]" type="submit" aria-label="提交咨询">{loading ? <LoaderCircle className="animate-spin" size={18} /> : <ArrowUp size={18} />}</button></div>
          </form>
          {error && <p className="mt-3 max-w-5xl border-l-2 border-[#c96637] bg-[#fff9f6] px-4 py-3 text-sm text-[#873d22]">{error}</p>}
          <div className="mt-10 max-w-5xl space-y-7">{messages.map((message) => <MessageBlock key={message.id} message={message} />)}{loading && <div className="border-l-2 border-[#257565] bg-[#f5faf5] px-4 py-4 text-sm text-[#365449]"><div className="flex items-center gap-3"><span className="flex h-6 items-end gap-1">{[0, 1, 2].map((index) => <i key={index} className="loading-bar block h-5 w-1 bg-[#257565]" style={{ animationDelay: `${index * 120}ms` }} />)}</span>{progress?.message ?? "正在准备职业建议..."}</div>{preview && <ReferencePreview preview={preview} />}</div>}</div>
        </section>
      </div>
    </main>
  );
}

function MessageBlock({ message }: { message: UiMessage }) {
  if (message.role === "user") return <div className="border-l-2 border-[#d16f3c] pl-4"><p className="text-xs font-semibold tracking-[0.16em] text-[#a85b34]">你的问题</p><p className="mt-2 whitespace-pre-wrap text-base leading-7 text-[#2b342e]">{message.content}</p></div>;
  return <article className="border-t border-[#d9ddd8] pt-6"><div className="flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-[#257565]"><MessageSquareText size={15} />数据解读</div><p className="mt-3 whitespace-pre-wrap text-base leading-8 text-[#2f3933]">{message.content}</p>{message.evidence && <Evidence evidence={message.evidence} />}</article>;
}

function Evidence({ evidence }: { evidence: ChatResponse["evidence"] }) {
  return <div className="mt-5"><div className="grid gap-px border border-[#d9ddd8] bg-[#d9ddd8] sm:grid-cols-3"><div className="bg-[#fafcf9] p-4"><p className="text-xs text-[#778077]">识别技能</p><p className="mt-2 text-sm text-[#24372f]">{evidence.recognizedSkills.join("、") || "暂无"}</p></div><div className="bg-[#fafcf9] p-4"><p className="text-xs text-[#778077]">预测目标年</p><p className="mt-2 text-sm text-[#24372f]">{evidence.forecastYear} 年</p></div><div className="bg-[#fafcf9] p-4"><p className="text-xs text-[#778077]">直接观测组合</p><p className="mt-2 text-sm text-[#24372f]">{evidence.observedPairCount} 组</p></div></div><ReferencePreview preview={buildEvidencePreview(evidence)} /></div>;
}

function ReferencePreview({ preview }: { preview: EvidencePreview }) {
  return <div className="mt-4 border-t border-[#d7e5da] pt-3 text-xs leading-5 text-[#51695d]"><p className="font-medium text-[#2d5949]">本次已检索到的依据</p><p>技能：{preview.skills.join("、") || "暂无"}</p><p>职业：{preview.occupations.join("、") || "暂无"}</p><p>城市：{preview.cities.join("、") || "暂无"}</p><p className="mt-1 text-[#718277]">引用表：{preview.sources.join("、")}</p></div>;
}

function AuthForms({ email, otp, otpSent, error, onEmail, onOtp, onSend, onVerify }: { email: string; otp: string; otpSent: boolean; error: string; onEmail: (value: string) => void; onOtp: (value: string) => void; onSend: (event: FormEvent) => Promise<void>; onVerify: (event: FormEvent) => Promise<void> }) {
  return <div className="mt-5 border-t border-[#d9ddd8] pt-4"><p className="text-xs font-medium text-[#506059]">登录后保存会话</p><form onSubmit={(event) => void (otpSent ? onVerify(event) : onSend(event))} className="mt-2 space-y-2"><input value={email} onChange={(event) => onEmail(event.target.value)} type="email" required placeholder="邮箱地址" className="h-9 w-full border border-[#cbd2cb] bg-[#fbfcfa] px-2 text-xs outline-none focus:border-[#257565]" />{otpSent && <input value={otp} onChange={(event) => onOtp(event.target.value)} inputMode="numeric" required placeholder="邮箱验证码" className="h-9 w-full border border-[#cbd2cb] bg-[#fbfcfa] px-2 text-xs outline-none focus:border-[#257565]" />}<button className="h-9 w-full bg-[#263c33] text-xs text-white hover:bg-[#1c2d26]" type="submit">{otpSent ? "验证并登录" : "发送验证码"}</button></form>{error && <p className="mt-2 text-xs leading-5 text-[#9a482a]">{error}</p>}</div>;
}
