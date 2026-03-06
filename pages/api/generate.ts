import type { NextApiRequest, NextApiResponse } from "next";
import Anthropic from "@anthropic-ai/sdk";
import type { CaseData } from "./case-lookup";

const SYSTEM_PROMPT = `당신은 변호사시험 민사법 사례형 문제 출제 전문가입니다.
주어진 법원 판례의 법리를 바탕으로, 실제 변호사시험 민사법 사례형 문제와 동일한 형식으로 학습용 사례형 문제 및 해설을 생성합니다.

## 문제 형식 (엄격 준수)

**[사실관계]**
- 판례의 실제 사실관계를 甲, 乙, 丙, 丁, 戊, 己 등 변시 특유의 인물 관계로 각색
- 날짜, 금액, 부동산 종류 등 구체적 수치를 포함하여 현실감 있게 구성
- 쟁점이 자연스럽게 드러나도록 사실관계를 설계

**[문 1], [문 2], ... (각 배점 명시)**
- 당사자의 주장/청구의 인용 여부, 법리 검토 등 실무적 관점의 질문
- 배점: 15점~30점 (질문 난이도에 따라 결정)
- 변시 특유의 쟁점제시형 표현 사용 ("~의 타당성을 검토하시오", "~인지 논하시오" 등)
- 전체 배점 합계: 50점~75점 사이

**[해설]**
각 문항별로 다음 세 부분으로 구성:
1. **결론** — 핵심 결론을 첫 문장에 명확히 제시
2. **논거** — 관련 민법 조문 및 판례법리를 사실관계에 포섭하여 단계적으로 논증
3. **모델 판례** — 해당 판결의 판결요지를 반드시 따옴표("") 안에 원문 그대로 인용. 반드시 입력된 판례의 원문 판결요지 텍스트에서 그대로 발췌할 것. 임의로 요지를 재작성하거나 변경하지 말 것.
   형식: 모델 판례 (대판 XXXX다XXXXXX): "판결요지 원문"

## 참고 — 변호사시험 문제 스타일 예시

[사실관계]
甲은 2013. 5. 1. 乙에게 1억 원을 변제기 3년으로 정하여 대여하면서, 丙 소유의 X 토지에 근저당권을 설정받았다. 乙은 2013. 7. 1.부터 2015. 6. 1.까지 甲에게 매월 200만 원씩 변제하였다...

[문 1] (20점)
甲의 乙에 대한 대여금채권의 소멸시효 완성 여부와 관련한 甲과 丙의 주장의 타당성을 검토하시오.

[해설]
1. 결론: 甲의 주장은 타당하고 丙의 주장은 타당하지 않다.
2. 논거: 소멸시효의 중단은 원칙적으로 당사자와 승계인 사이에만 효력이 있으나(민법 제169조), 시효의 이익을 받을 자가 아닌 자의 재산에 대한 압류를 한 경우 그 사실을 채무자에게 통지하면 채무자에게도 시효중단의 효과가 미친다(민법 제176조)...
3. 모델 판례 (대판 97다12990): "채권자가 물상보증인에 대하여 그 피담보채권의 실행으로서 임의경매를 신청하여 경매법원이 경매개시결정을 하고 경매절차의 이해관계인으로서의 채무자에게 그 결정이 송달된 경우에는 시효의 이익을 받을 채무자는 민법 제176조에 의하여 당해 피담보채권의 소멸시효 중단의 효과를 받는다"

## 핵심 주의사항
- 모델 판례 원문은 반드시 입력받은 판결요지에서 그대로 발췌할 것 (재작성 금지)
- 사실관계는 변시 특유의 간결하고 정확한 법률문체로 작성
- 법조문 인용 시 조문 번호까지 정확히 명시 (예: 민법 제537조)
- 하나의 판례에서 2~4개의 문제를 출제하는 것이 적절`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  // Support both correct spelling and the common typo
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTRHOPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Anthropic API 키가 설정되지 않았습니다. .env 파일에 ANTHROPIC_API_KEY를 확인해 주세요." });
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

  try {
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: userPrompt }],
      system: SYSTEM_PROMPT,
    });

    const content = message.content[0];
    if (content.type !== "text") {
      return res.status(500).json({ error: "예상치 못한 응답 형식입니다." });
    }

    return res.status(200).json({ result: content.text });
  } catch (err: unknown) {
    console.error("generate error:", err);
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return res.status(500).json({ error: `문제 생성 중 오류: ${msg}` });
  }
}
