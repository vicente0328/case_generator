import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import { useAuth } from "@/lib/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import type { CaseData } from "./api/case-lookup";

type Step = "input" | "preview" | "generating" | "done";

function CaseInfoCard({ data }: { data: CaseData }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 text-sm">판례 정보</h3>
        {data.court && <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">{data.court}</span>}
      </div>
      <div className="p-5 space-y-4">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <div className="text-sm"><span className="text-gray-400 text-xs">사건번호</span><p className="font-semibold text-gray-900 font-mono text-sm mt-0.5">{data.caseNumber}</p></div>
          {data.caseName && <div className="text-sm"><span className="text-gray-400 text-xs">사건명</span><p className="font-medium text-gray-800 mt-0.5">{data.caseName}</p></div>}
          {data.date && <div className="text-sm"><span className="text-gray-400 text-xs">선고일</span><p className="font-medium text-gray-800 mt-0.5">{formatDate(data.date)}</p></div>}
        </div>
        {data.rulingPoints && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">판시사항</p>
            <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-xl p-3.5">{data.rulingPoints}</p>
          </div>
        )}
        {data.rulingRatio && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">판결요지</p>
            <p className="text-sm text-gray-700 leading-relaxed bg-amber-50 rounded-xl p-3.5">{data.rulingRatio}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(date: string): string {
  if (!date) return "";
  const s = String(date).replace(/\D/g, "");
  if (s.length === 8) return `${s.slice(0, 4)}. ${s.slice(4, 6)}. ${s.slice(6, 8)}.`;
  return date;
}

function GeneratedContent({ content }: { content: string }) {
  const sections = parseContent(content);

  return (
    <div className="space-y-4 legal-content">
      {sections.map((s, i) => {
        if (s.type === "facts") {
          return (
            <div key={i} className="rounded-2xl overflow-hidden border border-amber-200/80">
              <div className="bg-amber-50 px-5 py-3 border-b border-amber-200/60">
                <span className="text-xs font-bold text-amber-700 uppercase tracking-widest">사실관계</span>
              </div>
              <div className="bg-amber-50/50 px-5 py-4">
                <p className="text-gray-800 text-sm leading-loose whitespace-pre-line">{s.body}</p>
              </div>
            </div>
          );
        }
        if (s.type === "question") {
          return (
            <div key={i} className="rounded-2xl overflow-hidden border border-navy-200/60">
              <div className="bg-navy-50 px-5 py-3 border-b border-navy-100">
                <span className="text-xs font-bold text-navy-700 uppercase tracking-widest">{s.heading}</span>
              </div>
              <div className="bg-navy-50/30 px-5 py-4">
                <p className="text-gray-800 text-sm leading-loose whitespace-pre-line font-medium">{s.body}</p>
              </div>
            </div>
          );
        }
        if (s.type === "answer") {
          return (
            <div key={i} className="rounded-2xl overflow-hidden border border-gray-200/80">
              <div className="bg-gray-50 px-5 py-3 border-b border-gray-100">
                <span className="text-xs font-bold text-gray-600 uppercase tracking-widest">해설 및 모범답안</span>
              </div>
              <div className="bg-white px-5 py-4">
                <div className="text-gray-800 text-sm leading-loose whitespace-pre-line">{s.body}</div>
              </div>
            </div>
          );
        }
        if (s.type === "precedent") {
          return (
            <div key={i} className="rounded-2xl border border-gold-200/80 overflow-hidden">
              <div className="bg-gold-50 px-5 py-3 border-b border-gold-200/60">
                <span className="text-xs font-bold text-gold-700 uppercase tracking-widest">모델 판례 및 판결요지</span>
              </div>
              <div className="bg-gold-50/30 px-5 py-4">
                <p className="font-serif text-sm text-gray-700 leading-loose whitespace-pre-line">{s.body}</p>
              </div>
            </div>
          );
        }
        return (
          <div key={i} className="text-gray-700 text-sm leading-loose whitespace-pre-line px-1">
            {s.heading && <p className="font-semibold text-gray-900 mb-1">{s.heading}</p>}
            {s.body}
          </div>
        );
      })}
    </div>
  );
}

interface ContentSection {
  type: "facts" | "question" | "answer" | "precedent" | "other";
  heading: string;
  body: string;
}

function parseContent(text: string): ContentSection[] {
  const sections: ContentSection[] = [];
  const lines = text.split("\n");
  let current: ContentSection | null = null;

  const flush = () => {
    if (current && (current.body.trim() || current.heading.trim())) {
      current.body = current.body.trim();
      sections.push(current);
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // <사실관계> or [사실관계]
    if (/^<사실관계>$|^\[사실관계\]$|^\*\*\[사실관계\]\*\*$/.test(trimmed)) {
      flush();
      current = { type: "facts", heading: "사실관계", body: "" };
    }
    // <문 N> (Xpoint) or <문제> — question blocks
    else if (/^<문\s*\d*>|^<문제>/.test(trimmed)) {
      flush();
      const heading = trimmed.replace(/^<|>$/g, "").trim();
      current = { type: "question", heading, body: "" };
    }
    // Old format: [문 N] at start of line (not inside answer section)
    else if (/^\[문\s*\d+\]\s*\(\d+점\)|^\*\*\[문\s*\d+\]/.test(trimmed) && current?.type !== "answer") {
      flush();
      const heading = trimmed.replace(/\*\*/g, "").replace(/^\[|\]$/g, "").trim();
      current = { type: "question", heading, body: "" };
    }
    // [해설 및 모범답안] or [해설]
    else if (/^\[해설/.test(trimmed)) {
      flush();
      current = { type: "answer", heading: "해설 및 모범답안", body: "" };
    }
    // [모델 판례 및 판결요지]
    else if (/^\[모델\s*판례/.test(trimmed)) {
      flush();
      current = { type: "precedent", heading: "모델 판례 및 판결요지", body: "" };
    }
    // Old inline 모델 판례: format
    else if (/^모델\s*판례/.test(trimmed) && current?.type !== "answer" && current?.type !== "precedent") {
      flush();
      const match = trimmed.match(/모델\s*판례[^:]*:\s*(.*)/s);
      current = {
        type: "precedent",
        heading: "모델 판례 및 판결요지",
        body: match ? match[1].replace(/^[""]/, "").replace(/[""]$/, "") : "",
      };
    }
    else if (current) {
      current.body += (current.body ? "\n" : "") + line;
    } else {
      flush();
      current = { type: "other", heading: "", body: line };
    }
  }
  flush();

  return sections.filter((s) => s.body.trim().length > 0 || s.heading.trim().length > 0);
}

export default function GeneratePage() {
  const { user } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<Step>("input");
  const [caseNumberInput, setCaseNumberInput] = useState("");

  // Pre-fill from URL query param ?case=XXXX
  useEffect(() => {
    if (router.isReady && typeof router.query.case === "string") {
      setCaseNumberInput(router.query.case);
    }
  }, [router.isReady, router.query.case]);
  const [caseData, setCaseData] = useState<CaseData | null>(null);
  const [generatedText, setGeneratedText] = useState("");
  const [loadingCase, setLoadingCase] = useState(false);
  const [loadingGen, setLoadingGen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
    if (!user) {
      setError("커뮤니티에 저장하려면 로그인이 필요합니다.");
      return;
    }
    if (!caseData || !generatedText) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "posts"), {
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
    setCaseNumberInput("");
  };

  const stepList = [
    { key: "input", label: "판례 입력" },
    { key: "preview", label: "판례 확인" },
    { key: "generating", label: "생성 중" },
    { key: "done", label: "완료" },
  ] as const;
  const stepIndex = stepList.findIndex((s) => s.key === step);

  return (
    <Layout title="문제 생성 - 변시 민사법 사례 생성기">
      <div className="max-w-3xl mx-auto px-4 py-10">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-gray-900 mb-1.5">사례형 문제 생성</h1>
          <p className="text-gray-400 text-sm">사건번호를 입력하면 변호사시험 민사법 사례형 문제를 자동 생성합니다.</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-1.5 mb-8">
          {stepList.map((s, i) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                i === stepIndex
                  ? "bg-navy-900 text-white"
                  : i < stepIndex
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-400"
              }`}>
                {i < stepIndex ? (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-current flex items-center justify-center text-[9px]">{i + 1}</span>
                )}
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < stepList.length - 1 && <div className="w-4 h-px bg-gray-200" />}
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-5 bg-red-50 border border-red-200 rounded-2xl px-4 py-3.5 text-sm text-red-700 flex items-start gap-2.5">
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Step: Input */}
        {step === "input" && (
          <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-6 sm:p-8">
            <h2 className="text-base font-semibold text-gray-900 mb-1">사건번호 입력</h2>
            <p className="text-sm text-gray-400 mb-5">대법원 판례의 사건번호 (숫자 + 한글) 를 입력하세요.</p>
            <div className="flex gap-2.5">
              <input
                type="text"
                value={caseNumberInput}
                onChange={(e) => setCaseNumberInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                placeholder="예: 2016다271226"
                className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-navy-300 focus:border-transparent bg-gray-50 font-mono"
                disabled={loadingCase}
              />
              <button
                onClick={handleLookup}
                disabled={!caseNumberInput.trim() || loadingCase}
                className="btn-primary rounded-xl whitespace-nowrap"
              >
                {loadingCase ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    조회 중
                  </>
                ) : "판례 조회"}
              </button>
            </div>
            <div className="mt-5">
              <p className="text-xs text-gray-400 mb-2.5">예시 사건번호</p>
              <div className="flex flex-wrap gap-2">
                {["2016다271226", "2019다272855", "2021다264253", "2020다209815"].map((num) => (
                  <button
                    key={num}
                    onClick={() => setCaseNumberInput(num)}
                    className="text-xs px-3 py-1.5 bg-gray-100 rounded-lg text-gray-600 hover:bg-gray-200 transition-colors font-mono"
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step: Preview */}
        {step === "preview" && caseData && (
          <div className="space-y-4">
            <CaseInfoCard data={caseData} />
            <div className="flex gap-2.5 justify-end">
              <button onClick={handleReset} className="btn-secondary">
                다시 입력
              </button>
              <button onClick={handleGenerate} className="btn-gold">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                문제 생성
              </button>
            </div>
          </div>
        )}

        {/* Step: Generating */}
        {step === "generating" && (
          <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-14 text-center">
            <div className="w-14 h-14 rounded-full bg-navy-50 flex items-center justify-center mx-auto mb-5">
              <svg className="animate-spin w-7 h-7 text-navy-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <h3 className="font-serif font-bold text-gray-900 text-lg mb-2">문제를 생성하고 있습니다</h3>
            <p className="text-gray-400 text-sm">Gemini가 변시 형식의 사례형 문제와 해설을 작성 중입니다.</p>
            <p className="text-gray-300 text-xs mt-1.5">약 15~30초 소요될 수 있습니다.</p>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && caseData && generatedText && (
          <div className="space-y-5">
            {/* Case reference chip */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-400">기반 판례</span>
              <span className="text-xs font-semibold text-navy-700 bg-navy-50 px-2.5 py-1 rounded-full border border-navy-100 font-mono">{caseData.caseNumber}</span>
              {caseData.caseName && <span className="text-xs text-gray-500">{caseData.caseName}</span>}
              {caseData.court && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{caseData.court}</span>}
            </div>

            {/* Generated content */}
            <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5 sm:p-7">
              <GeneratedContent content={generatedText} />
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2.5 justify-between">
              <button onClick={handleReset} className="btn-secondary text-sm">
                새 문제 생성
              </button>
              <div className="flex gap-2.5">
                <button onClick={handleGenerate} className="btn-secondary text-sm">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  재생성
                </button>
                {saved ? (
                  <div className="flex items-center gap-1.5 px-5 py-2 rounded-full bg-green-100 text-green-700 text-sm font-semibold">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    저장됨
                  </div>
                ) : (
                  <button onClick={handleSave} disabled={saving} className="btn-gold text-sm">
                    {saving ? (
                      <>
                        <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        저장 중
                      </>
                    ) : "커뮤니티에 공유"}
                  </button>
                )}
              </div>
            </div>

            {saved && (
              <div className="text-center">
                <button
                  onClick={() => router.push("/community")}
                  className="text-sm text-navy-600 hover:text-navy-800 font-medium"
                >
                  커뮤니티에서 확인하기 →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
