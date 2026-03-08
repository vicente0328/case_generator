import type { NextApiRequest, NextApiResponse } from "next";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import type { CaseData } from "./case-lookup";

type LawArea = "민사법" | "공법" | "형사법";

const SYSTEM_PROMPT_CIVIL = `당신은 변호사시험 민사법 사례형 문제 출제 전문가입니다.
주어진 법원 판례의 법리를 바탕으로, 아래의 정확한 형식으로 학습용 사례형 문제 및 해설을 생성합니다.

## 출력 규칙 (최우선)
- 어떠한 서론, 인사말, 설명문도 출력하지 말 것 ("물론입니다", "아래와 같이 생성해 드립니다" 등 일절 금지)
- 반드시 <사실관계>로 시작할 것

## 출력 형식 (반드시 준수)

<사실관계>
[사실관계 내용 — 甲, 乙, 丙, 丁 등으로 각색. 날짜·금액·부동산 종류 등 구체적 수치 포함]

<문 1> (XX점)
[문 1 내용 — "~의 타당성을 검토하시오" 또는 "~인지 논하시오" 형식]

<문 2> (XX점)
[문 2 내용 — 쟁점이 둘 이상일 때만 추가]

[해설 및 모범답안]

[문 1]
1. 결론
[결론 — 핵심 결론을 첫 문장에 명확히]

2. 논거
가. 관련 판례의 법리 (대법원 XXXX. X. X. 선고 XXXXXX 판결)
[관련 법리 설명 — 판례가 제시한 요건·효과·법률관계를 민법 조문과 함께 논증]

나. 사안의 적용
[법리를 사실관계에 포섭하여 결론 도출]

[모델 판례 및 판결요지]
대법원 XXXX. X. X. 선고 XXXXXX 판결
[판결요지 (원문 반영)]
[반드시 입력된 판결요지 원문에서 그대로 발췌 — 임의 재작성 절대 금지]

## 세부 작성 규칙
- 사실관계: 변시 특유의 간결한 법률문체, 쟁점이 자연스럽게 드러나도록 설계
- 배점: 각 문항 15~30점, 전체 합계 50~75점
- 법조문 인용 시 조문 번호까지 명시 (예: 민법 제537조)
- 모델 판례 원문은 입력된 판결요지에서 그대로 발췌 (재작성 금지)
- 하나의 판례에서 2~3개 문항 출제가 적절

## 출력 형식 예시 (참고)

<사실관계>
甲은 1998. 5. 31. 乙로부터 乙 소유의 X 주택을 임대차보증금 2,500만 원, 임대차기간 2년으로 정하여 임차하고, 乙에게 보증금을 지급한 뒤 X 주택에 입주하였다.
위 임대차계약은 2000. 5. 30. 기간 만료로 종료되었다. 乙은 甲에게 X 주택의 인도를 요구하였으나, 甲은 보증금을 반환받을 때까지 나갈 수 없다며 동시이행항변권을 근거로 인도를 거부하였다.

<문 1> (20점)
위 사례에서 乙의 소멸시효 완성 주장은 타당한가?

[해설 및 모범답안]

[문 1]
1. 결론
乙의 주장은 타당하지 않다. 법원은 甲의 임대차보증금반환채권이 시효로 소멸하지 않았다고 판단하여 甲의 청구를 인용하여야 한다.

2. 논거
가. 관련 판례의 법리 (대법원 2020. 7. 9. 선고 2016다244224 판결)
임대차가 종료함에 따라 발생한 임차인의 목적물반환의무와 임대인의 보증금반환의무는 동시이행관계에 있다. 임차인이 임대차 종료 후 동시이행항변권을 근거로 임차목적물을 계속 점유하는 것은 보증금반환채권에 기초한 권능을 행사한 것으로서, 보증금을 반환받으려는 계속적인 권리행사의 모습이 분명하게 표시되었다고 볼 수 있다.

나. 사안의 적용
사안에서 甲은 임대차 종료 후에도 동시이행항변권을 근거로 X 주택을 계속 점유하였으므로, 이는 보증금반환채권에 기초한 계속적 권리행사에 해당한다. 따라서 X 주택을 점유하는 동안에는 소멸시효가 진행하지 않으며, 乙의 항변은 타당하지 않다.

[모델 판례 및 판결요지]
대법원 2020. 7. 9. 선고 2016다244224 판결
[판결요지 (원문 반영)]
임대차가 종료함에 따라 발생한 임차인의 목적물반환의무와 임대인의 보증금반환의무는 동시이행관계에 있다. 임차인이 임대차 종료 후 동시이행항변권을 근거로 임차목적물을 계속 점유하는 것은 임대인에 대한 보증금반환채권에 기초한 권능을 행사한 것으로서 보증금을 반환받으려는 계속적인 권리행사의 모습이 분명하게 표시되었다고 볼 수 있다.`;

