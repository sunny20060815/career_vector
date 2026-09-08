"use client";

import { FormEvent, useLayoutEffect, useRef, useState } from "react";
import { Check, MessageSquareWarning, Send } from "lucide-react";
import gsap from "gsap";

import { feedbackCategories, type FeedbackCategory } from "@/lib/feedback";

export function FeedbackPanel({ userIdentity }: { userIdentity: string | null }) {
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
    return <div ref={rootRef} className="mx-auto flex min-h-[calc(100vh-12rem)] max-w-3xl items-center justify-center py-10"><div className="feedback-unit w-full border-y border-[#255d86] py-10"><span className="grid h-12 w-12 place-items-center text-[#73c6ff]"><Check size={28} /></span><h1 className="mt-6 font-serif text-4xl text-white">反馈已发送</h1><p className="mt-3 text-sm leading-7 text-[#829db3]">感谢你的反馈，项目团队已收到该问题。</p><button onClick={() => setSent(false)} type="button" className="mt-7 border-b border-[#73c6ff] pb-1 text-sm text-[#73c6ff] transition hover:text-white">继续提交问题</button></div></div>;
  }

  return (
    <div ref={rootRef} className="mx-auto grid min-h-[calc(100vh-12rem)] max-w-6xl items-center gap-12 py-10 lg:grid-cols-[0.82fr_1.18fr] lg:gap-20 lg:py-14">
      <section className="feedback-unit">
        <p className="flex items-center gap-3 text-[10px] font-semibold tracking-[0.2em] text-[#73c6ff]"><span className="h-px w-10 bg-[#73c6ff]" />PRODUCT FEEDBACK</p>
        <h1 className="mt-5 font-serif text-4xl leading-tight text-white md:text-5xl">帮助我们把职向量做得更准确</h1>
        <p className="mt-4 text-sm leading-7 text-[#809bb1]">如果你发现数据、职业匹配或页面功能存在问题，或者对产品有新的想法，请在这里告诉我们。反馈将直接发送给项目团队。</p>
        <div className="mt-7 border-y border-[#6d4b43] py-4 text-xs leading-6 text-[#829db3]"><span className="mr-2 text-[#ee9870]">ACCOUNT</span>{userIdentity}<br />反馈将与该账号关联，便于后续核查。</div>
      </section>

      <form onSubmit={(event) => void submit(event)} className="feedback-unit signal-frame border-y border-[#255d86] py-6 md:px-7 md:py-8">
        <div className="flex items-center gap-3 border-b border-[#1a4a72] pb-5"><span className="grid h-9 w-9 place-items-center text-[#73c6ff]"><MessageSquareWarning size={19} /></span><div><p className="text-sm font-medium text-[#dbe3e9]">提交问题</p><p className="mt-1 text-[10px] tracking-[0.1em] text-[#537088]">DIRECT TO PROJECT TEAM</p></div></div>
        <label className="mt-5 block text-xs text-[#849eb4]" htmlFor="feedback-category">问题类型</label>
        <select id="feedback-category" value={category} onChange={(event) => setCategory(event.target.value as FeedbackCategory)} className="mt-2 h-12 w-full border-0 border-b border-[#285f88] bg-transparent px-1 text-sm text-[#d5dee6] outline-none focus:border-[#73c6ff]">
          {Object.entries(feedbackCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <label className="mt-5 block text-xs text-[#849eb4]" htmlFor="feedback-message">问题描述</label>
        <textarea id="feedback-message" value={message} onChange={(event) => setMessage(event.target.value)} required minLength={10} maxLength={3000} rows={8} placeholder="请描述你遇到的问题、操作步骤或希望增加的功能……" className="mt-2 block w-full resize-y border-0 border-b border-[#285f88] bg-transparent px-1 py-3 text-sm leading-6 text-[#e1e8ed] outline-none placeholder:text-[#486175] focus:border-[#73c6ff]" />
        <div className="mt-2 flex justify-between text-[10px] text-[#4c677d]"><span>至少10个字</span><span>{message.length}/3000</span></div>
        {error && <p className="mt-4 border-l-2 border-[#df7957] bg-[#241512] px-3 py-2 text-xs leading-5 text-[#efaa90]">{error}</p>}
        <button disabled={submitting || message.trim().length < 10} type="submit" className="mt-6 flex h-12 w-full items-center justify-center gap-2 bg-[#73c6ff] text-sm font-semibold text-[#071a2a] transition hover:bg-[#9ad7ff] disabled:cursor-not-allowed disabled:bg-[#1c4567] disabled:text-[#526e85]"><Send size={15} />{submitting ? "正在发送…" : "发送反馈"}</button>
      </form>
    </div>
  );
}
