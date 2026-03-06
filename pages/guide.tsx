import Link from "next/link";
import Layout from "@/components/Layout";

const faqs = [
  {
    q: "AI가 생성한 문제가 실제 변호사시험과 동일한가요?",
    a: "AI가 생성한 문제는 변호사시험 형식을 모방하지만, 실제 출제 방향을 보장하지 않습니다. 판결요지만 봐서는 어떻게 출제될지 감이 오지 않을 때 이해를 돕기 위한 학습 목적으로 활용하시기 바랍니다.",
  },
  {
    q: "사실관계가 실제 판례와 다른 것 같아요.",
    a: "의도적입니다. 사실관계는 변호사시험 특유의 인물 관계(甲, 乙, 丙 등)로 각색되며, 쟁점이 자연스럽게 드러나도록 재구성됩니다. 원본 판례 정보는 게시물 내 '원본 판례 정보 보기'를 통해 확인할 수 있습니다.",
  },
  {
    q: "법제처 API 연결이 안 됩니다.",
    a: ".env 파일에 LAW_OC 값(법제처 가입 이메일의 ID 부분)이 올바르게 설정되어 있는지 확인하세요. 법제처 국가법령정보센터(law.go.kr)에서 무료로 가입 후 사용할 수 있습니다.",
  },
  {
    q: "문제 생성이 오래 걸려요.",
    a: "Claude Opus 모델을 사용하여 고품질 문제를 생성하기 때문에 30초~1분 정도 소요될 수 있습니다. 페이지를 닫지 마세요.",
  },
  {
    q: "생성된 문제의 오류를 발견했어요.",
    a: "커뮤니티 게시물에서 '검수 필요' 반응을 눌러 주세요. 여러 명이 검수 필요를 표시하면 다른 학습자들이 주의할 수 있습니다. 댓글로 구체적인 오류를 지적해 주시면 큰 도움이 됩니다.",
  },
];

const exampleCases = [
  { num: "2016다271226", topic: "대물변제의 요물계약성, 혼동의 법리" },
  { num: "2019다272855", topic: "채권양도 후 혼동에 의한 채권 소멸" },
  { num: "2021다264253", topic: "공동임차인의 임대차보증금반환채권의 불가분채권성" },
  { num: "2020다209815", topic: "점유 종료 후 유익비상환청구권의 제한" },
  { num: "2003다30890", topic: "물상보증인 소송에서 응소에 의한 시효중단 제한" },
  { num: "2021다244617", topic: "명의신탁에서 간접점유 부정" },
];

