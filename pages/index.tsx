import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import { useAuth } from "@/lib/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, updateDoc, doc, increment, limit, getDoc, where } from "firebase/firestore";
import type { CaseData } from "./api/case-lookup";

type Step = "input" | "preview" | "generating" | "done";

interface Comment {
  id: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: { seconds: number } | null;
  deleted?: boolean;
}

interface PostPreview {
  id: string;
  userId?: string | null;
  caseNumber: string;
  caseName: string;
  court: string;
  date: string;
  likes: number;
  needsReview: number;
  userName: string;
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
  const [error, setError] = useState("");

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
    setError("");
    try {
      const name = user.displayName || user.email?.split("@")[0] || "익명";
      const ref = await addDoc(collection(db, "posts", postId, "comments"), {
        userId: user.uid, userName: name, text: text.trim(), createdAt: serverTimestamp(), deleted: false,
      });
      setComments(p => [...p, { id: ref.id, userId: user.uid, userName: name, text: text.trim(), createdAt: null, deleted: false }]);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "댓글 등록에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteComment = async (c: Comment) => {
    if (!user || user.uid !== c.userId) return;
    try {
      await updateDoc(doc(db, "posts", postId, "comments", c.id), { deleted: true, text: "" });
      setComments(p => p.map(x => x.id === c.id ? { ...x, deleted: true, text: "" } : x));
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    }
  };

  const visibleCount = comments.filter(c => !c.deleted).length;

