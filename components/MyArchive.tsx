import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { useAuth } from "@/lib/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { classifyLawArea, type LawArea } from "@/lib/classifyLawArea";
import ArchiveCaseCard, { type ArchiveCase } from "./ArchiveCaseCard";
import type { BulkLookupResponse } from "@/pages/api/case-bulk-lookup";

const AREAS: LawArea[] = ["민사법", "공법", "형사법"];

const AREA_STYLE: Record<LawArea, { tab: string; tabActive: string; badge: string }> = {
  민사법: {
    tab: "text-blue-700 hover:bg-blue-50",
    tabActive: "bg-blue-900 text-white shadow-sm",
    badge: "bg-blue-50 text-blue-700",
  },
  공법: {
    tab: "text-violet-700 hover:bg-violet-50",
    tabActive: "bg-violet-900 text-white shadow-sm",
    badge: "bg-violet-50 text-violet-700",
  },
  형사법: {
    tab: "text-amber-700 hover:bg-amber-50",
    tabActive: "bg-amber-900 text-white shadow-sm",
    badge: "bg-amber-50 text-amber-700",
  },
};

type SortMode = "dateDesc" | "addedDesc" | "importanceDesc";

function normalizeId(cn: string): string {
  // 사건번호를 doc ID로 사용 가능한 형태로: 한글/숫자만 + 2자리 연도 → 4자리
  const s = cn.replace(/[^가-힣0-9]/g, "");
  return s.replace(/^(\d{2})([가-힣])/, (_, yr, type) => {
    const y = parseInt(yr, 10);
    return `${y >= 90 ? 1900 + y : 2000 + y}${type}`;
  });
}

function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

function applyHighlightsHtml(text: string, highlights: string[]): string {
  if (!text) return "";
  if (!highlights || highlights.length === 0) return escHtml(text);
  const flags = new Array<number>(text.length).fill(0);
  for (const h of highlights) {
    if (!h) continue;
    let idx = 0;
    while (true) {
      const found = text.indexOf(h, idx);
      if (found === -1) break;
      for (let i = found; i < found + h.length; i++) flags[i] = 1;
      idx = found + h.length;
    }
  }
  let out = "";
  let i = 0;
  while (i < text.length) {
    const f = flags[i];
    let j = i + 1;
    while (j < text.length && flags[j] === f) j++;
    const seg = escHtml(text.slice(i, j));
    out += f ? `<mark>${seg}</mark>` : seg;
    i = j;
  }
  return out;
}

function formatPdfDate(d?: string): string {
  if (!d) return "";
  const s = String(d).replace(/\D/g, "");
  if (s.length === 8) return `${s.slice(0, 4)}. ${s.slice(4, 6)}. ${s.slice(6, 8)}.`;
  return d;
}

