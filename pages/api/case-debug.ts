import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const oc = process.env.LAW_OC || "(not set)";
  const query = (req.query.q as string) || "2016다271226";

  const url = `https://www.law.go.kr/DRF/lawSearch.do?OC=${encodeURIComponent(oc)}&target=prec&type=JSON&query=${encodeURIComponent(query)}&display=5&page=1`;

  try {
    const fetchRes = await fetch(url, {
      headers: {
        Referer: "https://case-generator-eight.vercel.app/",
        Origin: "https://case-generator-eight.vercel.app",
      },
    });
    const status = fetchRes.status;
    const contentType = fetchRes.headers.get("content-type") || "";
    const text = await fetchRes.text();

    return res.status(200).json({
      oc_used: oc,
      url_called: url,
      http_status: status,
      content_type: contentType,
      raw_response: text.slice(0, 2000),
    });
  } catch (err) {
    return res.status(200).json({
      oc_used: oc,
      url_called: url,
      error: String(err),
    });
  }
}
