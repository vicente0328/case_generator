import { useState } from "react";
import { auth } from "@/lib/firebase";
import type { FetchResult, FetchedCase } from "@/pages/api/admin/fetch-important-cases";

type LawArea = "민사법" | "공법" | "형사법";

interface Props {
  onAppendCases: (caseNumbers: string[]) => void;
}

// ── 소스 뱃지 라벨 ─────────────────────────────────────────────────────────────
const SOURCE_LABEL: Record<string, { label: string; color: string }> = {
  RISS:     { label: "RISS",   color: "bg-sky-100 text-sky-600" },
  법원도서관:  { label: "법원도서관", color: "bg-violet-100 text-violet-600" },
  법제처:    { label: "법제처",  color: "bg-emerald-100 text-emerald-600" },
};

// ── 법역별 스타일 ─────────────────────────────────────────────────────────────
const AREA_STYLE: Record<LawArea, { badge: string; header: string; border: string }> = {
  민사법: {
    badge:  "bg-blue-50 text-blue-700 border-blue-200",
    header: "text-blue-800",
    border: "border-blue-100",
  },
  공법: {
    badge:  "bg-violet-50 text-violet-700 border-violet-200",
    header: "text-violet-800",
    border: "border-violet-100",
  },
  형사법: {
    badge:  "bg-amber-50 text-amber-700 border-amber-200",
    header: "text-amber-800",
    border: "border-amber-100",
  },
};

function formatDate(d?: string): string {
  if (!d) return "";
  const s = String(d).replace(/\D/g, "");
  if (s.length === 8) return `${s.slice(0, 4)}. ${s.slice(4, 6)}. ${s.slice(6, 8)}.`;
  return d;
}

