import type { NextApiRequest, NextApiResponse } from "next";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { CaseData } from "./case-lookup";

const SYSTEM_PROMPT = `당신은 변호사시험 민사법 사례형 문제 출제 전문가입니다.
주어진 법원 판례의 법리를 바탕으로, 아래의 정확한 형식으로 학습용 사례형 문제 및 해설을 생성합니다.

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Gemini API 키가 설정되지 않았습니다. .env 파일에 GEMINI_API_KEY를 확인해 주세요." });
  }

  const { caseData } = req.body as { caseData: CaseData };
  if (!caseData) {
    return res.status(400).json({ error: "판례 데이터가 없습니다." });
  }

  const userPrompt = `다음 판례를 기반으로 변호사시험 민사법 사례형 문제 및 해설을 생성해 주세요.

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

위 판례의 핵심 법리를 중심으로 변호사시험 민사법 사례형 문제를 생성해 주세요.
사실관계는 甲, 乙, 丙 등으로 각색하고, 판결요지는 반드시 원문 그대로 인용해 주세요.`;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-pro",
      systemInstruction: SYSTEM_PROMPT,
    });

    const { stream } = await model.generateContentStream(userPrompt);
    for await (const chunk of stream) {
      const text = chunk.text();
      if (text) send({ text });
    }
    send({ done: true });
  } catch (err: unknown) {
    console.error("generate error:", err);
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    send({ error: `문제 생성 중 오류: ${msg}` });
  } finally {
    res.end();
  }
}
