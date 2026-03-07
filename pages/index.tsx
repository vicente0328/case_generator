import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import { useAuth } from "@/lib/contexts/AuthContext";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore";
import type { CaseData } from "./api/case-lookup";
import { ArrowPathIcon, SparklesIcon, CheckCircleIcon } from "@heroicons/react/24/outline";

type Step = "input" | "preview" | "generating" | "done";

interface Comment {
  id: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: { seconds: number } | null;
}

interface ContentSection {
  type: "facts" | "question" | "answer" | "precedent" | "other";
  heading: string;
  body: string;
}

const SUGGESTED = ["2016다271226", "2019다272855", "2021다264253", "2020다209815"];

function formatDate(d: string): string {
  const s = String(d).replace(/\D/g, "");
  if (s.length === 8) return `${s.slice(0, 4)}. ${s.slice(4, 6)}. ${s.slice(6, 8)}.`;
  return d;
}

function parseContent(text: string): ContentSection[] {
  const sections: ContentSection[] = [];
  const lines = text.split("\n");
  let current: ContentSection | null = null;

  const flush = () => {
    if (current && (current.body.trim() || current.heading)) {
      current.body = current.body.trim();
      sections.push(current);
    }
  };

  for (const line of lines) {
    const t = line.trim();
    if (/^<사실관계>$|^\[사실관계\]$/.test(t)) {
      flush(); current = { type: "facts", heading: "사실관계", body: "" };
    } else if (/^<문\s*\d*>|^<문제>/.test(t)) {
      flush(); current = { type: "question", heading: t.replace(/^<|>$/g, "").trim(), body: "" };
    } else if (/^\[문\s*\d+\]\s*\(\d+점\)/.test(t) && current?.type !== "answer") {
      flush(); current = { type: "question", heading: t.replace(/\*\*/g, ""), body: "" };
    } else if (/^\[해설 및 모범답안\]|^\[해설\]/.test(t)) {
      flush(); current = { type: "answer", heading: "해설 및 모범답안", body: "" };
    } else if (/^\[모델\s*판례/.test(t)) {
      flush(); current = { type: "precedent", heading: "모델 판례", body: "" };
    } else if (current) {
      current.body += (current.body ? "\n" : "") + line;
    } else {
      flush(); current = { type: "other", heading: "", body: line };
    }
  }
  flush();
  return sections.filter((s) => s.body.trim().length > 0 || s.heading.trim().length > 0);
}

/* ─── Sub-components ─── */

function CaseInfoCard({ data, onReset }: { data: CaseData; onReset: () => void }) {
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#34C759] inline-block" />
            <span className="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-widest">판례 확인</span>
          </div>
          <p className="text-[22px] font-bold text-[#1C1C1E] font-mono tracking-tight leading-none">{data.caseNumber}</p>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {data.court && <span className="text-[13px] text-[#8E8E93]">{data.court}</span>}
            {data.date && <><span className="text-[#D1D1D6]">·</span><span className="text-[13px] text-[#8E8E93]">{formatDate(data.date)}</span></>}
            {data.caseName && <><span className="text-[#D1D1D6]">·</span><span className="text-[13px] text-[#8E8E93] truncate max-w-[200px]">{data.caseName}</span></>}
          </div>
        </div>
        <button
          onClick={onReset}
          className="flex-shrink-0 text-[13px] text-[#8E8E93] hover:text-[#1C1C1E] transition-colors px-3 py-1.5 rounded-full hover:bg-[#F2F2F7] mt-1"
        >
          다시 입력
        </button>
      </div>

      <div>
        <p className="text-[11px] font-semibold text-[#007AFF] uppercase tracking-widest mb-2">판시사항</p>
        {data.rulingPoints ? (
          <div className="bg-[#F0F7FF] rounded-[14px] px-4 py-3.5">
            <p className="text-[14px] text-[#1C1C1E] leading-[1.75] whitespace-pre-line">{data.rulingPoints}</p>
          </div>
        ) : (
          <p className="text-[13px] text-[#C7C7CC]">정보 없음</p>
        )}
      </div>

      <div>
        <p className="text-[11px] font-semibold text-[#9A6D1F] uppercase tracking-widest mb-2">판결요지</p>
        {data.rulingRatio ? (
          <div className="bg-[#FFFBF0] rounded-[14px] px-4 py-3.5">
            <p className="text-[14px] text-[#1C1C1E] leading-[1.75] whitespace-pre-line">{data.rulingRatio}</p>
          </div>
        ) : (
          <p className="text-[13px] text-[#C7C7CC]">정보 없음</p>
        )}
      </div>
    </div>
  );
}

