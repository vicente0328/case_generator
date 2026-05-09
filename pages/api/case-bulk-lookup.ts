import type { NextApiRequest, NextApiResponse } from "next";
import { lookupOne, type CaseData } from "./case-lookup";

const CONCURRENCY = 3;
const DELAY_MS = 200;

export interface BulkLookupOk {
  input: string;
  data: CaseData;
}

export interface BulkLookupFailed {
  input: string;
  error: string;
}

export interface BulkLookupResponse {
  ok: BulkLookupOk[];
  failed: BulkLookupFailed[];
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { caseNumbers } = req.body as { caseNumbers?: unknown };
  if (!Array.isArray(caseNumbers) || caseNumbers.length === 0) {
    return res.status(400).json({ error: "caseNumbers 배열이 필요합니다." });
  }
  if (caseNumbers.length > 50) {
    return res.status(400).json({ error: "한 번에 최대 50건까지 처리할 수 있습니다." });
  }
  const inputs = caseNumbers
    .map(c => (typeof c === "string" ? c.trim() : ""))
    .filter(Boolean);

  const oc = process.env.LAW_OC;
  if (!oc) {
    return res.status(500).json({ error: "법제처 OC 값이 설정되지 않았습니다." });
  }

  const ok: BulkLookupOk[] = [];
  const failed: BulkLookupFailed[] = [];

  // CONCURRENCY 청크 단위로 처리, 청크 사이 DELAY_MS
  for (let i = 0; i < inputs.length; i += CONCURRENCY) {
    const chunk = inputs.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (input) => {
        try {
          const r = await lookupOne(input, oc);
          return { input, r };
        } catch (e) {
          return {
            input,
            r: { ok: false as const, status: 500, error: e instanceof Error ? e.message : "조회 오류" },
          };
        }
      })
    );
    for (const { input, r } of results) {
      if (r.ok) ok.push({ input, data: r.data });
      else failed.push({ input, error: r.error });
    }
    if (i + CONCURRENCY < inputs.length) await sleep(DELAY_MS);
  }

  return res.status(200).json({ ok, failed } satisfies BulkLookupResponse);
}
