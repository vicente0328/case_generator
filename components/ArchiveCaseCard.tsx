import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  doc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  arrayRemove,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { LawArea } from "@/lib/classifyLawArea";

export interface ArchiveMemo {
  id: string;
  text: string;
  createdAt: Timestamp | { seconds: number; nanoseconds?: number } | null;
}

// 신규: { text, offset } 객체. 레거시: 문자열 — 본문 내 모든 occurrence 매칭(과거 동작).
export type HighlightItem = string | { text: string; offset: number };

export interface ArchiveHighlights {
  rulingPoints: HighlightItem[];
  rulingRatio: HighlightItem[];
}

function offsetInPlainText(container: Element, range: Range): number {
  let offset = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    if (node === range.startContainer) {
      return offset + range.startOffset;
    }
    offset += (node as Text).length;
    node = walker.nextNode();
  }
  return -1;
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
  importance?: number;
  tags?: string[];
  highlights?: ArchiveHighlights;
}

interface Props {
  uid: string;
  c: ArchiveCase;
  searchTerm: string;
  onDeleted: (id: string) => void;
  onUpdated: (id: string, partial: Partial<ArchiveCase>) => void;
  selectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
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

// 텍스트 + 영구 하이라이트 + 검색어 매치를 동시에 렌더링
// flag bitmask: 1 = highlight, 2 = search match
function renderWithHighlights(
  text: string,
  highlights: HighlightItem[],
  searchTerm: string,
  onHighlightClick: (h: HighlightItem) => void,
): ReactNode[] {
  if (!text) return [];

  const flags = new Array<number>(text.length).fill(0);
  const highlightRanges: { start: number; end: number; entry: HighlightItem }[] = [];
  for (const h of highlights) {
    if (typeof h === "string") {
      // 레거시: 본문 내 모든 occurrence (offset 정보가 없는 과거 데이터)
      if (!h) continue;
      let idx = 0;
      while (true) {
        const found = text.indexOf(h, idx);
        if (found === -1) break;
        for (let i = found; i < found + h.length; i++) flags[i] |= 1;
        highlightRanges.push({ start: found, end: found + h.length, entry: h });
        idx = found + h.length;
      }
    } else {
      // 신규: 저장된 offset 위치만 매칭 (본문이 바뀌었으면 무시)
      if (!h.text || h.offset < 0 || h.offset + h.text.length > text.length) continue;
      if (text.slice(h.offset, h.offset + h.text.length) !== h.text) continue;
      const start = h.offset;
      const end = start + h.text.length;
      for (let i = start; i < end; i++) flags[i] |= 1;
      highlightRanges.push({ start, end, entry: h });
    }
  }
  // 검색어 매치 — 대소문자 무시
  const term = searchTerm.trim();
  if (term) {
    const lower = text.toLowerCase();
    const t = term.toLowerCase();
    let idx = 0;
    while (true) {
      const found = lower.indexOf(t, idx);
      if (found === -1) break;
      for (let i = found; i < found + t.length; i++) flags[i] |= 2;
      idx = found + t.length;
    }
  }

  const result: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const f = flags[i];
    let j = i + 1;
    while (j < text.length && flags[j] === f) j++;
    const segment = text.slice(i, j);
    if (f === 0) {
      result.push(segment);
    } else {
      // 어느 highlight에 속하는지 (제거용)
      const containingHighlight = highlightRanges.find(r => r.start <= i && r.end >= j);
      const className =
        (f & 1) && (f & 2)
          ? "bg-yellow-300 ring-1 ring-blue-500 rounded px-0.5 cursor-pointer"
          : f & 2
            ? "bg-blue-200 rounded px-0.5"
            : "bg-yellow-200 rounded px-0.5 cursor-pointer hover:bg-yellow-300";
      result.push(
        <mark
          key={key++}
          className={className}
          onClick={
            (f & 1) && containingHighlight
              ? (e) => {
                  e.stopPropagation();
                  onHighlightClick(containingHighlight.entry);
                }
              : undefined
          }
          title={(f & 1) ? "클릭하여 하이라이트 제거" : undefined}
        >
          {segment}
        </mark>,
      );
    }
    i = j;
  }
  return result;
}

