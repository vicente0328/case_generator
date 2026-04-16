import type { NextApiRequest, NextApiResponse } from "next";
import { admin } from "@/lib/firebaseAdmin";
import { type LawArea, classifyLawArea } from "@/lib/classifyLawArea";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const secret = req.headers["x-admin-secret"];
  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const db = admin.firestore();
    const snap = await db.collection("posts").get();

    let updated = 0;
    const batch = db.batch();

    for (const doc of snap.docs) {
      const data = doc.data();
      const correctArea = classifyLawArea(data.caseNumber || "");
      if (data.lawArea !== correctArea) {
        batch.update(doc.ref, { lawArea: correctArea });
        updated++;
      }
    }

    await batch.commit();
    return res.status(200).json({ updated, total: snap.size });
  } catch (e) {
    console.error("migrate-law-area error:", e);
    return res.status(500).json({ error: String(e) });
  }
}