export default function GuidePage() {
  return (
    <Layout title="사용 가이드 - 변시 민사법 사례 생성기">
      <div className="max-w-4xl mx-auto px-4 py-10">
        {/* Hero */}
        <div className="bg-navy-950 rounded-2xl text-white p-8 sm:p-12 mb-10">
          <div className="inline-block bg-gold-500/20 border border-gold-500/30 text-gold-300 text-xs font-semibold px-3 py-1 rounded-full mb-4">
            사용 가이드
          </div>
          <h1 className="text-3xl font-serif font-bold mb-4">
            이 서비스를 만든 이유
          </h1>
          <p className="text-gray-300 leading-loose text-base">
            <strong className="text-white">판결요지만 봐서는 상상이 가지 않을 때, 어떻게 문제로 출제될지 감이 오지 않을 때</strong>를 위해
            이 서비스를 만들었습니다. 판례의 핵심 법리가 변호사시험 사례형 문제로 어떻게 변환되는지
            간단한 케이스를 만들어 이해를 돕고자 합니다.
          </p>
          <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
            <p className="text-amber-200 text-sm leading-relaxed">
              <strong className="text-amber-100">주의사항:</strong> AI가 생성한 사실관계는 실제 판례와 다소 각색되었을 수 있으며,
              변호사시험 출제 방향을 보장하지 않습니다. 학습 참고용으로만 활용하시고,
              원본 판례는 반드시 법제처 국가법령정보센터에서 확인하세요.
            </p>
          </div>
        </div>

        {/* How to use */}
        <section className="mb-10">
          <h2 className="text-2xl font-serif font-bold text-navy-900 mb-6">사용 방법</h2>
          <div className="space-y-4">
            {[
              {
                step: "1",
                title: "사건번호 확인",
                body: "학습하고 싶은 대법원 판례의 사건번호를 확인합니다. 판례는 대법원 법원도서관(library.scourt.go.kr) 또는 법제처 국가법령정보센터(law.go.kr)에서 찾을 수 있습니다. 사건번호 형식: 2016다271226 (연도 + 사건종류 + 번호)",
              },
              {
                step: "2",
                title: "판례 조회",
                body: "문제 생성 페이지에서 사건번호를 입력하고 '판례 조회' 버튼을 클릭합니다. 법제처 API를 통해 판시사항, 판결요지, 판례 본문을 자동으로 불러옵니다.",
              },
              {
                step: "3",
                title: "문제 생성",
                body: "불러온 판례 정보를 확인하고 '문제 생성' 버튼을 클릭합니다. Claude Opus 모델이 판결요지의 핵심 법리를 분석하여 변호사시험 형식(사실관계 → 문제 → 해설)으로 사례형 문제를 생성합니다.",
              },
              {
                step: "4",
                title: "학습 및 공유",
                body: "생성된 문제로 학습 후, '커뮤니티에 공유' 버튼으로 다른 수험생과 문제를 공유할 수 있습니다. 커뮤니티에서 다른 수험생의 문제를 열람하고 댓글로 의견을 나누세요.",
              },
            ].map((item) => (
              <div key={item.step} className="flex gap-4 bg-white rounded-xl border border-gray-100 p-5">
                <div className="flex-shrink-0 w-10 h-10 bg-navy-900 rounded-full flex items-center justify-center text-gold-400 font-bold text-sm">
                  {item.step}
                </div>
                <div>
                  <h3 className="font-semibold text-navy-900 mb-1">{item.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Generated format explanation */}
        <section className="mb-10">
          <h2 className="text-2xl font-serif font-bold text-navy-900 mb-6">생성 문제 형식 설명</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              {
                color: "border-amber-400 bg-amber-50",
                titleColor: "text-amber-900",
                title: "사실관계",
                desc: "실제 판례의 사실관계를 甲, 乙, 丙 등 변시 특유의 인물 관계로 각색한 내용입니다. 날짜, 금액, 부동산 등 구체적 수치가 포함됩니다.",
              },
              {
                color: "border-navy-500 bg-navy-50",
                titleColor: "text-navy-900",
                title: "문 X (XX점)",
                desc: "판례의 핵심 쟁점을 '~의 타당성을 검토하시오', '~인지 논하시오' 형태로 구성합니다. 배점은 15~30점 사이입니다.",
              },
              {
                color: "border-blue-400 bg-blue-50",
                titleColor: "text-blue-900",
                title: "해설",
                desc: "결론 → 논거(민법 조문 + 판례법리 포섭) → 모델 판례 순으로 구성됩니다. 실제 합격 답안 수준의 논리 구조를 참고하세요.",
              },
              {
                color: "border-gold-400 bg-gray-50",
                titleColor: "text-gray-700",
                title: "모델 판례",
                desc: "해당 사건의 판결요지를 원문 그대로 인용합니다. 판결요지를 정확히 암기하고 이해하는 데 활용하세요.",
              },
            ].map((item) => (
              <div key={item.title} className={`border-l-4 ${item.color} p-4 rounded-r-xl`}>
                <h3 className={`font-serif font-bold ${item.titleColor} mb-1`}>{item.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Example cases */}
        <section className="mb-10">
          <h2 className="text-2xl font-serif font-bold text-navy-900 mb-6">학습 추천 판례</h2>
          <p className="text-sm text-gray-500 mb-4">
            제14·15회 변호사시험에 출제된 주요 법리 관련 판례입니다. 사건번호를 클릭하면 바로 문제를 생성할 수 있습니다.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {exampleCases.map((c) => (
              <Link
                key={c.num}
                href={`/generate?case=${c.num}`}
                className="flex items-start gap-3 bg-white rounded-xl border border-gray-100 p-4 hover:border-navy-200 hover:shadow-sm transition-all group"
              >
                <span className="font-mono text-sm text-navy-700 bg-navy-50 px-2.5 py-1 rounded border border-navy-100 flex-shrink-0 group-hover:bg-navy-100">
                  {c.num}
                </span>
                <span className="text-sm text-gray-600 mt-0.5">{c.topic}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Community features */}
        <section className="mb-10">
          <h2 className="text-2xl font-serif font-bold text-navy-900 mb-6">커뮤니티 활용법</h2>
          <div className="space-y-3">
            {[
              {
                icon: "👁",
                title: "문제 열람",
                desc: "다른 수험생이 생성한 문제를 자유롭게 열람할 수 있습니다. 최신순/추천순으로 정렬하여 볼 수 있습니다.",
              },
              {
                icon: "👍",
                title: "추천 반응",
                desc: "잘 만들어진 문제에 '추천' 반응을 남겨 주세요. 추천이 많은 문제는 신뢰도 높은 학습 자료로 활용됩니다.",
              },
              {
                icon: "⚠",
                title: "검수 필요 반응",
                desc: "오류가 있거나 법리적으로 문제가 있는 문제에 '검수 필요' 반응을 남겨 주세요. 다른 학습자에게 주의를 알립니다.",
              },
              {
                icon: "💬",
                title: "댓글 토론",
                desc: "판례 해석, 법리적 의문점, 학습 팁 등을 댓글로 공유하세요. 함께 토론하며 더 깊이 이해할 수 있습니다.",
              },
            ].map((item) => (
              <div key={item.title} className="flex gap-4 bg-white rounded-xl border border-gray-100 p-4">
                <div className="text-2xl flex-shrink-0">{item.icon}</div>
                <div>
                  <h3 className="font-semibold text-navy-900 text-sm mb-0.5">{item.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-10">
          <h2 className="text-2xl font-serif font-bold text-navy-900 mb-6">자주 묻는 질문</h2>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <details key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden group">
                <summary className="px-5 py-4 cursor-pointer flex items-center justify-between gap-3 hover:bg-gray-50">
                  <span className="text-sm font-medium text-navy-900">{faq.q}</span>
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div className="px-5 pb-4 pt-1 border-t border-gray-100">
                  <p className="text-sm text-gray-600 leading-relaxed">{faq.a}</p>
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="text-center bg-navy-50 rounded-2xl p-8 border border-navy-100">
          <h3 className="font-serif font-bold text-navy-900 text-xl mb-3">지금 바로 시작해 보세요</h3>
          <p className="text-gray-500 text-sm mb-5">
            판결요지를 사례형 문제로 변환하여 이해도를 높여 보세요.
          </p>
          <Link href="/generate" className="btn-gold rounded-xl">
            문제 생성하기
          </Link>
        </div>
      </div>
    </Layout>
  );
}
