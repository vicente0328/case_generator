import { useState, useEffect } from "react";
import { auth } from "@/lib/firebase";

import type { LawArea } from "@/lib/classifyLawArea";

const AREA_KEYS: Record<LawArea, "civil" | "public" | "criminal"> = {
  민사법: "civil",
  공법: "public",
  형사법: "criminal",
};

const AREA_STYLE: Record<LawArea, { tab: string; activeTab: string }> = {
  민사법: { tab: "text-blue-600 border-blue-600",   activeTab: "bg-blue-50" },
  공법:   { tab: "text-green-600 border-green-600",  activeTab: "bg-green-50" },
  형사법: { tab: "text-red-600 border-red-600",      activeTab: "bg-red-50" },
};

type PromptMap = { civil: string | null; public: string | null; criminal: string | null };
type DefaultMap = { civil: string; public: string; criminal: string };

async function getToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

export default function AdminPromptEditor() {
  const [activeTab, setActiveTab] = useState<LawArea>("민사법");
  // Firestore에 저장된 커스텀 프롬프트 (null = 미설정)
  const [prompts, setPrompts] = useState<PromptMap>({ civil: null, public: null, criminal: null });
  // 코드 기본값
  const [defaults, setDefaults] = useState<DefaultMap | null>(null);
  // textarea에 표시 중인 값
  const [edited, setEdited] = useState<PromptMap>({ civil: null, public: null, criminal: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      setLoading(true);
      try {
        const token = await getToken();
        const res = await fetch("/api/admin/prompts", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json() as PromptMap & { defaults: DefaultMap };
        setPrompts({ civil: data.civil, public: data.public, criminal: data.criminal });
        setDefaults(data.defaults);
        // 커스텀이 있으면 커스텀, 없으면 기본값을 textarea에 표시
        setEdited({
          civil:    data.civil    ?? data.defaults.civil,
          public:   data.public   ?? data.defaults.public,
          criminal: data.criminal ?? data.defaults.criminal,
        });
      } catch {
        setStatus({ type: "error", msg: "프롬프트 불러오기 실패" });
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen]);

  const key = AREA_KEYS[activeTab];
  const isCustom = prompts[key] !== null;
  // 현재 표시값이 저장된 값(커스텀 or 기본값)과 다른지
  const savedValue = prompts[key] ?? (defaults?.[key] ?? "");
  const isDirty = edited[key] !== savedValue;

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/prompts", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ [key]: edited[key] }),
      });
      if (!res.ok) throw new Error();
      setPrompts(prev => ({ ...prev, [key]: edited[key] }));
      setStatus({ type: "success", msg: "저장되었습니다. (최대 1분 후 반영)" });
    } catch {
      setStatus({ type: "error", msg: "저장 실패" });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm(`${activeTab} 프롬프트를 코드 기본값으로 초기화하시겠습니까?`)) return;
    setSaving(true);
    setStatus(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/prompts", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ [key]: null }),
      });
      if (!res.ok) throw new Error();
      setPrompts(prev => ({ ...prev, [key]: null }));
      // 초기화 후 textarea에 기본값 표시
      setEdited(prev => ({ ...prev, [key]: defaults?.[key] ?? "" }));
      setStatus({ type: "success", msg: "기본값으로 초기화되었습니다." });
    } catch {
      setStatus({ type: "error", msg: "초기화 실패" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-zinc-100">
      {/* 헤더 */}
      <button
        onClick={() => setIsOpen(o => !o)}
        className="w-full px-5 py-4 flex items-center justify-between text-left"
      >
        <div>
          <p className="text-[13px] font-semibold text-zinc-700">프롬프트 관리</p>
          <p className="text-[12px] text-zinc-400 mt-0.5">민사법·공법·형사법 문제 생성 프롬프트를 Firestore에서 관리합니다.</p>
        </div>
        <svg
          className={`w-4 h-4 text-zinc-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="px-5 pb-5 border-t border-zinc-100">
          {loading ? (
            <div className="py-8 text-center text-[13px] text-zinc-400">불러오는 중...</div>
          ) : (
            <>
              {/* 탭 */}
              <div className="flex gap-0 mt-4 border-b border-zinc-200">
                {(["민사법", "공법", "형사법"] as LawArea[]).map(area => (
                  <button
                    key={area}
                    onClick={() => { setActiveTab(area); setStatus(null); }}
                    className={`px-4 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
                      activeTab === area
                        ? `${AREA_STYLE[area].tab} ${AREA_STYLE[area].activeTab}`
                        : "border-transparent text-zinc-400 hover:text-zinc-600"
                    }`}
                  >
                    {area}
                    {prompts[AREA_KEYS[area]] !== null && (
                      <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-amber-400 align-middle" title="커스텀 프롬프트 적용 중" />
                    )}
                  </button>
                ))}
              </div>

              {/* 상태 표시 */}
              <div className="mt-3 flex items-center gap-2">
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                  isCustom
                    ? "bg-amber-100 text-amber-700"
                    : "bg-zinc-100 text-zinc-500"
                }`}>
                  {isCustom ? "커스텀 프롬프트 적용 중" : "코드 기본값 사용 중"}
                </span>
                {isDirty && <span className="text-[11px] text-zinc-400">· 미저장 변경사항 있음</span>}
              </div>

              {/* 텍스트에어리어 */}
              <textarea
                value={edited[key] ?? ""}
                onChange={e => setEdited(prev => ({ ...prev, [key]: e.target.value }))}
                className="mt-2 w-full h-96 text-[12px] font-mono leading-relaxed border border-zinc-200 rounded-lg px-3 py-2.5 resize-y focus:outline-none focus:ring-1 focus:ring-blue-400"
                spellCheck={false}
              />

              {/* 버튼 영역 */}
              <div className="mt-3 flex items-center justify-between">
                <button
                  onClick={handleReset}
                  disabled={saving || !isCustom}
                  className="text-[12px] text-zinc-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  기본값으로 초기화
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !isDirty}
                  className="px-4 py-1.5 text-[13px] font-medium bg-blue-900 text-white rounded-lg hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? "저장 중..." : "저장"}
                </button>
              </div>

              {/* 상태 메시지 */}
              {status && (
                <p className={`mt-2 text-[12px] ${status.type === "success" ? "text-emerald-600" : "text-red-500"}`}>
                  {status.msg}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