// ── 개별 판례 행 ─────────────────────────────────────────────────────────────
function CaseRow({
  c,
  checked,
  onToggle,
}: {
  c: FetchedCase;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex items-start gap-2.5 px-3 py-2 rounded-lg hover:bg-white/70 cursor-pointer transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-0.5 flex-shrink-0 accent-blue-700"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[12px] font-mono font-semibold text-zinc-800 leading-tight">
            {c.caseNumber}
          </span>
          {c.date && (
            <span className="text-[10px] text-zinc-400">{formatDate(c.date)}</span>
          )}
        </div>
        {c.caseName && (
          <p className="text-[11px] text-zinc-500 truncate mt-0.5">{c.caseName}</p>
        )}
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          {c.sources.map((s) => {
            const style = SOURCE_LABEL[s] ?? { label: s, color: "bg-zinc-100 text-zinc-400" };
            return (
              <span key={s} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${style.color}`}>
                {style.label}
              </span>
            );
          })}
        </div>
      </div>
    </label>
  );
}

// ── 법역 칼럼 ─────────────────────────────────────────────────────────────────
function AreaColumn({
  area,
  cases,
  selected,
  onToggle,
  onSelectAll,
  onClearAll,
}: {
  area: LawArea;
  cases: FetchedCase[];
  selected: Set<string>;
  onToggle: (num: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}) {
  const style = AREA_STYLE[area];
  const allChecked = cases.length > 0 && cases.every((c) => selected.has(c.caseNumber));

  return (
    <div className={`rounded-xl border ${style.border} overflow-hidden`}>
      {/* 헤더 */}
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

      {/* 판례 목록 */}
      <div className={`overflow-y-auto max-h-[280px] py-1`}>
        {cases.length === 0 ? (
          <p className="text-[11px] text-zinc-300 text-center py-6">검색 결과 없음</p>
        ) : (
          cases.map((c) => (
            <CaseRow
              key={c.caseNumber}
              c={c}
              checked={selected.has(c.caseNumber)}
              onToggle={() => onToggle(c.caseNumber)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── 통계 뱃지 ─────────────────────────────────────────────────────────────────
function StatBadge({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
      <span className="text-[11px] text-zinc-500">{label}</span>
      <span className="text-[11px] font-semibold text-zinc-700">{count}</span>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function AdminImportantCases({ onAppendCases }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FetchResult | null>(null);
  const [fetchError, setFetchError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const AREAS: LawArea[] = ["민사법", "공법", "형사법"];

  const allCases = result
    ? [...result.민사법, ...result.공법, ...result.형사법]
    : [];
  const totalCount = allCases.length;

  // ── 데이터 가져오기 ─────────────────────────────────────────────────────────
  const handleFetch = async () => {
    setLoading(true);
    setFetchError("");
    setResult(null);
    setSelected(new Set());
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/admin/fetch-important-cases", {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      const data = await res.json() as FetchResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "서버 오류");
      setResult(data);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // ── 선택 관리 ──────────────────────────────────────────────────────────────
  const toggle = (num: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(num) ? next.delete(num) : next.add(num);
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

  // ── 일괄 생성에 추가 ────────────────────────────────────────────────────────
  const handleAddToBatch = () => {
    if (selected.size === 0) return;
    onAppendCases([...selected]);
    setSelected(new Set());
  };

  return (
    <div className="mt-3 rounded-xl border border-dashed border-zinc-200 overflow-hidden">
      {/* 토글 헤더 */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-3 flex items-center justify-between hover:bg-zinc-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          {/* 검색 아이콘 */}
          <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span className="text-[12px] font-semibold text-zinc-400">최신 중요 판례 가져오기</span>
          <span className="text-[11px] text-zinc-300">판례평석 · 공보판례 분석</span>
        </div>
        <svg
          className={`w-3.5 h-3.5 text-zinc-300 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-zinc-100">
          {/* 설명 + 가져오기 버튼 */}
          <div className="px-4 py-3 flex items-start justify-between gap-3">
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              RISS 판례평석 논문 · 법원도서관 판례해설 · 법제처 공보판례(prncYn=Y)를
              병렬 조회한 후, Gemini가 변시 사례형 출제 가능성을 평가하여 민사법 / 공법 / 형사법으로 분류합니다.
            </p>
            <button
              onClick={handleFetch}
              disabled={loading}
              className="flex-shrink-0 h-8 px-4 bg-blue-900 text-white rounded-lg text-[12px] font-semibold hover:bg-blue-800 transition-colors disabled:opacity-40 flex items-center gap-2"
            >
              {loading && (
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {loading ? "분석 중…" : "가져오기"}
            </button>
          </div>

          {/* 에러 표시 */}
          {fetchError && (
            <div className="mx-4 mb-3 px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
              <p className="text-[12px] text-red-600">{fetchError}</p>
            </div>
          )}

          {/* 결과 영역 */}
          {result && (
            <>
              {/* 소스별 통계 */}
              <div className="px-4 pb-3 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <StatBadge label="RISS" count={result.stats.riss} color="bg-sky-400" />
                  <StatBadge label="법원도서관" count={result.stats.glaw} color="bg-violet-400" />
                  <StatBadge label="법제처" count={result.stats.lawGoKr} color="bg-emerald-400" />
                  <span className="text-zinc-200 text-[11px]">→</span>
                  <span className="text-[11px] font-semibold text-zinc-700">
                    변시 적합 <span className="text-blue-700">{totalCount}건</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={selectAll} className="text-[11px] text-blue-500 hover:text-blue-700 transition-colors">
                    전체 선택
                  </button>
                  <span className="text-zinc-200">|</span>
                  <button onClick={clearAll} className="text-[11px] text-zinc-400 hover:text-zinc-600 transition-colors">
                    선택 해제
                  </button>
                </div>
              </div>

              {/* 소스 오류 경고 */}
              {result.errors.length > 0 && (
                <div className="mx-4 mb-3 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg space-y-0.5">
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-[11px] text-amber-700">{e}</p>
                  ))}
                </div>
              )}

              {/* 법역별 3단 그리드 */}
              <div className="px-4 pb-3 grid grid-cols-3 gap-3">
                {AREAS.map((area) => (
                  <AreaColumn
                    key={area}
                    area={area}
                    cases={result[area]}
                    selected={selected}
                    onToggle={toggle}
                    onSelectAll={() => selectArea(area)}
                    onClearAll={() => clearArea(area)}
                  />
                ))}
              </div>

              {/* 하단 액션 바 */}
              <div className="px-4 pb-4 flex items-center justify-between border-t border-zinc-100 pt-3">
                <p className="text-[11px] text-zinc-400">
                  {selected.size > 0 ? (
                    <><span className="font-semibold text-zinc-700">{selected.size}개</span> 선택됨</>
                  ) : (
                    "판례를 선택하세요"
                  )}
                </p>
                <button
                  onClick={handleAddToBatch}
                  disabled={selected.size === 0}
                  className="h-8 px-4 bg-emerald-700 text-white rounded-lg text-[12px] font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-40 flex items-center gap-1.5"
                >
                  {/* 플러스 아이콘 */}
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
    </div>
  );
}