function formatMemoTs(t: unknown): string {
  const seconds = (t as { seconds?: number } | null)?.seconds;
  if (!seconds) return "";
  const d = new Date(seconds * 1000);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function buildPrintHtml(items: ArchiveCase[]): string {
  const today = new Date();
  const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const sections = items
    .map(c => {
      const meta = [c.court, formatPdfDate(c.date), c.caseName].filter(Boolean).join(" · ");
      const stars = c.importance && c.importance > 0
        ? `<div class="stars">${"★".repeat(c.importance)}<span class="stars-empty">${"★".repeat(5 - c.importance)}</span></div>`
        : "";
      const tags = c.tags && c.tags.length > 0
        ? `<div class="tags">${c.tags.map(t => `<span class="tag">#${escHtml(t)}</span>`).join("")}</div>`
        : "";
      const points = (c.rulingPoints || "").trim();
      const ratio = (c.rulingRatio || "").trim();
      const pointsHtml = points
        ? `<h2>판시사항</h2><div class="body">${applyHighlightsHtml(points, c.highlights?.rulingPoints ?? [])}</div>`
        : "";
      const ratioHtml = ratio
        ? `<h2>판결요지</h2><div class="body">${applyHighlightsHtml(ratio, c.highlights?.rulingRatio ?? [])}</div>`
        : "";
      const memos = (c.memos ?? []).slice().sort((a, b) => {
        const at = (a.createdAt as { seconds?: number } | null)?.seconds ?? 0;
        const bt = (b.createdAt as { seconds?: number } | null)?.seconds ?? 0;
        return at - bt;
      });
      const memosHtml = memos.length > 0
        ? `<div class="memos"><h2>메모</h2>${memos
            .map(m => `<div class="memo"><span class="date">${escHtml(formatMemoTs(m.createdAt))}</span>${escHtml(m.text)}</div>`)
            .join("")}</div>`
        : "";
      return `<section class="case">
        <div class="case-num">${escHtml(c.caseNumber)}</div>
        <div class="meta">${escHtml(meta)}</div>
        ${stars}
        ${tags}
        ${pointsHtml}
        ${ratioHtml}
        ${memosHtml}
      </section>`;
    })
    .join("");
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"/>
<title>My Archive — ${items.length}건 (${stamp})</title>
<style>
  @page { size: A4; margin: 18mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "맑은 고딕", "Malgun Gothic", "Noto Sans KR", sans-serif; color: #18181b; line-height: 1.65; font-size: 11pt; margin: 0; }
  h1 { font-size: 16pt; margin: 0 0 4pt; font-weight: 700; }
  .header { border-bottom: 2px solid #18181b; padding-bottom: 8pt; margin-bottom: 16pt; }
  .header .sub { color: #71717a; font-size: 10pt; }
  .case { page-break-after: always; }
  .case:last-child { page-break-after: auto; }
  .case-num { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 13pt; font-weight: 700; }
  .meta { color: #71717a; font-size: 10pt; margin: 2pt 0 4pt; }
  .stars { color: #f59e0b; font-size: 11pt; letter-spacing: 1pt; }
  .stars-empty { color: #e4e4e7; }
  h2 { font-size: 9pt; color: #71717a; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; margin: 12pt 0 4pt; }
  .body { white-space: pre-wrap; word-break: keep-all; }
  mark { background: #fef08a; padding: 0 1px; }
  .tags { margin-top: 6pt; }
  .tag { display: inline-block; background: #f4f4f5; color: #52525b; font-size: 9pt; padding: 1pt 6pt; border-radius: 999px; margin: 0 3pt 3pt 0; }
  .memos { margin-top: 10pt; padding-top: 6pt; border-top: 1px solid #e4e4e7; }
  .memo { font-size: 10pt; margin-bottom: 3pt; white-space: pre-wrap; }
  .memo .date { color: #a1a1aa; font-size: 9pt; margin-right: 6pt; font-family: ui-monospace, monospace; }
  @media print { .no-print { display: none; } }
</style>
</head><body>
<div class="header"><h1>My Archive — 판례 ${items.length}건</h1><div class="sub">${stamp}</div></div>
${sections}
<script>window.addEventListener("load", function(){ setTimeout(function(){ window.print(); }, 250); });</script>
</body></html>`;
}

export default function MyArchive() {
  const { user } = useAuth();
  const [cases, setCases] = useState<ArchiveCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [report, setReport] = useState<{ ok: number; failed: { input: string; error: string }[] } | null>(null);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("dateDesc");
  const [activeArea, setActiveArea] = useState<LawArea>("민사법");
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set());
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 초기 로드
  useEffect(() => {
    if (!user) {
      setLoading(false);
      setCases([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const snap = await getDocs(query(collection(db, "users", user.uid, "myCases")));
        const list: ArchiveCase[] = snap.docs.map(d => {
          const data = d.data() as Omit<ArchiveCase, "id">;
          return {
            id: d.id,
            caseNumber: data.caseNumber,
            caseName: data.caseName ?? "",
            court: data.court ?? "",
            date: data.date ?? "",
            lawArea: data.lawArea ?? "민사법",
            rulingPoints: data.rulingPoints ?? "",
            rulingRatio: data.rulingRatio ?? "",
            serialNo: data.serialNo,
            fetchedAt: data.fetchedAt ?? null,
            memos: Array.isArray(data.memos) ? data.memos : [],
            importance: typeof data.importance === "number" ? data.importance : 0,
            tags: Array.isArray(data.tags) ? data.tags : [],
            highlights: data.highlights ?? { rulingPoints: [], rulingRatio: [] },
          };
        });
        if (!cancelled) setCases(list);
      } catch (e) {
        console.error("myCases load failed", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleSubmit = async (overrideTokens?: string[]) => {
    if (!user || submitting) return;
    const tokens = (overrideTokens ?? input.split(/[\n,;\s]+/))
      .map(s => s.trim())
      .filter(Boolean);
    if (tokens.length === 0) return;

    setSubmitting(true);
    setReport(null);
    setDuplicates([]);
    try {
      const res = await fetch("/api/case-bulk-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseNumbers: tokens }),
      });
      const data = (await res.json()) as BulkLookupResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "조회 실패");
      }

      // 성공 건 Firestore 저장 + 로컬 상태 반영
      const now = Timestamp.now();
      const newOrUpdated: ArchiveCase[] = [];
      for (const item of data.ok) {
        const id = normalizeId(item.data.caseNumber || item.input);
        const lawArea = classifyLawArea(item.data.caseNumber || item.input);
        const docRef = doc(db, "users", user.uid, "myCases", id);
        // 기존 문서가 있으면 메모 보존 (merge)
        const existing = cases.find(c => c.id === id);
        const payload = {
          caseNumber: item.data.caseNumber || item.input,
          caseName: item.data.caseName || "",
          court: item.data.court || "",
          date: item.data.date || "",
          lawArea,
          rulingPoints: item.data.rulingPoints || "",
          rulingRatio: item.data.rulingRatio || "",
          serialNo: item.data.serialNo || "",
          fetchedAt: serverTimestamp(),
        };
        try {
          await setDoc(docRef, existing ? payload : { ...payload, memos: [] }, { merge: true });
          newOrUpdated.push({
            id,
            ...payload,
            fetchedAt: now,
            memos: existing?.memos ?? [],
          });
        } catch (e) {
          console.error("myCase save failed", id, e);
        }
      }

      setCases(prev => {
        const map = new Map(prev.map(c => [c.id, c]));
        for (const c of newOrUpdated) map.set(c.id, c);
        return Array.from(map.values());
      });
      setReport({ ok: data.ok.length, failed: data.failed });
      if (data.failed.length === 0) setInput("");
    } catch (e) {
      setReport({
        ok: 0,
        failed: tokens.map(t => ({ input: t, error: e instanceof Error ? e.message : "오류" })),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleted = (id: string) => {
    setCases(prev => prev.filter(c => c.id !== id));
    setSelected(prev => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const handleBulkDelete = async (visibleIds: string[]) => {
    if (!user || selected.size === 0 || bulkBusy) return;
    const ids = visibleIds.filter(id => selected.has(id));
    if (ids.length === 0) return;
    if (!confirm(`선택된 ${ids.length}건을 아카이브에서 삭제하시겠습니까?`)) return;
    setBulkBusy(true);
    const failed: string[] = [];
    await Promise.all(
      ids.map(async id => {
        try {
          await deleteDoc(doc(db, "users", user.uid, "myCases", id));
        } catch (e) {
          console.error("bulk delete failed", id, e);
          failed.push(id);
        }
      }),
    );
    const succeeded = new Set(ids.filter(id => !failed.includes(id)));
    setCases(prev => prev.filter(c => !succeeded.has(c.id)));
    setSelected(prev => {
      const next = new Set(prev);
      for (const id of succeeded) next.delete(id);
      return next;
    });
    setBulkBusy(false);
    if (failed.length > 0) {
      alert(`${failed.length}건 삭제에 실패했습니다.`);
    } else {
      setSelectMode(false);
    }
  };

  const handleBulkExportPdf = (items: ArchiveCase[]) => {
    if (items.length === 0) return;
    const html = buildPrintHtml(items);
    const w = window.open("", "_blank");
    if (!w) {
      alert("팝업이 차단되었습니다. 팝업을 허용한 뒤 다시 시도해주세요.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  const handleUpdated = (id: string, partial: Partial<ArchiveCase>) => {
    setCases(prev => prev.map(c => (c.id === id ? { ...c, ...partial } : c)));
  };

  // 이미지 → 1500px 리사이즈 → JPEG base64 (data URL)
  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const MAX = 1500;
          const ratio = Math.min(1, MAX / Math.max(img.width, img.height));
          const w = Math.round(img.width * ratio);
          const h = Math.round(img.height * ratio);
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("canvas context 실패"));
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
        img.onerror = () => reject(new Error("이미지 로드 실패"));
        img.src = reader.result as string;
      };
      reader.onerror = () => reject(new Error("파일 읽기 실패"));
      reader.readAsDataURL(file);
    });

  const handleImageExtract = async (file: File) => {
    if (!user || extracting || submitting) return;
    setExtracting(true);
    setExtractError(null);
    setReport(null);
    setDuplicates([]);
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await fetch("/api/extract-case-numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const data = (await res.json()) as { caseNumbers?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "추출 실패");
      const numbers = data.caseNumbers ?? [];
      if (numbers.length === 0) {
        setExtractError("사건번호를 찾지 못했습니다. 다시 찍거나 직접 입력해주세요.");
      } else {
        // textarea 에 채워두고 사용자 확인 후 직접 list-up 하도록 둠
        setInput(numbers.join("\n"));
        // 이미 아카이브에 있는 사건번호 표시 — 사용자가 제외 선택 가능
        const existingIds = new Set(cases.map(c => c.id));
        const dupes = numbers.filter(n => existingIds.has(normalizeId(n)));
        setDuplicates(dupes);
      }
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : "이미지 처리 중 오류가 발생했습니다.");
    } finally {
      setExtracting(false);
    }
  };

  // 전체 태그 (해당 법역 내)
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of cases) {
      if (c.lawArea !== activeArea) continue;
      for (const t of c.tags ?? []) set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [cases, activeArea]);

  // 검색/정렬/필터링
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const inArea = cases.filter(c => c.lawArea === activeArea);
    const tagged = tagFilter.size === 0
      ? inArea
      : inArea.filter(c => (c.tags ?? []).some(t => tagFilter.has(t)));
    const matched = s
      ? tagged.filter(c =>
          (c.caseNumber + " " + c.caseName + " " + c.rulingPoints + " " + c.rulingRatio + " " + (c.tags ?? []).join(" "))
            .toLowerCase()
            .includes(s)
        )
      : tagged;
    const sorted = [...matched].sort((a, b) => {
      if (sortMode === "importanceDesc") {
        const ai = a.importance ?? 0;
        const bi = b.importance ?? 0;
        if (ai !== bi) return bi - ai;
      }
      if (sortMode === "dateDesc") {
        const ad = (a.date || "").replace(/\D/g, "");
        const bd = (b.date || "").replace(/\D/g, "");
        if (ad !== bd) return bd.localeCompare(ad);
      }
      const at = (a.fetchedAt as { seconds?: number })?.seconds ?? 0;
      const bt = (b.fetchedAt as { seconds?: number })?.seconds ?? 0;
      return bt - at;
    });
    return sorted;
  }, [cases, search, sortMode, activeArea, tagFilter]);

  const counts = useMemo(() => {
    const c: Record<LawArea, number> = { 민사법: 0, 공법: 0, 형사법: 0 };
    for (const x of cases) c[x.lawArea] = (c[x.lawArea] ?? 0) + 1;
    return c;
  }, [cases]);

  if (!user) {
    return (
      <div className="py-12 text-center text-zinc-500 text-sm">
        로그인 후 이용해주세요.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 일괄 입력 */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">
              사건번호 일괄 입력
            </span>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={extracting || submitting}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="사진에서 사건번호 추출"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
              <circle cx="12" cy="13" r="3"/>
            </svg>
            사진에서 추출
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // 같은 파일 재선택 가능하도록
            if (file) await handleImageExtract(file);
          }}
        />
        {extracting && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-blue-50 border border-blue-100 text-[12px] text-blue-700 flex items-center gap-2">
            <span className="w-3 h-3 border-2 border-blue-300 border-t-blue-700 rounded-full animate-spin" />
            사진에서 사건번호 인식 중...
          </div>
        )}
        {extractError && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-100 text-[12px] text-amber-700 flex items-start justify-between gap-2">
            <span>⚠ {extractError}</span>
            <button
              onClick={() => setExtractError(null)}
              className="text-amber-400 hover:text-amber-700 leading-none"
              aria-label="닫기"
            >
              ×
            </button>
          </div>
        )}
        {duplicates.length > 0 && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-[12px] text-zinc-700">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <span>
                <span className="font-semibold text-zinc-900">{duplicates.length}건</span>이 이미 아카이브에 있습니다
              </span>
              <button
                onClick={() => setDuplicates([])}
                className="text-zinc-400 hover:text-zinc-700 leading-none"
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <div className="font-mono text-[11px] text-zinc-500 break-all mb-2">
              {duplicates.join(", ")}
            </div>
            <button
              onClick={() => {
                const dupSet = new Set(duplicates.map(normalizeId));
                const remaining = input
                  .split(/[\n,;\s]+/)
                  .map(s => s.trim())
                  .filter(Boolean)
                  .filter(n => !dupSet.has(normalizeId(n)));
                setInput(remaining.join("\n"));
                setDuplicates([]);
              }}
              className="h-7 px-2.5 text-[11px] font-medium text-zinc-700 bg-white hover:bg-zinc-100 border border-zinc-200 rounded-md transition-colors"
            >
              중복 제외하고 채우기
            </button>
          </div>
        )}
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={"한 줄에 하나씩, 또는 쉼표·공백으로 구분\n예) 2016다271226\n     2019두49953\n     2022도5827"}
          rows={5}
          className="w-full text-[13px] font-mono px-3 py-2.5 border border-zinc-200 rounded-lg outline-none focus:border-blue-400 transition-colors resize-y"
        />
        <div className="flex items-center justify-between mt-3 gap-3">
          <p className="text-[11px] text-zinc-400">
            {input.split(/[\n,;\s]+/).filter(Boolean).length}건 입력됨 (최대 100건)
          </p>
          <button
            onClick={() => handleSubmit()}
            disabled={submitting || !input.trim()}
            className="h-9 px-5 bg-blue-900 text-white text-[13px] font-medium rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-40"
          >
            {submitting ? "조회 중..." : "list-up 시작"}
          </button>
        </div>

        {report && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                성공 {report.ok}
              </span>
              {report.failed.length > 0 && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                  실패 {report.failed.length}
                </span>
              )}
            </div>
            {report.failed.length > 0 && (
              <ul className="text-[12px] text-zinc-500 space-y-0.5">
                {report.failed.map((f, i) => (
                  <li key={i} className="font-mono">
                    <span className="text-red-500">×</span> {f.input}{" "}
                    <span className="text-zinc-400">— {f.error}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* 검색 + 정렬 */}
      <div className="flex items-center gap-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="사건번호·사건명·본문 검색"
          className="flex-1 h-9 px-3 text-[13px] border border-zinc-200 rounded-lg outline-none focus:border-blue-400 transition-colors bg-white"
        />
        <select
          value={sortMode}
          onChange={e => setSortMode(e.target.value as SortMode)}
          className="h-9 px-3 text-[13px] border border-zinc-200 rounded-lg outline-none focus:border-blue-400 transition-colors bg-white"
        >
          <option value="dateDesc">선고일 최신순</option>
          <option value="importanceDesc">중요도 높은 순</option>
          <option value="addedDesc">추가 최신순</option>
        </select>
      </div>

      {/* 3분할 탭 */}
      <div className="flex gap-1.5 bg-zinc-100 p-1 rounded-xl">
        {AREAS.map(area => {
          const active = activeArea === area;
          const style = AREA_STYLE[area];
          return (
            <button
              key={area}
              onClick={() => {
                setActiveArea(area);
                setTagFilter(new Set());
                setSelected(new Set());
              }}
              className={`flex-1 h-9 rounded-lg text-[13px] font-medium transition-all flex items-center justify-center gap-2 ${
                active ? style.tabActive : style.tab
              }`}
            >
              <span>{area}</span>
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  active ? "bg-white/20 text-white" : style.badge
                }`}
              >
                {counts[area]}
              </span>
            </button>
          );
        })}
      </div>

      {/* 태그 필터 */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mr-1">
            태그
          </span>
          {allTags.map(t => {
            const active = tagFilter.has(t);
            return (
              <button
                key={t}
                onClick={() =>
                  setTagFilter(prev => {
                    const next = new Set(prev);
                    if (next.has(t)) next.delete(t);
                    else next.add(t);
                    return next;
                  })
                }
                className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                  active
                    ? "bg-blue-900 text-white border-blue-900"
                    : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"
                }`}
              >
                #{t}
              </button>
            );
          })}
          {tagFilter.size > 0 && (
            <button
              onClick={() => setTagFilter(new Set())}
              className="text-[11px] text-zinc-400 hover:text-zinc-700 transition-colors ml-1"
            >
              초기화
            </button>
          )}
        </div>
      )}

      {/* 선택 모드 툴바 */}
      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          {!selectMode ? (
            <button
              onClick={() => setSelectMode(true)}
              className="text-[12px] font-medium text-zinc-600 hover:text-zinc-900 transition-colors inline-flex items-center gap-1.5 h-8 px-3 rounded-lg hover:bg-zinc-100"
              title="여러 판례 선택"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <polyline points="9 11 12 14 17 9"/>
              </svg>
              선택
            </button>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[12px] font-semibold text-zinc-900">
                  {(() => {
                    const visibleSelected = filtered.filter(c => selected.has(c.id)).length;
                    return `${visibleSelected}건 선택됨`;
                  })()}
                </span>
                <button
                  onClick={() => {
                    const allSelected = filtered.every(c => selected.has(c.id));
                    if (allSelected) {
                      setSelected(prev => {
                        const next = new Set(prev);
                        for (const c of filtered) next.delete(c.id);
                        return next;
                      });
                    } else {
                      setSelected(prev => {
                        const next = new Set(prev);
                        for (const c of filtered) next.add(c.id);
                        return next;
                      });
                    }
                  }}
                  className="text-[12px] text-zinc-600 hover:text-zinc-900 transition-colors h-7 px-2 rounded-md hover:bg-zinc-100"
                >
                  {filtered.every(c => selected.has(c.id)) ? "전체 해제" : "전체 선택"}
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    const items = filtered.filter(c => selected.has(c.id));
                    handleBulkExportPdf(items);
                  }}
                  disabled={selected.size === 0 || bulkBusy}
                  className="h-8 px-3 text-[12px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  PDF 내보내기
                </button>
                <button
                  onClick={() => handleBulkDelete(filtered.map(c => c.id))}
                  disabled={selected.size === 0 || bulkBusy}
                  className="h-8 px-3 text-[12px] font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {bulkBusy ? "삭제 중..." : "삭제"}
                </button>
                <button
                  onClick={exitSelectMode}
                  disabled={bulkBusy}
                  className="h-8 px-3 text-[12px] font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors disabled:opacity-40"
                >
                  취소
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* 리스트 */}
      <div className="space-y-3">
        {loading ? (
          <p className="text-center text-[13px] text-zinc-400 py-12">불러오는 중...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-[13px] text-zinc-400 py-12">
            {cases.length === 0
              ? "아직 아카이브에 추가된 판례가 없습니다."
              : search.trim()
                ? "검색 결과가 없습니다."
                : `${activeArea} 영역에 추가된 판례가 없습니다.`}
          </p>
        ) : (
          filtered.map(c => (
            <ArchiveCaseCard
              key={c.id}
              uid={user.uid}
              c={c}
              searchTerm={search}
              onDeleted={handleDeleted}
              onUpdated={handleUpdated}
              selectMode={selectMode}
              isSelected={selected.has(c.id)}
              onToggleSelect={toggleSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}