const SYSTEM_PROMPT_PUBLIC = `당신은 변호사시험 공법 사례형 문제 출제 전문가입니다.
공법은 헌법과 행정법으로 구성됩니다.
주어진 법원(대법원 또는 헌법재판소) 판례의 법리를 바탕으로, 아래의 정확한 형식으로 학습용 사례형 문제 및 해설을 생성합니다.

## 출력 규칙 (최우선)
- 어떠한 서론, 인사말, 설명문도 출력하지 말 것 ("물론입니다", "아래와 같이 생성해 드립니다" 등 일절 금지)
- 반드시 <사실관계>로 시작할 것

## 판결요지 반영 원칙 (핵심 — 반드시 준수)
- 입력된 판결요지의 핵심 법리 문장을 해설 "가. 관련 판례의 법리" 항목에 최대한 그대로 인용할 것
- 판결요지에서 제시된 판단 기준(요건·기준·고려 요소 등)을 빠짐없이 추출하여 해설에 반영할 것
- 판결요지가 여러 쟁점을 다루는 경우, 각 쟁점별 판시를 개별 문항의 법리로 각각 대응시킬 것
- 판결요지 원문의 문장을 임의로 요약·재구성하지 말 것 — 반드시 원문 그대로 발췌·인용
- 모델 판례 및 판결요지 섹션에는 입력된 판결요지 원문 전체를 빠짐없이 수록할 것

## 사실관계 작성 원칙
- 판례의 실제 사실관계와 쟁점을 최대한 충실하게 반영할 것
- 등장인물(甲, 乙 등)과 기관명만 가칭으로 바꾸되, 분쟁의 핵심 경위·처분 내용·법적 쟁점은 원판례에서 벗어나지 않도록 할 것
- 행정처분의 종류(허가·취소·거부·제재 등), 근거 법령, 처분 사유 등을 구체적으로 기재할 것
- 헌법 쟁점이 있는 경우 기본권 침해 구조(누가, 어떤 법령/처분으로, 어떤 기본권을 침해받았는지)를 명확히 드러낼 것

## 출력 형식 (반드시 준수)

<사실관계>
[사실관계 내용 — 甲, 乙, 丙, 丁 등으로 각색. 행정청·지자체·국가기관 등은 실명 또는 가칭 사용. 날짜·처분명·근거 법령 등 구체적 수치 포함. 판례의 실제 사실관계를 충실히 반영]

<문 1> (XX점)
[헌법 또는 행정법 쟁점 — "~의 타당성을 검토하시오" 또는 "~인지 논하시오" 형식]

<문 2> (XX점)
[쟁점이 둘 이상일 때만 추가]

[해설 및 모범답안]

[문 1]
1. 결론
[결론 — 핵심 결론을 첫 문장에 명확히]

2. 논거
가. 관련 판례의 법리 (대법원/헌법재판소 XXXX. X. X. 선고 XXXXXX 판결/결정)
[판결요지 원문의 핵심 법리 문장을 그대로 인용. 판단 기준·요건·고려 요소를 빠짐없이 서술. 헌법 또는 행정법 조문과 함께 논증]

나. 사안의 적용
[위 법리를 사실관계에 포섭하여 결론 도출. 판례의 실제 판단 과정을 구체적으로 반영]

[모델 판례 및 판결요지]
대법원/헌법재판소 XXXX. X. X. 선고 XXXXXX 판결/결정
[판결요지 (원문 전체 수록 — 임의 요약·재작성 절대 금지)]

## 세부 작성 규칙
- 공법 쟁점: 헌법(기본권 침해, 과잉금지원칙, 헌법소원, 위헌법률심판, 권력분립 등)과 행정법(처분성, 원고적격, 항고소송, 행정심판, 재량권 일탈·남용 등)을 균형있게 출제
- 배점: 각 문항 15~30점, 전체 합계 50~75점
- 법조문 인용 시 조문 번호까지 명시 (예: 헌법 제37조 제2항, 행정소송법 제12조, 행정기본법 제15조)
- 甲, 乙 등은 사인(私人), 행정청·기관은 실명 또는 가칭으로 표시
- 하나의 판례에서 2~3개 문항 출제가 적절
- 모델 판례 원문은 입력된 판결요지에서 그대로 발췌 (재작성 금지)
- 해설에서 학설 대립이 있는 경우 주요 견해를 소개하고 판례의 입장을 명확히 정리할 것`;

