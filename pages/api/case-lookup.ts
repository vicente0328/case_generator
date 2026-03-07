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

// ─── glaw.scourt.go.kr (대법원 종합법률정보) 스크래핑 ───────────────────────
// 저작권 정책: 본문(이유) 섹션 및 사실적 메타데이터만 활용
// 판시사항/판결요지/참조조문/참조판례는 대법원 저작권 보호 대상이므로 추출하지 않음

const GLAW_BASE = "http://glaw.scourt.go.kr";
const GLAW_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
};

async function fetchHtml(url: string, referer?: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: referer ? { ...GLAW_HEADERS, Referer: referer } : GLAW_HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    // EUC-KR 인코딩 대응 (법원 사이트는 EUC-KR 사용 가능)
    try {
      return new TextDecoder("utf-8").decode(buf);
    } catch {
      return new TextDecoder("euc-kr").decode(buf);
    }
  } catch (e) {
    console.error("fetchHtml failed:", url, e instanceof Error ? e.message : e);
    return null;
  }
}

// glaw 검색 결과 HTML에서 판례 상세 경로 추출
function extractGlawDetailPath(html: string): string | null {
  // 방법 1: href 링크에서 sjo040.do 경로 추출
  const hrefMatch = html.match(/href=['"]([^'"]*sjo040[^'"]*)['"]/);
  if (hrefMatch) return hrefMatch[1].startsWith("/") ? hrefMatch[1] : `/wsjo/panre/${hrefMatch[1]}`;

  // 방법 2: script/data 속성에서 panreSeq 또는 csId 추출
  const seqPatterns = [
    /panreSeq['"]?\s*[=:]\s*['"]?(\d+)/,
    /csId['"]?\s*[=:]\s*['"]?(\d+)/,
    /'panreSeq'\s*,\s*'(\d+)'/,
    /goDetail\(['"]?(\d+)/,
  ];
  for (const p of seqPatterns) {
    const m = html.match(p);
    if (m) return `/wsjo/panre/sjo040.do?prevUrl=sjo060&panreSeq=${m[1]}`;
  }
  return null;
}

// glaw 상세 페이지 HTML에서 사건 정보 추출
function parseGlawDetail(html: string, inputCaseNumber: string): CaseData | null {
  const text = stripHtml(html);
  if (text.length < 200) return null;

  // 사건번호 (사실 정보 — 저작권 해당 없음)
  const caseNumberMatch =
    text.match(/사건번호\s*[:\s]\s*([\w가-힣]+)/) ||
    text.match(/([\d]{4}[가-힣]+[\d]+)/);

  // 사건명 [보증채무금] 형태 또는 "사건명" 필드
  const caseNameMatch =
    text.match(/\[([^\]]{2,30})\]/) ||
    text.match(/사건명\s*[:\s]\s*([^\n]+)/);

  // 법원명
  const courtMatch = text.match(/(대법원|고등법원|지방법원|가정법원|행정법원)[^\n]*/);

  // 선고일자 (YYYY. M. D. 또는 YYYYMMDD 형태)
  const dateMatch = text.match(/(\d{4})[.\s]+(\d{1,2})[.\s]+(\d{1,2})/);
  const date = dateMatch
    ? `${dateMatch[1]}${dateMatch[2].padStart(2, "0")}${dateMatch[3].padStart(2, "0")}`
    : "";

  // 본문(이유) 추출 — 저작권 없는 부분
  // 전문 전체를 fullText로, 판시사항/판결요지는 포함하지 않음
  const iuStart = text.indexOf("【이유】");
  const juStart = text.indexOf("【전문】");
  const fullText = iuStart >= 0
    ? text.slice(iuStart).trim()
    : juStart >= 0
      ? text.slice(juStart).trim()
      : text.slice(0, 8000);

  if (fullText.length < 100) return null;

  return {
    caseNumber: caseNumberMatch?.[1] || inputCaseNumber,
    caseName: caseNameMatch?.[1]?.trim() || "",
    court: courtMatch?.[1] || "",
    date,
    rulingPoints: "",  // 저작권 보호 대상 — 스크래핑 안 함
    rulingRatio: "",   // 저작권 보호 대상 — 스크래핑 안 함
    fullText: fullText.slice(0, 10000),
  };
}

async function scrapeGlaw(caseNum: string, normalizedNum: string): Promise<CaseData | null> {
  const searchUrl = `${GLAW_BASE}/wsjo/panre/sjo060.do?q=${encodeURIComponent(caseNum)}&tabId=0&spId=`;
  console.log("[glaw] searching:", searchUrl);

  const searchHtml = await fetchHtml(searchUrl);
  if (!searchHtml) {
    console.log("[glaw] search failed — server unreachable");
    return null;
  }

  // 검색 결과에서 상세 경로 추출
  let detailPath = extractGlawDetailPath(searchHtml);

  // 경로 못 찾으면 정규화된 번호로 재시도
  if (!detailPath && normalizedNum !== caseNum) {
    const searchHtml2 = await fetchHtml(
      `${GLAW_BASE}/wsjo/panre/sjo060.do?q=${encodeURIComponent(normalizedNum)}&tabId=0&spId=`
    );
    if (searchHtml2) detailPath = extractGlawDetailPath(searchHtml2);
  }

  if (!detailPath) {
    console.log("[glaw] no detail path found in search results");
    return null;
  }

  const detailUrl = detailPath.startsWith("http") ? detailPath : `${GLAW_BASE}${detailPath}`;
  console.log("[glaw] fetching detail:", detailUrl);

  const detailHtml = await fetchHtml(detailUrl, searchUrl);
  if (!detailHtml) {
    console.log("[glaw] detail fetch failed");
    return null;
  }

  const result = parseGlawDetail(detailHtml, caseNum);
  if (result) console.log("[glaw] success:", result.caseNumber, result.court, result.date);
  else console.log("[glaw] parse failed — content too short or not found");
  return result;
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
      // nb 파라미터는 한글을 URL 인코딩하면 법제처 서버가 인식 못함 — 그대로 전달
      const url = `https://www.law.go.kr/DRF/lawSearch.do?OC=${encodeURIComponent(oc!)}&target=prec&type=JSON&nb=${nb}&display=5`;
      let data = await fetchJson(url);
      if (!data) data = await fetchJson(url.replace("https://", "http://"));
      return data ? extractItems(data) : [];
    }

    // 사건번호 정확 매칭 헬퍼 — normalizeCase 기준 완전 일치만 허용
    function matchExact(items: ApiRecord[]): ApiRecord | undefined {
      return (
        items.find((item) => normalizeCase(item["사건번호"] ?? "") === normalized) ||
        items.find((item) => normalizeCase(item["사건번호"] ?? "") === normalizeCase(trimmed))
      );
    }

    // nb 파라미터로 사건번호 직접 검색 (정규화 형태 → 원본 순서로 시도)
    let found: ApiRecord | undefined;

    const nbItems = await searchByNb(normalized);
    found = matchExact(nbItems);

    if (!found && normalized !== trimmed) {
      const nbItems2 = await searchByNb(trimmed);
      found = matchExact(nbItems2);
    }

    // nb 검색 실패 시 query 파라미터로 fallback (결과는 반드시 정확 매칭만 사용)
    if (!found) {
      const queryUrl = `https://www.law.go.kr/DRF/lawSearch.do?OC=${encodeURIComponent(oc!)}&target=prec&type=JSON&query=${encodeURIComponent(normalized !== trimmed ? trimmed : normalized)}&display=30`;
      let qData = await fetchJson(queryUrl);
      if (!qData) qData = await fetchJson(queryUrl.replace("https://", "http://"));
      if (qData) found = matchExact(extractItems(qData));
    }

    // 법제처 DRF API에서 찾지 못한 경우 → glaw.scourt.go.kr 스크래핑 시도
    if (!found) {
      const glawResult = await scrapeGlaw(trimmed, normalized);
      if (glawResult) {
        return res.status(200).json(glawResult);
      }

      const year = parseInt(normalized.match(/^(\d{4})/)?.[1] ?? "0", 10);
      const oldCase = year > 0 && year < 2000;
      return res.status(404).json({
        error: oldCase
          ? `'${trimmed}'에 해당하는 판례를 찾지 못했습니다. 법제처 및 대법원 종합법률정보에서 확인되지 않는 판례입니다.`
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
