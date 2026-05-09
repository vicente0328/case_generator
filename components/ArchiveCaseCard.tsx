import { useState } from "react";
import { doc, updateDoc, deleteDoc, arrayUnion, arrayRemove, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { LawArea } from "@/lib/classifyLawArea";

export interface ArchiveMemo {
  id: string;
  text: string;
  createdAt: Timestamp | { seconds: number; nanoseconds?: number } | null;
}

export interface ArchiveCase {
  id: string;
  caseNumber: string;
  caseName: string;
  court: string;
  date: string;
  lawArea: LawArea;
  rulingPoints: string;
  rulingRatio: string;
  serialNo?: string;
  fetchedAt?: Timestamp | { seconds: number } | null;
  memos: ArchiveMemo[];
}

interface Props {
  uid: string;
  c: ArchiveCase;
  onDeleted: (id: string) => void;
  onMemosChanged: (id: string, memos: ArchiveMemo[]) => void;
}

function formatDate(d?: string): string {
  if (!d) return "";
  const s = String(d).replace(/\D/g, "");
  if (s.length === 8) return `${s.slice(0, 4)}. ${s.slice(4, 6)}. ${s.slice(6, 8)}.`;
  return d;
}

function formatMemoDate(t: ArchiveMemo["createdAt"]): string {
  if (!t) return "";
  const seconds =
    t instanceof Timestamp ? t.seconds : (t as { seconds: number }).seconds;
  if (!seconds) return "";
  const d = new Date(seconds * 1000);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yy}-${mm}-${dd} ${hh}:${min}`;
}

export default function ArchiveCaseCard({ uid, c, onDeleted, onMemosChanged }: Props) {
  const [newMemo, setNewMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [expandedPoints, setExpandedPoints] = useState(false);
  const [expandedRatio, setExpandedRatio] = useState(false);

  const docRef = doc(db, "users", uid, "myCases", c.id);

  const handleAddMemo = async () => {
    const text = newMemo.trim();
    if (!text || busy) return;
    setBusy(true);
    const memo: ArchiveMemo = {
      id: crypto.randomUUID(),
      text,
      createdAt: Timestamp.now(),
    };
    try {
      await updateDoc(docRef, { memos: arrayUnion(memo) });
      onMemosChanged(c.id, [...c.memos, memo]);
      setNewMemo("");
    } catch (e) {
      console.error("memo add failed", e);
      alert("메모 추가에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteMemo = async (memo: ArchiveMemo) => {
    if (!confirm("이 메모를 삭제하시겠습니까?")) return;
    try {
      await updateDoc(docRef, { memos: arrayRemove(memo) });
      onMemosChanged(c.id, c.memos.filter(m => m.id !== memo.id));
    } catch (e) {
      console.error("memo delete failed", e);
      alert("메모 삭제에 실패했습니다.");
    }
  };

  const handleDeleteCase = async () => {
    if (!confirm(`${c.caseNumber} 판례를 아카이브에서 삭제하시겠습니까?`)) return;
    try {
      await deleteDoc(docRef);
      onDeleted(c.id);
    } catch (e) {
      console.error("case delete failed", e);
      alert("판례 삭제에 실패했습니다.");
    }
  };

  const points = (c.rulingPoints || "").trim();
  const ratio = (c.rulingRatio || "").trim();
  const POINTS_LIMIT = 600;
  const RATIO_LIMIT = 800;

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      {/* 헤더 */}
      <div className="px-5 py-4 border-b border-zinc-100 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-bold tracking-tight font-mono text-zinc-900 break-all">
            {c.caseNumber}
          </p>
          <p className="text-[12px] text-zinc-400 mt-1">
            {[c.court, formatDate(c.date), c.caseName].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button
          onClick={handleDeleteCase}
          className="flex-shrink-0 text-[12px] text-zinc-400 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
          title="삭제"
        >
          삭제
        </button>
      </div>

      {/* 본문 — 판시사항/판결요지 인라인 */}
      <div className="px-5 py-4 space-y-4 text-[13px] leading-relaxed text-zinc-700">
        {points ? (
          <div>
            <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mb-1.5">
              판시사항
            </div>
            <div className="whitespace-pre-wrap">
              {!expandedPoints && points.length > POINTS_LIMIT
                ? points.slice(0, POINTS_LIMIT) + "…"
                : points}
            </div>
            {points.length > POINTS_LIMIT && (
              <button
                onClick={() => setExpandedPoints(v => !v)}
                className="mt-1 text-[12px] text-blue-600 hover:underline"
              >
                {expandedPoints ? "접기" : "더 보기"}
              </button>
            )}
          </div>
        ) : (
          <div className="text-[12px] text-zinc-400 italic">판시사항 정보 없음</div>
        )}

        {ratio ? (
          <div>
            <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mb-1.5">
              판결요지
            </div>
            <div className="whitespace-pre-wrap">
              {!expandedRatio && ratio.length > RATIO_LIMIT
                ? ratio.slice(0, RATIO_LIMIT) + "…"
                : ratio}
            </div>
            {ratio.length > RATIO_LIMIT && (
              <button
                onClick={() => setExpandedRatio(v => !v)}
                className="mt-1 text-[12px] text-blue-600 hover:underline"
              >
                {expandedRatio ? "접기" : "더 보기"}
              </button>
            )}
          </div>
        ) : (
          <div className="text-[12px] text-zinc-400 italic">판결요지 정보 없음</div>
        )}
      </div>

      {/* 메모 섹션 */}
      <div className="px-5 py-4 border-t border-zinc-100 bg-zinc-50/50">
        <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mb-2">
          메모 ({c.memos.length})
        </div>
        {c.memos.length > 0 && (
          <ul className="space-y-1.5 mb-3">
            {[...c.memos]
              .sort((a, b) => {
                const at = (a.createdAt as { seconds?: number })?.seconds ?? 0;
                const bt = (b.createdAt as { seconds?: number })?.seconds ?? 0;
                return bt - at;
              })
              .map(m => (
                <li
                  key={m.id}
                  className="flex items-start gap-2 text-[12px] bg-white rounded-lg px-3 py-2 border border-zinc-100"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-zinc-400 mb-0.5">
                      {formatMemoDate(m.createdAt)}
                    </div>
                    <div className="text-zinc-700 whitespace-pre-wrap break-words">{m.text}</div>
                  </div>
                  <button
                    onClick={() => handleDeleteMemo(m)}
                    className="text-zinc-300 hover:text-red-500 transition-colors text-[14px] leading-none flex-shrink-0"
                    title="메모 삭제"
                  >
                    ×
                  </button>
                </li>
              ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            value={newMemo}
            onChange={e => setNewMemo(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleAddMemo();
              }
            }}
            placeholder="새 메모 추가"
            className="flex-1 h-9 px-3 text-[13px] border border-zinc-200 rounded-lg outline-none focus:border-blue-400 transition-colors bg-white"
          />
          <button
            onClick={handleAddMemo}
            disabled={busy || !newMemo.trim()}
            className="h-9 px-4 bg-blue-900 text-white text-[12px] font-medium rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-40"
          >
            추가
          </button>
        </div>
      </div>
    </div>
  );
}
