import type { NextApiRequest, NextApiResponse } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://case-generator-eight.vercel.app";

async function fetchRaw(url: string) {
  const res = await fetch(url, {
    headers: {
      Referer: `${SITE_URL}/`,
      Origin: SITE_URL,
      "User-Agent": "Mozilla/5.0 (compatible; CaseGenerator/1.0)",
    },
  });
  const text = await res.text();
  return { status: res.status, text: text.slice(0, 3000) };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const oc = process.env.LAW_OC || "(not set)";
  const q = (req.query.q as string) || "2016다271226";

  const searchUrl = `https://www.law.go.kr/DRF/lawSearch.do?OC=${encodeURIComponent(oc)}&target=prec&type=JSON&query=${encodeURIComponent(q)}&display=5&page=1`;

  try {
    const searchResult = await fetchRaw(searchUrl);

    // 검색 결과에서 일련번호 추출 시도
    let serialNo = "";
    let detailResult = null;
    try {
      const parsed = JSON.parse(searchResult.text.replace(/^\uFEFF/, "").trim());
      const search = parsed["PrecSearch"] || parsed["precSearch"] || parsed;
      const prec = search["prec"] || search["Prec"];
      const items = Array.isArray(prec) ? prec : prec ? [prec] : [];
      if (items.length > 0) {
        const first = items[0];
        serialNo =
          first["판례정보일련번호"] || first["일련번호"] || first["prec_seq"] || "";
        console.log("First item keys:", Object.keys(first));
        if (serialNo) {
          const detailUrl = `https://www.law.go.kr/DRF/lawService.do?OC=${encodeURIComponent(oc)}&target=prec&ID=${serialNo}&type=JSON`;
          detailResult = await fetchRaw(detailUrl);
        }
      }
    } catch (e) {
      console.error("parse error:", e);
    }

    return res.status(200).json({
      oc_prefix: oc.slice(0, 4) + "****",
      search: { url: searchUrl, ...searchResult },
      serial_no_found: serialNo,
      detail: detailResult,
    });
  } catch (err) {
    return res.status(200).json({ error: String(err) });
  }
}
