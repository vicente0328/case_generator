import Link from "next/link";
import Layout from "@/components/Layout";

const features = [
  {
    icon: "⚖",
    title: "판례 기반 문제 생성",
    desc: "사건번호를 입력하면 법제처 API로 판례를 불러와 Claude Opus가 변시 형식의 사례형 문제를 자동 생성합니다.",
  },
  {
    icon: "📋",
    title: "실전 변시 형식",
    desc: "사실관계 → 문제(배점 포함) → 해설(결론·논거·모델 판례 원문)의 실제 변호사시험 형식을 그대로 구현합니다.",
  },
  {
    icon: "💬",
    title: "커뮤니티 학습",
    desc: "다른 수험생이 생성한 문제를 열람하고, 댓글과 추천·검수 반응을 통해 함께 학습할 수 있습니다.",
  },
];

const steps = [
  { num: "01", title: "사건번호 입력", desc: "대법원 판례의 사건번호를 입력합니다.\n예) 2016다271226" },
  { num: "02", title: "판례 자동 조회", desc: "법제처 국가법령정보센터 API에서\n판시사항·판결요지를 자동으로 불러옵니다." },
  { num: "03", title: "AI 문제 생성", desc: "Claude Opus가 변시 형식으로\n사실관계·문제·해설을 생성합니다." },
  { num: "04", title: "저장 & 공유", desc: "생성된 문제를 커뮤니티에 게시하여\n다른 수험생과 함께 학습합니다." },
];

export default function Home() {
  return (
    <Layout title="변시 민사법 사례 생성기">
      {/* Hero */}
      <section className="bg-navy-950 text-white py-20 px-4 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, transparent, transparent 40px, rgba(255,255,255,.05) 40px, rgba(255,255,255,.05) 41px), repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(255,255,255,.05) 40px, rgba(255,255,255,.05) 41px)",
            }}
          />
        </div>

        <div className="max-w-4xl mx-auto text-center relative">
          <div className="inline-block bg-gold-500/20 border border-gold-500/40 text-gold-300 text-xs font-semibold px-4 py-1.5 rounded-full mb-6 tracking-wide">
            변호사시험 민사법 사례형 학습 플랫폼
          </div>
          <h1 className="text-4xl sm:text-5xl font-serif font-bold mb-6 leading-tight">
            판례로 만드는
            <br />
            <span className="text-gold-400">변시 민사법 사례형 문제</span>
          </h1>
          <p className="text-gray-300 text-lg mb-10 max-w-2xl mx-auto leading-relaxed">
            사건번호만 입력하면, AI가 실제 변호사시험 형식으로
            <br className="hidden sm:block" />
            사실관계·문제·해설을 자동으로 생성해 드립니다.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/generate"
              className="inline-flex items-center justify-center gap-2 bg-gold-500 text-navy-900 px-8 py-3.5 rounded-xl font-bold text-base hover:bg-gold-400 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              문제 생성 시작
            </Link>
            <Link
              href="/community"
              className="inline-flex items-center justify-center gap-2 border border-white/30 text-white px-8 py-3.5 rounded-xl font-semibold text-base hover:bg-white/10 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              커뮤니티 둘러보기
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-serif font-bold text-navy-900 text-center mb-12">
            핵심 기능
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {features.map((f) => (
              <div key={f.title} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="font-serif font-bold text-navy-900 text-lg mb-2">{f.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-serif font-bold text-navy-900 text-center mb-12">
            이용 방법
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((s, i) => (
              <div key={s.num} className="relative">
                {i < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-8 left-full w-full h-0.5 bg-gray-200 z-0" style={{ width: "calc(100% - 3rem)", left: "calc(50% + 1.5rem)" }} />
                )}
                <div className="relative bg-white rounded-xl p-5 shadow-sm border border-gray-100 text-center z-10">
                  <div className="text-gold-500 font-serif font-bold text-2xl mb-2">{s.num}</div>
                  <h3 className="font-semibold text-navy-900 mb-2">{s.title}</h3>
                  <p className="text-gray-500 text-xs leading-relaxed whitespace-pre-line">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Notice Banner */}
      <section className="py-10 px-4 bg-amber-50 border-t border-b border-amber-200">
        <div className="max-w-4xl mx-auto flex gap-4">
          <div className="flex-shrink-0 w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 text-lg">
            ⚠
          </div>
          <div>
            <h3 className="font-semibold text-amber-900 mb-1">학습 목적 서비스 안내</h3>
            <p className="text-amber-800 text-sm leading-relaxed">
              이 서비스는 <strong>학습 목적</strong>으로 제공됩니다. AI가 생성한 사실관계는 실제 판례와 다소 각색될 수 있으며,
              변호사시험 출제 방향을 보장하지 않습니다.{" "}
              <Link href="/guide" className="underline hover:text-amber-900">
                사용 가이드 보기 →
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 bg-navy-900 text-white text-center">
        <h2 className="text-3xl font-serif font-bold mb-4">지금 바로 시작해 보세요</h2>
        <p className="text-gray-300 mb-8 max-w-xl mx-auto">
          판결요지만 봐서는 어떻게 출제될지 상상하기 어려울 때, 이 서비스가 도움이 됩니다.
        </p>
        <Link
          href="/generate"
          className="inline-flex items-center gap-2 bg-gold-500 text-navy-900 px-8 py-3.5 rounded-xl font-bold text-base hover:bg-gold-400 transition-colors"
        >
          문제 생성하기
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </section>
    </Layout>
  );
}
