import type { NextApiRequest, NextApiResponse } from "next";

export interface CaseData {
  caseNumber: string;
  caseName: string;
  court: string;
  date: string;
  rulingPoints: string;
  rulingRatio: string;
  references?: string;
  fullText?: string;
  serialNo?: string;
}

type ApiRecord = Record<string, string>;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://case-generator-eight.vercel.app";

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      Referer: `${SITE_URL}/`,
      Origin: SITE_URL,
      "User-Agent": "Mozilla/5.0 (compatible; CaseGenerator/1.0)",
    },
  });
  const text = await res.text();
  const clean = text.replace(/^\uFEFF/, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    console.error("JSON parse failed:", clean.slice(0, 300));
    return null;
  }
}

function dig(data: unknown, ...keys: string[]): string {
  if (!data || typeof data !== "object") return "";
  const obj = data as Record<string, unknown>;
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return "";
}

function extractItems(data: unknown): ApiRecord[] {
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;

  // 인증 실패 감지
  const str = JSON.stringify(obj);
  if (str.includes("검증에 실패") || str.includes("인증") && str.includes("실패")) {
    console.error("법제처 auth failed:", str.slice(0, 200));
    return [];
  }

  const search =
    obj["PrecSearch"] ?? obj["precSearch"] ?? obj["prec_search"] ?? obj;
  if (!search || typeof search !== "object") return [];
  const s = search as Record<string, unknown>;

  const prec = s["prec"] ?? s["Prec"] ?? s["result"] ?? s["items"];
  if (!prec) return [];
  if (Array.isArray(prec)) return prec as ApiRecord[];
  if (typeof prec === "object") return [prec as ApiRecord];
  return [];
}

function extractDetail(data: unknown): ApiRecord | null {
  if (!data || typeof data !== "object") return null;
  const str = JSON.stringify(data);

  // 인증 실패 감지
  if (str.includes("검증에 실패") || (str.includes("인증") && str.includes("실패"))) {
    console.error("법제처 detail auth failed");
    return null;
  }

  const obj = data as Record<string, unknown>;
  const detail =
    obj["PrecService"] ?? obj["precService"] ?? obj["PrecDetail"] ?? obj;

  if (!detail || typeof detail !== "object") return null;
  const d = detail as Record<string, unknown>;

  // 의미 있는 필드가 하나라도 있으면 유효한 응답
  const hasData =
    d["판결요지"] || d["판시사항"] || d["사건번호"] ||
    d["판례내용"] || d["gbnNm"] || d["caseNm"];
  if (!hasData) return null;
  return d as ApiRecord;
}

