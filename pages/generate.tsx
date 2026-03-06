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
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="bg-navy-900 px-5 py-3 flex items-center justify-between">
        <h3 className="text-white font-semibold text-sm">판례 정보</h3>
        <span className="text-gold-300 text-xs">{data.court}</span>
      </div>
      <div className="p-5 space-y-4">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div><span className="text-gray-400">사건번호</span> <span className="font-medium text-navy-900 ml-1">{data.caseNumber}</span></div>
          <div><span className="text-gray-400">사건명</span> <span className="font-medium text-navy-900 ml-1">{data.caseName}</span></div>
          {data.date && <div><span className="text-gray-400">선고일</span> <span className="font-medium ml-1">{formatDate(data.date)}</span></div>}
        </div>
        {data.rulingPoints && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">판시사항</p>
            <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-lg p-3 border border-gray-100">{data.rulingPoints}</p>
          </div>
        )}
        {data.rulingRatio && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">판결요지</p>
            <p className="text-sm text-gray-700 leading-relaxed bg-amber-50 rounded-lg p-3 border border-amber-100">{data.rulingRatio}</p>
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
            <div key={i} className="bg-amber-50 border-l-4 border-amber-400 rounded-r-xl p-5">
              <h4 className="font-serif font-bold text-amber-900 mb-3 text-base">{s.heading}</h4>
              <p className="text-gray-800 text-sm leading-loose whitespace-pre-line">{s.body}</p>
            </div>
          );
        }
        if (s.type === "question") {
          return (
            <div key={i} className="bg-navy-50 border-l-4 border-navy-500 rounded-r-xl p-5">
              <h4 className="font-serif font-bold text-navy-900 mb-3 text-base">{s.heading}</h4>
              <p className="text-gray-800 text-sm leading-loose whitespace-pre-line">{s.body}</p>
            </div>
          );
        }
        if (s.type === "answer") {
          return (
            <div key={i} className="bg-blue-50 border-l-4 border-blue-400 rounded-r-xl p-5">
              <h4 className="font-serif font-bold text-blue-900 mb-3 text-base">{s.heading}</h4>
              <div className="text-gray-800 text-sm leading-loose whitespace-pre-line">{s.body}</div>
            </div>
          );
        }
        if (s.type === "precedent") {
          return (
            <div key={i} className="bg-gray-50 border border-gray-200 rounded-xl p-5 ml-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{s.heading}</p>
              <blockquote className="font-serif text-sm text-gray-700 leading-relaxed border-l-2 border-gold-400 pl-4 italic">
                {s.body}
              </blockquote>
            </div>
          );
        }
        return (
          <div key={i} className="text-gray-800 text-sm leading-loose whitespace-pre-line">
            {s.heading && <p className="font-semibold mb-1">{s.heading}</p>}
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

    // Detect section headers
    if (/^\[사실관계\]|^\*\*\[사실관계\]\*\*|^##\s*사실관계|^사실관계/.test(trimmed)) {
      flush();
      current = { type: "facts", heading: "사실관계", body: "" };
    } else if (/^\[문\s*\d+\]|^\*\*\[문\s*\d+\]|^##\s*문\s*\d+|^문\s*\d+/.test(trimmed)) {
      flush();
      current = { type: "question", heading: trimmed.replace(/\*\*/g, ""), body: "" };
    } else if (/^\[해설\]|^\*\*\[해설\]\*\*|^##\s*해설|^해설/.test(trimmed)) {
      flush();
      current = { type: "answer", heading: "해설", body: "" };
    } else if (/모델\s*판례/.test(trimmed)) {
      flush();
      // Extract the precedent text
      const match = trimmed.match(/모델\s*판례[^:]*:\s*(.*)/s);
      current = {
        type: "precedent",
        heading: trimmed.replace(/[""].*/, "").trim(),
        body: match ? match[1].replace(/^[""]/, "").replace(/[""]$/, "") : "",
      };
    } else if (current) {
      current.body += (current.body ? "\n" : "") + line;
    } else {
      // Raw text before any section
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

  return (
    <Layout title="문제 생성 - 변시 민사법 사례 생성기">
      <div className="max-w-4xl mx-auto px-4 py-10">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-serif font-bold text-navy-900 mb-2">사례형 문제 생성</h1>
          <p className="text-gray-500 text-sm">
            대법원 판례의 사건번호를 입력하면 변호사시험 민사법 사례형 문제를 자동 생성합니다.
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 mb-8 text-xs">
          {[
            { key: "input", label: "판례 입력" },
            { key: "preview", label: "판례 확인" },
            { key: "generating", label: "문제 생성" },
            { key: "done", label: "완료" },
          ].map((s, i, arr) => (
            <div key={s.key} className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center font-semibold transition-colors ${
                  step === s.key
                    ? "bg-navy-900 text-white"
                    : (["input","preview","generating","done"].indexOf(step) > i)
                    ? "bg-green-500 text-white"
                    : "bg-gray-200 text-gray-400"
                }`}
              >
                {(["input","preview","generating","done"].indexOf(step) > i) ? "✓" : i + 1}
              </div>
              <span className={step === s.key ? "text-navy-900 font-semibold" : "text-gray-400"}>{s.label}</span>
              {i < arr.length - 1 && <div className="w-6 h-px bg-gray-200 mx-1" />}
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex items-start gap-2">
            <span className="flex-shrink-0 mt-0.5">⚠</span>
            <span>{error}</span>
          </div>
        )}

        {/* Step: Input */}
        {step === "input" && (
          <div className="card p-8">
            <h2 className="text-lg font-serif font-bold text-navy-900 mb-2">사건번호 입력</h2>
            <p className="text-sm text-gray-500 mb-6">대법원 판례의 사건번호를 입력하세요. 숫자와 한글로 구성됩니다.</p>
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={caseNumberInput}
                  onChange={(e) => setCaseNumberInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                  placeholder="예: 2016다271226"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-transparent"
                  disabled={loadingCase}
                />
              </div>
              <button
                onClick={handleLookup}
                disabled={!caseNumberInput.trim() || loadingCase}
                className="btn-primary px-6 rounded-xl whitespace-nowrap"
              >
                {loadingCase ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    조회 중...
                  </span>
                ) : "판례 조회"}
              </button>
            </div>

            <div className="mt-6 bg-gray-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-500 mb-2">입력 예시</p>
              <div className="flex flex-wrap gap-2">
                {["2016다271226", "2019다272855", "2021다264253", "2020다209815"].map((num) => (
                  <button
                    key={num}
                    onClick={() => setCaseNumberInput(num)}
                    className="text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-navy-700 hover:bg-navy-50 hover:border-navy-300 transition-colors font-mono"
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
            <div className="flex gap-3 justify-end">
              <button onClick={handleReset} className="btn-secondary rounded-xl">
                다시 입력
              </button>
              <button onClick={handleGenerate} className="btn-gold rounded-xl flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                문제 생성
              </button>
            </div>
          </div>
        )}

        {/* Step: Generating */}
        {step === "generating" && (
          <div className="card p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-navy-100 flex items-center justify-center mx-auto mb-4">
              <svg className="animate-spin w-8 h-8 text-navy-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <h3 className="font-serif font-bold text-navy-900 text-xl mb-2">문제를 생성하고 있습니다</h3>
            <p className="text-gray-500 text-sm">Claude Opus가 변시 형식의 사례형 문제와 해설을 작성 중입니다...</p>
            <p className="text-gray-400 text-xs mt-2">약 30초~1분 소요될 수 있습니다.</p>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && caseData && generatedText && (
          <div className="space-y-6">
            {/* Case reference */}
            <div className="bg-gray-100 rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="text-gray-500">기반 판례:</span>
              <span className="font-medium text-navy-900">{caseData.caseNumber}</span>
              <span className="text-gray-400">|</span>
              <span className="text-gray-600">{caseData.caseName}</span>
              {caseData.court && <><span className="text-gray-400">|</span><span className="text-gray-600">{caseData.court}</span></>}
            </div>

            {/* Generated content */}
            <div className="card p-6 sm:p-8">
              <GeneratedContent content={generatedText} />
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3 justify-between">
              <button onClick={handleReset} className="btn-secondary rounded-xl text-sm">
                새 문제 생성
              </button>
              <div className="flex gap-3">
                <button
                  onClick={handleGenerate}
                  className="btn-secondary rounded-xl text-sm flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  재생성
                </button>
                {saved ? (
                  <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-100 text-green-700 text-sm font-semibold">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    커뮤니티에 저장됨
                  </div>
                ) : (
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="btn-gold rounded-xl text-sm flex items-center gap-1.5"
                  >
                    {saving ? (
                      <>
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        저장 중...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                        </svg>
                        커뮤니티에 공유
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {saved && (
              <div className="text-center">
                <button
                  onClick={() => router.push("/community")}
                  className="text-sm text-navy-600 hover:text-navy-800 underline"
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
