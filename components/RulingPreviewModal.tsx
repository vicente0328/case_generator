import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

interface RulingPreviewModalProps {
  postId: string;
  caseName: string;
  caseNumber: string;
  court: string;
  date: string;
  generationComplete: boolean;
  onClose: () => void;
  onEmpty?: () => void;
}

function formatDate(d: string): string {
  const s = String(d).replace(/\D/g, "");
  if (s.length === 8) return `${s.slice(0, 4)}. ${s.slice(4, 6)}. ${s.slice(6, 8)}.`;
  return d;
}

export default function RulingPreviewModal({
  postId, caseName, caseNumber, court, date, generationComplete, onClose, onEmpty,
}: RulingPreviewModalProps) {
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<"ruling" | "analysis">("ruling");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDoc(doc(db, "posts", postId))
      .then(snap => {
        if (!snap.exists()) { onEmpty?.(); return; }
        const data = snap.data();
        const ratio = (data.rulingRatio || "").trim();
        if (ratio) {
          setPreviewText(ratio);
          setPreviewType("ruling");
        } else {
          // 판결요지가 없으면 content에서 해설/법리 부분 추출
          const content = (data.content || "") as string;
          const match = content.match(/\[해설(?:\s*및\s*모범답안)?\]([\s\S]*?)(?:\[모델\s*판례|$)/);
          if (match) {
            const extracted = match[1].trim().slice(0, 2000);
            setPreviewText(extracted);
            setPreviewType("analysis");
          } else {
            // 판결요지도 해설도 없으면 빈 콘텐츠 콜백
            onEmpty?.();
          }
        }
      })
      .catch(() => onClose())
      .finally(() => setLoading(false));
  }, [postId, onClose, onEmpty]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[480px] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
        style={{ animation: "modalIn 0.2s cubic-bezier(0.16,1,0.3,1)", maxHeight: "80vh" }}
      >
        {/* 안내 문구 */}
        <div className="px-6 py-3.5 bg-blue-50 border-b border-blue-100 flex items-center justify-between flex-shrink-0">
          <p className="text-[13px] text-blue-700 leading-relaxed">
            기다리시는 동안 다른 사건의 {previewType === "ruling" ? "판결요지" : "해설"}을 읽어보시는 건 어떨까요?
          </p>
          <button
            onClick={onClose}
            className="text-blue-400 hover:text-blue-600 transition-colors p-1 -ml-2 flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 헤더 */}
        <div className="px-6 pt-5 pb-4 border-b border-zinc-100 flex-shrink-0">
          <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">
            {previewType === "ruling" ? "판결요지 미리보기" : "해설 미리보기"}
          </span>
          <p className="text-[15px] font-bold text-zinc-900 tracking-tight font-mono mt-2.5">{caseNumber}</p>
          <p className="text-[12px] text-zinc-400 mt-1">
            {[court, date && formatDate(date), caseName].filter(Boolean).join(" · ")}
          </p>
        </div>

        {/* 본문 */}
        <div className="px-6 py-5 overflow-y-auto flex-1" style={{ maxHeight: "60vh" }}>
          {loading ? (
            <div className="space-y-2.5 animate-pulse">
              <div className="h-3.5 bg-zinc-100 rounded-full w-full" />
              <div className="h-3.5 bg-zinc-100 rounded-full w-[95%]" />
              <div className="h-3.5 bg-zinc-100 rounded-full w-[88%]" />
              <div className="h-3.5 bg-zinc-100 rounded-full w-full" />
              <div className="h-3.5 bg-zinc-100 rounded-full w-[72%]" />
            </div>
          ) : previewText ? (
            <p className="text-[14px] text-zinc-700 leading-[1.85] whitespace-pre-line">{previewText}</p>
          ) : (
            <p className="text-[13px] text-zinc-300 italic">미리보기 정보가 없습니다.</p>
          )}
        </div>

        {/* 푸터 — 생성 완료 시 */}
        {generationComplete && (
          <div className="px-6 py-4 border-t border-emerald-100 bg-emerald-50/60 flex-shrink-0"
               style={{ animation: "modalIn 0.2s cubic-bezier(0.16,1,0.3,1)" }}>
            <p className="text-[13px] text-emerald-700 mb-3">
              문제 생성이 완료되었습니다! 이 창을 닫으면 바로 확인하실 수 있습니다.
            </p>
            <button
              onClick={onClose}
              className="w-full h-10 bg-emerald-600 text-white rounded-xl text-[14px] font-semibold hover:bg-emerald-500 transition-colors"
            >
              내 문제 보러가기
            </button>
          </div>
        )}
      </div>
      <style>{`@keyframes modalIn { from { opacity:0; transform:scale(0.96) } to { opacity:1; transform:scale(1) } }`}</style>
    </div>
  );
}