// 긴 텍스트에서 판시사항/판결요지 섹션 추출 (판례내용 파싱)
function extractFromFullText(fullText: string, section: "판시사항" | "판결요지"): string {
  if (!fullText) return "";
  const markers: Record<string, string[]> = {
    판시사항: ["【판시사항】", "[판시사항]", "판시사항"],
    판결요지: ["【판결요지】", "[판결요지]", "판결요지"],
  };
  const nextMarkers = ["【", "[참조조문]", "[참조판례]", "【참조조문】", "【판결요지】", "【주문】", "【이유】"];

  const starts = markers[section];
  for (const start of starts) {
    const idx = fullText.indexOf(start);
    if (idx === -1) continue;
    let end = fullText.length;
    const after = fullText.slice(idx + start.length);
    for (const m of nextMarkers) {
      if (m === start) continue;
      const ni = after.indexOf(m);
      if (ni !== -1 && ni < end - idx - start.length) {
        end = idx + start.length + ni;
      }
    }
    return fullText.slice(idx + start.length, end).replace(/^\s*\n+/, "").trim();
  }
  return "";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const { caseNumber } = req.query;
  if (!caseNumber || typeof caseNumber !== "string") {
    return res.status(400).json({ error: "사건번호를 입력해 주세요." });
  }

  const oc = process.env.LAW_OC;
  if (!oc) {
    return res.status(500).json({ error: "법제처 OC 값이 설정되지 않았습니다." });
  }

  const trimmed = caseNumber.trim();

  try {
    // Step 1: 검색
    const searchUrl = `https://www.law.go.kr/DRF/lawSearch.do?OC=${encodeURIComponent(oc)}&target=prec&type=JSON&query=${encodeURIComponent(trimmed)}&display=10&page=1`;
    let searchData = await fetchJson(searchUrl);
    if (!searchData) {
      searchData = await fetchJson(searchUrl.replace("https://", "http://"));
    }
    if (!searchData) {
      return res.status(502).json({ error: "법제처 API 응답을 파싱하지 못했습니다." });
    }

    const items = extractItems(searchData);
    if (items.length === 0) {
      return res.status(404).json({ error: `'${trimmed}'에 해당하는 판례를 찾지 못했습니다.` });
    }

    // Step 2: 사건번호 매칭
    const normalized = trimmed.replace(/\s/g, "");
    const found =
      items.find((item) => (item["사건번호"] ?? "").replace(/\s/g, "") === normalized) ||
      items.find((item) => (item["사건번호"] ?? "").replace(/\s/g, "").includes(normalized)) ||
      items.find((item) => normalized.includes((item["사건번호"] ?? "").replace(/\s/g, "")));

    if (!found) {
      return res.status(404).json({ error: `'${trimmed}'에 해당하는 판례를 찾지 못했습니다.` });
    }

    console.log("Search result keys:", Object.keys(found));
    console.log("Search result sample:", JSON.stringify(found).slice(0, 500));

    // Step 3: 일련번호 다양한 필드명으로 시도
    const serialNo =
      found["판례정보일련번호"] ??
      found["일련번호"] ??
      found["prec_seq"] ??
      found["precSeq"] ??
      found["id"] ??
      "";

    // Step 4: 상세 API 호출
    if (serialNo) {
      const detailUrl = `https://www.law.go.kr/DRF/lawService.do?OC=${encodeURIComponent(oc)}&target=prec&ID=${serialNo}&type=JSON`;
      let detailData = await fetchJson(detailUrl);
      if (!detailData) {
        detailData = await fetchJson(detailUrl.replace("https://", "http://"));
      }

      const detail = extractDetail(detailData);
      if (detail) {
        const fullText = dig(detail, "판례내용", "precContent", "fullText");
        const rulingPoints =
          dig(detail, "판시사항", "precIssue", "ruling_issue") ||
          extractFromFullText(fullText, "판시사항");
        const rulingRatio =
          dig(detail, "판결요지", "precSummary", "ruling_summary") ||
          extractFromFullText(fullText, "판결요지");

        return res.status(200).json({
          caseNumber: dig(detail, "사건번호", "caseNo") || found["사건번호"] || trimmed,
          caseName: dig(detail, "사건명", "caseNm") || found["사건명"] || "",
          court: dig(detail, "법원명", "courtNm") || found["법원명"] || "",
          date: dig(detail, "선고일자", "judmnAdjYd") || String(found["선고일자"] || ""),
          rulingPoints,
          rulingRatio,
          references: dig(detail, "참조조문", "refLaw"),
          fullText,
          serialNo,
        } as CaseData);
      }
    }

    // Step 5: search 결과로 fallback — 판례내용이 있으면 파싱
    const fullText = found["판례내용"] || "";
    const rulingPoints =
      found["판시사항"] ||
      extractFromFullText(fullText, "판시사항") ||
      "";
    const rulingRatio =
      found["판결요지"] ||
      extractFromFullText(fullText, "판결요지") ||
      "";

    return res.status(200).json({
      caseNumber: found["사건번호"] || trimmed,
      caseName: found["사건명"] || "",
      court: found["법원명"] || "",
      date: String(found["선고일자"] || ""),
      rulingPoints,
      rulingRatio,
      references: "",
      fullText,
      serialNo,
    } as CaseData);
  } catch (err) {
    console.error("case-lookup error:", err);
    return res.status(500).json({ error: "판례 조회 중 오류가 발생했습니다." });
  }
}
