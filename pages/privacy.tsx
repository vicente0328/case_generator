import Head from "next/head";
import Link from "next/link";

const SECTIONS = [
  "개인정보의 처리 목적",
  "처리하는 개인정보의 항목",
  "14세 미만 아동의 개인정보 처리",
  "개인정보의 처리 및 보유 기간",
  "개인정보의 파기 절차 및 방법",
  "개인정보의 제3자 제공",
  "개인정보 처리업무의 위탁",
  "개인정보의 국외 이전",
  "개인정보의 안전성 확보조치",
  "개인정보 자동 수집 장치의 설치·운영 및 거부",
  "정보주체와 법정대리인의 권리·의무 및 행사방법",
  "자동화된 결정에 관한 사항",
  "개인정보 보호책임자",
  "정보주체의 권익침해에 대한 구제방법",
  "개인정보 처리방침의 변경",
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-8">
      <h2 className="text-[15px] font-bold text-zinc-900 mb-3 pb-2 border-b border-zinc-100">{title}</h2>
      <div className="text-[13.5px] text-zinc-600 leading-[1.9] space-y-3">{children}</div>
    </section>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px] border-collapse">
        <thead>
          <tr className="bg-zinc-50">
            {headers.map((h, i) => (
              <th key={i} className="text-left px-3 py-2 border border-zinc-200 font-semibold text-zinc-700 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="even:bg-zinc-50/50">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 border border-zinc-200 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <>
      <Head>
        <title>개인정보 처리방침 — Case Generator</title>
      </Head>

      <div className="min-h-screen bg-white">
        {/* 헤더 */}
        <header className="border-b border-zinc-100 bg-white sticky top-0 z-10">
          <div className="max-w-[800px] mx-auto px-6 h-14 flex items-center gap-3">
            <Link href="/" className="text-zinc-400 hover:text-zinc-700 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <span className="text-[13px] font-semibold text-zinc-800">개인정보 처리방침</span>
          </div>
        </header>

        <div className="max-w-[800px] mx-auto px-6 py-10">
          {/* 서문 */}
          <div className="mb-10">
            <h1 className="text-[22px] font-bold text-zinc-900 mb-4">
              Case Generator 개인정보 처리방침
            </h1>
            <p className="text-[13.5px] text-zinc-500 leading-relaxed">
              Case Generator(이하 "서비스")는 정보주체의 자유와 권리 보호를 위해 「개인정보 보호법」 및
              관계 법령이 정한 바를 준수하여 적법하게 개인정보를 처리하고 안전하게 관리하고 있습니다.
              이에 「개인정보 보호법」 제30조에 따라 정보주체에게 개인정보의 처리와 보호에 관한 절차 및
              기준을 안내하고, 이와 관련한 고충을 신속하고 원활하게 처리할 수 있도록 하기 위하여
              다음과 같이 개인정보 처리방침을 수립·공개합니다.
            </p>
            <p className="text-[12px] text-zinc-400 mt-3">시행일: 2026년 6월 6일</p>
          </div>

          {/* 목차 */}
          <nav className="mb-10 p-5 bg-zinc-50 rounded-xl border border-zinc-100">
            <p className="text-[12px] font-semibold text-zinc-500 uppercase tracking-widest mb-3">목차</p>
            <ol className="space-y-1">
              {SECTIONS.map((title, i) => (
                <li key={i}>
                  <a
                    href={`#s${i + 1}`}
                    className="text-[13px] text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    {i + 1}. {title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="space-y-10">

            {/* 1 */}
            <Section id="s1" title="1. 개인정보의 처리 목적">
              <p>
                서비스는 다음의 목적을 위하여 개인정보를 처리합니다. 처리하고 있는 개인정보는 다음의 목적
                이외의 용도로는 이용되지 않으며, 이용 목적이 변경되는 경우에는 「개인정보 보호법」 제18조에
                따라 별도의 동의를 받는 등 필요한 조치를 이행할 예정입니다.
              </p>
              <ol className="list-decimal list-inside space-y-2 pl-1">
                <li><strong className="text-zinc-700">회원 가입 및 관리</strong> — 회원 가입 의사 확인, 본인 식별·인증, 회원자격 유지·관리, 서비스 부정이용 방지</li>
                <li><strong className="text-zinc-700">서비스 제공</strong> — 변호사시험 사례형 문제 생성, 판례 검색, My 판례함(개인 아카이브) 서비스 제공</li>
                <li><strong className="text-zinc-700">커뮤니티 운영</strong> — 생성된 문제의 공개 피드 운영, 댓글·추천 기능 제공</li>
                <li><strong className="text-zinc-700">AI 문제 생성</strong> — 이용자가 입력한 판례 정보를 AI 모델에 전달하여 사례형 문제 자동 생성</li>
                <li><strong className="text-zinc-700">서비스 개선 및 통계 분석</strong> — Google Analytics를 통한 서비스 이용 패턴 분석</li>
              </ol>
            </Section>

            {/* 2 */}
            <Section id="s2" title="2. 처리하는 개인정보의 항목">
              <p className="font-medium text-zinc-700">■ 계약 체결·이행을 위해 동의 없이 처리하는 개인정보</p>
              <p className="text-[12.5px] text-zinc-400">법적 근거: 「개인정보 보호법」 제15조제1항제4호</p>

              <Table
                headers={["처리 목적", "수집·이용 항목"]}
                rows={[
                  ["회원 서비스 운영", "이메일 주소, 표시명(닉네임), 사용자 고유 식별자(UID)\nGoogle 로그인 이용 시: Google 계정 이메일, 이름"],
                  ["생성된 문제·댓글 저장", "사용자 ID, 표시명, 생성된 문제 내용, 댓글 내용, 추천 기록"],
                  ["My 판례함", "저장한 판례 정보, 메모, 하이라이트, 중요도 평가"],
                  ["AI Pro 모델 사용량 관리", "주간/누적 Pro 모델 사용 횟수, 최종 사용 일시"],
                  ["서비스 통계 분석", "페이지 방문 이력, 세션 정보 (Google Analytics 자동 수집)"],
                ]}
              />

              <p className="mt-2 font-medium text-zinc-700">■ 비로그인(게스트) 이용자</p>
              <p>
                관리자가 허용한 경우 로그인 없이 문제를 생성할 수 있습니다. 이때 생성된 문제는
                무작위 익명 닉네임으로 공개 피드에 저장되며, 해당 닉네임은 브라우저의 localStorage에만
                보관됩니다. 개인을 식별할 수 있는 정보는 수집되지 않습니다.
              </p>
            </Section>

            {/* 3 */}
            <Section id="s3" title="3. 14세 미만 아동의 개인정보 처리">
              <p>
                서비스는 14세 미만 아동을 대상으로 하지 않으며, 14세 미만 아동의 개인정보를 의도적으로
                수집하지 않습니다.
              </p>
            </Section>

            {/* 4 */}
            <Section id="s4" title="4. 개인정보의 처리 및 보유 기간">
              <p>법령에 따른 보유·이용 기간 또는 정보주체로부터 동의받은 기간 내에서 개인정보를 처리·보유합니다.</p>
              <Table
                headers={["항목", "보유 기간"]}
                rows={[
                  ["회원 인증 정보", "회원 탈퇴 시까지"],
                  ["생성된 문제 및 댓글", "게시물 삭제 요청 또는 회원 탈퇴 시까지"],
                  ["AI 사용량 추적 정보", "회원 탈퇴 시까지"],
                  ["My 판례함", "이용자가 직접 삭제하거나 회원 탈퇴 시까지"],
                  ["Google Analytics 데이터", "Google LLC 정책에 따름 (기본 26개월)"],
                  ["서버 접속 로그", "Vercel Inc. 정책에 따름"],
                ]}
              />
              <p className="text-[12.5px] text-zinc-400">
                ※ 관계 법령 위반에 따른 수사·조사 등이 진행 중인 경우에는 해당 수사·조사 종료 시까지 보관합니다.
              </p>
            </Section>

            {/* 5 */}
            <Section id="s5" title="5. 개인정보의 파기 절차 및 방법">
              <p>개인정보 보유기간의 경과, 처리목적 달성 등으로 개인정보가 불필요하게 되었을 때에는 지체없이 해당 개인정보를 파기합니다.</p>
              <ol className="list-decimal list-inside space-y-2 pl-1">
                <li><strong className="text-zinc-700">파기 절차</strong> — Firebase Firestore에 저장된 개인정보는 보유 기간 경과 또는 회원 탈퇴·삭제 요청 시 즉시 파기됩니다.</li>
                <li><strong className="text-zinc-700">파기 방법</strong> — 전자적 파일 형태로 기록·저장된 개인정보는 기록을 재생할 수 없도록 파기합니다.</li>
              </ol>
            </Section>

            {/* 6 */}
            <Section id="s6" title="6. 개인정보의 제3자 제공">
              <p>
                서비스는 정보주체의 개인정보를 원칙적으로 제3자에게 제공하지 않습니다.
                다만, 다음의 경우에는 예외로 합니다.
              </p>
              <ol className="list-decimal list-inside space-y-2 pl-1">
                <li>정보주체로부터 별도의 동의를 받은 경우</li>
                <li>법률에 특별한 규정이 있는 경우 (예: 수사기관의 적법한 영장에 따른 요청)</li>
              </ol>
              <p className="text-[12.5px] bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
                ※ 문제 생성 시 생성된 문제는 공개 피드에 게시되어 서비스를 방문하는 모든 이용자가 열람할 수 있습니다.
                이용자가 문제 생성을 요청하는 행위는 공개 게시에 동의한 것으로 봅니다.
              </p>
            </Section>

            {/* 7 */}
            <Section id="s7" title="7. 개인정보 처리업무의 위탁">
              <p>서비스는 원활한 서비스 제공을 위해 다음과 같이 개인정보 처리 업무를 위탁하고 있습니다. 모든 위탁 업무는 국외에서 처리됩니다 (8항 참조).</p>
              <Table
                headers={["수탁사", "위탁하는 업무"]}
                rows={[
                  ["Google LLC (Firebase)", "회원 인증, 데이터베이스 저장·관리"],
                  ["Google LLC (Gemini API)", "AI 사례형 문제 생성"],
                  ["Anthropic PBC (Claude API)", "AI 사례형 문제 생성 (Gemini 장애 시 자동 대체)"],
                  ["Google LLC (Google Analytics)", "서비스 이용 통계 분석"],
                  ["Vercel Inc.", "웹 서비스 호스팅 및 API 서버 운영"],
                ]}
              />
              <p className="text-[12.5px] text-zinc-400">
                서비스는 위탁계약 체결 시 「개인정보 보호법」 제26조에 따라 위탁업무 수행목적 외 개인정보 처리금지,
                기술적·관리적 보호조치, 손해배상 등 책임에 관한 사항을 명시하고 있습니다.
              </p>
            </Section>

            {/* 8 */}
            <Section id="s8" title="8. 개인정보의 국외 이전">
              <p>
                서비스는 「개인정보 보호법」 제28조의8제1항제3호(계약 이행을 위한 국외 처리위탁·보관)에 근거하여
                다음과 같이 개인정보를 국외에 이전하고 있습니다.
              </p>
              <p className="text-[12.5px] bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-3">
                국외 이전을 거부하는 경우 서비스 이용이 불가능합니다. 이전을 원치 않으시면
                회원 탈퇴를 통해 데이터 삭제를 요청할 수 있습니다.
              </p>

              <div className="space-y-5 mt-1">
                {[
                  {
                    name: "① Firebase (Google LLC)",
                    items: [
                      ["이전 항목", "회원 인증 정보, 생성된 문제, 댓글, My 판례함 전체"],
                      ["이전 국가", "미국 (및 Google 데이터센터 소재 국가)"],
                      ["이전 시기·방법", "서비스 이용 시 실시간, 암호화된 네트워크 전송"],
                      ["이전받는 자", "Google LLC (privacy@google.com)"],
                      ["이용 목적", "회원 인증 및 데이터 저장·관리"],
                      ["보유 기간", "회원 탈퇴 시까지"],
                    ],
                  },
                  {
                    name: "② Google Generative AI / Gemini (Google LLC)",
                    items: [
                      ["이전 항목", "판례 정보 (사건번호, 사건명, 법원, 판시사항, 판결요지, 판례 원문 일부 최대 3,000자)"],
                      ["이전 국가", "미국"],
                      ["이전 시기·방법", "문제 생성 요청 시, 암호화된 네트워크 전송"],
                      ["이전받는 자", "Google LLC (privacy@google.com)"],
                      ["이용 목적", "AI 사례형 문제 생성"],
                      ["보유 기간", "Google API 서비스 약관에 따름"],
                    ],
                  },
                  {
                    name: "③ Anthropic Claude (Anthropic PBC)",
                    items: [
                      ["이전 항목", "판례 정보 (사건번호, 사건명, 법원, 판시사항, 판결요지, 판례 원문 일부 최대 3,000자)"],
                      ["이전 국가", "미국"],
                      ["이전 시기·방법", "Gemini 서비스 오류(503) 발생 시 자동 대체 처리, 암호화된 네트워크 전송"],
                      ["이전받는 자", "Anthropic PBC (privacy@anthropic.com)"],
                      ["이용 목적", "AI 사례형 문제 생성 (Gemini 대체)"],
                      ["보유 기간", "Anthropic API 서비스 약관에 따름"],
                    ],
                  },
                  {
                    name: "④ Google Analytics (Google LLC)",
                    items: [
                      ["이전 항목", "페이지 방문 이력, 세션 정보"],
                      ["이전 국가", "미국"],
                      ["이전 시기·방법", "페이지 방문 시 실시간, 쿠키를 통한 자동 수집"],
                      ["이전받는 자", "Google LLC (privacy@google.com)"],
                      ["이용 목적", "서비스 이용 통계 분석"],
                      ["보유 기간", "26개월 (Google Analytics 기본 설정)"],
                    ],
                  },
                  {
                    name: "⑤ Vercel Inc.",
                    items: [
                      ["이전 항목", "서비스 접속 로그 (IP 주소, 요청 정보)"],
                      ["이전 국가", "미국"],
                      ["이전 시기·방법", "서비스 접속 시 실시간, 암호화된 네트워크 전송"],
                      ["이전받는 자", "Vercel Inc. (privacy@vercel.com)"],
                      ["이용 목적", "웹 서비스 호스팅 및 API 처리"],
                      ["보유 기간", "Vercel 서비스 정책에 따름"],
                    ],
                  },
                ].map((entry) => (
                  <div key={entry.name} className="border border-zinc-100 rounded-xl overflow-hidden">
                    <div className="bg-zinc-50 px-4 py-2.5 border-b border-zinc-100">
                      <p className="font-semibold text-zinc-700 text-[13px]">{entry.name}</p>
                    </div>
                    <div className="divide-y divide-zinc-100">
                      {entry.items.map(([label, value]) => (
                        <div key={label} className="grid grid-cols-[120px_1fr] px-4 py-2.5 text-[12.5px]">
                          <span className="text-zinc-400 font-medium">{label}</span>
                          <span className="text-zinc-600">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* 9 */}
            <Section id="s9" title="9. 개인정보의 안전성 확보조치">
              <p>서비스는 개인정보의 안전성 확보를 위해 다음과 같은 조치를 취하고 있습니다.</p>
              <ol className="list-decimal list-inside space-y-2 pl-1">
                <li>
                  <strong className="text-zinc-700">기술적 조치</strong> —
                  Firebase Authentication을 통한 안전한 회원 인증,
                  Firestore 보안 규칙을 통한 데이터 접근 권한 통제(본인 데이터는 본인만 접근 가능),
                  HTTPS를 통한 전송 구간 전체 암호화,
                  서버 측 Firebase Admin SDK를 통한 인증 토큰 검증
                </li>
                <li>
                  <strong className="text-zinc-700">관리적 조치</strong> —
                  개인정보에 접근 가능한 관리자 계정 최소화, 서비스 운영 로그 모니터링
                </li>
              </ol>
            </Section>

            {/* 10 */}
            <Section id="s10" title="10. 개인정보 자동 수집 장치의 설치·운영 및 거부">
              <p className="font-medium text-zinc-700">■ localStorage (브라우저 로컬 저장소)</p>
              <p>서비스는 이용 편의를 위해 브라우저의 localStorage를 사용합니다. localStorage는 서버로 전송되지 않으며, 브라우저 설정에서 직접 삭제할 수 있습니다.</p>
              <Table
                headers={["항목", "목적", "보유 기간"]}
                rows={[
                  ["homeMode", "탭 UI 상태 유지", "브라우저 초기화 시까지"],
                  ["anonName", "비로그인 이용자 익명 닉네임", "브라우저 초기화 시까지"],
                  ["archiveIntroDismissedV2", "안내 팝업 표시 여부", "브라우저 초기화 시까지"],
                ]}
              />

              <p className="font-medium text-zinc-700 mt-4">■ Google Analytics 쿠키</p>
              <p>
                서비스는 Google Analytics(GA4)를 통해 서비스 이용 통계를 수집합니다.
                Google Analytics는 쿠키를 통해 방문 이력 및 세션 정보를 수집하여 미국 Google LLC 서버로 전송합니다.
                정보주체는 브라우저 설정을 통해 쿠키를 차단할 수 있습니다.
              </p>
              <div className="bg-zinc-50 rounded-lg px-4 py-3 text-[12.5px] space-y-1">
                <p className="font-medium text-zinc-600">▶ 쿠키 차단 방법</p>
                <p>· 크롬: 오른쪽 상단 ⋮ → 설정 → 개인정보 보호 및 보안 → 서드파티쿠키 → 차단</p>
                <p>· 엣지: 오른쪽 상단 … → 설정 → 개인정보 보호, 검색 및 서비스 → 추적방지 → 엄격 선택</p>
                <p className="text-zinc-400">※ 쿠키를 차단해도 서비스 이용에는 제한이 없습니다.</p>
              </div>
            </Section>

            {/* 11 */}
            <Section id="s11" title="11. 정보주체와 법정대리인의 권리·의무 및 행사방법">
              <p>정보주체는 서비스에 대해 언제든지 다음의 권리를 행사할 수 있습니다.</p>
              <ol className="list-decimal list-inside space-y-1 pl-1">
                <li>개인정보 열람 요구</li>
                <li>개인정보 정정·삭제 요구</li>
                <li>개인정보 처리정지 요구</li>
                <li>동의 철회 (회원 탈퇴)</li>
                <li>자동화된 결정에 대한 거부 및 설명 요구</li>
              </ol>
              <div className="bg-zinc-50 rounded-lg px-4 py-3 text-[12.5px] space-y-1">
                <p className="font-medium text-zinc-600">▶ 권리 행사 방법</p>
                <p>· 개인정보 조회·수정: 서비스 내 계정 설정에서 직접 가능</p>
                <p>· 회원 탈퇴: 계정 설정 내 탈퇴 기능 이용</p>
                <p>· 기타 요청: 아래 개인정보 보호책임자 이메일로 문의 (요청일로부터 10일 이내 처리)</p>
              </div>
              <p className="text-[12.5px] text-zinc-400">
                ※ 생성된 문제는 공개 피드에 게시되어 삭제 전까지 제3자가 열람할 수 있습니다.
                삭제 요청 시 해당 게시물은 즉시 삭제되나, 이미 제3자가 열람한 내용은 통제가 불가합니다.
              </p>
              <p className="text-[12.5px] text-zinc-400">
                ※ 권리 행사는 정보주체의 법정대리인이나 위임을 받은 자를 통해서도 가능합니다.
                이 경우 「개인정보 처리 방법에 관한 고시」 별지 제11호 서식에 따른 위임장을 제출해야 합니다.
              </p>
            </Section>

            {/* 12 */}
            <Section id="s12" title="12. 자동화된 결정에 관한 사항">
              <p>
                서비스는 「개인정보 보호법」 제37조의2에 따라 인공지능(AI) 기술을 활용한 자동화된 처리에
                관한 사항을 다음과 같이 안내합니다.
              </p>

              <div className="space-y-4">
                <div>
                  <p className="font-medium text-zinc-700 mb-1">■ 자동화된 처리의 목적 및 대상</p>
                  <p>이용자가 판례번호를 입력하면 AI 모델이 해당 판례 정보를 분석하여 변호사시험 사례형 문제 및 해설을 자동 생성합니다. 서비스를 통해 문제 생성을 요청한 모든 이용자가 대상입니다.</p>
                </div>

                <div>
                  <p className="font-medium text-zinc-700 mb-1">■ 처리되는 개인정보 유형</p>
                  <p>이용자가 입력한 판례 정보(사건번호, 판시사항, 판결요지, 판례 원문 최대 3,000자), 로그인 여부 및 누적 사용량(AI 모델 등급 결정에 사용)</p>
                </div>

                <div>
                  <p className="font-medium text-zinc-700 mb-1">■ 자동화된 처리 절차</p>
                  <p>판례번호 입력 → 법제처·대법원 API 판례 정보 조회 → AI 모델(Gemini 또는 Claude)에 판례 정보 전송 → 사례형 문제 자동 생성 → 이용자에게 결과 제공 및 공개 피드 저장</p>
                </div>

                <div>
                  <p className="font-medium text-zinc-700 mb-1">■ AI 모델 자동 선택</p>
                  <Table
                    headers={["이용자 구분", "적용 모델"]}
                    rows={[
                      ["비로그인 이용자", "Gemini Flash Lite (경량 모델)"],
                      ["로그인 이용자 (주 3회·누적 10회 한도 내)", "Gemini Pro"],
                      ["로그인 이용자 (한도 초과 시)", "Gemini Flash Lite 자동 전환"],
                    ]}
                  />
                </div>

                <div>
                  <p className="font-medium text-zinc-700 mb-1">■ 거부·설명 요구 방법</p>
                  <p>
                    자동으로 생성된 문제 내용에 이의가 있거나 자동화된 처리에 대한 설명을 요구하실 경우,
                    아래 개인정보 보호책임자 이메일로 문의하십시오. 요청일로부터 30일 이내에 회신합니다.
                  </p>
                </div>
              </div>
            </Section>

            {/* 13 */}
            <Section id="s13" title="13. 개인정보 보호책임자">
              <p>
                서비스는 개인정보 처리에 관한 업무를 총괄 책임지고, 정보주체의 개인정보 관련 불만처리 및
                피해구제를 위해 아래와 같이 개인정보 보호책임자를 지정하고 있습니다.
              </p>
              <div className="bg-zinc-50 rounded-xl border border-zinc-100 px-5 py-4 text-[13px]">
                <p className="font-semibold text-zinc-700 mb-2">▶ 개인정보 보호책임자</p>
                <p className="text-zinc-600">성 명: 고병욱</p>
                <p className="text-zinc-600">
                  이메일:{" "}
                  <a href="mailto:kennethkoh97@gmail.com" className="text-blue-600 hover:underline">
                    kennethkoh97@gmail.com
                  </a>
                </p>
              </div>
              <p className="text-[12.5px] text-zinc-400">
                정보주체는 서비스 이용 중 발생한 모든 개인정보 보호 관련 문의, 불만처리, 피해구제 등을 위 연락처로 문의하실 수 있습니다.
                지체없이 답변 및 처리해 드리겠습니다.
              </p>
            </Section>

            {/* 14 */}
            <Section id="s14" title="14. 정보주체의 권익침해에 대한 구제방법">
              <p>
                정보주체는 개인정보침해로 인한 구제를 받기 위하여 아래 기관에 분쟁 해결이나 상담을 신청할 수 있습니다.
              </p>
              <Table
                headers={["기관", "연락처", "홈페이지"]}
                rows={[
                  ["개인정보분쟁조정위원회", "(국번없이) 1833-6972", "www.kopico.go.kr"],
                  ["개인정보침해신고센터", "(국번없이) 118", "privacy.kisa.or.kr"],
                  ["대검찰청", "(국번없이) 1301", "www.spo.go.kr"],
                  ["경찰청", "(국번없이) 182", "ecrm.police.go.kr"],
                ]}
              />
            </Section>

            {/* 15 */}
            <Section id="s15" title="15. 개인정보 처리방침의 변경">
              <p>
                이 개인정보 처리방침은 <strong className="text-zinc-700">2026년 6월 6일</strong>부터 적용됩니다.
              </p>
              <p className="text-[12.5px] text-zinc-400">이전 개인정보 처리방침이 있는 경우 이 페이지 하단에 이력을 공개합니다.</p>
            </Section>

          </div>

          {/* 하단 */}
          <div className="mt-14 pt-6 border-t border-zinc-100 flex items-center justify-between">
            <p className="text-[12px] text-zinc-400">최종 수정: 2026. 6. 6.</p>
            <Link href="/" className="text-[12px] text-blue-600 hover:underline">
              서비스로 돌아가기
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
