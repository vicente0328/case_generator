import type { NextApiRequest, NextApiResponse } from "next";
import { admin } from "@/lib/firebaseAdmin";

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await verifyAdmin(req))) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const db = admin.firestore();
  const { id } = req.query;
  if (!id || typeof id !== "string") return res.status(400).json({ error: "id required" });

  // DELETE: 게시물 삭제
  if (req.method === "DELETE") {
    await db.collection("posts").doc(id).delete();
    return res.status(200).json({ ok: true });
  }

  // PATCH: 법역 재분류
  if (req.method === "PATCH") {
    const { lawArea } = req.body as { lawArea: string };
    if (!["민사법", "공법", "형사법"].includes(lawArea)) {
      return res.status(400).json({ error: "invalid lawArea" });
    }
    await db.collection("posts").doc(id).update({ lawArea });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
