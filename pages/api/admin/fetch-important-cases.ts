import type { NextApiRequest, NextApiResponse } from "next";
import { admin } from "@/lib/firebaseAdmin";
import { classifyLawArea, type LawArea } from "@/lib/classifyLawArea";
import { scoreCase } from "@/lib/barExamTopics";

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
  sources: string[];
  rulingPoints?: string;
  rulingRatio?: string;
  rulingPointsCount?: number;
  rulingPointsLength?: number;
  lawArea?: LawArea;
  score?: number;
  matchedTopics?: string[];
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
    addedThisRun?: number;
    totalInList?: number;
  };
  errors: string[];
}

// ── 선별 기준 ─────────────────────────────────────────────────────────────────
const MIN_YEAR = 2020;
const MIN_RULING_POINTS_LENGTH = 200;
const MIN_RULING_POINTS_COUNT = 2;

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

// ── 텍스트 유틸 ───────────────────────────────────────────────────────────────

function stripHtml(text: string): string {
  return (text || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

function countRulingPoints(text: string): number {
  if (!text) return 0;
  const t = stripHtml(text);
  const m1 = (t.match(/\[\d+\]/g) || []).length;
  const m2 = (t.match(/^\s*\d+\.\s/gm) || []).length;
  const m3 = (t.match(/【\d+】/g) || []).length;
  const max = Math.max(m1, m2, m3);
  return max > 0 ? max : 1;
}

// Firestore document ID 안전화 — 사건번호의 쉼표·공백·슬래시 등 제거
function caseNumberToDocId(caseNumber: string): string {
  return caseNumber.replace(/[^\w가-힣]/g, "_");
}

// ── 법제처 API 호출 ───────────────────────────────────────────────────────────

interface SearchItem {
  caseNumber: string;
  caseName: string;
  court: string;
  date: string;
  serialNo: string;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://case-generator-eight.vercel.app";

async function fetchLawGoKrUrl(url: string, timeoutMs = 20000): Promise<{ data: Record<string, unknown> | null; error?: string }> {
  try {
    const res = await fetch(url, {
      headers: {
        Referer: `${SITE_URL}/`,
        Origin: SITE_URL,
        "User-Agent": "Mozilla/5.0 (compatible; CaseGenerator/1.0)",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { data: null, error: `HTTP ${res.status}` };
    const text = await res.text();
    try {
      return { data: JSON.parse(text.replace(/^﻿/, "").trim()) as Record<string, unknown> };
    } catch {
      return { data: null, error: `JSON parse fail: ${text.slice(0, 100)}` };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch fail";
    return { data: null, error: msg };
  }
}

function parseSearchItems(data: Record<string, unknown>): { items: SearchItem[]; authFailed: boolean } {
  const str = JSON.stringify(data);
  if (str.includes("검증에 실패") || (str.includes("인증") && str.includes("실패"))) {
    return { items: [], authFailed: true };
  }
  const search = (data["PrecSearch"] ?? data["precSearch"] ?? data) as Record<string, unknown>;
  const prec = search["prec"] ?? search["Prec"] ?? [];
  const raw = (Array.isArray(prec) ? prec : [prec]) as Record<string, string>[];
  const items = raw
    .map((it) => ({
      caseNumber: String(it["사건번호"] ?? "").trim(),
      caseName: String(it["사건명"] ?? "").trim(),
      court: String(it["법원명"] ?? "").trim(),
      date: String(it["선고일자"] ?? "").trim(),
      serialNo: String(it["판례일련번호"] ?? "").trim(),
    }))
    .filter((c) => c.caseNumber && c.serialNo);
  return { items, authFailed: false };
}

async function collectRecentCases(oc: string): Promise<{ items: SearchItem[]; error?: string; debug: string[] }> {
  // 전략 변경: 연도 직접 검색 + 작은 display 값으로 응답 시간 단축
  // "2025", "2024" 등은 사건번호에 해당 연도가 포함된 판례를 매칭
  // display=50 으로 응답 부담 감소, 페이지 더 늘려서 전체 양 유지
  const currentYear = new Date().getFullYear();
  const queries: string[] = [];
  for (let y = currentYear; y >= MIN_YEAR; y--) queries.push(String(y));

  const allMap = new Map<string, SearchItem>();
  const debug: string[] = [];
  let authFailed = false;
  let httpFailed = 0;
  let parseSuccess = 0;
  let totalRawItems = 0;
  let firstHttpError = "";

  for (const q of queries) {
    if (authFailed) break;
    for (let page = 1; page <= 4; page++) {
      const url =
        `https://www.law.go.kr/DRF/lawSearch.do` +
        `?OC=${encodeURIComponent(oc)}&target=prec&type=JSON` +
        `&query=${encodeURIComponent(q)}&display=50&sort=date&page=${page}`;
      const { data, error: httpErr } = await fetchLawGoKrUrl(url);
      if (!data) {
        httpFailed++;
        if (!firstHttpError && httpErr) firstHttpError = httpErr;
        debug.push(`HTTP fail q="${q}" p=${page}: ${httpErr || "?"}`);
        continue;
      }
      const { items, authFailed: af } = parseSearchItems(data);
      if (af) {
        authFailed = true;
        debug.push(`Auth fail: ${JSON.stringify(data).slice(0, 200)}`);
        break;
      }
      parseSuccess++;
      totalRawItems += items.length;
      if (items.length === 0) {
        if (page === 1) {
          debug.push(`Empty q="${q}": ${JSON.stringify(data).slice(0, 200)}`);
        }
        break;
      }
      for (const it of items) {
        if (!allMap.has(it.caseNumber)) allMap.set(it.caseNumber, it);
      }
    }
  }

  if (authFailed) return { items: [], error: "법제처 OC 인증 실패 (LAW_OC 환경변수 확인 필요)", debug };

  if (parseSuccess === 0) {
    return { items: [], error: `법제처 API 호출 ${httpFailed}회 모두 실패: ${firstHttpError || "원인 불명"}`, debug };
  }

  if (totalRawItems === 0) {
    return { items: [], error: `법제처 API 응답이 모두 빈 결과 — 응답 본문: ${debug[0] || "(없음)"}`, debug };
  }

  debug.push(`수집 raw=${totalRawItems}, 중복제거 후=${allMap.size}`);

  const filtered = [...allMap.values()].filter((it) => {
    const yearMatch = it.caseNumber.match(/^(\d{4})/);
    if (!yearMatch) return false;
    const year = parseInt(yearMatch[1], 10);
    if (year < MIN_YEAR) return false;
    return it.court.includes("대법원") || it.court.includes("헌법재판소");
  });

  debug.push(`post-2020 대법원/헌재 필터 후=${filtered.length}`);

  if (filtered.length === 0) {
    // 샘플 사건번호 1개 반환 — 응답 형태 진단용
    const sample = [...allMap.values()].slice(0, 3).map(it => `${it.caseNumber}|${it.court}`);
    return { items: [], error: `필터 통과 0건 (수집 ${allMap.size}건 중). 샘플: ${sample.join(", ")}`, debug };
  }

  return { items: filtered, debug };
}

export interface DetailResult {
  caseNumber: string;
  caseName: string;
  court: string;
  date: string;
  rulingPoints: string;       // 판시사항 본문
  rulingRatio: string;        // 판결요지 본문
  rulingPointsCount: number;
  rulingPointsLength: number;
  score: number;
  matchedTopics: string[];
}

async function fetchDetail(oc: string, item: SearchItem): Promise<DetailResult | null> {
  const url = `https://www.law.go.kr/DRF/lawService.do?OC=${encodeURIComponent(oc)}&target=prec&ID=${item.serialNo}&type=JSON`;
  const { data } = await fetchLawGoKrUrl(url, 12000);
  if (!data) return null;
  const detail = (data["PrecService"] ?? data["precService"] ?? data) as Record<string, unknown>;
  if (!detail || typeof detail !== "object") return null;

  const rulingPoints = stripHtml(String(detail["판시사항"] ?? ""));
  if (!rulingPoints) return null;
  const rulingRatio = stripHtml(String(detail["판결요지"] ?? ""));

  const caseNumber = String(detail["사건번호"] ?? item.caseNumber);
  const caseName = String(detail["사건명"] ?? item.caseName);
  const area = classifyLawArea(caseNumber);
  const matchText = `${caseName}\n${rulingPoints}\n${rulingRatio}`;
  const { score, matchedTopics } = scoreCase(area, matchText);

  return {
    caseNumber,
    caseName,
    court: String(detail["법원명"] ?? item.court),
    date: String(detail["선고일자"] ?? item.date),
    rulingPoints,
    rulingRatio,
    rulingPointsCount: countRulingPoints(rulingPoints),
    rulingPointsLength: rulingPoints.length,
    score,
    matchedTopics,
  };
}

async function fetchAllDetails(oc: string, items: SearchItem[]): Promise<DetailResult[]> {
  const results: DetailResult[] = [];
  const CHUNK = 5;
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    const settled = await Promise.allSettled(chunk.map((it) => fetchDetail(oc, it)));
    for (const r of settled) {
      if (r.status === "fulfilled" && r.value) results.push(r.value);
    }
    if (i + CHUNK < items.length) {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  return results;
}

// ── Firestore 입출력 ──────────────────────────────────────────────────────────

interface StoredCase {
  caseNumber: string;
  caseName: string;
  court: string;
  date: string;
  rulingPoints: string;
  rulingRatio: string;
  rulingPointsCount: number;
  rulingPointsLength: number;
  lawArea: LawArea;
  score: number;
  matchedTopics: string[];
  addedAt: FirebaseFirestore.Timestamp;
}

const COLLECTION = "examLikelyCases";

async function loadAll(): Promise<StoredCase[]> {
  const db = admin.firestore();
  const snap = await db.collection(COLLECTION).orderBy("addedAt", "desc").get();
  return snap.docs.map((d) => d.data() as StoredCase);
}

async function loadExistingCaseNumbers(): Promise<Set<string>> {
  const db = admin.firestore();
  const snap = await db.collection(COLLECTION).select("caseNumber").get();
  const set = new Set<string>();
  for (const d of snap.docs) {
    const cn = (d.data() as { caseNumber?: string }).caseNumber;
    if (cn) set.add(cn);
  }
  return set;
}

async function saveCases(cases: DetailResult[]): Promise<number> {
  if (cases.length === 0) return 0;
  const db = admin.firestore();
  const batch = db.batch();
  const now = admin.firestore.Timestamp.now();
  let added = 0;
  for (const c of cases) {
    const docId = caseNumberToDocId(c.caseNumber);
    const ref = db.collection(COLLECTION).doc(docId);
    // Firestore 는 undefined 를 거부하므로 모든 문자열·배열 필드를 안전 기본값으로 강제
    const stored: StoredCase = {
      caseNumber: c.caseNumber,
      caseName: c.caseName ?? "",
      court: c.court ?? "",
      date: c.date ?? "",
      rulingPoints: c.rulingPoints ?? "",
      rulingRatio: c.rulingRatio ?? "",
      rulingPointsCount: c.rulingPointsCount ?? 0,
      rulingPointsLength: c.rulingPointsLength ?? 0,
      lawArea: classifyLawArea(c.caseNumber),
      score: c.score ?? 0,
      matchedTopics: c.matchedTopics ?? [],
      addedAt: now,
    };
    batch.set(ref, stored, { merge: false });
    added++;
  }
  await batch.commit();
  return added;
}

// ── 응답 빌더 ─────────────────────────────────────────────────────────────────

function sortByScore(arr: FetchedCase[]) {
  arr.sort((a, b) => {
    const sa = a.score ?? 0;
    const sb = b.score ?? 0;
    if (sb !== sa) return sb - sa;
    const ca = a.rulingPointsCount ?? 0;
    const cb = b.rulingPointsCount ?? 0;
    if (cb !== ca) return cb - ca;
    return (b.rulingPointsLength ?? 0) - (a.rulingPointsLength ?? 0);
  });
}

function buildResult(
  stored: StoredCase[],
  stats: FetchResult["stats"],
  errors: string[]
): FetchResult {
  const grouped: Record<LawArea, FetchedCase[]> = { 민사법: [], 공법: [], 형사법: [] };
  for (const s of stored) {
    grouped[s.lawArea].push({
      caseNumber: s.caseNumber,
      caseName: s.caseName,
      court: s.court,
      date: s.date,
      sources: ["법제처"],
      rulingPoints: s.rulingPoints,
      rulingRatio: s.rulingRatio,
      rulingPointsCount: s.rulingPointsCount,
      rulingPointsLength: s.rulingPointsLength,
      lawArea: s.lawArea,
      score: s.score,
      matchedTopics: s.matchedTopics,
    });
  }
  for (const area of Object.keys(grouped) as LawArea[]) {
    sortByScore(grouped[area]);
  }
  return { ...grouped, stats, errors };
}

// ── 메인 핸들러 ───────────────────────────────────────────────────────────────
// GET                    → DB의 출제 유력 판례 목록 반환
// POST ?action=activate  → 법제처 검색 + 선별 → 후보 반환 (DB 미저장)
// POST ?action=commit    → body.cases 의 사건들을 DB에 저장

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).end();
  if (!(await verifyAdmin(req))) return res.status(401).json({ error: "Unauthorized" });

  const errors: string[] = [];

  try {
    if (req.method === "GET") {
      const stored = await loadAll();
      return res.status(200).json(
        buildResult(stored, {
          lawGoKr: 0,
          journal: 0,
          aiSuggested: 0,
          totalRaw: 0,
          totalFiltered: 0,
          totalInList: stored.length,
        }, errors)
      );
    }

    // POST 분기
    const action = String(req.query.action || "activate");

    if (action === "commit") {
      // body 에서 후보 사건들을 받아 DB에 저장
      const body = req.body as { cases?: DetailResult[] } | undefined;
      const cases = Array.isArray(body?.cases) ? body!.cases : [];
      if (cases.length === 0) {
        return res.status(400).json({ error: "저장할 판례가 없습니다." });
      }
      // 기존 DB와 중복 제거
      const existing = await loadExistingCaseNumbers();
      const novel = cases.filter((c) => c.caseNumber && !existing.has(c.caseNumber));
      const addedCount = await saveCases(novel);
      const stored = await loadAll();

      return res.status(200).json(
        buildResult(stored, {
          lawGoKr: 0,
          journal: 0,
          aiSuggested: 0,
          totalRaw: cases.length,
          totalFiltered: novel.length,
          addedThisRun: addedCount,
          totalInList: stored.length,
        }, errors)
      );
    }

    // action === "activate" — 검색 + 선별 (DB 미저장, 후보만 반환)
    const oc = process.env.LAW_OC;
    if (!oc) return res.status(500).json({ error: "환경변수 필요: LAW_OC" });

    const existing = await loadExistingCaseNumbers();

    const collected = await collectRecentCases(oc);
    if (collected.error) errors.push(`법제처: ${collected.error}`);
    for (const d of collected.debug.slice(0, 5)) errors.push(`[debug] ${d}`);
    const totalRaw = collected.items.length;

    // 이미 DB에 있는 사건 사전 제외 (이미 출제 유력 목록에 들어가 있음)
    const novel = collected.items.filter((it) => !existing.has(it.caseNumber));
    errors.push(`[debug] 신규 사건(기존 DB 제외 후)=${novel.length}, 기존 DB=${existing.size}`);

    const MAX_DETAIL = 200;
    const toFetch = novel.slice(0, MAX_DETAIL);
    if (novel.length > MAX_DETAIL) {
      errors.push(`상세 조회 상한 ${MAX_DETAIL}건 (신규 ${novel.length}건)`);
    }

    const details = await fetchAllDetails(oc, toFetch);
    errors.push(`[debug] 상세 조회 성공=${details.length}/${toFetch.length}`);

    const passed = details.filter((d) => {
      if (isSpecialLaw(d.caseName)) return false;
      return d.rulingPointsLength >= MIN_RULING_POINTS_LENGTH || d.rulingPointsCount >= MIN_RULING_POINTS_COUNT;
    });
    errors.push(`[debug] 임계값 통과=${passed.length}/${details.length}`);

    // 후보를 법역별로 그룹핑 (저장은 안 함)
    const grouped: Record<LawArea, FetchedCase[]> = { 민사법: [], 공법: [], 형사법: [] };
    for (const d of passed) {
      const area = classifyLawArea(d.caseNumber);
      grouped[area].push({
        caseNumber: d.caseNumber,
        caseName: d.caseName,
        court: d.court,
        date: d.date,
        sources: ["법제처"],
        rulingPoints: d.rulingPoints,
        rulingRatio: d.rulingRatio,
        rulingPointsCount: d.rulingPointsCount,
        rulingPointsLength: d.rulingPointsLength,
        lawArea: area,
        score: d.score,
        matchedTopics: d.matchedTopics,
      });
    }
    for (const area of Object.keys(grouped) as LawArea[]) {
      sortByScore(grouped[area]);
    }

    return res.status(200).json({
      ...grouped,
      stats: {
        lawGoKr: totalRaw,
        journal: 0,
        aiSuggested: 0,
        totalRaw,
        totalFiltered: passed.length,
        addedThisRun: 0,           // Activate 단계는 DB 저장 안 함
        totalInList: existing.size,
      },
      errors,
    } as FetchResult);
  } catch (e) {
    console.error("[fetch-important-cases]", e);
    return res.status(500).json({
      error: e instanceof Error ? e.message : "오류가 발생했습니다.",
    });
  }
}
