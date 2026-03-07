import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import { useAuth } from "@/lib/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy } from "firebase/firestore";
import type { CaseData } from "./api/case-lookup";

type Step = "input" | "preview" | "generating" | "streaming" | "done";

interface Comment {
  id: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: { seconds: number } | null;
}

interface Section {
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

// AI 응답에서 불필요한 메타 문자열 제거
function cleanAiText(text: string): string {
  return text
    .replace(/^(출력 형식 준수|출력 형식|형식 준수|참고|주의사항|주의)[^\n]*/gim, "")
    .replace(/^#+\s*(출력 형식|세부 작성 규칙|작성 규칙)[^\n]*/gim, "")
    .replace(/^\*\*?(출력 형식|세부 작성|참고|주의)[^*\n]*/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseContent(text: string): Section[] {
  const cleaned = cleanAiText(text);
  const sections: Section[] = [];
  const lines = cleaned.split("\n");
  let cur: Section | null = null;

  const flush = () => {
    if (cur && (cur.body.trim() || cur.heading)) {
      cur.body = cur.body.trim();
      sections.push(cur);
    }
  };

  for (const line of lines) {
    const t = line.trim();
    if (/^<사실관계>$|^\[사실관계\]$/.test(t)) {
      flush(); cur = { type: "facts", heading: "사실관계", body: "" };
    } else if (/^<문\s*\d*>|^<문제>/.test(t)) {
      flush(); cur = { type: "question", heading: t.replace(/^<|>$/g, "").trim(), body: "" };
    } else if (/^\[문\s*\d+\]\s*\(\d+점\)/.test(t) && cur?.type !== "answer") {
      flush(); cur = { type: "question", heading: t.replace(/\*\*/g, ""), body: "" };
    } else if (/^\[해설 및 모범답안\]|^\[해설\]/.test(t)) {
      flush(); cur = { type: "answer", heading: "해설 및 모범답안", body: "" };
    } else if (/^\[모델\s*판례/.test(t)) {
      flush(); cur = { type: "precedent", heading: "모델 판례", body: "" };
    } else if (cur) {
      cur.body += (cur.body ? "\n" : "") + line;
    } else {
      flush(); cur = { type: "other", heading: "", body: line };
    }
  }
  flush();
  return sections.filter(s => s.body.trim() || s.heading);
}

/* ── 판례 확인 카드 ── */
function CaseCard({ data, onReset }: { data: CaseData; onReset: () => void }) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      {/* 헤더 */}
      <div className="px-6 py-5 border-b border-zinc-100 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">판례 확인</span>
          </div>
          <p className="text-[21px] font-bold tracking-tight font-mono text-zinc-900">{data.caseNumber}</p>
          <p className="text-[13px] text-zinc-400 mt-1.5">
            {[data.court, data.date && formatDate(data.date), data.caseName].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button
          onClick={onReset}
          className="flex-shrink-0 text-[13px] text-zinc-400 hover:text-zinc-700 transition-colors mt-1 px-2 py-1 rounded-lg hover:bg-zinc-50"
        >
          ← 다시 입력
        </button>
      </div>

      {/* 판시사항 */}
      <div className="px-6 py-6 border-b border-zinc-100">
        <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mb-4">판시사항</p>
        {data.rulingPoints
          ? <p className="text-[14px] text-zinc-700 leading-[1.85] whitespace-pre-line">{data.rulingPoints}</p>
          : <p className="text-[13px] text-zinc-300 italic">정보 없음</p>
        }
      </div>

      {/* 판결요지 */}
      <div className="px-6 py-6">
        <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mb-4">판결요지</p>
        {data.rulingRatio
          ? <p className="text-[14px] text-zinc-700 leading-[1.85] whitespace-pre-line">{data.rulingRatio}</p>
          : <p className="text-[13px] text-zinc-300 italic">정보 없음</p>
        }
      </div>
    </div>
  );
}

/* ── 생성된 콘텐츠 ── */
function GeneratedContent({ content }: { content: string }) {
  const sections = parseContent(content);
  return (
    <div className="space-y-4">
      {sections.map((s, i) => {
        if (s.type === "facts") return (
          <div key={i} className="bg-white rounded-xl border border-zinc-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-amber-100 bg-amber-50/60 flex items-center gap-3">
              <div className="w-[3px] h-5 rounded-full bg-amber-400 flex-shrink-0" />
              <span className="text-[11px] font-bold text-amber-600 uppercase tracking-widest">사실관계</span>
            </div>
            <div className="px-6 py-6">
              <p className="text-[15px] text-zinc-800 leading-[1.9] whitespace-pre-line">{s.body}</p>
            </div>
          </div>
        );
        if (s.type === "question") return (
          <div key={i} className="bg-white rounded-xl border border-zinc-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-blue-100 bg-blue-50/60 flex items-center gap-3">
              <div className="w-[3px] h-5 rounded-full bg-blue-400 flex-shrink-0" />
              <span className="text-[11px] font-bold text-blue-600 uppercase tracking-widest">{s.heading}</span>
            </div>
            <div className="px-6 py-6">
              <p className="text-[15px] text-zinc-800 leading-[1.9] whitespace-pre-line font-medium">{s.body}</p>
            </div>
          </div>
        );
        if (s.type === "answer") return (
          <div key={i} className="bg-white rounded-xl border border-zinc-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-100 bg-zinc-50 flex items-center gap-3">
              <div className="w-[3px] h-5 rounded-full bg-zinc-300 flex-shrink-0" />
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">해설 및 모범답안</span>
            </div>
            <div className="px-6 py-6">
              <p className="text-[15px] text-zinc-700 leading-[1.9] whitespace-pre-line">{s.body}</p>
            </div>
          </div>
        );
        if (s.type === "precedent") return (
          <div key={i} className="rounded-xl border border-zinc-100 bg-zinc-50/80 overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center gap-3">
              <div className="w-[3px] h-5 rounded-full bg-zinc-300 flex-shrink-0" />
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">모델 판례</span>
            </div>
            <div className="px-6 py-6">
              <p className="text-[14px] text-zinc-500 leading-[1.9] whitespace-pre-line">{s.body}</p>
            </div>
          </div>
        );
        return s.body.trim() ? (
          <div key={i} className="px-1">
            {s.heading && <p className="text-[12px] font-semibold text-zinc-500 mb-1">{s.heading}</p>}
            <p className="text-[15px] text-zinc-700 leading-[1.9] whitespace-pre-line">{s.body}</p>
          </div>
        ) : null;
      })}
    </div>
  );
}

/* ── 댓글 ── */
function Comments({ postId }: { postId: string }) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getDocs(query(collection(db, "posts", postId, "comments"), orderBy("createdAt", "asc")))
      .then(snap => {
        setComments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Comment)));
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
        userId: user.uid, userName: name, text: text.trim(), createdAt: serverTimestamp(),
      });
      setComments(p => [...p, { id: ref.id, userId: user.uid, userName: name, text: text.trim(), createdAt: null }]);
      setText("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-8 pt-7 border-t border-zinc-100">
      <p className="text-[13px] font-semibold text-zinc-900 mb-5">
        댓글{comments.length > 0 ? ` ${comments.length}` : ""}
      </p>

      {!loading && comments.length > 0 && (
        <div className="space-y-5 mb-6">
          {comments.map(c => (
            <div key={c.id} className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center flex-shrink-0 text-[11px] font-semibold text-zinc-500">
                {c.userName.charAt(0).toUpperCase()}
              </div>
              <div className="pt-0.5">
                <span className="text-[12px] font-medium text-zinc-500">{c.userName}</span>
                <p className="text-[14px] text-zinc-700 leading-snug mt-0.5">{c.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && comments.length === 0 && (
        <p className="text-[13px] text-zinc-300 mb-5">첫 댓글을 남겨보세요.</p>
      )}

      {user ? (
        <div className="flex gap-2">
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && submit()}
            placeholder="댓글 남기기…"
            className="flex-1 h-9 bg-zinc-50 border border-zinc-200 rounded-lg px-3 text-[14px] text-zinc-900 placeholder-zinc-300 focus:outline-none focus:border-zinc-400 transition-colors"
          />
          <button
            onClick={submit}
            disabled={!text.trim() || submitting}
            className="text-[13px] font-medium text-zinc-400 hover:text-zinc-700 disabled:text-zinc-200 px-2 transition-colors"
          >
            등록
          </button>
        </div>
      ) : (
        <p className="text-[13px] text-zinc-400">댓글을 남기려면 로그인하세요.</p>
      )}
    </div>
  );
}

/* ── 메인 페이지 ── */
export default function Home() {
  const { user } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<Step>("input");
  const [input, setInput] = useState("");
  const [caseData, setCaseData] = useState<CaseData | null>(null);
  const [generated, setGenerated] = useState("");
  const [loadingCase, setLoadingCase] = useState(false);
  const [loadingGen, setLoadingGen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [postId, setPostId] = useState<string | null>(null);

  useEffect(() => {
    if (router.isReady && typeof router.query.case === "string") setInput(router.query.case);
  }, [router.isReady, router.query.case]);

  const lookup = async () => {
    const num = input.trim();
    if (!num) return;
    setError(""); setLoadingCase(true);
    try {
      const res = await fetch(`/api/case-lookup?caseNumber=${encodeURIComponent(num)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "판례 조회 실패");
      setCaseData(data); setStep("preview");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "조회 중 오류가 발생했습니다.");
    } finally {
      setLoadingCase(false);
    }
  };

  const generate = async () => {
    if (!caseData) return;
    setError(""); setLoadingGen(true); setStep("generating"); setGenerated("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseData }),
      });
      if (!res.body) throw new Error("스트림을 받을 수 없습니다.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      let started = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.error) throw new Error(payload.error);
            if (payload.done) { setStep("done"); return; }
            if (payload.text) {
              fullText += payload.text;
              setGenerated(fullText);
              if (!started) { setStep("streaming"); started = true; }
            }
          } catch (e) {
            if (e instanceof Error && e.message !== "Unexpected end of JSON input") throw e;
          }
        }
      }
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "문제 생성 중 오류가 발생했습니다.");
      setStep("preview");
    } finally {
      setLoadingGen(false);
    }
  };

  const save = async () => {
    if (!user) { setError("로그인이 필요한 기능입니다."); return; }
    if (!caseData || !generated) return;
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
        content: generated,
        likes: 0, needsReview: 0,
        createdAt: serverTimestamp(),
      });
      setPostId(ref.id); setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setStep("input"); setCaseData(null); setGenerated(""); setError("");
    setSaved(false); setPostId(null); setInput("");
  };

  return (
    <Layout title="Case Generator">
      <div className="max-w-[800px] mx-auto px-6">

        {/* 헤더 텍스트 */}
        <div className="pt-12 pb-8 text-center">
          <h1 className="text-[26px] font-bold tracking-tight text-zinc-900 mb-1.5">Case Generator</h1>
          <p className="text-[14px] text-zinc-400">사건번호로 변시 사례형 문제를 생성합니다</p>
        </div>

        {/* 에러 */}
        {error && (
          <div className="mb-5 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-[13px] text-red-500">
            {error}
          </div>
        )}

        {/* ── 입력 ── */}
        {step === "input" && (
          <div>
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && lookup()}
                placeholder="사건번호 입력  예) 2016다271226"
                className="flex-1 h-[52px] bg-white border border-zinc-200 rounded-xl px-4 text-[15px] text-zinc-900 placeholder-zinc-300 focus:outline-none focus:border-zinc-400 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-colors"
                disabled={loadingCase}
                autoFocus
              />
              <button
                onClick={lookup}
                disabled={!input.trim() || loadingCase}
                className="h-[52px] px-5 bg-zinc-900 text-white rounded-xl text-[14px] font-semibold hover:bg-zinc-700 transition-colors disabled:opacity-40 flex-shrink-0 min-w-[72px] flex items-center justify-center gap-2"
              >
                {loadingCase
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : "조회"}
              </button>
            </div>

            <div className="mt-4 flex items-center gap-4">
              <span className="text-[11px] font-semibold text-zinc-300 uppercase tracking-widest">추천</span>
              <div className="flex gap-3 flex-wrap">
                {SUGGESTED.map(n => (
                  <button
                    key={n}
                    onClick={() => setInput(n)}
                    className="text-[12px] font-mono text-zinc-400 hover:text-zinc-700 transition-colors"
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── 판례 확인 ── */}
        {step === "preview" && caseData && (
          <div>
            <CaseCard data={caseData} onReset={reset} />
            <div className="mt-4 flex justify-end">
              <button
                onClick={generate}
                className="h-10 px-5 bg-zinc-900 text-white rounded-xl text-[14px] font-semibold hover:bg-zinc-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                문제 생성하기
              </button>
            </div>
          </div>
        )}

        {/* ── 생성 중 (첫 응답 전) ── */}
        {step === "generating" && (
          <div className="py-20 flex flex-col items-center justify-center text-center">
            <div className="w-8 h-8 border-2 border-zinc-200 border-t-zinc-700 rounded-full animate-spin mb-6" />
            <p className="text-[16px] font-semibold text-zinc-900 mb-1">문제를 만들고 있어요</p>
            <p className="text-[13px] text-zinc-400">판례를 분석하고 있습니다. 잠시만 기다려 주세요.</p>
          </div>
        )}

        {/* ── 스트리밍 중 (실시간 표시) ── */}
        {step === "streaming" && generated && (
          <div>
            <GeneratedContent content={generated} />
            <div className="mt-6 flex items-center gap-2 text-[12px] text-zinc-300">
              <span className="flex gap-0.5">
                <span className="w-1 h-1 rounded-full bg-zinc-300 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1 h-1 rounded-full bg-zinc-300 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1 h-1 rounded-full bg-zinc-300 animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
              생성 중…
            </div>
          </div>
        )}

        {/* ── 완료 ── */}
        {step === "done" && generated && (
          <div>
            <GeneratedContent content={generated} />

            {/* 액션 바 */}
            <div className="mt-8 pt-6 border-t border-zinc-100 flex items-center justify-between">
              <button
                onClick={reset}
                className="text-[13px] text-zinc-400 hover:text-zinc-700 transition-colors"
              >
                ← 새 문제
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={generate}
                  className="h-8 px-3.5 text-[13px] text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  다시 생성
                </button>
                <div className="w-px h-4 bg-zinc-200" />
                {saved ? (
                  <div className="flex items-center gap-1.5 text-[13px] font-medium text-emerald-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    공유됨
                  </div>
                ) : (
                  <button
                    onClick={save}
                    disabled={saving}
                    className="h-8 px-3.5 bg-zinc-900 text-white text-[13px] font-medium rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {saving
                      ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : "공유하기"}
                  </button>
                )}
              </div>
            </div>

            {saved && postId && <Comments postId={postId} />}
          </div>
        )}

        <div className="h-20" />
      </div>
    </Layout>
  );
}
