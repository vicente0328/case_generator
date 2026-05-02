import { useState, useEffect } from "react";
import { auth } from "@/lib/firebase";
import type { FetchResult, FetchedCase } from "@/pages/api/admin/fetch-important-cases";
import type { LawArea } from "@/lib/classifyLawArea";

interface Props {
  onAppendCases: (caseNumbers: string[]) => void;
  refreshSignal?: number; // 외부에서 List-up 발생 시 증가시켜 재조회 트리거
}

const AREA_STYLE: Record<LawArea, { badge: string; header: string; border: string }> = {
  민사법: { badge: "bg-blue-50 text-blue-700 border-blue-200", header: "text-blue-800", border: "border-blue-100" },
  공법: { badge: "bg-violet-50 text-violet-700 border-violet-200", header: "text-violet-800", border: "border-violet-100" },
  형사법: { badge: "bg-amber-50 text-amber-700 border-amber-200", header: "text-amber-800", border: "border-amber-100" },
};

function formatDate(d?: string): string {
  if (!d) return "";
  const s = String(d).replace(/\D/g, "");
  if (s.length === 8) return `${s.slice(0, 4)}. ${s.slice(4, 6)}. ${s.slice(6, 8)}.`;
  return d;
}

// ── 판결요지 모달 ─────────────────────────────────────────────────────────────
function RulingDetailModal({ c, onClose }: { c: FetchedCase; onClose: () => void }) {
  const [points, setPoints] = useState((c.rulingPoints || "").trim());
  const [ratio, setRatio] = useState((c.rulingRatio || "").trim());
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");

  // DB에 텍스트가 없으면 (legacy 문서) /api/case-lookup 으로 즉시 폴백 조회
  const fetchLive = async () => {
    setFetching(true);
    setFetchError("");
    try {
      const res = await fetch(`/api/case-lookup?caseNumber=${encodeURIComponent(c.caseNumber)}`);
      const data = await res.json() as { rulingPoints?: string; rulingRatio?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "법제처 조회 실패");
      setPoints((data.rulingPoints || "").trim());
      setRatio((data.rulingRatio || "").trim());
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setFetching(false);
    }
  };

  // 마운트 시 텍스트 비어있으면 자동 폴백 (legacy DB 문서 보정)
  useEffect(() => {
    if (!points && !ratio) void fetchLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[640px] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: "85vh" }}
      >
        {/* 헤더 */}
        <div className="px-6 pt-5 pb-4 border-b border-zinc-100 flex-shrink-0 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">판례 상세</span>
            <p className="text-[15px] font-bold text-zinc-900 tracking-tight font-mono mt-2.5 break-all">{c.caseNumber}</p>
            <p className="text-[12px] text-zinc-400 mt-1">
              {[c.court, c.date && formatDate(c.date), c.caseName].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors p-1 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 본문 */}
        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-5">
          {fetching && !points && !ratio && (
            <div className="flex items-center gap-2 text-[12px] text-zinc-400">
              <span className="w-3 h-3 border-2 border-zinc-200 border-t-zinc-500 rounded-full animate-spin" />
              법제처에서 본문을 가져오는 중…
            </div>
          )}
          {fetchError && (
            <div className="px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
              <p className="text-[12px] text-red-600">{fetchError}</p>
            </div>
          )}
          {points && (
            <div>
              <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide mb-2">판시사항</p>
              <p className="text-[13px] text-zinc-700 leading-[1.85] whitespace-pre-line">{points}</p>
            </div>
          )}
          {ratio && (
            <div>
              <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide mb-2">판결요지</p>
              <p className="text-[14px] text-zinc-700 leading-[1.85] whitespace-pre-line">{ratio}</p>
            </div>
          )}
          {!points && !ratio && !fetching && !fetchError && (
            <p className="text-[13px] text-zinc-300 italic">판결요지·판시사항 정보가 없습니다.</p>
          )}
        </div>

        {/* 푸터 — 재조회 버튼 */}
        <div className="px-6 py-3 border-t border-zinc-100 flex items-center justify-end flex-shrink-0">
          <button
            onClick={() => void fetchLive()}
            disabled={fetching}
            className="text-[11px] text-blue-600 hover:text-blue-800 transition-colors disabled:opacity-40 flex items-center gap-1"
          >
            {fetching && (
              <span className="w-3 h-3 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            )}
            {fetching ? "조회 중…" : "법제처에서 재조회"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 판례 행 ─────────────────────────────────────────────────────────────────
function CaseRow({
  c,
  checked,
  onToggle,
  onClick,
}: {
  c: FetchedCase;
  checked: boolean;
  onToggle: () => void;
  onClick: () => void;
}) {
  return (
    <div className="flex items-start gap-2.5 px-3 py-2 rounded-lg hover:bg-white/70 transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        className="mt-0.5 flex-shrink-0 accent-blue-700 cursor-pointer"
      />
      <button onClick={onClick} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(c.score ?? 0) > 0 && (
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
              {c.score}
            </span>
          )}
          <span className="text-[12px] font-mono font-semibold text-zinc-800 leading-tight hover:underline">
            {c.caseNumber}
          </span>
          {c.date && <span className="text-[10px] text-zinc-400">{formatDate(c.date)}</span>}
        </div>
        {c.caseName && <p className="text-[11px] text-zinc-500 truncate mt-0.5">{c.caseName}</p>}
        {(c.rulingPointsCount !== undefined || c.rulingPointsLength !== undefined) && (
          <p className="text-[10px] text-zinc-400 mt-0.5">
            판시사항 {c.rulingPointsCount ?? 0}개 · {c.rulingPointsLength ?? 0}자
          </p>
        )}
        {(c.matchedTopics?.length ?? 0) > 0 && (
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {(c.matchedTopics || []).slice(0, 3).map((t) => (
              <span key={t} className="text-[10px] text-zinc-600 bg-zinc-100 px-1 rounded">
                {t}
              </span>
            ))}
            {(c.matchedTopics?.length ?? 0) > 3 && (
              <span className="text-[10px] text-zinc-400">+{(c.matchedTopics!.length) - 3}</span>
            )}
          </div>
        )}
      </button>
    </div>
  );
}

// ── 법역 칼럼 ─────────────────────────────────────────────────────────────────
function AreaColumn({
  area,
  cases,
  selected,
  onToggle,
  onCaseClick,
  onSelectAll,
  onClearAll,
}: {
  area: LawArea;
  cases: FetchedCase[];
  selected: Set<string>;
  onToggle: (n: string) => void;
  onCaseClick: (c: FetchedCase) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}) {
  const style = AREA_STYLE[area];
  const allChecked = cases.length > 0 && cases.every((c) => selected.has(c.caseNumber));
  return (
    <div className={`rounded-xl border ${style.border} overflow-hidden`}>
      <div className={`px-3 py-2.5 flex items-center justify-between bg-white border-b ${style.border}`}>
        <div className="flex items-center gap-2">
          <span className={`text-[12px] font-bold ${style.header}`}>{area}</span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${style.badge}`}>
            {cases.length}건
          </span>
        </div>
        {cases.length > 0 && (
          <button
            onClick={allChecked ? onClearAll : onSelectAll}
            className="text-[10px] text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            {allChecked ? "해제" : "전체"}
          </button>
        )}
      </div>
      <div className="overflow-y-auto max-h-[320px] py-1">
        {cases.length === 0 ? (
          <p className="text-[11px] text-zinc-300 text-center py-6">목록 비어있음</p>
        ) : (
          cases.map((c) => (
            <CaseRow
              key={c.caseNumber}
              c={c}
              checked={selected.has(c.caseNumber)}
              onToggle={() => onToggle(c.caseNumber)}
              onClick={() => onCaseClick(c)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function AdminExamLikelyList({ onAppendCases, refreshSignal }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FetchResult | null>(null);
  const [fetchError, setFetchError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailCase, setDetailCase] = useState<FetchedCase | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);

  const AREAS: LawArea[] = ["민사법", "공법", "형사법"];

  const allCases = result ? [...result.민사법, ...result.공법, ...result.형사법] : [];
  const totalCount = allCases.length;

  const loadList = async () => {
    setLoading(true);
    setFetchError("");
    setRefreshedAt(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/admin/fetch-important-cases", {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      const data = (await res.json()) as FetchResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "서버 오류");
      setResult(data);
      setHasLoaded(true);
      setRefreshedAt(Date.now());
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 패널을 열 때 자동 로드 (한 번)
  useEffect(() => {
    if (open && !hasLoaded) void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 외부(List-up) 트리거로 강제 재조회
  useEffect(() => {
    if (refreshSignal === undefined) return;
    if (open) void loadList();
    else setHasLoaded(false); // 패널 닫혀있으면 다음 열 때 재조회되도록
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  const toggle = (n: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  const selectArea = (area: LawArea) =>
    setSelected((prev) => {
      const next = new Set(prev);
      result?.[area].forEach((c) => next.add(c.caseNumber));
      return next;
    });
  const clearArea = (area: LawArea) =>
    setSelected((prev) => {
      const next = new Set(prev);
      result?.[area].forEach((c) => next.delete(c.caseNumber));
      return next;
    });
  const selectAll = () => setSelected(new Set(allCases.map((c) => c.caseNumber)));
  const clearAll = () => setSelected(new Set());

  const handleAddToBatch = () => {
    if (selected.size === 0) return;
    onAppendCases([...selected]);
    setSelected(new Set());
  };

  return (
    <div className="mt-3 rounded-xl border border-dashed border-emerald-200 overflow-hidden bg-emerald-50/30">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-3 flex items-center justify-between hover:bg-emerald-50/60 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-[12px] font-semibold text-emerald-700">출제 유력 판례 (DB 누적 목록)</span>
          {hasLoaded && result && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              {totalCount}건
            </span>
          )}
        </div>
        <svg
          className={`w-3.5 h-3.5 text-emerald-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-emerald-100">
          <div className="px-4 py-3">
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              List-up 으로 누적된 판례 목록입니다. 사건번호를 클릭하면 판시사항·판결요지 본문을 볼 수 있습니다.
            </p>
          </div>

          {fetchError && (
            <div className="mx-4 mb-3 px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
              <p className="text-[12px] text-red-600">{fetchError}</p>
            </div>
          )}

          {loading && !result && (
            <div className="px-4 pb-3">
              <p className="text-[11px] text-zinc-400">목록 불러오는 중…</p>
            </div>
          )}

          {result && (
            <>
              <div className="px-4 pb-3 flex items-center justify-end gap-2">
                {refreshedAt && !loading && (
                  <span className="text-[11px] text-emerald-600 mr-1">
                    갱신됨 · {totalCount}건
                  </span>
                )}
                <button onClick={selectAll} disabled={loading} className="text-[11px] text-blue-500 hover:text-blue-700 transition-colors disabled:opacity-40">
                  전체 선택
                </button>
                <span className="text-zinc-200">|</span>
                <button onClick={clearAll} disabled={loading} className="text-[11px] text-zinc-400 hover:text-zinc-600 transition-colors disabled:opacity-40">
                  선택 해제
                </button>
                <span className="text-zinc-200 mx-1">·</span>
                <button
                  onClick={() => void loadList()}
                  disabled={loading}
                  className="text-[11px] text-emerald-600 hover:text-emerald-800 transition-colors disabled:opacity-40 flex items-center gap-1"
                >
                  {loading && (
                    <span className="w-3 h-3 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
                  )}
                  {loading ? "갱신 중…" : "새로고침"}
                </button>
              </div>

              <div className="px-4 pb-3 grid grid-cols-3 gap-3">
                {AREAS.map((area) => (
                  <AreaColumn
                    key={area}
                    area={area}
                    cases={result[area]}
                    selected={selected}
                    onToggle={toggle}
                    onCaseClick={setDetailCase}
                    onSelectAll={() => selectArea(area)}
                    onClearAll={() => clearArea(area)}
                  />
                ))}
              </div>

              <div className="px-4 pb-4 flex items-center justify-between border-t border-emerald-100 pt-3">
                <p className="text-[11px] text-zinc-400">
                  {selected.size > 0 ? (
                    <>
                      <span className="font-semibold text-zinc-700">{selected.size}개</span> 선택됨
                    </>
                  ) : (
                    "판례를 클릭하면 상세, 체크박스로 선택"
                  )}
                </p>
                <button
                  onClick={handleAddToBatch}
                  disabled={selected.size === 0}
                  className="h-8 px-4 bg-emerald-700 text-white rounded-lg text-[12px] font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-40 flex items-center gap-1.5"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  일괄 생성에 추가 ({selected.size})
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {detailCase && <RulingDetailModal c={detailCase} onClose={() => setDetailCase(null)} />}
    </div>
  );
}
