import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/contexts/AuthContext";
import AuthModal from "./AuthModal";
import { XMarkIcon, ArrowRightStartOnRectangleIcon } from "@heroicons/react/24/outline";

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
}

const GUIDE_STEPS = [
  {
    num: "01",
    title: "사건번호 입력",
    desc: "대법원 판례의 사건번호를 입력합니다.\n예) 2016다271226",
  },
  {
    num: "02",
    title: "판례 자동 조회",
    desc: "법제처 API에서 판시사항·판결요지를 자동으로 불러옵니다.",
  },
  {
    num: "03",
    title: "AI 문제 생성",
    desc: "Gemini AI가 변시 형식으로 사실관계·문제·해설을 생성합니다.",
  },
  {
    num: "04",
    title: "공유 & 댓글",
    desc: "생성된 문제를 공유하고 댓글로 피드백을 나눌 수 있습니다.",
  },
];

function GuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

      {/* Sheet */}
      <div
        className="relative w-full max-w-md bg-white rounded-t-[28px] sm:rounded-[28px] shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-[#D1D1D6]" />
        </div>

        <div className="px-6 pt-4 pb-6 sm:pt-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-[19px] font-bold text-[#1C1C1E] tracking-tight">이용 가이드</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-[#F2F2F7] flex items-center justify-center text-[#8E8E93] hover:bg-[#E5E5EA] transition-colors"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-5">
            {GUIDE_STEPS.map((s) => (
              <div key={s.num} className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-[#007AFF] text-white text-[12px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {s.num}
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-[#1C1C1E] mb-0.5">{s.title}</p>
                  <p className="text-[13px] text-[#8E8E93] leading-relaxed whitespace-pre-line">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-5 border-t border-[#F2F2F7]">
            <p className="text-[12px] text-[#C7C7CC] leading-relaxed">
              AI가 생성한 사실관계는 실제 판례와 다를 수 있습니다. 학습 목적으로만 활용하세요.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Layout({ children, title = "Case Generator" }: LayoutProps) {
  const { user, logout } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content="AI 기반 변호사시험 민사법 사례형 문제 생성기" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-[#F2F2F7] flex flex-col">
        {/* Nav */}
        <header className="ios-header">
          <div className="max-w-2xl mx-auto px-4">
            <div className="flex items-center justify-between h-[56px]">
              {/* Brand */}
              <Link href="/" className="flex items-center gap-2 active:opacity-60 transition-opacity">
                <div className="w-7 h-7 bg-[#007AFF] rounded-[8px] flex items-center justify-center">
                  <span className="text-white font-bold text-[11px] tracking-tight">CG</span>
                </div>
                <span className="font-bold text-[17px] tracking-tight text-[#1C1C1E]">
                  Case Generator
                </span>
              </Link>

              {/* Right actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowGuide(true)}
                  className="text-[14px] font-medium text-[#8E8E93] hover:text-[#1C1C1E] transition-colors px-2 py-1"
                >
                  가이드
                </button>

                {user ? (
                  <div className="flex items-center gap-1.5 pl-3 pr-1.5 py-1 bg-[#F2F2F7] rounded-full">
                    <span className="text-[13px] font-medium text-[#636366] max-w-[80px] truncate">
                      {user.displayName || user.email?.split("@")[0]}
                    </span>
                    <button
                      onClick={logout}
                      className="w-6 h-6 flex items-center justify-center rounded-full bg-white text-[#8E8E93] hover:text-[#FF3B30] transition-colors shadow-sm"
                      title="로그아웃"
                    >
                      <ArrowRightStartOnRectangleIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAuthModal(true)}
                    className="text-[14px] font-semibold px-4 py-1.5 rounded-full bg-[#007AFF] text-white hover:bg-[#0062cc] transition-colors active:scale-95"
                  >
                    로그인
                  </button>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 px-4">
          {children}
        </main>

        {/* Footer */}
        <footer className="py-8 text-center text-[11px] text-[#C7C7CC]">
          © {new Date().getFullYear()} Case Generator
        </footer>
      </div>

      {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </>
  );
}