function GeneratedContent({ content }: { content: string }) {
  const sections = parseContent(content);
  return (
    <div className="space-y-3">
      {sections.map((s, i) => {
        if (s.type === "facts") return (
          <div key={i} className="rounded-[16px] overflow-hidden border border-[#F0D080]/50 bg-[#FFFDF5]">
            <div className="px-5 py-2.5 border-b border-[#F0D080]/30">
              <span className="text-[11px] font-bold text-[#9A6D1F] uppercase tracking-widest">사실관계</span>
            </div>
            <p className="px-5 py-4 text-[15px] text-[#1C1C1E] leading-[1.85] whitespace-pre-line">{s.body}</p>
          </div>
        );
        if (s.type === "question") return (
          <div key={i} className="rounded-[16px] overflow-hidden border border-[#007AFF]/10 bg-[#F5FAFF]">
            <div className="px-5 py-2.5 border-b border-[#007AFF]/10">
              <span className="text-[11px] font-bold text-[#007AFF] uppercase tracking-widest">{s.heading}</span>
            </div>
            <p className="px-5 py-4 text-[15px] text-[#1C1C1E] leading-[1.85] whitespace-pre-line font-medium">{s.body}</p>
          </div>
        );
        if (s.type === "answer") return (
          <div key={i} className="rounded-[16px] overflow-hidden border border-[#E5E5EA] bg-white">
            <div className="px-5 py-2.5 border-b border-[#F2F2F7] bg-[#F9F9FB]">
              <span className="text-[11px] font-bold text-[#636366] uppercase tracking-widest">해설 및 모범답안</span>
            </div>
            <p className="px-5 py-4 text-[15px] text-[#1C1C1E] leading-[1.85] whitespace-pre-line">{s.body}</p>
          </div>
        );
        if (s.type === "precedent") return (
          <div key={i} className="rounded-[16px] overflow-hidden border border-[#E5E5EA] bg-[#F9F9FB]">
            <div className="px-5 py-2.5 border-b border-[#E5E5EA]">
              <span className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-widest">모델 판례</span>
            </div>
            <p className="px-5 py-4 text-[14px] text-[#3A3A3C] leading-[1.85] whitespace-pre-line">{s.body}</p>
          </div>
        );
        return s.body.trim() ? (
          <div key={i} className="px-1">
            {s.heading && <p className="text-[13px] font-semibold text-[#1C1C1E] mb-1">{s.heading}</p>}
            <p className="text-[15px] text-[#3A3A3C] leading-[1.85] whitespace-pre-line">{s.body}</p>
          </div>
        ) : null;
      })}
    </div>
  );
}