  return (
    <div className="mt-8 pt-7 border-t border-zinc-100">
      <p className="text-[13px] font-semibold text-zinc-900 mb-5">
        댓글{visibleCount > 0 ? ` ${visibleCount}` : ""}
      </p>

      {!loading && comments.length > 0 && (
        <div className="space-y-5 mb-6">
          {comments.map(c => (
            <div key={c.id} className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center flex-shrink-0 text-[11px] font-semibold text-zinc-500">
                {c.deleted ? "−" : c.userName.charAt(0).toUpperCase()}
              </div>
              <div className="pt-0.5 flex-1">
                {c.deleted ? (
                  <p className="text-[13px] text-zinc-300 italic">(삭제됨)</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-medium text-zinc-500">{c.userName}</span>
                      {user && user.uid === c.userId && (
                        <button
                          onClick={() => deleteComment(c)}
                          className="text-[11px] text-zinc-300 hover:text-red-400 transition-colors"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                    <p className="text-[14px] text-zinc-700 leading-snug mt-0.5">{c.text}</p>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && comments.length === 0 && (
        <p className="text-[13px] text-zinc-300 mb-5">첫 댓글을 남겨보세요.</p>
      )}

      {user ? (
        <div className="space-y-2">
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
              {submitting ? "등록 중…" : "등록"}
            </button>
          </div>
          {error && <p className="text-[12px] text-red-500">{error}</p>}
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
  const [, setLoadingGen] = useState(false);
  const [error, setError] = useState("");
  const [postId, setPostId] = useState<string | null>(null);
  const [voted, setVoted] = useState<"likes" | "needsReview" | null>(null);
  const [feedPosts, setFeedPosts] = useState<PostPreview[]>([]);
  const [existingPost, setExistingPost] = useState<PostPreview | null>(null);
  const [feedSearch, setFeedSearch] = useState("");
  const [feedFilter, setFeedFilter] = useState<"all" | "mine">("all");
  const [displayCount, setDisplayCount] = useState(10);
  const [feedLoading, setFeedLoading] = useState(true);
  const [checkedSteps, setCheckedSteps] = useState<boolean[]>([false, false, false, false, false]);

  const prefetchAbortRef = useRef<AbortController | null>(null);
  const autoSaveRef = useRef(false);
  const prefetchRef = useRef<{
    text: string;
    done: boolean;
    error: string | null;
    notify: (() => void) | null;
  } | null>(null);

  useEffect(() => {
    if (router.isReady && typeof router.query.case === "string") setInput(router.query.case);
  }, [router.isReady, router.query.case]);

  const PROGRESS_STEPS = ["판례 원문 분석", "핵심 법리 추출", "사실관계 구성", "문항 및 배점 설정", "해설 및 모범답안 작성"];
  const STEP_DELAYS = [1500, 4000, 8000, 13000];

  useEffect(() => {
    if (step !== "generating") {
      setCheckedSteps([false, false, false, false, false]);
      return;
    }
    const timers = STEP_DELAYS.map((delay, i) =>
      setTimeout(() => setCheckedSteps(prev => prev.map((v, j) => j <= i ? true : v)), delay)
    );
    return () => timers.forEach(clearTimeout);
  }, [step]);

  useEffect(() => {
    setFeedLoading(true);
    getDocs(query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(200)))
      .then(snap => setFeedPosts(snap.docs.map(d => ({ id: d.id, ...d.data() } as PostPreview))))
      .catch(() => {})
      .finally(() => setFeedLoading(false));
  }, []);

  useEffect(() => {
    if (step === "done" && generated && !postId && !autoSaveRef.current && caseData) {
      autoSaveRef.current = true;
      addDoc(collection(db, "posts"), {
        userId: user?.uid || null,
        userName: user?.displayName || user?.email?.split("@")[0] || "익명",
        caseNumber: caseData.caseNumber,
        caseName: caseData.caseName || "",
        court: caseData.court || "",
        date: caseData.date || "",
        rulingPoints: caseData.rulingPoints || "",
        rulingRatio: caseData.rulingRatio || "",
        content: generated,
        likes: 0, needsReview: 0,
        createdAt: serverTimestamp(),
      }).then(ref => setPostId(ref.id)).catch(console.error);
    }
    if (step !== "done") autoSaveRef.current = false;
  }, [step, generated, postId, caseData, user]);

  const runPrefetch = (data: CaseData) => {
    prefetchAbortRef.current?.abort();
    const controller = new AbortController();
    prefetchAbortRef.current = controller;

    const state = { text: "", done: false, error: null as string | null, notify: null as (() => void) | null };
    prefetchRef.current = state;

    (async () => {
      try {
        const token = user ? await user.getIdToken() : "";
        if (!token) { state.error = "로그인이 필요합니다."; state.notify?.(); return; }
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ caseData: data }),
          signal: controller.signal,
        });
        if (!res.body) { state.error = "스트림을 받을 수 없습니다."; return; }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

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
              if (payload.error) { state.error = payload.error; state.notify?.(); return; }
              if (payload.done) { state.done = true; state.notify?.(); return; }
              if (payload.text) { state.text += payload.text; state.notify?.(); }
            } catch {}
          }
        }
        state.done = true;
        state.notify?.();
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        state.error = e instanceof Error ? e.message : "오류";
        state.notify?.();
      }
    })();
  };

  const lookup = async () => {
    const num = input.trim();
    if (!num) return;
    setError(""); setLoadingCase(true); setExistingPost(null);
    prefetchAbortRef.current?.abort();
    prefetchRef.current = null;
    try {
      const res = await fetch(`/api/case-lookup?caseNumber=${encodeURIComponent(num)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "판례 조회 실패");
      setCaseData(data); setStep("preview");

      // 기존 문제 조회 (병렬)
      getDocs(query(
        collection(db, "posts"),
        where("caseNumber", "==", data.caseNumber),
        orderBy("createdAt", "desc"),
        limit(1)
      )).then(snap => {
        if (!snap.empty) {
          const d = snap.docs[0];
          setExistingPost({ id: d.id, ...d.data() } as PostPreview);
          prefetchAbortRef.current?.abort(); // 기존 문제 있으면 프리페치 불필요
          prefetchRef.current = null;
        } else {
          runPrefetch(data); // 기존 문제 없으면 바로 프리페치 시작
        }
      }).catch(() => runPrefetch(data));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "조회 중 오류가 발생했습니다.");
    } finally {
      setLoadingCase(false);
    }
  };

  const generate = async (fresh = false) => {
    if (!caseData) return;

    if (fresh) {
      prefetchAbortRef.current?.abort();
      prefetchRef.current = null;
      autoSaveRef.current = false;
      setVoted(null);
      setPostId(null);
    }

    setError(""); setLoadingGen(true); setStep("generating"); setGenerated("");

    const prefetch = prefetchRef.current;

    if (prefetch && !prefetch.error) {
      const flush = () => {
        if (prefetch.error) {
          setError(prefetch.error);
          setStep("preview");
          setLoadingGen(false);
          return;
        }
        if (prefetch.done) {
          setGenerated(prefetch.text);
          setStep("done");
          setLoadingGen(false);
        }
      };

      flush();
      if (!prefetch.done) prefetch.notify = flush;
      return;
    }

    prefetchRef.current = null;
    try {
      const token = user ? await user.getIdToken() : "";
      if (!token) throw new Error("로그인이 필요합니다.");
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ caseData }),
      });
      if (!res.body) throw new Error("스트림을 받을 수 없습니다.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

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
            if (payload.done) { setGenerated(fullText); setStep("done"); return; }
            if (payload.text) fullText += payload.text;
          } catch (e) {
            if (e instanceof Error && e.message !== "Unexpected end of JSON input") throw e;
          }
        }
      }
      setGenerated(fullText);
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "문제 생성 중 오류가 발생했습니다.");
      setStep("preview");
    } finally {
      setLoadingGen(false);
    }
  };

  const vote = async (field: "likes" | "needsReview") => {
    if (!postId) return;
    try {
      if (voted === field) {
        await updateDoc(doc(db, "posts", postId), { [field]: increment(-1) });
        setVoted(null);
      } else {
        if (voted) await updateDoc(doc(db, "posts", postId), { [voted]: increment(-1) });
        await updateDoc(doc(db, "posts", postId), { [field]: increment(1) });
        setVoted(field);
      }
    } catch (e) { console.error("vote failed:", e); }
  };

  const viewPost = async (post: PostPreview) => {
    try {
      const snap = await getDoc(doc(db, "posts", post.id));
      if (!snap.exists()) return;
      const data = snap.data();
      setCaseData({
        caseNumber: data.caseNumber,
        caseName: data.caseName,
        court: data.court,
        date: data.date,
        rulingPoints: data.rulingPoints,
        rulingRatio: data.rulingRatio,
      } as CaseData);
      setGenerated(data.content);
      setPostId(post.id);
      setVoted(null);
      setStep("done");
    } catch (e) { console.error("viewPost failed:", e); }
  };

  const reset = () => {
    prefetchAbortRef.current?.abort();
    prefetchRef.current = null;
    autoSaveRef.current = false;
    setStep("input"); setCaseData(null); setGenerated(""); setError("");
    setPostId(null); setInput(""); setVoted(null); setExistingPost(null);
  };

  return (
    <Layout title="Case Generator" onLogoClick={reset}>
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

            {/* ── 문제 피드 ── */}
            <div className="mt-10">
              {/* 헤더: 탭 + 검색 */}
              <div className="flex items-center gap-2 mb-4">
                <div className="flex bg-zinc-100 p-0.5 rounded-lg flex-shrink-0">
                  <button
                    onClick={() => { setFeedFilter("all"); setDisplayCount(10); }}
                    className={`px-3 py-1 text-[12px] font-medium rounded-md transition-all ${feedFilter === "all" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-400 hover:text-zinc-600"}`}
                  >
                    전체
                  </button>
                  <button
                    onClick={() => { setFeedFilter("mine"); setDisplayCount(10); }}
                    className={`px-3 py-1 text-[12px] font-medium rounded-md transition-all ${feedFilter === "mine" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-400 hover:text-zinc-600"}`}
                  >
                    내 문제
                  </button>
                </div>
                <div className="relative flex-1">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-300 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                  </svg>
                  <input
                    value={feedSearch}
                    onChange={e => { setFeedSearch(e.target.value); setDisplayCount(10); }}
                    placeholder="사건번호 또는 사건명 검색…"
                    className="w-full h-8 bg-white border border-zinc-200 rounded-lg pl-8 pr-3 text-[13px] text-zinc-900 placeholder-zinc-300 focus:outline-none focus:border-zinc-400 transition-colors"
                  />
                </div>
              </div>

              {/* 목록 */}
              {(() => {
                const source = feedFilter === "mine"
                  ? feedPosts.filter(p => p.userId === user?.uid)
                  : feedPosts;
                const q = feedSearch.trim().toLowerCase();
                const filtered = q
                  ? source.filter(p =>
                      p.caseNumber.toLowerCase().includes(q) ||
                      (p.caseName || "").toLowerCase().includes(q)
                    )
                  : source;
                const visible = filtered.slice(0, displayCount);

                if (feedLoading) return (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="bg-white rounded-xl border border-zinc-100 px-5 py-4 animate-pulse">
                        <div className="h-3.5 bg-zinc-100 rounded-full w-[40%] mb-2" />
                        <div className="h-3 bg-zinc-100 rounded-full w-[25%]" />
                      </div>
                    ))}
                  </div>
                );

                if (feedFilter === "mine" && !user) return (
                  <p className="text-[13px] text-zinc-400 py-4">로그인하면 내 문제를 볼 수 있습니다.</p>
                );

                if (filtered.length === 0) return (
                  <p className="text-[13px] text-zinc-300 py-4">
                    {q ? `"${feedSearch}"에 해당하는 문제가 없습니다.` : feedFilter === "mine" ? "아직 생성한 문제가 없습니다." : "아직 생성된 문제가 없습니다."}
                  </p>
                );

                return (
                  <>
                    <div className="space-y-2">
                      {visible.map(post => (
                        <button
                          key={post.id}
                          onClick={() => viewPost(post)}
                          className="w-full bg-white rounded-xl border border-zinc-100 px-5 py-4 text-left hover:border-zinc-300 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[14px] font-mono font-semibold text-zinc-800 truncate">{post.caseNumber}</p>
                              <p className="text-[12px] text-zinc-400 mt-0.5 truncate">
                                {[post.court, post.date && formatDate(post.date), post.caseName].filter(Boolean).join(" · ")}
                              </p>
                            </div>
                            <div className="flex items-center gap-3 text-[12px] text-zinc-400 flex-shrink-0">
                              <span>추천 {post.likes}</span>
                              <span className="text-zinc-200">·</span>
                              <span className="max-w-[60px] truncate">{post.userName}</span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                    {filtered.length > displayCount && (
                      <button
                        onClick={() => setDisplayCount(c => c + 10)}
                        className="w-full mt-3 h-9 text-[13px] text-zinc-400 hover:text-zinc-700 border border-zinc-200 hover:border-zinc-300 rounded-xl transition-colors"
                      >
                        더 보기 ({filtered.length - displayCount}개 남음)
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* ── 판례 확인 ── */}
        {step === "preview" && caseData && (
          <div>
            <CaseCard data={caseData} onReset={reset} />

            {existingPost ? (
              /* 기존 문제 있음 → 선택지 제시 */
              <div className="mt-4 bg-white rounded-xl border border-zinc-100 px-5 py-4">
                <p className="text-[13px] text-zinc-500 mb-3">
                  이 판례로 생성된 문제가 이미 있습니다.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => viewPost(existingPost)}
                    className="flex-1 h-10 bg-zinc-900 text-white rounded-xl text-[14px] font-semibold hover:bg-zinc-700 transition-colors"
                  >
                    기존 문제 보기
                  </button>
                  <button
                    onClick={() => { setExistingPost(null); runPrefetch(caseData); generate(); }}
                    className="flex-1 h-10 bg-white border border-zinc-200 text-zinc-600 rounded-xl text-[14px] font-semibold hover:border-zinc-400 hover:text-zinc-900 transition-colors"
                  >
                    새로 생성하기
                  </button>
                </div>
              </div>
            ) : (
              /* 기존 문제 없음 → 바로 생성 */
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => generate()}
                  className="h-10 px-5 bg-zinc-900 text-white rounded-xl text-[14px] font-semibold hover:bg-zinc-700 transition-colors flex items-center gap-2"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  문제 생성하기
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── 생성 중 (첫 응답 전) — 스켈레톤 ── */}
        {step === "generating" && (
          <div className="space-y-4">
            {/* 진행 상황 카드 */}
            <div className="bg-white rounded-xl border border-zinc-100 px-6 py-5 flex gap-4 items-start">
              <div className="w-4 h-4 border-2 border-zinc-200 border-t-zinc-600 rounded-full animate-spin mt-0.5 flex-shrink-0" />
              <div className="space-y-2.5">
                {PROGRESS_STEPS.map((label, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    {checkedSteps[i] ? (
                      <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-zinc-200 flex-shrink-0" />
                    )}
                    <span className={`text-[13px] transition-colors ${checkedSteps[i] ? "text-zinc-300 line-through" : "text-zinc-600"}`}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          <div className="space-y-4 animate-pulse">
            <div className="bg-white rounded-xl border border-zinc-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-amber-100 bg-amber-50/60 flex items-center gap-3">
                <div className="w-[3px] h-5 rounded-full bg-amber-200 flex-shrink-0" />
                <span className="text-[11px] font-bold text-amber-300 uppercase tracking-widest">사실관계</span>
              </div>
              <div className="px-6 py-6 space-y-2.5">
                <div className="h-3.5 bg-zinc-100 rounded-full w-full" />
                <div className="h-3.5 bg-zinc-100 rounded-full w-[95%]" />
                <div className="h-3.5 bg-zinc-100 rounded-full w-[88%]" />
                <div className="h-3.5 bg-zinc-100 rounded-full w-full" />
                <div className="h-3.5 bg-zinc-100 rounded-full w-[72%]" />
              </div>
            </div>
            <div className="bg-white rounded-xl border border-zinc-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-blue-100 bg-blue-50/60 flex items-center gap-3">
                <div className="w-[3px] h-5 rounded-full bg-blue-200 flex-shrink-0" />
                <span className="text-[11px] font-bold text-blue-300 uppercase tracking-widest">문 1</span>
              </div>
              <div className="px-6 py-6 space-y-2.5">
                <div className="h-3.5 bg-zinc-100 rounded-full w-[90%]" />
                <div className="h-3.5 bg-zinc-100 rounded-full w-[60%]" />
              </div>
            </div>
            <div className="bg-white rounded-xl border border-zinc-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-100 bg-zinc-50 flex items-center gap-3">
                <div className="w-[3px] h-5 rounded-full bg-zinc-200 flex-shrink-0" />
                <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-widest">해설 및 모범답안</span>
              </div>
              <div className="px-6 py-6 space-y-2.5">
                <div className="h-3.5 bg-zinc-100 rounded-full w-full" />
                <div className="h-3.5 bg-zinc-100 rounded-full w-[93%]" />
                <div className="h-3.5 bg-zinc-100 rounded-full w-[85%]" />
                <div className="h-3.5 bg-zinc-100 rounded-full w-full" />
                <div className="h-3.5 bg-zinc-100 rounded-full w-[78%]" />
                <div className="h-3.5 bg-zinc-100 rounded-full w-[88%]" />
                <div className="h-3.5 bg-zinc-100 rounded-full w-[65%]" />
              </div>
            </div>
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
                  onClick={() => generate(true)}
                  className="h-8 px-3.5 text-[13px] text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  다시 생성
                </button>
                <div className="w-px h-4 bg-zinc-200" />
                <button
                  onClick={() => vote("likes")}
                  className={`h-8 px-3.5 rounded-lg text-[13px] font-medium flex items-center gap-1.5 transition-colors ${
                    voted === "likes" ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "text-zinc-500 hover:bg-zinc-100"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                  </svg>
                  추천
                </button>
                <button
                  onClick={() => vote("needsReview")}
                  className={`h-8 px-3.5 rounded-lg text-[13px] font-medium transition-colors ${
                    voted === "needsReview" ? "bg-amber-50 text-amber-600 border border-amber-200" : "text-zinc-500 hover:bg-zinc-100"
                  }`}
                >
                  검수 요청
                </button>
              </div>
            </div>

            {postId && <Comments postId={postId} />}
          </div>
        )}

        <div className="h-20" />
      </div>
    </Layout>
  );
}
