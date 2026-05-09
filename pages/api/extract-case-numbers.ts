import type { NextApiRequest, NextApiResponse } from "next";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = {
  api: {
    bodyParser: { sizeLimit: "6mb" },
  },
};

export interface ExtractResponse {
  caseNumbers: string[];
}

const PROMPT = `이미지에서 한국 판례의 사건번호만 추출해 JSON 배열로 반환하세요.
형식: 4자리 연도 + 한글 분류기호 + 숫자 (예: 2016다271226, 2019두49953, 2017헌마479).
중복 제거, 발견 순서대로, 사건번호 외 텍스트는 모두 무시.
응답은 오직 JSON 배열 한 줄. 예) ["2016다271226","2019두49953"]
사건번호가 없으면 빈 배열 []만 반환.`;

const CASE_NUMBER_RE = /^[0-9]{4}[가-힣]+[0-9]+$/;

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  return { mimeType: m[1], base64: m[2] };
}

function extractJsonArray(text: string): string[] | null {
  // 마크다운 코드펜스 제거
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  // 첫 [ 부터 마지막 ] 까지만
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const arr = JSON.parse(cleaned.slice(start, end + 1));
    if (!Array.isArray(arr)) return null;
    return arr.filter((x): x is string => typeof x === "string");
  } catch {
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Gemini API 키가 설정되지 않았습니다." });
  }

  const { image } = req.body as { image?: unknown };
  if (typeof image !== "string" || !image) {
    return res.status(400).json({ error: "image (data URL) 가 필요합니다." });
  }

  const parsed = parseDataUrl(image);
  if (!parsed) {
    return res.status(400).json({ error: "이미지 형식이 올바르지 않습니다 (data URL 필요)." });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-preview" });
    const result = await model.generateContent([
      { inlineData: { mimeType: parsed.mimeType, data: parsed.base64 } },
      { text: PROMPT },
    ]);
    const text = result.response.text();
    const arr = extractJsonArray(text) ?? [];

    // 정규식으로 잘못된 항목 필터링 + 중복 제거 + 50건 truncate
    const seen = new Set<string>();
    const valid: string[] = [];
    for (const raw of arr) {
      const cn = raw.trim();
      if (!CASE_NUMBER_RE.test(cn)) continue;
      if (seen.has(cn)) continue;
      seen.add(cn);
      valid.push(cn);
      if (valid.length >= 50) break;
    }

    return res.status(200).json({ caseNumbers: valid } satisfies ExtractResponse);
  } catch (err) {
    console.error("extract-case-numbers error:", err);
    return res.status(500).json({ error: "사건번호 추출 중 오류가 발생했습니다." });
  }
}