function CommentsSection({ postId }: { postId: string }) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "posts", postId, "comments"), orderBy("createdAt", "asc"));
    getDocs(q)
      .then((snap) => {
        setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Comment)));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [postId]);

  const submit = async () => {
    if (!text.trim() || !user || submitting) return;
    setSubmitting(true);
    try {
      const name = user.displayName || user.email?.split("@")[0] || "익명";
      const ref = await addDoc(collection(db, "posts", postId, "comments"), {
        userId: user.uid,
        userName: name,
        text: text.trim(),
        createdAt: serverTimestamp(),
      });
      setComments((p) => [...p, { id: ref.id, userId: user.uid, userName: name, text: text.trim(), createdAt: null }]);
      setText("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pt-6 mt-6 border-t border-[#F2F2F7]">
      <p className="text-[13px] font-semibold text-[#8E8E93] mb-4">
        댓글{comments.length > 0 ? ` ${comments.length}` : ""}
      </p>

      {loading ? (
        <div className="h-6 flex items-center mb-4">
          <ArrowPathIcon className="w-4 h-4 text-[#C7C7CC] animate-spin" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-[13px] text-[#C7C7CC] mb-4">첫 댓글을 남겨보세요.</p>
      ) : (
        <div className="space-y-4 mb-5">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-[#E5E5EA] flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-[11px] font-semibold text-[#8E8E93]">
                  {c.userName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-[12px] font-semibold text-[#636366] mb-0.5">{c.userName}</p>
                <p className="text-[14px] text-[#1C1C1E] leading-snug">{c.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {user ? (
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && submit()}
            placeholder="댓글 남기기…"
            className="flex-1 bg-[#F2F2F7] rounded-full px-4 py-2.5 text-[14px] text-[#1C1C1E] placeholder-[#C7C7CC] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:bg-white transition-all"
          />
          <button
            onClick={submit}
            disabled={!text.trim() || submitting}
            className="text-[14px] font-semibold text-[#007AFF] disabled:text-[#C7C7CC] px-3 transition-colors active:opacity-60"
          >
            등록
          </button>
        </div>
      ) : (
        <p className="text-[13px] text-[#C7C7CC]">댓글을 남기려면 로그인하세요.</p>
      )}
    </div>
  );
}

/* ─── Main Page ─── */

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<Step>("input");
  const [caseNumberInput, setCaseNumberInput] = useState("");
  const [caseData, setCaseData] = useState<CaseData | null>(null);
  const [generatedText, setGeneratedText] = useState("");
  const [loadingCase, setLoadingCase] = useState(false);
  const [loadingGen, setLoadingGen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [postId, setPostId] = useState<string | null>(null);

  useEffect(() => {
    if (router.isReady && typeof router.query.case === "string") {
      setCaseNumberInput(router.query.case);
    }
  }, [router.isReady, router.query.case]);

  const handleLookup = async () => {
    const num = caseNumberInput.trim();
    if (!num) return;
    setError("");
    setLoadingCase(true);
    try {
      const res = await fetch(`/api/case-lookup?caseNumber=${encodeURIComponent(num)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "판례 조회 실패");
      setCaseData(data);
      setStep("preview");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "조회 중 오류가 발생했습니다.");
    } finally {
      setLoadingCase(false);
    }
  };

  const handleGenerate = async () => {
    if (!caseData) return;
    setError("");
    setLoadingGen(true);
    setStep("generating");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseData }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "문제 생성 실패");
      setGeneratedText(data.result);
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "문제 생성 중 오류가 발생했습니다.");
      setStep("preview");
    } finally {
      setLoadingGen(false);
    }
  };

  const handleSave = async () => {
    if (!user) { setError("로그인이 필요한 기능입니다."); return; }
    if (!caseData || !generatedText) return;
    setSaving(true);
    try {
      const ref = await addDoc(collection(db, "posts"), {
        userId: user.uid,
        userName: user.displayName || user.email?.split("@")[0] || "익명",
        caseNumber: caseData.caseNumber,
        caseName: caseData.caseName,
        court: caseData.court,
        date: caseData.date,
        rulingPoints: caseData.rulingPoints,
        rulingRatio: caseData.rulingRatio,
        content: generatedText,
        likes: 0,
        needsReview: 0,
        createdAt: serverTimestamp(),
      });
      setPostId(ref.id);
      setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setStep("input");
    setCaseData(null);
    setGeneratedText("");
    setError("");
    setSaved(false);
    setPostId(null);
    setCaseNumberInput("");
  };

  return (
    <Layout title="Case Generator">
      <div className="max-w-2xl mx-auto">

        {/* Hero */}
        <div className="pt-10 pb-7 text-center">
          <h1 className="text-[26px] font-bold text-[#1C1C1E] tracking-tight mb-1.5">
            Case Generator
          </h1>
          <p className="text-[15px] text-[#8E8E93]">
            사건번호로 변시 사례형 문제를 생성합니다.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-[14px] bg-[#FF3B30]/8 border border-[#FF3B30]/15 px-4 py-3 text-[13px] text-[#FF3B30]">
            {error}
          </div>
        )}

        {/* Main Card */}
        <div className="card">

          {/* Input */}
          {step === "input" && (
            <div className="p-6 sm:p-8">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={caseNumberInput}
                  onChange={(e) => setCaseNumberInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                  placeholder="사건번호  예) 2016다271226"
                  className="input-field h-[52px]"
                  disabled={loadingCase}
                  autoFocus
                />
                <button
                  onClick={handleLookup}
                  disabled={!caseNumberInput.trim() || loadingCase}
                  className="px-5 h-[52px] rounded-[12px] bg-[#007AFF] text-white font-semibold text-[15px] disabled:opacity-40 transition-all active:scale-95 hover:bg-[#0062cc] flex items-center gap-2 flex-shrink-0 min-w-[72px] justify-center"
                >
                  {loadingCase
                    ? <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    : "조회"}
                </button>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {SUGGESTED.map((num) => (
                  <button
                    key={num}
                    onClick={() => setCaseNumberInput(num)}
                    className="text-[12px] px-3 py-1.5 bg-[#F2F2F7] rounded-full text-[#8E8E93] hover:bg-[#E5E5EA] hover:text-[#636366] transition-colors font-mono"
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Preview */}
          {step === "preview" && caseData && (
            <div className="p-6 sm:p-8">
              <CaseInfoCard data={caseData} onReset={handleReset} />
              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleGenerate}
                  className="px-6 py-3 rounded-full bg-[#007AFF] text-white font-semibold text-[15px] hover:bg-[#0062cc] transition-all active:scale-95 flex items-center gap-2"
                >
                  <SparklesIcon className="w-4 h-4" />
                  문제 생성하기
                </button>
              </div>
            </div>
          )}

          {/* Generating */}
          {step === "generating" && (
            <div className="p-12 flex flex-col items-center justify-center text-center min-h-[240px]">
              <div className="w-14 h-14 rounded-full bg-[#007AFF]/8 flex items-center justify-center mb-5">
                <ArrowPathIcon className="w-6 h-6 text-[#007AFF] animate-spin" />
              </div>
              <p className="text-[17px] font-semibold text-[#1C1C1E] mb-1">문제를 만들고 있어요</p>
              <p className="text-[14px] text-[#8E8E93]">잠시만 기다려 주세요</p>
            </div>
          )}

          {/* Done */}
          {step === "done" && generatedText && (
            <div className="p-6 sm:p-8">
              <GeneratedContent content={generatedText} />

              <div className="mt-6 pt-5 border-t border-[#F2F2F7] flex items-center justify-between gap-3">
                <button
                  onClick={handleReset}
                  className="text-[14px] text-[#8E8E93] hover:text-[#1C1C1E] transition-colors"
                >
                  새 문제
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleGenerate}
                    className="px-4 py-2 rounded-full bg-[#F2F2F7] text-[#636366] font-medium text-[14px] hover:bg-[#E5E5EA] transition-all active:scale-95 flex items-center gap-1.5"
                  >
                    <ArrowPathIcon className="w-3.5 h-3.5" />
                    다시 생성
                  </button>
                  {saved ? (
                    <div className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#34C759]/10 text-[#34C759] text-[14px] font-semibold">
                      <CheckCircleIcon className="w-4 h-4" />
                      공유됨
                    </div>
                  ) : (
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-4 py-2 rounded-full bg-[#1C1C1E] text-white font-semibold text-[14px] hover:bg-[#3A3A3C] transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {saving ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : "공유하기"}
                    </button>
                  )}
                </div>
              </div>

              {saved && postId && <CommentsSection postId={postId} />}
            </div>
          )}
        </div>

        <div className="h-16" />
      </div>
    </Layout>
  );
}
