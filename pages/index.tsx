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
      <section className="px-4 pt-20 pb-16">
        <div className="max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center gap-1.5 bg-navy-900/8 text-navy-700 text-xs font-semibold px-3.5 py-1.5 rounded-full mb-7 border border-navy-200/40">
            <span className="w-1.5 h-1.5 rounded-full bg-gold-500 inline-block" />
            변호사시험 민사법 사례형 학습 플랫폼
          </div>
          <h1 className="text-4xl sm:text-5xl font-serif font-bold text-gray-900 mb-5 leading-tight tracking-tight">
            판례로 만드는<br />
            <span className="text-navy-900">변시 사례형 문제</span>
          </h1>
          <p className="text-gray-500 text-base sm:text-lg mb-10 leading-relaxed">
            사건번호만 입력하면 AI가 실제 변호사시험 형식으로<br className="hidden sm:block" />
            사실관계·문제·해설을 자동으로 생성합니다.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/generate"
              className="inline-flex items-center justify-center gap-2 bg-navy-900 text-white px-8 py-3.5 rounded-full font-semibold text-base hover:bg-navy-700 transition-colors shadow-sm"
            >
              문제 생성 시작
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            <Link
              href="/community"
              className="inline-flex items-center justify-center gap-2 bg-white text-gray-700 px-8 py-3.5 rounded-full font-semibold text-base hover:bg-gray-50 transition-colors border border-gray-200"
            >
              커뮤니티 보기
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-4 py-14">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest text-center mb-8">핵심 기능</p>
          <div className="grid md:grid-cols-3 gap-4">
            {features.map((f) => (
              <div key={f.title} className="bg-white rounded-2xl p-6 border border-gray-200/60 shadow-sm">
                <div className="w-11 h-11 rounded-2xl bg-navy-50 flex items-center justify-center text-xl mb-4">
                  {f.icon}
                </div>
                <h3 className="font-serif font-bold text-gray-900 text-base mb-2">{f.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-4 py-14 bg-white border-y border-gray-200/60">
        <div className="max-w-4xl mx-auto">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest text-center mb-8">이용 방법</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {steps.map((s) => (
              <div key={s.num} className="text-center p-5">
                <div className="w-10 h-10 rounded-full bg-navy-900 text-white font-bold text-sm flex items-center justify-center mx-auto mb-4 font-serif">
                  {s.num}
                </div>
                <h3 className="font-semibold text-gray-900 text-sm mb-2">{s.title}</h3>
                <p className="text-gray-400 text-xs leading-relaxed whitespace-pre-line">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Notice */}
      <section className="px-4 py-10">
        <div className="max-w-2xl mx-auto bg-amber-50 border border-amber-200/80 rounded-2xl p-5 flex gap-4">
          <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 text-sm font-bold mt-0.5">
            !
          </div>
          <div>
            <h3 className="font-semibold text-amber-900 text-sm mb-1">학습 목적 서비스 안내</h3>
            <p className="text-amber-800 text-xs leading-relaxed">
              AI가 생성한 사실관계는 실제 판례와 다소 각색될 수 있으며, 변호사시험 출제 방향을 보장하지 않습니다.{" "}
              <Link href="/guide" className="underline font-medium">
                사용 가이드 →
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-16 text-center">
        <div className="max-w-xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-serif font-bold text-gray-900 mb-3">지금 바로 시작해 보세요</h2>
          <p className="text-gray-500 text-sm mb-8">
            판결요지만 봐서는 어떻게 출제될지 상상하기 어려울 때, 이 서비스가 도움이 됩니다.
          </p>
          <Link
            href="/generate"
            className="inline-flex items-center gap-2 bg-gold-500 text-white px-8 py-3.5 rounded-full font-bold text-base hover:bg-gold-600 transition-colors shadow-sm"
          >
            문제 생성하기
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </section>
    </Layout>
  );
}
