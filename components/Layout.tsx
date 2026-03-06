import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { useAuth } from "@/lib/contexts/AuthContext";
import AuthModal from "./AuthModal";

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
}

export default function Layout({ children, title = "변시 민사법 사례 생성기" }: LayoutProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { href: "/generate", label: "문제 생성" },
    { href: "/community", label: "커뮤니티" },
    { href: "/guide", label: "사용 가이드" },
  ];

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content="변호사시험 민사법 사례형 문제 생성 및 학습 플랫폼" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&family=Noto+Serif+KR:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Header */}
        <header className="bg-navy-900 text-white shadow-lg sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              {/* Logo */}
              <Link href="/" className="flex items-center gap-3 group">
                <div className="w-8 h-8 bg-gold-500 rounded flex items-center justify-center text-navy-900 font-bold text-sm">
                  변
                </div>
                <span className="font-serif font-bold text-lg tracking-tight hidden sm:block group-hover:text-gold-300 transition-colors">
                  민사법 사례 생성기
                </span>
                <span className="font-serif font-bold text-lg tracking-tight sm:hidden group-hover:text-gold-300 transition-colors">
                  민사법
                </span>
              </Link>

              {/* Desktop Nav */}
              <nav className="hidden md:flex items-center gap-1">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      router.pathname === item.href
                        ? "bg-navy-700 text-gold-300"
                        : "text-gray-300 hover:bg-navy-800 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>

              {/* Auth */}
              <div className="flex items-center gap-2">
                {user ? (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-300 hidden sm:block">
                      {user.displayName || user.email?.split("@")[0]}
                    </span>
                    <button
                      onClick={logout}
                      className="text-sm px-3 py-1.5 rounded border border-navy-600 text-gray-300 hover:bg-navy-800 hover:text-white transition-colors"
                    >
                      로그아웃
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAuthModal(true)}
                    className="text-sm px-4 py-1.5 rounded bg-gold-500 text-navy-900 font-semibold hover:bg-gold-400 transition-colors"
                  >
                    로그인
                  </button>
                )}

                {/* Mobile menu button */}
                <button
                  className="md:hidden p-2 rounded text-gray-300 hover:text-white hover:bg-navy-800"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    {mobileMenuOpen ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    )}
                  </svg>
                </button>
              </div>
            </div>

            {/* Mobile menu */}
            {mobileMenuOpen && (
              <div className="md:hidden border-t border-navy-700 py-2">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block px-4 py-2 text-sm font-medium transition-colors ${
                      router.pathname === item.href
                        ? "bg-navy-700 text-gold-300"
                        : "text-gray-300 hover:bg-navy-800 hover:text-white"
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1">{children}</main>

        {/* Footer */}
        <footer className="bg-navy-950 text-gray-400 py-8 mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-sm">
                <p className="font-semibold text-gray-300">변호사시험 민사법 사례 생성기</p>
                <p className="mt-1 text-xs">
                  AI가 생성한 사례는 학습 목적으로만 활용하시기 바랍니다.
                </p>
              </div>
              <div className="text-xs text-center sm:text-right">
                <p>사실관계는 학습을 위해 각색되었을 수 있습니다.</p>
                <p className="mt-1">판례 원문은 법제처 국가법령정보센터에서 확인하세요.</p>
              </div>
            </div>
          </div>
        </footer>
      </div>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </>
  );
}
