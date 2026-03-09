import Head from "next/head";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/contexts/AuthContext";
import AuthModal from "./AuthModal";

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
  onLogoClick?: () => void;
}

function GuideModal({ onClose }: { onClose: () => void }) {
  const steps = [
    { n: "01", t: "사건번호 입력", d: "대법원 판례의 사건번호를 입력합니다.\n예) 2016다271226" },
    { n: "02", t: "판례 자동 조회", d: "법제처 API에서 판시사항과 판결요지를 자동으로 가져옵니다." },
    { n: "03", t: "AI 문제 생성", d: "Gemini AI가 변시 형식으로 사실관계·문제·해설을 생성합니다.\n문제 생성에는 30초~1분가량 소요됩니다." },
    { n: "04", t: "공유 & 댓글", d: "생성된 문제를 공유하고 댓글로 피드백을 나눌 수 있습니다." },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={e => e.stopPropagation()}
        style={{ animation: "modalIn 0.2s cubic-bezier(0.16,1,0.3,1)" }}
      >
        <div className="px-6 pt-6 pb-5 border-b border-zinc-100 flex items-center justify-between">
          <p className="font-semibold text-[16px] tracking-tight">이용 가이드</p>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-zinc-100 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 transition-colors text-[16px] font-medium flex items-center justify-center"
          >
            ×
          </button>
        </div>
        <div className="px-6 py-5 space-y-5">
          {steps.map(s => (
            <div key={s.n} className="flex gap-4">
              <span className="text-[11px] font-bold text-zinc-300 mt-0.5 w-5 flex-shrink-0">{s.n}</span>
              <div>
                <p className="text-[14px] font-semibold text-zinc-900 mb-0.5">{s.t}</p>
                <p className="text-[13px] text-zinc-400 leading-relaxed whitespace-pre-line">{s.d}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="px-6 pb-5">
          <p className="text-[11px] text-zinc-300 leading-relaxed">
            AI가 생성한 내용은 실제 변호사시험과 다를 수 있습니다. 학습 목적으로만 활용하세요.
          </p>
        </div>
      </div>
      <style>{`@keyframes modalIn { from { opacity:0; transform:scale(0.95) } to { opacity:1; transform:scale(1) } }`}</style>
    </div>
  );
}

function NameEditor({ onClose }: { onClose: () => void }) {
  const { user, customDisplayName, updateDisplayName } = useAuth();
  const [value, setValue] = useState(customDisplayName || user?.displayName || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSave = async () => {
    if (!value.trim()) { setError("이름을 입력해주세요."); return; }
    if (value.trim().length > 20) { setError("20자 이내로 입력해주세요."); return; }
    setSaving(true);
    try {
      await updateDisplayName(value.trim());
      onClose();
    } catch {
      setError("저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden"
        onClick={e => e.stopPropagation()}
        style={{ animation: "modalIn 0.2s cubic-bezier(0.16,1,0.3,1)" }}
      >
        <div className="px-6 pt-6 pb-5 border-b border-zinc-100 flex items-center justify-between">
          <p className="font-semibold text-[16px] tracking-tight">이름 변경</p>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-zinc-100 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 transition-colors text-[16px] font-medium flex items-center justify-center"
          >
            ×
          </button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <input
            ref={inputRef}
            value={value}
            onChange={e => { setValue(e.target.value); setError(""); }}
            onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
            placeholder="표시할 이름"
            maxLength={20}
            className="w-full h-10 px-3 border border-zinc-200 rounded-lg text-[14px] outline-none focus:border-blue-400 transition-colors"
          />
          {error && <p className="text-[12px] text-red-500">{error}</p>}
          <p className="text-[11px] text-zinc-400">변경 시 내가 작성한 게시글 이름도 함께 업데이트됩니다.</p>
        </div>
        <div className="px-6 pb-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 h-9 rounded-lg border border-zinc-200 text-[13px] text-zinc-500 hover:bg-zinc-50 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 h-9 rounded-lg bg-blue-900 text-white text-[13px] font-medium hover:bg-blue-800 transition-colors disabled:opacity-50"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
      <style>{`@keyframes modalIn { from { opacity:0; transform:scale(0.95) } to { opacity:1; transform:scale(1) } }`}</style>
    </div>
  );
}

export default function Layout({ children, title = "Case Generator", onLogoClick }: LayoutProps) {
  const { user, customDisplayName, logout } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showNameEditor, setShowNameEditor] = useState(false);

  const displayName = customDisplayName || user?.displayName || user?.email?.split("@")[0] || "";

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content="변호사시험 민사법 사례형 문제 생성기" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-screen bg-[#F6F6F7] flex flex-col">
        <header className="sticky top-0 z-40 h-[52px] bg-white/90 backdrop-blur-xl border-b border-zinc-100 flex items-center">
          <div className="w-full max-w-[800px] mx-auto px-6 flex items-center justify-between">
            <Link href="/" onClick={onLogoClick} className="flex items-center gap-2 group">
              <div className="w-[26px] h-[26px] bg-blue-900 rounded-[7px] flex items-center justify-center flex-shrink-0">
                <span className="text-white text-[10px] font-bold tracking-tighter">CG</span>
              </div>
              <span className="font-semibold text-[14px] tracking-tight text-zinc-900">Case Generator</span>
            </Link>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowGuide(true)}
                className="h-8 px-3 text-[13px] text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50 rounded-lg transition-colors"
              >
                가이드
              </button>
              {user ? (
                <div className="flex items-center gap-1 ml-1">
                  <button
                    onClick={() => setShowNameEditor(true)}
                    className="flex items-center gap-1 h-8 px-2 rounded-lg hover:bg-zinc-50 transition-colors group"
                    title="이름 변경"
                  >
                    <span className="text-[13px] text-zinc-400 max-w-[80px] truncate">
                      {displayName}
                    </span>
                    <svg
                      width="11" height="11" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      className="text-zinc-300 group-hover:text-zinc-500 transition-colors flex-shrink-0"
                    >
                      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                    </svg>
                  </button>
                  <button
                    onClick={logout}
                    className="h-8 px-3 text-[13px] text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50 rounded-lg transition-colors"
                  >
                    로그아웃
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowAuth(true)}
                  className="h-8 px-3.5 ml-1 bg-blue-900 text-white text-[13px] font-medium rounded-lg hover:bg-blue-800 transition-colors"
                >
                  로그인
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1">
          {children}
        </main>

        <footer className="py-8 text-center text-[11px] text-zinc-300">
          <div className="mb-3">
            <a
              href="mailto:kennethkoh97@gmail.com?subject=Case Generator 문의"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-zinc-200 rounded-lg text-[12px] text-zinc-500 hover:text-zinc-800 hover:border-zinc-300 hover:shadow-sm transition-all"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="16" x="2" y="4" rx="2"/>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
              개발자에게 문의하기
            </a>
          </div>
          © {new Date().getFullYear()} Case Generator
        </footer>
      </div>

      {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      {showNameEditor && <NameEditor onClose={() => setShowNameEditor(false)} />}
    </>
  );
}
