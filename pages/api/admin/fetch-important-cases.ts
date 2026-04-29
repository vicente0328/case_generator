import type { NextApiRequest, NextApiResponse } from "next";
import { admin } from "@/lib/firebaseAdmin";
import { classifyLawArea, type LawArea } from "@/lib/classifyLawArea";

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
  rulingPointsCount?: number;
  rulingPointsLength?: number;
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

async function fetchLawGoKrUrl(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CaseGenerator/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    return JSON.parse(text.replace(/^﻿/, "").trim()) as Record<string, unknown>;
  } catch {
    return null;
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

async function collectRecentCases(oc: string): Promise<{ items: SearchItem[]; error?: string }> {
  const queries = ["선고", "결정", "헌법재판소"];
  const allMap = new Map<string, SearchItem>();
  let authFailed = false;

  for (const q of queries) {
    if (authFailed) break;
    for (let page = 1; page <= 3; page++) {
      const url =
        `https://www.law.go.kr/DRF/lawSearch.do` +
        `?OC=${encodeURIComponent(oc)}&target=prec&type=JSON` +
        `&query=${encodeURIComponent(q)}&display=100&sort=date&page=${page}`;
      const data = await fetchLawGoKrUrl(url);
      if (!data) continue;
      const { items, authFailed: af } = parseSearchItems(data);
      if (af) { authFailed = true; break; }
      if (items.length === 0) break;
      for (const it of items) {
        if (!allMap.has(it.caseNumber)) allMap.set(it.caseNumber, it);
      }
    }
  }

  if (authFailed) return { items: [], error: "법제처 OC 인증 실패 (LAW_OC 환경변수 확인 필요)" };

  const filtered = [...allMap.values()].filter((it) => {
    const yearMatch = it.caseNumber.match(/^(\d{4})/);
    if (!yearMatch) return false;
    const year = parseInt(yearMatch[1], 10);
    if (year < MIN_YEAR) return false;
    return it.court.includes("대법원") || it.court.includes("헌법재판소");
  });

  return { items: filtered };
}

interface DetailResult {
  caseNumber: string;
  caseName: string;
  court: string;
  date: string;
  rulingPointsCount: number;
  rulingPointsLength: number;
}

async function fetchDetail(oc: string, item: SearchItem): Promise<DetailResult | null> {
  const url = `https://www.law.go.kr/DRF/lawService.do?OC=${encodeURIComponent(oc)}&target=prec&ID=${item.serialNo}&type=JSON`;
  const data = await fetchLawGoKrUrl(url);
  if (!data) return null;
  const detail = (data["PrecService"] ?? data["precService"] ?? data) as Record<string, unknown>;
  if (!detail || typeof detail !== "object") return null;

  const rulingPoints = stripHtml(String(detail["판시사항"] ?? ""));
  if (!rulingPoints) return null;

  return {
    caseNumber: String(detail["사건번호"] ?? item.caseNumber),
    caseName: String(detail["사건명"] ?? item.caseName),
    court: String(detail["법원명"] ?? item.court),
    date: String(detail["선고일자"] ?? item.date),
    rulingPointsCount: countRulingPoints(rulingPoints),
    rulingPointsLength: rulingPoints.length,
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
  rulingPointsCount: number;
  rulingPointsLength: number;
  lawArea: LawArea;
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
    const stored: StoredCase = {
      caseNumber: c.caseNumber,
      caseName: c.caseName,
      court: c.court,
      date: c.date,
      rulingPointsCount: c.rulingPointsCount,
      rulingPointsLength: c.rulingPointsLength,
      lawArea: classifyLawArea(c.caseNumber),
      addedAt: now,
    };
    batch.set(ref, stored, { merge: false });
    added++;
  }
  await batch.commit();
  return added;
}

// ── 응답 빌더 ─────────────────────────────────────────────────────────────────

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
      rulingPointsCount: s.rulingPointsCount,
      rulingPointsLength: s.rulingPointsLength,
    });
  }
  for (const area of Object.keys(grouped) as LawArea[]) {
    grouped[area].sort((a, b) => {
      const ca = a.rulingPointsCount ?? 0;
      const cb = b.rulingPointsCount ?? 0;
      if (cb !== ca) return cb - ca;
      return (b.rulingPointsLength ?? 0) - (a.rulingPointsLength ?? 0);
    });
  }
  return { ...grouped, stats, errors };
}

// ── 메인 핸들러 ───────────────────────────────────────────────────────────────
// GET  → DB의 출제 유력 판례 목록 반환
// POST → 법제처 검색 + 선별 + DB에 신규 추가 + 갱신된 목록 반환

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

    // POST — Activate
    const oc = process.env.LAW_OC;
    if (!oc) return res.status(500).json({ error: "환경변수 필요: LAW_OC" });

    const existing = await loadExistingCaseNumbers();

    const collected = await collectRecentCases(oc);
    if (collected.error) errors.push(`법제처: ${collected.error}`);
    const totalRaw = collected.items.length;

    // 이미 DB에 있는 사건 사전 제외 → 상세 조회 비용 절감
    const novel = collected.items.filter((it) => !existing.has(it.caseNumber));

    const MAX_DETAIL = 200;
    const toFetch = novel.slice(0, MAX_DETAIL);
    if (novel.length > MAX_DETAIL) {
      errors.push(`상세 조회 상한 ${MAX_DETAIL}건 (신규 ${novel.length}건)`);
    }

    const details = await fetchAllDetails(oc, toFetch);

    const passed = details.filter((d) => {
      if (isSpecialLaw(d.caseName)) return false;
      return d.rulingPointsLength >= MIN_RULING_POINTS_LENGTH || d.rulingPointsCount >= MIN_RULING_POINTS_COUNT;
    });

    const addedCount = await saveCases(passed);

    const stored = await loadAll();

    return res.status(200).json(
      buildResult(stored, {
        lawGoKr: totalRaw,
        journal: 0,
        aiSuggested: 0,
        totalRaw,
        totalFiltered: passed.length,
        addedThisRun: addedCount,
        totalInList: stored.length,
      }, errors)
    );
  } catch (e) {
    console.error("[fetch-important-cases]", e);
    return res.status(500).json({
      error: e instanceof Error ? e.message : "오류가 발생했습니다.",
    });
  }
}
