import { useState } from "react";
import { useAuth } from "@/lib/contexts/AuthContext";
import { XMarkIcon, ExclamationCircleIcon } from "@heroicons/react/24/outline";

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (tab === "login") {
        await signIn(email, password);
      } else {
        if (!displayName.trim()) {
          throw new Error("이름을 입력해주세요.");
        }
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
        setError(msg || "오류가 발생했습니다. 다시 시도해주세요.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    setLoading(true);
    try {
      await signInWithGoogle();
      onClose();
    } catch {
      setError("Google 로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-[400px] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        
        {/* Header */}
        <div className="relative px-6 pt-6 pb-2 text-center">
          <h2 className="text-[22px] font-bold text-[#1C1C1E]">
            {tab === "login" ? "로그인" : "회원가입"}
          </h2>
          <p className="text-[#8E8E93] text-[15px] mt-1">
            {tab === "login" ? "Case Generator에 오신 것을 환영합니다." : "새로운 계정을 생성합니다."}
          </p>
          <button
            onClick={onClose}
            className="absolute right-5 top-5 p-2 rounded-full text-[#8E8E93] hover:bg-[#F2F2F7] transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 pt-4">
          {/* Tabs */}
          <div className="flex bg-[#F2F2F7] p-1 rounded-[12px] mb-6">
            {(["login", "signup"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(""); }}
                className={`flex-1 py-2 text-[14px] font-medium rounded-[10px] transition-all duration-200 ${
                  tab === t 
                    ? "bg-white text-[#1C1C1E] shadow-sm" 
                    : "text-[#8E8E93] hover:text-[#1C1C1E]"
                }`}
              >
                {t === "login" ? "로그인" : "회원가입"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === "signup" && (
              <div className="space-y-1">
                <label className="text-[13px] font-medium text-[#8E8E93] ml-1">이름</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="홍길동"
                  className="w-full h-[50px] bg-[#F2F2F7] rounded-[12px] px-4 text-[16px] text-[#1C1C1E] placeholder-[#8E8E93] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:bg-white transition-all"
                  required
                />
              </div>
            )}
            
            <div className="space-y-1">
              <label className="text-[13px] font-medium text-[#8E8E93] ml-1">이메일</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full h-[50px] bg-[#F2F2F7] rounded-[12px] px-4 text-[16px] text-[#1C1C1E] placeholder-[#8E8E93] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:bg-white transition-all"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[13px] font-medium text-[#8E8E93] ml-1">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="6자 이상"
                className="w-full h-[50px] bg-[#F2F2F7] rounded-[12px] px-4 text-[16px] text-[#1C1C1E] placeholder-[#8E8E93] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:bg-white transition-all"
                required
                minLength={6}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-[13px] text-[#FF3B30] bg-[#FF3B30]/10 rounded-[12px] px-3 py-2.5">
                <ExclamationCircleIcon className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-[50px] bg-[#007AFF] text-white rounded-[14px] text-[16px] font-semibold hover:bg-[#0062cc] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                  처리 중...
                </span>
              ) : (
                tab === "login" ? "로그인" : "회원가입"
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#E5E5EA]"></div>
            </div>
            <div className="relative flex justify-center text-[13px]">
              <span className="px-2 bg-white text-[#8E8E93]">또는</span>
            </div>
          </div>

          {/* Google Login */}
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full h-[50px] flex items-center justify-center gap-2.5 border border-[#E5E5EA] rounded-[14px] text-[15px] font-medium text-[#1C1C1E] hover:bg-[#F2F2F7] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google로 계속하기
          </button>
        </div>
      </div>
    </div>
  );
}
