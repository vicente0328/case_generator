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
  if (req.method !== "DELETE") return res.status(405).end();
  if (!(await verifyAdmin(req))) return res.status(401).json({ error: "Unauthorized" });

  const { postId, commentId } = req.query;
  if (!postId || !commentId || typeof postId !== "string" || typeof commentId !== "string") {
    return res.status(400).json({ error: "postId and commentId required" });
  }

  const db = admin.firestore();
  await db.collection("posts").doc(postId).collection("comments").doc(commentId).update({
    deleted: true,
    text: "",
  });
  return res.status(200).json({ ok: true });
}
