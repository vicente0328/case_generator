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
  sources: string[]; // "riss" | "glaw" | "법제처"
}

export interface FetchResult {
  민사법: FetchedCase[];
  공법: FetchedCase[];
  형사법: FetchedCase[];
  stats: {
    riss: number;
    glaw: number;
    lawGoKr: number;
    totalRaw: number;
    totalFiltered: number;
  };
  errors: string[];
}

// ── 사건번호 추출 정규식 ───────────────────────────────────────────────────────
// 연도(2021~현재) + 사건종류(다|도|두|헌마 등) + 번호
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
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

// ── Source 1: RISS 판례평석 논문 검색 ─────────────────────────────────────────
// riss.kr 학술지 논문에서 "판례평석" 검색 → 제목/요약에서 사건번호 추출
async function fetchFromRiss(): Promise<{ caseNumbers: string[]; error?: string }> {
  const queries = [
    "민사 판례평석",
    "형사 판례평석",
    "행정법 판례평석",
    "헌법 판례평석",
  ];
  const allNums = new Set<string>();

  for (const q of queries) {
    try {
      // RISS 학술지 논문 검색 (page_collection=IJOU: 학술지)
      const url =
        `https://www.riss.kr/search/Search.do` +
        `?query=${encodeURIComponent(q)}` +
        `&isDetailSearch=N&searchGubun=true&viewYn=OP` +
        `&iStartCount=0&iGroupView=10&sortOrder=NEW&resultCnt=10` +
        `&sflag=1&isForeign=N&page_collection=IJOU`;

      const res = await fetch(url, {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      // 2022년 이상 최신 판례만
      extractCaseNumbers(html, 2022).forEach((n) => allNums.add(n));
    } catch {
      // 개별 쿼리 실패 무시
    }
  }

  return {
    caseNumbers: [...allNums],
    error: allNums.size === 0 ? "RISS 검색 결과 없음 (JS 렌더링 사이트일 수 있음)" : undefined,
  };
}

// ── Source 2: 법원도서관 판례해설 + glaw 주요판례 ────────────────────────────
// 법원도서관 검색 → glaw 최신 판례 목록 순서로 fallback
async function fetchFromLawLibrary(): Promise<{ caseNumbers: string[]; error?: string }> {
  const allNums = new Set<string>();
  const attempts: { label: string; url: string }[] = [
    // 법원도서관 판례해설 검색
    {
      label: "법원도서관",
      url: "https://library.scourt.go.kr/search/SearchList.do?searchQuery=%ED%8C%90%EB%A1%80%ED%95%B4%EC%84%A4&searchType=TI",
    },
    // glaw 주요판례 목록 (탭 ID 0 = 최신순)
    {
      label: "glaw-main",
      url: "http://glaw.scourt.go.kr/wsjo/panre/sjo060.do?q=&tabId=0&spId=",
    },
    // glaw 공보판례 섹션 시도
    {
      label: "glaw-notice",
      url: "http://glaw.scourt.go.kr/wsjo/panre/sjo090.do",
    },
  ];

  for (const { url } of attempts) {
    try {
      const res = await fetch(url, {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      extractCaseNumbers(html, 2022).forEach((n) => allNums.add(n));
    } catch {
      // 무시하고 다음 시도
    }
  }

  return {
    caseNumbers: [...allNums],
    error: allNums.size === 0 ? "법원도서관/glaw 접근 실패" : undefined,
  };
}

// ── Source 3: 법제처 DRF API — 공보판례(prncYn=Y) ─────────────────────────────
// 공보게재 판례 = 대법원이 중요하다고 선별한 판례
interface LawGoKrCase {
  caseNumber: string;
  caseName: string;
  court: string;
  date: string;
}

async function fetchFromLawGoKr(
  oc: string
): Promise<{ cases: LawGoKrCase[]; error?: string }> {
  const cutoffDate = `${CURRENT_YEAR - 2}0101`; // 최근 2년

  async function tryUrl(url: string): Promise<LawGoKrCase[]> {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CaseGenerator/1.0)" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const text = await res.text();
    const data = JSON.parse(text.replace(/^\uFEFF/, "").trim()) as Record<string, unknown>;

    // 인증 실패 감지
    const str = JSON.stringify(data);
    if (str.includes("검증에 실패") || (str.includes("인증") && str.includes("실패"))) {
      throw new Error("법제처 인증 실패");
    }

    const search =
      (data["PrecSearch"] ?? data["precSearch"] ?? data) as Record<string, unknown>;
    const prec = search["prec"] ?? search["Prec"] ?? [];
    const items = (Array.isArray(prec) ? prec : [prec]) as Record<string, string>[];

    return items
      .filter((item) => String(item["선고일자"] ?? "") >= cutoffDate)
      .map((item) => ({
        caseNumber: String(item["사건번호"] ?? "").trim(),
        caseName: String(item["사건명"] ?? "").trim(),
        court: String(item["법원명"] ?? "").trim(),
        date: String(item["선고일자"] ?? "").trim(),
      }))
      .filter((c) => c.caseNumber);
  }

  // 시도 1: 공보판례 전용 (prncYn=Y)
  try {
    const url = `https://www.law.go.kr/DRF/lawSearch.do?OC=${encodeURIComponent(oc)}&target=prec&type=JSON&prncYn=Y&display=100&sort=date`;
    const cases = await tryUrl(url);
    if (cases.length > 0) return { cases };
  } catch {
    // fallback으로
  }

  // 시도 2: 대법원 최신 판례 (court 파라미터)
  try {
    const url = `https://www.law.go.kr/DRF/lawSearch.do?OC=${encodeURIComponent(oc)}&target=prec&type=JSON&court=%EB%8C%80%EB%B2%95%EC%9B%90&display=100&sort=date`;
    const cases = await tryUrl(url);
    if (cases.length > 0) return { cases };
  } catch {
    // fallback으로
  }

  // 시도 3: query 없이 최신순
  try {
    const url = `https://www.law.go.kr/DRF/lawSearch.do?OC=${encodeURIComponent(oc)}&target=prec&type=JSON&display=100&sort=date`;
    const cases = await tryUrl(url);
    return { cases };
  } catch (e) {
    return {
      cases: [],
      error: e instanceof Error ? e.message : "법제처 API 오류",
    };
  }
}

// ── 특별법 사전 필터 ──────────────────────────────────────────────────────────
// 사건명에 특별법 키워드가 있으면 변시 비출제 가능성 높음
const SPECIAL_LAW_KEYWORDS = [
  "자본시장", "금융투자", "증권거래", "공정거래", "독점규제",
  "조세", "국세", "지방세", "관세", "부가가치세", "소득세", "법인세",
  "특허", "상표", "저작권", "지식재산", "실용신안",
  "고용보험", "산업재해", "근로기준", "임금채권",
  "환경오염", "폐기물", "대기환경",
  "농지", "산지", "광업",
];

function isSpecialLaw(caseName: string): boolean {
  return SPECIAL_LAW_KEYWORDS.some((kw) => caseName.includes(kw));
}

// ── Gemini 분류 + 변시 적합성 필터 ───────────────────────────────────────────
async function classifyWithGemini(
  apiKey: string,
  cases: Array<{ caseNumber: string; caseName?: string; court?: string }>
): Promise<{ 민사법: string[]; 공법: string[]; 형사법: string[] }> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

  // 사건번호 + 사건명 목록 구성
  const list = cases
    .slice(0, 120) // Gemini 입력 제한 고려
    .map((c) => `${c.caseNumber}${c.caseName ? ` [${c.caseName}]` : ""}`)
    .join("\n");

  const prompt = `다음은 최근 대법원·헌법재판소 판례번호 목록입니다.
변호사시험 사례형(민사법/공법/형사법) 출제 가능성이 높은 판례를 선별하여 법역별로 분류해 주세요.

## 선별 기준
- 민사법: 민법(계약·물권·불법행위·가족), 상법 기초(회사법 일반), 민사소송법
  → 사건번호에 "다" "나" "마" "라" 포함
- 공법: 헌법(기본권·위헌심사·헌법소원), 행정법(처분·항고소송·행정심판·재량)
  → 사건번호에 "두" "헌" 포함
- 형사법: 형법(구성요건·위법성·공범·죄수), 형사소송법(수사·압수수색·증거·공판)
  → 사건번호에 "도" 포함

## 제외 기준 (반드시 제외)
- 자본시장법·금융투자·공정거래법·조세법·특허법·저작권법·노동법·환경법 등 특별법 전문 사건
- 가처분·집행 등 절차법만 문제 되는 단순 사건
- 상고기각·심판불개시 등 실체 판단 없는 사건
- 사건번호 유형이 위 민사/공법/형사 분류에 맞지 않는 경우

## 응답 형식
코드블록, 설명 없이 JSON만 출력:
{"민사법":["사건번호1","사건번호2"],"공법":["사건번호1"],"형사법":["사건번호1","사건번호2"]}

## 판례 목록
${list}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("JSON not found in response");
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    return {
      민사법: Array.isArray(parsed["민사법"]) ? (parsed["민사법"] as string[]) : [],
      공법: Array.isArray(parsed["공법"]) ? (parsed["공법"] as string[]) : [],
      형사법: Array.isArray(parsed["형사법"]) ? (parsed["형사법"] as string[]) : [],
    };
  } catch (e) {
    console.error("[Gemini classify] error:", e);
    // Fallback: 사건번호 패턴 기반 분류만
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
    return res
      .status(500)
      .json({ error: "환경변수 설정 필요: LAW_OC, GEMINI_API_KEY" });
  }

  const errors: string[] = [];

  // 3개 소스 병렬 조회
  const [rissResult, glawResult, lawGoKrResult] = await Promise.all([
    fetchFromRiss(),
    fetchFromLawLibrary(),
    fetchFromLawGoKr(oc),
  ]);

  if (rissResult.error) errors.push(`RISS: ${rissResult.error}`);
  if (glawResult.error) errors.push(`법원도서관/glaw: ${glawResult.error}`);
  if (lawGoKrResult.error) errors.push(`법제처: ${lawGoKrResult.error}`);

  // 사건번호 맵 — 중복 제거 + 소스 추적 + 메타데이터 병합
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

  rissResult.caseNumbers.forEach((n) => addCase(n, "RISS"));
  glawResult.caseNumbers.forEach((n) => addCase(n, "법원도서관"));
  lawGoKrResult.cases.forEach((c) =>
    addCase(c.caseNumber, "법제처", {
      caseName: c.caseName,
      court: c.court,
      date: c.date,
    })
  );

  const totalRaw = caseMap.size;

  // 특별법 사전 필터 (사건명 기준)
  const filtered = [...caseMap.entries()]
    .filter(([, meta]) => !isSpecialLaw(meta.caseName ?? ""))
    .map(([num, meta]) => ({
      caseNumber: num,
      caseName: meta.caseName,
      court: meta.court,
      date: meta.date,
      sources: [...meta.sources],
    }));

  // Gemini 분류 + 변시 적합성 필터
  const classified = await classifyWithGemini(geminiKey, filtered);

  // FetchedCase 구조로 변환
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
      riss: rissResult.caseNumbers.length,
      glaw: glawResult.caseNumbers.length,
      lawGoKr: lawGoKrResult.cases.length,
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
