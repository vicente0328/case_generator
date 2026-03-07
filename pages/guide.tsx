import Layout from "@/components/Layout";
import { 
  LightBulbIcon, 
  ExclamationTriangleIcon,
  BookOpenIcon,
  ShieldCheckIcon
} from "@heroicons/react/24/outline";

export default function Guide() {
  const steps = [
    {
      title: "사건번호 준비",
      desc: "대법원 판례의 사건번호(예: 2016다271226)를 미리 준비해주세요. 최근 공부한 판례나 중요 판례를 추천합니다.",
      icon: <BookOpenIcon className="w-6 h-6 text-[#007AFF]" />,
    },
    {
      title: "문제 생성",
      desc: "'문제 생성' 메뉴에서 사건번호를 입력하고 조회를 누르세요. 판례 정보가 맞다면 생성을 시작합니다.",
      icon: <LightBulbIcon className="w-6 h-6 text-[#FF9500]" />,
    },
    {
      title: "학습 및 공유",
      desc: "생성된 문제를 풀며 학습하세요. 유익한 문제는 저장하여 커뮤니티에 공유할 수 있습니다.",
      icon: <ShieldCheckIcon className="w-6 h-6 text-[#34C759]" />,
    },
  ];

  return (
    <Layout title="이용 가이드 - Case Generator">
      <div className="max-w-3xl mx-auto py-10">
        <h1 className="text-[34px] font-bold text-[#1C1C1E] mb-2 text-center">이용 가이드</h1>
        <p className="text-[#8E8E93] text-[17px] text-center mb-12">
          Case Generator를 100% 활용하는 방법을 알려드립니다.
        </p>

        {/* Steps */}
        <div className="space-y-6 mb-16">
          {steps.map((step, i) => (
            <div key={i} className="bg-white p-6 rounded-[20px] shadow-sm border border-[#E5E5EA] flex gap-5 items-start">
              <div className="w-12 h-12 rounded-[14px] bg-[#F2F2F7] flex items-center justify-center flex-shrink-0">
                {step.icon}
              </div>
              <div>
                <h3 className="text-[19px] font-semibold text-[#1C1C1E] mb-2">{step.title}</h3>
                <p className="text-[#3A3A3C] text-[16px] leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Disclaimer */}
        <div className="bg-[#FF9500]/10 border border-[#FF9500]/20 rounded-[20px] p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-4">
            <ExclamationTriangleIcon className="w-7 h-7 text-[#FF9500]" />
            <h3 className="text-[19px] font-bold text-[#1C1C1E]">주의사항</h3>
          </div>
          <ul className="space-y-3">
            {[
              "AI가 생성한 사실관계는 실제 판례와 다소 차이가 있을 수 있습니다.",
              "본 서비스는 변호사시험 학습 보조 도구이며, 실제 출제 경향과 완벽히 일치하지 않을 수 있습니다.",
              "생성된 해설은 참고용으로만 활용하시고, 정확한 내용은 반드시 기본서나 판례 원문을 확인해주세요."
            ].map((txt, i) => (
              <li key={i} className="flex gap-3 text-[#3A3A3C] text-[16px] leading-relaxed">
                <span className="text-[#FF9500] font-bold">•</span>
                {txt}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Layout>
  );
}
