import type { NextApiRequest, NextApiResponse } from "next";
import { admin } from "@/lib/firebaseAdmin";
import { GoogleGenerativeAI } from "@google/generative-ai";

const ADMIN_EMAIL = "admin@casegenerator.com";

async function verifyAdmin(req: NextApiRequest): Promise<boolean> {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return false;
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return decoded.email === ADMIN_EMAIL;
  } catch {
    return false;
  }
}

// ── 공유 타입 ─────────────────────────────────────────────────────────────────

export interface FetchedCase {
  caseNumber: string;
  caseName?: string;
  court?: string;
  date?: string;
  sources: string[]; // "법제처" | "glaw" | "AI추천"
}

export interface FetchResult {
  민사법: FetchedCase[];
  공법: FetchedCase[];
  형사법: FetchedCase[];
  stats: {
    lawGoKr: number;
    journal: number;
    aiSuggested: number;
    totalRaw: number;
    totalFiltered: number;
  };
  errors: string[];
}

// ── 사건번호 추출 정규식 ───────────────────────────────────────────────────────
const CASE_NUM_RE =
  /(\d{4})(다|도|두|헌마|헌바|헌라|헌가|마|카|라|나)(\d{1,6}(?:-\d+)?)/g;
const CURRENT_YEAR = new Date().getFullYear();

function extractCaseNumbers(text: string, minYear = 2021): string[] {
  const found = new Set<string>();
  CASE_NUM_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CASE_NUM_RE.exec(text)) !== null) {
    const year = parseInt(m[1], 10);
    if (year >= minYear && year <= CURRENT_YEAR) found.add(m[0]);
  }
  return [...found];
}

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "ko-KR,ko;q=0.9",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

// ── Source 1: 법제처 DRF API — 민사/공법/형사 키워드 다중 검색 ────────────────
// prncYn/court 같은 비표준 파라미터 제거 → case-lookup.ts에서 검증된 파라미터만 사용

interface LawGoKrCase {
  caseNumber: string;
  caseName: string;
  court: string;
  date: string;
}

// 변시 3법역의 핵심 키워드. 각각 최신 판례를 가져옴
const LAW_KEYWORDS = [
  // 민사법
  "계약해제 손해배상",
  "불법행위 과실",
  "부동산 소유권이전",
  "임대차 보증금",
  "채무불이행 이행불능",
  // 공법
  "행정처분 취소",
  "기본권 침해 헌법소원",
  "재량권 일탈 남용",
  "처분성 원고적격",
  // 형사법
  "공범 방조범",
  "압수수색 증거능력",
  "정당방위 위법성",
  "사기 횡령 배임",
];

// 법제처 API 공통 파서
function parseLawGoKrItems(
  data: Record<string, unknown>,
  cutoffDate: string
): LawGoKrCase[] {
  const str = JSON.stringify(data);
  if (str.includes("검증에 실패") || (str.includes("인증") && str.includes("실패"))) {
    throw new Error("법제처 OC 인증 실패 (LAW_OC 환경변수 확인 필요)");
  }
  const search = (data["PrecSearch"] ?? data["precSearch"] ?? data) as Record<string, unknown>;
  const prec = search["prec"] ?? search["Prec"] ?? [];
  const items = (Array.isArray(prec) ? prec : [prec]) as Record<string, string>[];
  return items
    .map((item) => ({
      caseNumber: String(item["사건번호"] ?? "").trim(),
      caseName: String(item["사건명"] ?? "").trim(),
      court: String(item["법원명"] ?? "").trim(),
      date: String(item["선고일자"] ?? "").trim(),
    }))
    .filter((c) => c.caseNumber && (!cutoffDate || c.date >= cutoffDate));
}

async function fetchLawGoKrUrl(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; CaseGenerator/1.0)" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return JSON.parse(text.replace(/^\uFEFF/, "").trim()) as Record<string, unknown>;
}

