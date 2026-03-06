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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const { caseNumber } = req.query;
  if (!caseNumber || typeof caseNumber !== "string") {
    return res.status(400).json({ error: "사건번호를 입력해 주세요." });
  }

  const oc = process.env.LAW_OC;
  if (!oc) {
    return res.status(500).json({ error: "법제처 OC 값이 설정되지 않았습니다. .env 파일에 LAW_OC를 확인해 주세요." });
  }

  try {
    // Step 1: Search for the case by case number
    const searchUrl = `http://www.law.go.kr/DRF/lawSearch.do?OC=${encodeURIComponent(oc)}&target=prec&type=JSON&query=${encodeURIComponent(caseNumber)}`;
    const searchRes = await fetch(searchUrl);

    if (!searchRes.ok) {
      return res.status(502).json({ error: "법제처 API 요청에 실패했습니다." });
    }

    const searchData = await searchRes.json();
    const precSearch = searchData?.PrecSearch;

    if (!precSearch) {
      return res.status(404).json({ error: "판례 검색 결과를 파싱하지 못했습니다." });
    }

    const items: Record<string, string>[] = Array.isArray(precSearch.prec)
      ? precSearch.prec
      : precSearch.prec
      ? [precSearch.prec]
      : [];

    if (items.length === 0) {
      return res.status(404).json({ error: `'${caseNumber}'에 해당하는 판례를 찾지 못했습니다.` });
    }

    // Find exact case number match or use first result
    const found =
      items.find((item) => item["사건번호"]?.includes(caseNumber.replace(/\s/g, ""))) ||
      items[0];

    const serialNo = found["판례정보일련번호"];

    // Step 2: Get full case detail using serial number
    if (serialNo) {
      const detailUrl = `http://www.law.go.kr/DRF/lawService.do?OC=${encodeURIComponent(oc)}&target=prec&ID=${serialNo}&type=JSON`;
      const detailRes = await fetch(detailUrl);
      if (detailRes.ok) {
        const detailData = await detailRes.json();
        const detail = detailData?.PrecService || detailData;
        if (detail && (detail["판시사항"] || detail["판결요지"])) {
          return res.status(200).json({
            caseNumber: detail["사건번호"] || found["사건번호"] || caseNumber,
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
    }

    // Fallback: use search result data
    return res.status(200).json({
      caseNumber: found["사건번호"] || caseNumber,
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
