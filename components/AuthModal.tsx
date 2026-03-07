import { useState } from "react";
import { useAuth } from "@/lib/contexts/AuthContext";

interface AuthModalProps {
  onClose: () => void;
}

export default function AuthModal({ onClose }: AuthModalProps) {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGoogle = async () => {
    setError("");
    setLoading(true);
    try {
      await signInWithGoogle();
      onClose();
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      setError(`[${e.code ?? "unknown"}] ${e.message ?? "Google 로그인 실패"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (tab === "login") {
        await signIn(email, password);
      } else {
        if (!displayName.trim()) throw new Error("이름을 입력해주세요.");
        await signUp(email, password, displayName);
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("user-not-found") || msg.includes("wrong-password") || msg.includes("invalid-credential")) {
        setError("이메일 또는 비밀번호가 올바르지 않습니다.");
      } else if (msg.includes("email-already-in-use")) {
        setError("이미 사용 중인 이메일입니다.");
      } else if (msg.includes("weak-password")) {
        setError("비밀번호는 6자 이상이어야 합니다.");
      } else if (msg.includes("invalid-email")) {
        setError("유효하지 않은 이메일 형식입니다.");
      } else {
        setError(msg || "오류가 발생했습니다.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[360px] overflow-hidden"
        onClick={e => e.stopPropagation()}
        style={{ animation: "modalIn 0.2s cubic-bezier(0.16,1,0.3,1)" }}
      >
        {/* 헤더 */}
        <div className="px-6 pt-6 pb-5 border-b border-zinc-100 flex items-center justify-between">
          <p className="font-semibold text-[16px] tracking-tight text-zinc-900">로그인</p>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-zinc-100 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 transition-colors text-[16px] font-medium flex items-center justify-center"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-3">
          {/* Google 로그인 — 주 CTA */}
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full h-[46px] flex items-center justify-center gap-3 bg-zinc-900 text-white rounded-xl text-[14px] font-semibold hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
              <path fill="#ffffff" fillOpacity=".9" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#ffffff" fillOpacity=".75" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#ffffff" fillOpacity=".6" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#ffffff" fillOpacity=".85" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google로 계속하기
          </button>

          {/* 구분선 */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-100" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-3 bg-white text-[12px] text-zinc-300">또는</span>
            </div>
          </div>

          {/* 이메일 폼 */}
          <div>
            {/* 탭 */}
            <div className="flex bg-zinc-100 p-0.5 rounded-lg mb-4">
              {(["login", "signup"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setError(""); }}
                  className={`flex-1 py-1.5 text-[13px] font-medium rounded-md transition-all ${
                    tab === t
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "text-zinc-400 hover:text-zinc-600"
                  }`}
                >
                  {t === "login" ? "로그인" : "회원가입"}
                </button>
              ))}
            </div>

            <form onSubmit={handleEmail} className="space-y-2.5">
              {tab === "signup" && (
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="이름"
                  className="w-full h-10 bg-zinc-50 border border-zinc-200 rounded-lg px-3 text-[14px] text-zinc-900 placeholder-zinc-300 focus:outline-none focus:border-zinc-400 transition-colors"
                  required
                />
              )}
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="이메일"
                className="w-full h-10 bg-zinc-50 border border-zinc-200 rounded-lg px-3 text-[14px] text-zinc-900 placeholder-zinc-300 focus:outline-none focus:border-zinc-400 transition-colors"
                required
              />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="비밀번호 (6자 이상)"
                className="w-full h-10 bg-zinc-50 border border-zinc-200 rounded-lg px-3 text-[14px] text-zinc-900 placeholder-zinc-300 focus:outline-none focus:border-zinc-400 transition-colors"
                required
                minLength={6}
              />
              {error && (
                <p className="text-[12px] text-red-500 px-1">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-10 bg-zinc-900 text-white rounded-lg text-[14px] font-semibold hover:bg-zinc-700 transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto block" />
                ) : tab === "login" ? "로그인" : "회원가입"}
              </button>
            </form>
          </div>
        </div>
      </div>
      <style>{`@keyframes modalIn { from { opacity:0; transform:scale(0.96) } to { opacity:1; transform:scale(1) } }`}</style>
    </div>
  );
}
