"use client";

import { FormEvent, useLayoutEffect, useRef, useState } from "react";
import { Check, MessageSquareWarning, Send } from "lucide-react";
import gsap from "gsap";

import { feedbackCategories, type FeedbackCategory } from "@/lib/feedback";

export function FeedbackPanel({ userEmail }: { userEmail: string | null }) {
  const [category, setCategory] = useState<FeedbackCategory>("suggestion");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!rootRef.current) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(rootRef.current!.querySelectorAll(".feedback-unit"), { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.07, ease: "power2.out" });
    });
    return () => mm.revert();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, message })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "反馈提交失败");
      setSent(true);
      setMessage("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "反馈提交失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return <div ref={rootRef} className="mx-auto flex min-h-[calc(100vh-12rem)] max-w-3xl items-center justify-center py-10"><div className="feedback-unit w-full border border-[#58758f] bg-[#29394b] p-7 md:p-10"><span className="grid h-12 w-12 place-items-center border border-[#61b0ed] bg-[#244866] text-[#78c6f3]"><Check size={24} /></span><h1 className="mt-6 font-serif text-3xl text-white">反馈已发送</h1><p className="mt-3 text-sm leading-7 text-[#b0becb]">感谢你的反馈。我们会通过登录邮箱 <span className="text-[#dfe6ed]">{userEmail}</span> 与你联系。</p><button onClick={() => setSent(false)} type="button" className="mt-7 text-sm text-[#72c0f1] transition hover:text-[#99d4fa]">继续提交问题</button></div></div>;
  }

  return (
    <div ref={rootRef} className="mx-auto grid min-h-[calc(100vh-12rem)] max-w-5xl items-center gap-10 py-8 lg:grid-cols-[0.8fr_1.2fr] lg:py-12">
      <section className="feedback-unit">
        <p className="text-xs font-semibold tracking-[0.2em] text-[#66b8f0]">PRODUCT FEEDBACK</p>
        <h1 className="mt-4 font-serif text-3xl leading-tight text-white md:text-4xl">帮助我们把职向量做得更准确</h1>
        <p className="mt-4 text-sm leading-7 text-[#aebcca]">如果你发现数据、职业匹配或页面功能存在问题，或者对产品有新的想法，请在这里告诉我们。反馈将直接发送给项目团队。</p>
        <div className="mt-6 border-l-2 border-[#d98560] bg-[#2b394a] px-4 py-3 text-xs leading-6 text-[#b2bfcc]">当前登录邮箱：<span className="text-[#e1e7ee]">{userEmail}</span><br />我们可能通过该邮箱与你确认问题细节。</div>
      </section>

      <form onSubmit={(event) => void submit(event)} className="feedback-unit border border-[#526b83] bg-[#263647] p-5 md:p-7">
        <div className="flex items-center gap-3 border-b border-[#465e75] pb-4"><span className="grid h-9 w-9 place-items-center border border-[#6687a3] text-[#6abaf0]"><MessageSquareWarning size={17} /></span><div><p className="text-sm font-medium text-[#e8edf3]">提交问题</p><p className="mt-1 text-[10px] tracking-[0.1em] text-[#8196aa]">DIRECT TO PROJECT TEAM</p></div></div>
        <label className="mt-5 block text-xs text-[#b3c0cd]" htmlFor="feedback-category">问题类型</label>
        <select id="feedback-category" value={category} onChange={(event) => setCategory(event.target.value as FeedbackCategory)} className="mt-2 h-11 w-full border border-[#58748e] bg-[#2a3b4e] px-3 text-sm text-[#e4eaf0] outline-none focus:border-[#63b2ed]">
          {Object.entries(feedbackCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <label className="mt-5 block text-xs text-[#b3c0cd]" htmlFor="feedback-message">问题描述</label>
        <textarea id="feedback-message" value={message} onChange={(event) => setMessage(event.target.value)} required minLength={10} maxLength={3000} rows={8} placeholder="请描述你遇到的问题、操作步骤或希望增加的功能……" className="mt-2 block w-full resize-y border border-[#58748e] bg-[#2a3b4e] px-3 py-3 text-sm leading-6 text-[#e9eef4] outline-none placeholder:text-[#71869b] focus:border-[#63b2ed]" />
        <div className="mt-2 flex justify-between text-[10px] text-[#7b90a5]"><span>至少10个字</span><span>{message.length}/3000</span></div>
        {error && <p className="mt-4 border-l-2 border-[#df7957] bg-[#432d32] px-3 py-2 text-xs leading-5 text-[#efaa90]">{error}</p>}
        <button disabled={submitting || message.trim().length < 10} type="submit" className="mt-5 flex h-11 w-full items-center justify-center gap-2 bg-[#58a6e7] text-sm font-semibold text-[#172433] transition hover:bg-[#75c3f3] disabled:cursor-not-allowed disabled:bg-[#4e6479] disabled:text-[#7e94a8]"><Send size={15} />{submitting ? "正在发送…" : "发送反馈"}</button>
      </form>
    </div>
  );
}