async function fetchFromLawGoKr(
  oc: string
): Promise<{ cases: LawGoKrCase[]; error?: string }> {
  // Gemini knowledge cutoff 보완: 최근 2년을 기준으로 하되 현재 연도까지 포함
  // 2026년 기준 → 2024년 이후 = 25년, 26년 케이스 모두 커버
  const cutoffDate = `${CURRENT_YEAR - 2}0101`;
  const allCases = new Map<string, LawGoKrCase>();
  let authFailed = false;

  // ① 최신 판례 직접 수집 (sort=date, 최근 100개) — Gemini가 모르는 25~26년 판례 커버
  // 빈 query 또는 "선고"로 넓게 검색
  const recentQueries = ["선고", "대법원", "헌법재판소"];
  for (const q of recentQueries) {
    if (authFailed) break;
    try {
      const url =
        `https://www.law.go.kr/DRF/lawSearch.do` +
        `?OC=${encodeURIComponent(oc)}&target=prec&type=JSON` +
        `&query=${encodeURIComponent(q)}&display=100&sort=date`;
      const data = await fetchLawGoKrUrl(url);
      const items = parseLawGoKrItems(data, cutoffDate);
      items.forEach((c) => { if (!allCases.has(c.caseNumber)) allCases.set(c.caseNumber, c); });
    } catch (e) {
      if (e instanceof Error && e.message.includes("인증 실패")) { authFailed = true; break; }
    }
  }

  if (authFailed) {
    return { cases: [], error: "법제처 OC 인증 실패 (LAW_OC 환경변수 확인 필요)" };
  }

  // ② 키워드 검색 — 법역별 핵심 판례 보완 (topically targeted)
  for (const keyword of LAW_KEYWORDS) {
    try {
      const url =
        `https://www.law.go.kr/DRF/lawSearch.do` +
        `?OC=${encodeURIComponent(oc)}&target=prec&type=JSON` +
        `&query=${encodeURIComponent(keyword)}&display=20&sort=date`;
      const data = await fetchLawGoKrUrl(url);
      const items = parseLawGoKrItems(data, cutoffDate);
      items.forEach((c) => { if (!allCases.has(c.caseNumber)) allCases.set(c.caseNumber, c); });
    } catch {
      // 개별 키워드 실패 무시
    }
  }

  return {
    cases: [...allCases.values()],
    error: allCases.size === 0 ? "법제처 API 검색 결과 없음" : undefined,
  };
}

