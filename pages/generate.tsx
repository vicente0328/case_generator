import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import { useAuth } from "@/lib/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import type { CaseData } from "./api/case-lookup";
import { 
  MagnifyingGlassIcon, 
  ArrowPathIcon, 
  DocumentPlusIcon,
  CheckCircleIcon,
  ShareIcon,
  SparklesIcon,
  ArrowRightIcon
} from "@heroicons/react/24/outline";

type Step = "input" | "preview" | "generating" | "done";

function CaseInfoCard({ data }: { data: CaseData }) {
  const [rulingExpanded, setRulingExpanded] = useState(false);

  return (
    <div className="bg-white rounded-[20px] border border-[#E5E5EA] overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="px-6 py-4 bg-[#F9F9FB] border-b border-[#E5E5EA] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#34C759] inline-block" />
          <h3 className="font-semibold text-[#1C1C1E] text-[15px]">판례 확인</h3>
        </div>
        {data.court && <span className="text-[11px] font-medium text-[#8E8E93] bg-[#E5E5EA] px-2.5 py-1 rounded-full">{data.court}</span>}
      </div>

      <div className="p-6 space-y-5">
        {/* Meta info */}
        <div className="flex flex-wrap gap-x-8 gap-y-4">
          <div>
            <span className="text-[#8E8E93] text-[12px] uppercase tracking-wide block mb-1">사건번호</span>
            <p className="font-bold text-[#1C1C1E] font-mono text-[17px]">{data.caseNumber}</p>
          </div>
          {data.caseName && (
            <div>
              <span className="text-[#8E8E93] text-[12px] uppercase tracking-wide block mb-1">사건명</span>
              <p className="font-medium text-[#1C1C1E] text-[15px]">{data.caseName}</p>
            </div>
          )}
          {data.date && (
            <div>
              <span className="text-[#8E8E93] text-[12px] uppercase tracking-wide block mb-1">선고일</span>
              <p className="font-medium text-[#1C1C1E] text-[15px]">{formatDate(data.date)}</p>
            </div>
          )}
        </div>

        {/* 판시사항 */}
        {data.rulingPoints ? (
          <div>
            <p className="text-[12px] font-semibold text-[#007AFF] uppercase tracking-wide mb-2">판시사항</p>
            <div className="bg-[#F0F7FF] border border-[#007AFF]/10 rounded-[14px] p-4">
              <p className="text-[14px] text-[#3A3A3C] leading-[1.75] whitespace-pre-line">{data.rulingPoints}</p>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-[12px] font-semibold text-[#8E8E93] uppercase tracking-wide mb-2">판시사항</p>
            <p className="text-[13px] text-[#C7C7CC] italic">판시사항 정보 없음</p>
          </div>
        )}

        {/* 판결요지 (접기/펼치기) */}
        {data.rulingRatio && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[12px] font-semibold text-[#9A6D1F] uppercase tracking-wide">판결요지</p>
              <button
                onClick={() => setRulingExpanded((v) => !v)}
                className="text-[12px] text-[#8E8E93] hover:text-[#1C1C1E] transition-colors"
              >
                {rulingExpanded ? "접기 ↑" : "펼치기 ↓"}
              </button>
            </div>
            <div className={`relative bg-[#FFF8E6] border border-[#FFE0A2]/40 rounded-[14px] p-4 overflow-hidden transition-all duration-300 ${rulingExpanded ? "" : "max-h-[96px]"}`}>
              <p className="text-[14px] text-[#3A3A3C] leading-[1.75] whitespace-pre-line">{data.rulingRatio}</p>
              {!rulingExpanded && (
                <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#FFF8E6] to-transparent pointer-events-none" />
              )}
            </div>
            {!rulingExpanded && data.rulingRatio.length > 150 && (
              <button onClick={() => setRulingExpanded(true)} className="mt-1.5 text-[12px] text-[#007AFF] hover:underline">
                전체 보기
              </button>
            )}
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
    <div className="space-y-6 legal-content animate-in fade-in slide-in-from-bottom-8 duration-700">
      {sections.map((s, i) => {
        if (s.type === "facts") {
          return (
            <div key={i} className="rounded-[20px] overflow-hidden border border-[#E5E5EA] bg-white shadow-sm">
              <div className="bg-[#FFF8E6] px-6 py-4 border-b border-[#FFE0A2]/30">
                <span className="text-[13px] font-bold text-[#9A6D1F] uppercase tracking-wide">사실관계</span>
              </div>
              <div className="p-6">
                <p className="text-[#1C1C1E] text-[16px] leading-[1.8] whitespace-pre-line">{s.body}</p>
              </div>
            </div>
          );
        }
        if (s.type === "question") {
          return (
            <div key={i} className="rounded-[20px] overflow-hidden border border-[#E5E5EA] bg-white shadow-sm">
              <div className="bg-[#F0F7FF] px-6 py-4 border-b border-[#007AFF]/10">
                <span className="text-[13px] font-bold text-[#007AFF] uppercase tracking-wide">{s.heading}</span>
              </div>
              <div className="p-6">
                <p className="text-[#1C1C1E] text-[16px] leading-[1.8] whitespace-pre-line font-medium">{s.body}</p>
              </div>
            </div>
          );
        }
        if (s.type === "answer") {
          return (
            <div key={i} className="rounded-[20px] overflow-hidden border border-[#E5E5EA] bg-white shadow-sm">
              <div className="bg-[#F2F2F7] px-6 py-4 border-b border-[#E5E5EA]">
                <span className="text-[13px] font-bold text-[#636366] uppercase tracking-wide">해설 및 모범답안</span>
              </div>
              <div className="p-6">
                <div className="text-[#1C1C1E] text-[16px] leading-[1.8] whitespace-pre-line">{s.body}</div>
              </div>
            </div>
          );
        }
        if (s.type === "precedent") {
          return (
            <div key={i} className="rounded-[20px] border border-[#E5E5EA] overflow-hidden bg-white shadow-sm">
              <div className="bg-[#F9F9FB] px-6 py-4 border-b border-[#E5E5EA]">
                <span className="text-[13px] font-bold text-[#636366] uppercase tracking-wide">모델 판례 및 판결요지</span>
              </div>
              <div className="p-6">
                <p className="font-serif text-[16px] text-[#3A3A3C] leading-[1.8] whitespace-pre-line">{s.body}</p>
              </div>
            </div>
          );
        }
        return (
          <div key={i} className="text-[#3A3A3C] text-[16px] leading-[1.8] whitespace-pre-line px-2">
            {s.heading && <p className="font-semibold text-[#1C1C1E] mb-2">{s.heading}</p>}
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

    if (/^<사실관계>$|^\[사실관계\]$|^\*\*\[사실관계\]\*\*$/.test(trimmed)) {
      flush();
      current = { type: "facts", heading: "사실관계", body: "" };
    }
    else if (/^<문\s*\d*>|^<문제>/.test(trimmed)) {
      flush();
      const heading = trimmed.replace(/^<|>$/g, "").trim();
      current = { type: "question", heading, body: "" };
    }
    else if (/^\[문\s*\d+\]\s*\(\d+점\)|^\*\*\[문\s*\d+\]/.test(trimmed) && current?.type !== "answer") {
      flush();
      const heading = trimmed.replace(/\*\*/g, "").replace(/^\[|\]$/g, "").trim();
      current = { type: "question", heading, body: "" };
    }
    else if (/^\[해설 및 모범답안\]|^\[해설\]/.test(trimmed)) {
      flush();
      current = { type: "answer", heading: "해설 및 모범답안", body: "" };
    }
    else if (/^\[모델\s*판례/.test(trimmed)) {
      flush();
      current = { type: "precedent", heading: "모델 판례 및 판결요지", body: "" };
    }
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
      setError("로그인이 필요한 기능입니다.");
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
    <Layout title="문제 생성 - Case Generator">
      <div className="max-w-3xl mx-auto py-6 sm:py-10">
        
        {/* Header */}
        <div className="mb-10 text-center sm:text-left">
          <h1 className="text-[28px] font-bold text-[#1C1C1E] mb-2">문제 생성</h1>
          <p className="text-[#8E8E93] text-[15px]">사건번호만 입력하세요. 나머지는 AI가 처리합니다.</p>
        </div>

        {/* Error Toast */}
        {error && (
          <div className="mb-6 bg-[#FF3B30]/10 border border-[#FF3B30]/20 rounded-[14px] px-4 py-3 text-[14px] text-[#FF3B30] flex items-center gap-2 animate-in slide-in-from-top-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: Input */}
        {step === "input" && (
          <div className="card p-6 sm:p-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-[17px] font-semibold text-[#1C1C1E] mb-2">사건번호 입력</h2>
            <p className="text-[14px] text-[#8E8E93] mb-6">대법원 판례의 사건번호 (예: 2016다271226)를 입력해주세요.</p>
            
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={caseNumberInput}
                  onChange={(e) => setCaseNumberInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                  placeholder="예: 2016다271226"
                  className="input-field pl-10 h-[50px]"
                  disabled={loadingCase}
                  autoFocus
                />
              </div>
              <button
                onClick={handleLookup}
                disabled={!caseNumberInput.trim() || loadingCase}
                className="btn-primary h-[50px] w-full sm:w-auto min-w-[100px]"
              >
                {loadingCase ? (
                  <ArrowPathIcon className="w-5 h-5 animate-spin" />
                ) : "조회"}
              </button>
            </div>

            <div className="mt-8 pt-6 border-t border-[#E5E5EA]">
              <p className="text-[12px] font-semibold text-[#8E8E93] mb-3 uppercase tracking-wide">추천 판례</p>
              <div className="flex flex-wrap gap-2">
                {["2016다271226", "2019다272855", "2021다264253", "2020다209815"].map((num) => (
                  <button
                    key={num}
                    onClick={() => {
                        setCaseNumberInput(num);
                        // Optional: automatically trigger lookup on click?
                        // handleLookup(); 
                    }}
                    className="text-[13px] px-3 py-1.5 bg-[#F2F2F7] rounded-full text-[#636366] hover:bg-[#E5E5EA] transition-colors font-mono"
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Preview */}
        {step === "preview" && caseData && (
          <div className="space-y-6">
            <CaseInfoCard data={caseData} />
            
            <div className="flex gap-3 justify-end">
              <button onClick={handleReset} className="btn-secondary h-[50px]">
                다시 입력
              </button>
              <button onClick={handleGenerate} className="btn-primary h-[50px]">
                <SparklesIcon className="w-5 h-5" />
                문제 생성하기
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Generating */}
        {step === "generating" && (
          <div className="card p-12 text-center animate-in fade-in zoom-in-95 duration-500">
            <div className="w-16 h-16 rounded-full bg-[#007AFF]/10 flex items-center justify-center mx-auto mb-6">
              <ArrowPathIcon className="w-8 h-8 text-[#007AFF] animate-spin" />
            </div>
            <h3 className="text-[20px] font-bold text-[#1C1C1E] mb-2">AI가 문제를 만들고 있어요</h3>
            <p className="text-[#8E8E93] text-[15px]">
              판례를 분석하여 변호사시험 형식으로 구성하고 있습니다.
              <br />잠시만 기다려주세요.
            </p>
          </div>
        )}

        {/* Step 4: Done */}
        {step === "done" && caseData && generatedText && (
          <div className="space-y-6">
            {/* Generated Content Display */}
            <GeneratedContent content={generatedText} />

            {/* Bottom Actions */}
            <div className="card p-5 bg-[#F9F9FB] border border-[#E5E5EA] flex flex-col sm:flex-row items-center justify-between gap-4">
              <button 
                onClick={handleReset} 
                className="text-[15px] font-medium text-[#8E8E93] hover:text-[#1C1C1E] transition-colors flex items-center gap-2"
              >
                <ArrowPathIcon className="w-4 h-4" />
                새로운 문제 만들기
              </button>
              
              <div className="flex items-center gap-3 w-full sm:w-auto">
                 <button 
                  onClick={handleGenerate} 
                  className="flex-1 sm:flex-none btn-secondary h-[44px]"
                >
                  <ArrowPathIcon className="w-4 h-4" />
                  다시 생성
                </button>
                {saved ? (
                   <button disabled className="flex-1 sm:flex-none bg-[#34C759] text-white px-5 py-2.5 rounded-full font-medium text-[15px] inline-flex items-center justify-center gap-2 cursor-default shadow-sm">
                    <CheckCircleIcon className="w-5 h-5" />
                    저장됨
                  </button>
                ) : (
                  <button 
                    onClick={handleSave} 
                    disabled={saving} 
                    className="flex-1 sm:flex-none btn-primary h-[44px] bg-[#34C759] hover:bg-[#2DB14E]"
                  >
                    {saving ? (
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <ShareIcon className="w-4 h-4" />
                        공유하기
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