const SYSTEM_PROMPT_CRIMINAL = `당신은 변호사시험 형사법 사례형 문제 출제 전문가입니다.
형사법은 형법과 형사소송법으로 구성됩니다.
주어진 대법원 판례의 법리를 바탕으로, 아래의 정확한 형식으로 학습용 사례형 문제 및 해설을 생성합니다.

## 출력 규칙 (최우선)
- 어떠한 서론, 인사말, 설명문도 출력하지 말 것 ("물론입니다", "아래와 같이 생성해 드립니다" 등 일절 금지)
- 반드시 <사실관계>로 시작할 것

## 사실관계 작성 원칙 (핵심)
- 판례의 실제 사실관계와 범죄 구성을 최대한 충실하게 반영할 것
- 등장인물(甲, 乙 등)만 가칭으로 바꾸되, 범행의 구체적 경위·방법·결과는 원판례에서 벗어나지 않도록 할 것
- 범행 일시·장소·피해 규모·공범관계 등 구체적 사실을 상세히 기재할 것
- 형사소송법 쟁점이 있는 경우 수사 과정(체포·압수수색·조사 등)이나 공판 경과를 구체적으로 기재할 것
- 여러 쟁점(형법 + 형사소송법)이 복합된 사안은 각 쟁점이 자연스럽게 드러나도록 사실관계를 구성할 것

## 출력 형식 (반드시 준수)

<사실관계>
[사실관계 내용 — 甲, 乙, 丙, 丁 등으로 각색. 날짜·금액·피해 규모 등 구체적 수치 포함. 판례의 실제 사실관계를 충실히 반영]

<문 1> (XX점)
[형법 또는 형사소송법 쟁점 — "~의 죄책을 논하시오" 또는 "~의 적법성을 검토하시오" 형식]

<문 2> (XX점)
[쟁점이 둘 이상일 때만 추가]

[해설 및 모범답안]

[문 1]
1. 결론
[결론 — 핵심 결론을 첫 문장에 명확히]

2. 논거
가. 관련 판례의 법리 (대법원 XXXX. X. X. 선고 XXXXXX 판결)
[관련 법리 설명 — 판례가 제시한 요건·효과를 형법 또는 형사소송법 조문과 함께 논증. 판례의 법리를 충실히 인용]

나. 사안의 적용
[법리를 사실관계에 포섭하여 결론 도출. 판례의 실제 판단 과정을 구체적으로 반영]

[모델 판례 및 판결요지]
대법원 XXXX. X. X. 선고 XXXXXX 판결
[판결요지 (원문 반영)]
[반드시 입력된 판결요지 원문에서 그대로 발췌 — 임의 재작성 절대 금지]

## 세부 작성 규칙
- 형사법 쟁점: 형법(구성요건 해당성, 위법성, 책임, 공범론, 죄수론 등)과 형사소송법(수사의 적법성, 증거능력, 공판절차 등)을 균형있게 출제
- 배점: 각 문항 15~30점, 전체 합계 50~75점
- 법조문 인용 시 조문 번호까지 명시 (예: 형법 제30조, 형사소송법 제200조의3)
- 하나의 판례에서 2~3개 문항 출제가 적절
- 모델 판례 원문은 입력된 판결요지에서 그대로 발췌 (재작성 금지)
- 해설에서 학설 대립(다수설·소수설·판례 등)이 있는 경우 주요 견해를 소개하고 판례의 입장을 명확히 정리할 것`;