// ── Source 2: 법학지·법률신문 크롤링 ──────────────────────────────────────────
// 판례평석이 자주 실리는 법학지·법률신문을 크롤링하여 사건번호 추출.
// 평석 대상 판례 = 법리적으로 중요 → 변시 출제 가능성 높음.
//
// 시도 순서:
//   ① 법률신문 (lawtimes.co.kr)  — 판례평석 코너, 주 1~2회 업데이트, 로스쿨 교수 필진
//   ② 저스티스 (justice.or.kr)   — 한국법학원 발간, 민사·공법·형사 균형
//   ③ 법조 (koreanbar.or.kr)     — 대한변협, 판례평석 코너
//   ④ glaw 최신판례              — 위 소스 실패 시 보완용 fallback
async function fetchFromLegalJournals(): Promise<{ caseNumbers: string[]; error?: string }> {
  const allNums = new Set<string>();
  const minYear = CURRENT_YEAR - 3; // 최근 3년치 판례평석 커버

  const attempts: string[] = [
    // ① 법률신문 — 판례평석 검색 결과
    `https://www.lawtimes.co.kr/search/news?query=${encodeURIComponent("판례평석")}`,
    `https://www.lawtimes.co.kr/search/news?query=${encodeURIComponent("판례평석")}&page=2`,
    `https://www.lawtimes.co.kr/search/news?query=${encodeURIComponent("대법원 판결 평석")}`,
    // 법률신문 — 판례 전문 섹션
    `https://www.lawtimes.co.kr/Legal-Info/Cases-Keyword`,
    `https://www.lawtimes.co.kr/Legal-Info/Judgment`,

    // ② 저스티스 (한국법학원) — 논문 목록 (판례평석 포함)
    `https://justice.or.kr/home/bbs/list.do?bbsId=BBSSTR_000000000031&pageIndex=1`,
    `https://justice.or.kr/home/bbs/list.do?bbsId=BBSSTR_000000000031&pageIndex=2`,

    // ③ 법조 (대한변협) — 판례평석 카테고리
    `https://www.koreanbar.or.kr/pages/research/list.asp?cate=4`,
    `https://www.koreanbar.or.kr/pages/research/list.asp?cate=5`,

    // ④ glaw fallback — 위 소스에서 사건번호를 못 가져올 경우 보완
    `https://glaw.scourt.go.kr/wsjo/panre/sjo060.do?q=%EB%AF%BC%EB%B2%95&tabId=0&spId=&startDate=${CURRENT_YEAR - 2}0101`,
    `https://glaw.scourt.go.kr/wsjo/panre/sjo060.do?q=%ED%98%95%EB%B2%95&tabId=0&spId=&startDate=${CURRENT_YEAR - 2}0101`,
    `https://glaw.scourt.go.kr/wsjo/panre/sjo060.do?q=%ED%96%89%EC%A0%95%EB%B2%95&tabId=0&spId=&startDate=${CURRENT_YEAR - 2}0101`,
  ];

  for (const url of attempts) {
    try {
      const res = await fetch(url, {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      extractCaseNumbers(html, minYear).forEach((n) => allNums.add(n));
    } catch {
      // 개별 소스 실패 무시
    }
  }

  return {
    caseNumbers: [...allNums],
    error: allNums.size === 0
      ? "법학지·법률신문 크롤링 결과 없음 (JS 렌더링 또는 접근 차단)"
      : undefined,
  };
}

// ── Source 3: Gemini 지식 기반 판례번호 추천 (RISS 대체) ─────────────────────
// Gemini에게 최신 중요 판례번호를 직접 추천받음.
// ⚠ Gemini 지식 컷오프 이후 판례는 hallucination 가능 — 일괄 생성 시 case-lookup으로 검증됨
async function fetchFromGeminiKnowledge(
  apiKey: string
): Promise<{ caseNumbers: string[]; error?: string }> {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

    // Gemini 지식 컷오프 고려: 2024년 이전까지의 판례는 신뢰할 수 있지만
    // 2025년 이후는 hallucination 위험이 높음 → 2022~2024년에 집중하도록 유도
    // 2025~현재 판례는 법제처 sort=date 실시간 검색으로 커버됨
    const geminiMaxYear = Math.min(CURRENT_YEAR - 1, 2024);
    const fromYear = geminiMaxYear - 2; // 최근 3년치 (e.g., 2022~2024)
    const prompt = `당신의 학습 데이터 컷오프(2024년 초~중반)를 고려하여, 당신이 확실히 알고 있는 범위인 ${fromYear}년~${geminiMaxYear}년 사이에 선고된 대법원/헌법재판소 판례만 추천해 주세요.

⚠️ 중요: ${geminiMaxYear + 1}년 이후 판례는 별도 경로로 수집하므로 포함하지 마세요. 확실하지 않은 사건번호는 출력하지 마세요.

판례평석이 많이 나왔거나 법리적으로 중요한 판례를 우선합니다.

조건:
- 민사법(민법·상법 기초·민사소송법) 10개
- 공법(헌법·행정법) 10개
- 형사법(형법·형사소송법) 10개
- 자본시장법·조세법·특허법·공정거래법·노동법 등 특별법 전문 판례 제외
- 변호사시험 사례형 출제 가능성이 높은 판례 위주

사건번호만 한 줄에 하나씩 출력하세요. 설명, 코드블록 없이:`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const nums = extractCaseNumbers(text, fromYear).filter((n) => {
      const year = parseInt(n.slice(0, 4), 10);
      return year <= geminiMaxYear; // 컷오프 초과 연도 제거
    });

    return {
      caseNumbers: nums,
      error: nums.length === 0 ? "Gemini 추천 결과에서 사건번호를 추출하지 못했습니다" : undefined,
    };
  } catch (e) {
    return {
      caseNumbers: [],
      error: `Gemini 지식 기반 추천 실패: ${e instanceof Error ? e.message : "오류"}`,
    };
  }
}

// ── 특별법 사전 필터 ──────────────────────────────────────────────────────────
const SPECIAL_LAW_KEYWORDS = [
  "자본시장", "금융투자", "증권거래", "공정거래", "독점규제",
  "조세", "국세", "지방세", "관세", "부가가치세", "소득세", "법인세",
  "특허", "상표", "저작권", "지식재산", "실용신안",
  "고용보험", "산업재해", "근로기준", "임금채권",
  "환경오염", "폐기물", "농지", "산지",
];

function isSpecialLaw(caseName: string): boolean {
  return SPECIAL_LAW_KEYWORDS.some((kw) => caseName.includes(kw));
}

// ── Gemini 분류 + 변시 적합성 필터 ───────────────────────────────────────────
async function classifyWithGemini(
  apiKey: string,
  cases: Array<{ caseNumber: string; caseName?: string }>
): Promise<{ 민사법: string[]; 공법: string[]; 형사법: string[] }> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

  const list = cases
    .slice(0, 120)
    .map((c) => `${c.caseNumber}${c.caseName ? ` [${c.caseName}]` : ""}`)
    .join("\n");

  const prompt = `다음 대법원·헌법재판소 판례 목록에서 변호사시험 사례형 출제 가능성이 높은 것을 선별하여 법역별로 분류하세요.

## 분류 기준
- 민사법: 민법·상법 기초·민사소송법 → "다" "나" "마" "라" 포함
- 공법: 헌법·행정법 → "두" "헌" 포함
- 형사법: 형법·형사소송법 → "도" 포함

## 제외
- 자본시장법·금융투자·공정거래법·조세법·특허법·저작권법·노동법 등 특별법 전문 사건
- 절차법만 문제되는 단순 사건, 상고기각·심판불개시 등 실체 판단 없는 사건

## 응답 형식
JSON만 (코드블록·설명 없이):
{"민사법":["사건번호1","사건번호2"],"공법":["사건번호1"],"형사법":["사건번호1"]}

## 판례 목록
${list}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("JSON not found");
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    return {
      민사법: Array.isArray(parsed["민사법"]) ? (parsed["민사법"] as string[]) : [],
      공법: Array.isArray(parsed["공법"]) ? (parsed["공법"] as string[]) : [],
      형사법: Array.isArray(parsed["형사법"]) ? (parsed["형사법"] as string[]) : [],
    };
  } catch (e) {
    console.error("[Gemini classify] error:", e);
    // Fallback: 사건번호 패턴 기반 분류
    const fallback = { 민사법: [] as string[], 공법: [] as string[], 형사법: [] as string[] };
    for (const c of cases) {
      const n = c.caseNumber;
      if (/도\d/.test(n)) fallback["형사법"].push(n);
      else if (/두\d/.test(n) || /헌/.test(n)) fallback["공법"].push(n);
      else fallback["민사법"].push(n);
    }
    return fallback;
  }
}

// ── 메인 핸들러 ───────────────────────────────────────────────────────────────
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") return res.status(405).end();
  if (!(await verifyAdmin(req))) return res.status(401).json({ error: "Unauthorized" });

  const oc = process.env.LAW_OC;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!oc || !geminiKey) {
    return res.status(500).json({ error: "환경변수 필요: LAW_OC, GEMINI_API_KEY" });
  }

  const errors: string[] = [];

  // 3개 소스 병렬 조회
  const [lawGoKrResult, journalResult, aiResult] = await Promise.all([
    fetchFromLawGoKr(oc),
    fetchFromLegalJournals(),
    fetchFromGeminiKnowledge(geminiKey),
  ]);

  if (lawGoKrResult.error) errors.push(`법제처: ${lawGoKrResult.error}`);
  if (journalResult.error) errors.push(`법학지: ${journalResult.error}`);
  if (aiResult.error) errors.push(`AI추천: ${aiResult.error}`);

  // 사건번호 맵 — 중복 제거 + 소스 추적 + 메타데이터
  const caseMap = new Map<
    string,
    { caseName?: string; court?: string; date?: string; sources: Set<string> }
  >();

  function addCase(
    num: string,
    source: string,
    meta?: { caseName?: string; court?: string; date?: string }
  ) {
    const trimmed = num.trim();
    if (!trimmed) return;
    if (!caseMap.has(trimmed)) {
      caseMap.set(trimmed, { ...meta, sources: new Set([source]) });
    } else {
      const existing = caseMap.get(trimmed)!;
      existing.sources.add(source);
      if (meta?.caseName && !existing.caseName) existing.caseName = meta.caseName;
      if (meta?.court && !existing.court) existing.court = meta.court;
      if (meta?.date && !existing.date) existing.date = meta.date;
    }
  }

  lawGoKrResult.cases.forEach((c) =>
    addCase(c.caseNumber, "법제처", { caseName: c.caseName, court: c.court, date: c.date })
  );
  journalResult.caseNumbers.forEach((n) => addCase(n, "법학지"));
  aiResult.caseNumbers.forEach((n) => addCase(n, "AI추천"));

  const totalRaw = caseMap.size;

  // 특별법 사전 필터
  const filtered = [...caseMap.entries()]
    .filter(([, meta]) => !isSpecialLaw(meta.caseName ?? ""))
    .map(([num, meta]) => ({
      caseNumber: num,
      caseName: meta.caseName,
      court: meta.court,
      date: meta.date,
      sources: [...meta.sources],
    }));

  // Gemini 분류
  const classified = await classifyWithGemini(geminiKey, filtered);

  function toFetchedCases(numbers: string[]): FetchedCase[] {
    return numbers.map((num) => {
      const meta = caseMap.get(num);
      return {
        caseNumber: num,
        caseName: meta?.caseName,
        court: meta?.court,
        date: meta?.date,
        sources: meta ? [...meta.sources] : [],
      };
    });
  }

  const result: FetchResult = {
    민사법: toFetchedCases(classified["민사법"]),
    공법: toFetchedCases(classified["공법"]),
    형사법: toFetchedCases(classified["형사법"]),
    stats: {
      lawGoKr: lawGoKrResult.cases.length,
      journal: journalResult.caseNumbers.length,
      aiSuggested: aiResult.caseNumbers.length,
      totalRaw,
      totalFiltered:
        classified["민사법"].length +
        classified["공법"].length +
        classified["형사법"].length,
    },
    errors,
  };

  return res.status(200).json(result);
}
