import { useEffect, useMemo, useState } from "react";
import {
  collection,
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
import ArchiveCaseCard, { type ArchiveCase, type ArchiveMemo } from "./ArchiveCaseCard";
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

type SortMode = "dateDesc" | "addedDesc";

function normalizeId(cn: string): string {
  // 사건번호를 doc ID로 사용 가능한 형태로: 한글/숫자만 + 2자리 연도 → 4자리
  const s = cn.replace(/[^가-힣0-9]/g, "");
  return s.replace(/^(\d{2})([가-힣])/, (_, yr, type) => {
    const y = parseInt(yr, 10);
    return `${y >= 90 ? 1900 + y : 2000 + y}${type}`;
  });
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

  const handleSubmit = async () => {
    if (!user || submitting) return;
    const tokens = input
      .split(/[\n,;\s]+/)
      .map(s => s.trim())
      .filter(Boolean);
    if (tokens.length === 0) return;

    setSubmitting(true);
    setReport(null);
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
  };

  const handleMemosChanged = (id: string, memos: ArchiveMemo[]) => {
    setCases(prev => prev.map(c => (c.id === id ? { ...c, memos } : c)));
  };

  // 검색/정렬/필터링
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const inArea = cases.filter(c => c.lawArea === activeArea);
    const matched = s
      ? inArea.filter(c =>
          (c.caseNumber + " " + c.caseName + " " + c.rulingPoints + " " + c.rulingRatio)
            .toLowerCase()
            .includes(s)
        )
      : inArea;
    const sorted = [...matched].sort((a, b) => {
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
  }, [cases, search, sortMode, activeArea]);

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
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">
            사건번호 일괄 입력
          </span>
        </div>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={"한 줄에 하나씩, 또는 쉼표·공백으로 구분\n예) 2016다271226\n     2019두49953\n     2022도5827"}
          rows={5}
          className="w-full text-[13px] font-mono px-3 py-2.5 border border-zinc-200 rounded-lg outline-none focus:border-blue-400 transition-colors resize-y"
        />
        <div className="flex items-center justify-between mt-3 gap-3">
          <p className="text-[11px] text-zinc-400">
            {input.split(/[\n,;\s]+/).filter(Boolean).length}건 입력됨 (최대 50건)
          </p>
          <button
            onClick={handleSubmit}
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
              onClick={() => setActiveArea(area)}
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
              onDeleted={handleDeleted}
              onMemosChanged={handleMemosChanged}
            />
          ))
        )}
      </div>
    </div>
  );
}
