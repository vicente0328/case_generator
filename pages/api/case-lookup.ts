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

function stripHtml(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .trim();
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

  // 사건번호 정규화: 한글/숫자 이외 문자 제거 + 2자리 연도 → 4자리
  // 예) "2008. 다. 54877." → "2008다54877"
  // 예) "96다3982" → "1996다3982"
  function normalizeCase(cn: string): string {
    const s = cn.replace(/[^가-힣0-9]/g, "");
    return s.replace(/^(\d{2})([가-힣])/, (_, yr, type) => {
      const y = parseInt(yr, 10);
      return `${y >= 90 ? 1900 + y : 2000 + y}${type}`;
    });
  }

  const normalized = normalizeCase(trimmed);

  try {
    // Step 1: nb 파라미터로 사건번호 직접 검색 (정확도 높음)
    // nb=2008다54877 형태로 사건번호 전용 검색
    async function searchByNb(nb: string): Promise<ApiRecord[]> {
      const url = `https://www.law.go.kr/DRF/lawSearch.do?OC=${encodeURIComponent(oc!)}&target=prec&type=JSON&nb=${encodeURIComponent(nb)}&display=5`;
      let data = await fetchJson(url);
      if (!data) data = await fetchJson(url.replace("https://", "http://"));
      return data ? extractItems(data) : [];
    }

    // 정규화된 번호로 먼저 시도, 0건이면 원본으로 재시도
    let items = await searchByNb(normalized);
    if (items.length === 0 && normalized !== trimmed) {
      items = await searchByNb(trimmed);
    }

    // nb 검색 실패 시 query 검색으로 fallback
    if (items.length === 0) {
      const queryUrl = `https://www.law.go.kr/DRF/lawSearch.do?OC=${encodeURIComponent(oc)}&target=prec&type=JSON&query=${encodeURIComponent(normalized)}&display=30&page=1`;
      let qData = await fetchJson(queryUrl);
      if (!qData) qData = await fetchJson(queryUrl.replace("https://", "http://"));
      if (qData) items = extractItems(qData);
    }

    if (items.length === 0) {
      const year = parseInt(normalized.match(/^(\d{4})/)?.[1] ?? "0", 10);
      const oldCase = year > 0 && year < 2000;
      return res.status(404).json({
        error: oldCase
          ? `'${trimmed}'에 해당하는 판례를 찾지 못했습니다. 법제처 API에 수록되지 않은 오래된 판례일 수 있습니다.`
          : `'${trimmed}'에 해당하는 판례를 찾지 못했습니다.`,
      });
    }

    // Step 2: 사건번호 매칭 (양쪽 모두 정규화하여 비교)
    const found =
      items.find((item) => normalizeCase(item["사건번호"] ?? "") === normalized) ||
      items.find((item) => normalizeCase(item["사건번호"] ?? "").includes(normalized)) ||
      items.find((item) => normalized.includes(normalizeCase(item["사건번호"] ?? ""))) ||
      items[0]; // nb 검색은 정확하므로 첫 번째 결과를 최후 수단으로 사용

    if (!found) {
      const year = parseInt(normalized.match(/^(\d{4})/)?.[1] ?? "0", 10);
      const oldCase = year > 0 && year < 2000;
      return res.status(404).json({
        error: oldCase
          ? `'${trimmed}'에 해당하는 판례를 찾지 못했습니다. 법제처 API에 수록되지 않은 오래된 판례일 수 있습니다.`
          : `'${trimmed}'에 해당하는 판례를 찾지 못했습니다.`,
      });
    }

    console.log("Search result keys:", Object.keys(found));
    console.log("Search result sample:", JSON.stringify(found).slice(0, 500));

    // Step 3: 일련번호 — 실제 API 응답 필드명 기준
    const serialNo =
      found["판례일련번호"] ??   // 실제 search 결과 필드명
      found["판례정보일련번호"] ??
      found["일련번호"] ??
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
        const rulingPoints = stripHtml(
          dig(detail, "판시사항", "precIssue", "ruling_issue") ||
          extractFromFullText(fullText, "판시사항")
        );
        const rulingRatio = stripHtml(
          dig(detail, "판결요지", "precSummary", "ruling_summary") ||
          extractFromFullText(fullText, "판결요지")
        );

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
    const rulingPoints = stripHtml(
      found["판시사항"] ||
      extractFromFullText(fullText, "판시사항") ||
      ""
    );
    const rulingRatio = stripHtml(
      found["판결요지"] ||
      extractFromFullText(fullText, "판결요지") ||
      ""
    );

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
