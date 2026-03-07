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

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      Referer: "https://case-generator-eight.vercel.app/",
      Origin: "https://case-generator-eight.vercel.app",
    },
  });
  const text = await res.text();
  // Strip BOM if present
  const clean = text.replace(/^\uFEFF/, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    // If JSON parse fails, log and return null
    console.error("JSON parse failed. Raw response:", clean.slice(0, 500));
    return null;
  }
}

function extractItems(data: unknown): ApiRecord[] {
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;

  // Try common top-level keys
  const search =
    obj["PrecSearch"] ??
    obj["precSearch"] ??
    obj["prec_search"] ??
    obj;

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
  const obj = data as Record<string, unknown>;

  // Try common top-level keys
  const detail =
    obj["PrecService"] ??
    obj["precService"] ??
    obj;

  if (!detail || typeof detail !== "object") return null;
  const d = detail as ApiRecord;

  // Must have at least one meaningful field
  if (d["판결요지"] || d["판시사항"] || d["사건번호"]) return d;
  return null;
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
    // Step 1: Search by case number (try HTTPS first, fallback HTTP)
    const searchUrl = `https://www.law.go.kr/DRF/lawSearch.do?OC=${encodeURIComponent(oc)}&target=prec&type=JSON&query=${encodeURIComponent(trimmed)}&display=10&page=1`;

    let searchData = await fetchJson(searchUrl);

    // Fallback to HTTP if HTTPS fails
    if (!searchData) {
      const httpUrl = searchUrl.replace("https://", "http://");
      searchData = await fetchJson(httpUrl);
    }

    if (!searchData) {
      return res.status(502).json({ error: "법제처 API 응답을 파싱하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    }

    const items = extractItems(searchData);

    if (items.length === 0) {
      return res.status(404).json({ error: `'${trimmed}'에 해당하는 판례를 찾지 못했습니다. 사건번호를 다시 확인해 주세요.` });
    }

    // Find best matching item (exact case number match required)
    const normalized = trimmed.replace(/\s/g, "");
    const found =
      items.find((item) => (item["사건번호"] ?? "").replace(/\s/g, "") === normalized) ||
      items.find((item) => (item["사건번호"] ?? "").replace(/\s/g, "").includes(normalized)) ||
      items.find((item) => normalized.includes((item["사건번호"] ?? "").replace(/\s/g, "")));

    if (!found) {
      return res.status(404).json({ error: `'${trimmed}'에 해당하는 판례를 찾지 못했습니다. 사건번호를 다시 확인해 주세요.` });
    }

    const serialNo = found["판례정보일련번호"] ?? found["일련번호"] ?? "";

    // Step 2: Get full detail by serial number
    if (serialNo) {
      const detailUrl = `https://www.law.go.kr/DRF/lawService.do?OC=${encodeURIComponent(oc)}&target=prec&ID=${serialNo}&type=JSON`;
      let detailData = await fetchJson(detailUrl);
      if (!detailData) {
        detailData = await fetchJson(detailUrl.replace("https://", "http://"));
      }

      const detail = extractDetail(detailData);
      if (detail) {
        return res.status(200).json({
          caseNumber: detail["사건번호"] || found["사건번호"] || trimmed,
          caseName: detail["사건명"] || found["사건명"] || "",
          court: detail["법원명"] || found["법원명"] || "",
          date: String(detail["선고일자"] || found["선고일자"] || ""),
          rulingPoints: detail["판시사항"] || found["판시사항"] || "",
          rulingRatio: detail["판결요지"] || found["판결요지"] || "",
          references: detail["참조조문"] || "",
          fullText: detail["판례내용"] || "",
          serialNo,
        } as CaseData);
      }
    }

    // Fallback: return search result data as-is
    return res.status(200).json({
      caseNumber: found["사건번호"] || trimmed,
      caseName: found["사건명"] || "",
      court: found["법원명"] || "",
      date: String(found["선고일자"] || ""),
      rulingPoints: found["판시사항"] || "",
      rulingRatio: found["판결요지"] || "",
      references: "",
      fullText: "",
      serialNo,
    } as CaseData);
  } catch (err) {
    console.error("case-lookup error:", err);
    return res.status(500).json({ error: "판례 조회 중 오류가 발생했습니다." });
  }
}