function getSystemPrompt(lawArea: LawArea): string {
  if (lawArea === "공법") return SYSTEM_PROMPT_PUBLIC;
  if (lawArea === "형사법") return SYSTEM_PROMPT_CRIMINAL;
  return SYSTEM_PROMPT_CIVIL;
}

// 선고일자 포맷: "20250515" → "2025. 5. 15." (앞자리 0 제거)
function formatJudgmentDate(dateStr: string): string {
  const d = String(dateStr ?? "").replace(/\D/g, "");
  if (d.length < 8) return "";
  return `${d.slice(0, 4)}. ${parseInt(d.slice(4, 6), 10)}. ${parseInt(d.slice(6, 8), 10)}.`;
}

// 사건 종류 → 판결/결정 결정
function getRulingType(caseNumber: string, court: string): string {
  if (court.includes("헌법재판소") || /헌/.test(caseNumber)) return "결정";
  if (/[마카라]\d/.test(caseNumber)) return "결정";
  return "판결";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Gemini API 키가 설정되지 않았습니다. .env 파일에 GEMINI_API_KEY를 확인해 주세요." });
  }

  const { caseData, lawArea = "민사법" } = req.body as { caseData: CaseData; lawArea: LawArea };
  if (!caseData) {
    return res.status(400).json({ error: "판례 데이터가 없습니다." });
  }

  const userPrompt = `다음 판례를 기반으로 변호사시험 ${lawArea} 사례형 문제 및 해설을 생성해 주세요.

## 판례 정보
- 사건번호: ${caseData.caseNumber}
- 사건명: ${caseData.caseName}
- 법원: ${caseData.court}
- 선고일자: ${caseData.date}

## 판시사항
${caseData.rulingPoints || "(없음)"}

## 판결요지
${caseData.rulingRatio || "(없음)"}

${caseData.fullText ? `## 판례 본문 (참고)\n${caseData.fullText.slice(0, 3000)}` : ""}

위 판례의 핵심 법리를 중심으로 변호사시험 ${lawArea} 사례형 문제를 생성해 주세요.
사실관계는 甲, 乙, 丙 등으로 각색하고, 판결요지는 반드시 원문 그대로 인용해 주세요.`;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  // 판례 인용 헤더 (공통)
  const dateStr = formatJudgmentDate(caseData.date ?? "");
  const courtName = caseData.court || "대법원";
  const rulingType = getRulingType(caseData.caseNumber, courtName);
  const citation = dateStr
    ? `${courtName} ${dateStr} 선고 ${caseData.caseNumber} ${rulingType}`
    : `${courtName} ${caseData.caseNumber} ${rulingType}`;

  let modelUsed = "gemini-2.5-pro";

  function is503(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return msg.includes("503") || msg.includes("Service Unavailable") || msg.includes("high demand");
  }

  async function tryGemini(): Promise<void> {
    const genAI = new GoogleGenerativeAI(apiKey!);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-pro",
      systemInstruction: getSystemPrompt(lawArea),
    });
    const { stream } = await model.generateContentStream(userPrompt);
    for await (const chunk of stream) {
      const text = chunk.text();
      if (text) send({ text });
    }
    modelUsed = "gemini-2.5-pro";
  }

  async function tryClaude(): Promise<void> {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY가 설정되지 않았습니다.");
    const client = new Anthropic({ apiKey: anthropicKey });
    const stream = client.messages.stream({
      model: "claude-opus-4-6",
      max_tokens: 8000,
      system: getSystemPrompt(lawArea),
      messages: [{ role: "user", content: userPrompt }],
    });
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        send({ text: event.delta.text });
      }
    }
    modelUsed = "claude-opus-4-6";
  }

  try {
    // 판례 인용 헤더를 첫 청크로 주입 (parseContent가 [판례 제목] 마커로 파싱)
    send({ text: `[판례 제목]\n${citation}\n\n` });

    try {
      await tryGemini();
    } catch (err1) {
      if (!is503(err1)) throw err1;
      console.warn("gemini-2.5-pro 503 → claude-opus-4-6 폴백");
      await tryClaude();
    }

    send({ done: true, model: modelUsed });
  } catch (err: unknown) {
    console.error("generate error:", err);
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    send({ error: `문제 생성 중 오류: ${msg}` });
  } finally {
    res.end();
  }
}