function StarRating({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = (hover || value) >= n;
        return (
          <button
            key={n}
            onClick={() => onChange(value === n ? 0 : n)}
            onMouseEnter={() => setHover(n)}
            className={`text-[16px] leading-none transition-colors ${
              filled ? "text-amber-400 hover:text-amber-500" : "text-zinc-300 hover:text-amber-300"
            }`}
            title={`${n}점`}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}

export default function ArchiveCaseCard({
  uid,
  c,
  searchTerm,
  onDeleted,
  onUpdated,
  selectMode = false,
  isSelected = false,
  onToggleSelect,
}: Props) {
  const [newMemo, setNewMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [collapsedPoints, setCollapsedPoints] = useState(false);
  const [collapsedRatio, setCollapsedRatio] = useState(false);
  const [pending, setPending] = useState<
    {
      text: string;
      field: "rulingPoints" | "rulingRatio";
      offset: number;
      rect: { top: number; bottom: number; left: number; width: number };
    } | null
  >(null);
  const [newTag, setNewTag] = useState("");

  const pointsRef = useRef<HTMLDivElement>(null);
  const ratioRef = useRef<HTMLDivElement>(null);

  const docRef = doc(db, "users", uid, "myCases", c.id);
  const tags = c.tags ?? [];
  const importance = c.importance ?? 0;
  const highlights: ArchiveHighlights = c.highlights ?? { rulingPoints: [], rulingRatio: [] };
  const memos = c.memos ?? [];

  // ── 메모 ──
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
      onUpdated(c.id, { memos: [...memos, memo] });
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
      onUpdated(c.id, { memos: memos.filter(m => m.id !== memo.id) });
    } catch (e) {
      console.error("memo delete failed", e);
      alert("메모 삭제에 실패했습니다.");
    }
  };

  // ── 카드 삭제 ──
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

  // ── 별점 ──
  const handleImportance = async (v: number) => {
    try {
      await updateDoc(docRef, { importance: v });
      onUpdated(c.id, { importance: v });
    } catch (e) {
      console.error("importance update failed", e);
    }
  };

  // ── 태그 ──
  const handleAddTag = async () => {
    const t = newTag.trim();
    if (!t || tags.includes(t)) return;
    try {
      await updateDoc(docRef, { tags: arrayUnion(t) });
      onUpdated(c.id, { tags: [...tags, t] });
      setNewTag("");
    } catch (e) {
      console.error("tag add failed", e);
    }
  };
  const handleRemoveTag = async (t: string) => {
    try {
      await updateDoc(docRef, { tags: arrayRemove(t) });
      onUpdated(c.id, { tags: tags.filter(x => x !== t) });
    } catch (e) {
      console.error("tag remove failed", e);
    }
  };

  // ── 하이라이트 ──
  // selection 변경을 한 곳에서 추적 — 데스크톱(드래그)·모바일(handle 조정) 모두 실시간 반영
  useEffect(() => {
    let frame = 0;
    const onChange = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
          setPending(null);
          return;
        }
        const text = sel.toString().trim();
        if (text.length < 2) {
          setPending(null);
          return;
        }
        const range = sel.getRangeAt(0);
        const inPoints = pointsRef.current?.contains(range.commonAncestorContainer);
        const inRatio = ratioRef.current?.contains(range.commonAncestorContainer);
        if (!inPoints && !inRatio) {
          setPending(null);
          return;
        }
        const field: "rulingPoints" | "rulingRatio" = inPoints ? "rulingPoints" : "rulingRatio";
        const container = (inPoints ? pointsRef.current : ratioRef.current)!;
        const offset = offsetInPlainText(container, range);
        if (offset < 0) {
          setPending(null);
          return;
        }
        const r = range.getBoundingClientRect();
        setPending({
          text,
          field,
          offset,
          rect: { top: r.top, bottom: r.bottom, left: r.left, width: r.width },
        });
      });
    };
    document.addEventListener("selectionchange", onChange);
    return () => {
      document.removeEventListener("selectionchange", onChange);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const addHighlight = async () => {
    if (!pending) return;
    const arr = highlights[pending.field];
    const exists = arr.some(h =>
      typeof h !== "string" && h.text === pending.text && h.offset === pending.offset,
    );
    if (exists) {
      setPending(null);
      return;
    }
    const newEntry: HighlightItem = { text: pending.text, offset: pending.offset };
    const newHighlights: ArchiveHighlights = {
      rulingPoints: [...highlights.rulingPoints],
      rulingRatio: [...highlights.rulingRatio],
    };
    newHighlights[pending.field] = [...arr, newEntry];
    try {
      await updateDoc(docRef, { highlights: newHighlights });
      onUpdated(c.id, { highlights: newHighlights });
      window.getSelection()?.removeAllRanges();
      setPending(null);
    } catch (e) {
      console.error("highlight add failed", e);
      alert("하이라이트 추가에 실패했습니다.");
    }
  };

  const removeHighlight = async (field: "rulingPoints" | "rulingRatio", entry: HighlightItem) => {
    if (!confirm("이 하이라이트를 제거하시겠습니까?")) return;
    const newHighlights: ArchiveHighlights = {
      rulingPoints: [...highlights.rulingPoints],
      rulingRatio: [...highlights.rulingRatio],
    };
    newHighlights[field] = newHighlights[field].filter(h => {
      if (typeof h === "string" && typeof entry === "string") return h !== entry;
      if (typeof h !== "string" && typeof entry !== "string") {
        return !(h.text === entry.text && h.offset === entry.offset);
      }
      return true;
    });
    try {
      await updateDoc(docRef, { highlights: newHighlights });
      onUpdated(c.id, { highlights: newHighlights });
    } catch (e) {
      console.error("highlight remove failed", e);
    }
  };

  const points = (c.rulingPoints || "").trim();
  const ratio = (c.rulingRatio || "").trim();

  return (
    <div
      className={`bg-white rounded-2xl border overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.06)] transition-colors ${
        selectMode && isSelected
          ? "border-blue-500 ring-2 ring-blue-200"
          : "border-zinc-200"
      }`}
    >
      {/* 헤더 */}
      <div className="px-5 py-4 border-b border-zinc-100 flex items-start justify-between gap-3">
        {selectMode && (
          <button
            onClick={() => onToggleSelect?.(c.id)}
            className={`flex-shrink-0 mt-1 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              isSelected
                ? "bg-blue-600 border-blue-600"
                : "border-zinc-300 hover:border-blue-500"
            }`}
            aria-label={isSelected ? "선택 해제" : "선택"}
          >
            {isSelected && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold tracking-tight font-mono text-zinc-900 break-all">
            {c.caseNumber}
          </p>
          <p className="text-[12px] text-zinc-400 mt-1">
            {[c.court, formatDate(c.date), c.caseName].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-2">
            <StarRating value={importance} onChange={handleImportance} />
          </div>
        </div>
        {!selectMode && (
          <button
            onClick={handleDeleteCase}
            className="flex-shrink-0 text-[12px] text-zinc-400 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
            title="삭제"
          >
            삭제
          </button>
        )}
      </div>

      {/* 태그 */}
      <div className="px-5 pt-3 pb-3 border-b border-zinc-100 flex flex-wrap items-center gap-1.5">
        {tags.map(t => (
          <span
            key={t}
            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600"
          >
            #{t}
            <button
              onClick={() => handleRemoveTag(t)}
              className="text-zinc-400 hover:text-red-500 leading-none"
              title="태그 제거"
            >
              ×
            </button>
          </span>
        ))}
        <div className="inline-flex items-center gap-1">
          <input
            value={newTag}
            onChange={e => setNewTag(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleAddTag();
              }
            }}
            placeholder="+ 태그"
            className="h-6 px-2 text-[11px] border border-zinc-200 rounded-full outline-none focus:border-blue-400 transition-colors w-20"
          />
        </div>
      </div>

      {/* 본문 — 판시사항 / 판결요지 (각각 접기 + 하이라이트) */}
      <div className="px-5 py-4 space-y-4 text-[15px] leading-[1.7] text-zinc-800">
        {/* 판시사항 */}
        <div>
          <button
            onClick={() => setCollapsedPoints(v => !v)}
            className="w-full flex items-center justify-between text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mb-1.5 hover:text-zinc-700 transition-colors"
          >
            <span>판시사항</span>
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform ${collapsedPoints ? "" : "rotate-180"}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {!collapsedPoints && (
            points ? (
              <div
                ref={pointsRef}
                className="whitespace-pre-wrap selection:bg-blue-100"
              >
                {renderWithHighlights(
                  points,
                  highlights.rulingPoints,
                  searchTerm,
                  (h) => removeHighlight("rulingPoints", h),
                )}
              </div>
            ) : (
              <div className="text-[13px] text-zinc-400 italic">판시사항 정보 없음</div>
            )
          )}
        </div>

        {/* 판결요지 */}
        <div>
          <button
            onClick={() => setCollapsedRatio(v => !v)}
            className="w-full flex items-center justify-between text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mb-1.5 hover:text-zinc-700 transition-colors"
          >
            <span>판결요지</span>
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform ${collapsedRatio ? "" : "rotate-180"}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {!collapsedRatio && (
            ratio ? (
              <div
                ref={ratioRef}
                className="whitespace-pre-wrap selection:bg-blue-100"
              >
                {renderWithHighlights(
                  ratio,
                  highlights.rulingRatio,
                  searchTerm,
                  (h) => removeHighlight("rulingRatio", h),
                )}
              </div>
            ) : (
              <div className="text-[13px] text-zinc-400 italic">판결요지 정보 없음</div>
            )
          )}
        </div>

      </div>
      {pending && typeof window !== "undefined" &&
        createPortal(
          (() => {
            const BTN_H = 36;
            const GAP = 8;
            // 위쪽 공간이 부족하면 선택 영역 아래로 뒤집기
            const flipBelow = pending.rect.top < BTN_H + GAP + 4;
            const top = flipBelow
              ? pending.rect.bottom + window.scrollY + GAP
              : pending.rect.top + window.scrollY - BTN_H - GAP;
            // 가로 중앙 + 뷰포트 좌우 클램프
            const centerX = pending.rect.left + window.scrollX + pending.rect.width / 2;
            const minX = window.scrollX + 12;
            const maxX = window.scrollX + window.innerWidth - 12;
            const left = Math.max(minX, Math.min(centerX, maxX));
            return (
              <div
                data-highlight-popover
                style={{ position: "absolute", top, left, transform: "translateX(-50%)", zIndex: 50 }}
                className="animate-in fade-in zoom-in-95 duration-100 ease-out will-change-transform"
              >
                <button
                  onMouseDown={e => e.preventDefault()}
                  onTouchStart={e => e.stopPropagation()}
                  onClick={addHighlight}
                  className="px-3.5 h-9 bg-yellow-300 hover:bg-yellow-400 active:bg-yellow-400 text-zinc-900 text-[12px] font-semibold rounded-full shadow-lg ring-1 ring-yellow-500/20 transition-colors flex items-center gap-1.5 whitespace-nowrap touch-manipulation"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11l-6 6v3h3l6-6"/>
                    <path d="M14 7l3-3 3 3-3 3z"/>
                    <path d="M9 11l5-5 4 4-5 5z"/>
                  </svg>
                  형광펜
                </button>
              </div>
            );
          })(),
          document.body,
        )}

      {/* 메모 섹션 */}
      <div className="px-5 py-4 border-t border-zinc-100 bg-zinc-50/50">
        <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mb-2">
          메모 ({memos.length})
        </div>
        {memos.length > 0 && (
          <ul className="space-y-1.5 mb-3">
            {[...memos]
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
