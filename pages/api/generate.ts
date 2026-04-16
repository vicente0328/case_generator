import type { NextApiRequest, NextApiResponse } from "next";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import { admin } from "@/lib/firebaseAdmin";
import { SYSTEM_PROMPT_CIVIL, SYSTEM_PROMPT_PUBLIC, SYSTEM_PROMPT_CRIMINAL } from "@/lib/defaultPrompts";
import type { CaseData } from "./case-lookup";

// Firestore 프롬프트 캐시 (1분 TTL)
let _promptCache: { civil: string | null; public: string | null; criminal: string | null; cachedAt: number } | null = null;

async function fetchFirestorePrompts() {
  const now = Date.now();
  if (_promptCache && now - _promptCache.cachedAt < 60_000) return _promptCache;
  try {
    const snap = await admin.firestore().collection("config").doc("prompts").get();
    const data = snap.exists ? snap.data() : {};
    _promptCache = { civil: data?.civil ?? null, public: data?.public ?? null, criminal: data?.criminal ?? null, cachedAt: now };
  } catch {
    _promptCache = { civil: null, public: null, criminal: null, cachedAt: now };
  }
  return _promptCache;
}

import type { LawArea } from "@/lib/classifyLawArea";


// 기본값 반환 (Firestore 미설정 시 폴백용)
function getDefaultPrompt(lawArea: LawArea): string {
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

  // Firestore 프롬프트 로드 (실패 시 코드 기본값 사용)
  const firestorePrompts = await fetchFirestorePrompts();
  function getSystemPrompt(area: LawArea): string {
    if (area === "공법") return firestorePrompts.public || getDefaultPrompt(area);
    if (area === "형사법") return firestorePrompts.criminal || getDefaultPrompt(area);
    return firestorePrompts.civil || getDefaultPrompt(area);
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  // 판례 인용 헤더 (공통)
  const dateStr = formatJudgmentDate(caseData.date ?? "");

  const userPrompt = `다음 판례를 기반으로 변호사시험 ${lawArea} 사례형 문제 및 해설을 생성해 주세요.

## 판례 정보
- 사건번호: ${caseData.caseNumber}
- 사건명: ${caseData.caseName}
- 법원: ${caseData.court}
- 선고일자: ${dateStr || caseData.date}

## 판시사항
${caseData.rulingPoints || "(없음)"}

## 판결요지
${caseData.rulingRatio || "(없음)"}

${caseData.fullText ? `## 판례 본문 (참고)\n${caseData.fullText.slice(0, 3000)}` : ""}

위 판례의 핵심 법리를 중심으로 변호사시험 ${lawArea} 사례형 문제를 생성해 주세요.
사실관계는 甲, 乙, 丙 등으로 각색하고, 판결요지는 반드시 원문 그대로 인용해 주세요.`;
  const courtName = caseData.court || "대법원";
  const rulingType = getRulingType(caseData.caseNumber, courtName);
  const citation = dateStr
    ? `${courtName} ${dateStr} 선고 ${caseData.caseNumber} ${rulingType}`
    : `${courtName} ${caseData.caseNumber} ${rulingType}`;

  let modelUsed = "gemini-3.1-pro-preview";
  let costInfo: { inputTokens: number; outputTokens: number; costUsd: number } | null = null;

  function is503(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return msg.includes("503") || msg.includes("Service Unavailable") || msg.includes("high demand");
  }

  async function tryGemini(): Promise<void> {
    const genAI = new GoogleGenerativeAI(apiKey!);
    const model = genAI.getGenerativeModel({
      model: "gemini-3.1-pro-preview",
      systemInstruction: getSystemPrompt(lawArea),
    });
    const result = await model.generateContentStream(userPrompt);
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) send({ text });
    }
    const finalResponse = await result.response;
    const usage = finalResponse.usageMetadata;
    if (usage) {
      const inputTokens = usage.promptTokenCount ?? 0;
      const outputTokens = usage.candidatesTokenCount ?? 0;
      // gemini-3.1-pro-preview 가격: 입력 $2/1M, 출력 $12/1M (≤200K 토큰 기준)
      costInfo = { inputTokens, outputTokens, costUsd: (inputTokens * 2 + outputTokens * 12) / 1_000_000 };
    }
    modelUsed = "gemini-3.1-pro-preview";
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
    const finalMsg = await stream.finalMessage();
    const usage = finalMsg.usage;
    // claude-opus-4-6 가격: 입력 $15/1M, 출력 $75/1M
    costInfo = {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      costUsd: (usage.input_tokens * 15 + usage.output_tokens * 75) / 1_000_000,
    };
    modelUsed = "claude-opus-4-6";
  }

  try {
    // 판례 인용 헤더를 첫 청크로 주입 (parseContent가 [판례 제목] 마커로 파싱)
    send({ text: `[판례 제목]\n${citation}\n\n` });

    try {
      await tryGemini();
    } catch (err1) {
      if (!is503(err1)) throw err1;
      console.warn("gemini-3.1-pro-preview 503 → claude-opus-4-6 폴백");
      await tryClaude();
    }

    send({ done: true, model: modelUsed, cost: costInfo });
  } catch (err: unknown) {
    console.error("generate error:", err);
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    send({ error: `문제 생성 중 오류: ${msg}` });
  } finally {
    res.end();
  }
}
