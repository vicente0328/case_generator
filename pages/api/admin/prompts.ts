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
  const ref = db.collection("config").doc("prompts");

  if (req.method === "GET") {
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : {};
    return res.status(200).json({
      civil: data?.civil ?? null,
      public: data?.public ?? null,
      criminal: data?.criminal ?? null,
    });
  }

  if (req.method === "PUT") {
    const { civil, public: pub, criminal } = req.body as {
      civil?: string | null;
      public?: string | null;
      criminal?: string | null;
    };

    const update: Record<string, string | FirebaseFirestore.FieldValue> = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // null → 필드 삭제 (기본값으로 초기화), string → 저장
    if (civil !== undefined) {
      update.civil = civil === null ? admin.firestore.FieldValue.delete() : civil;
    }
    if (pub !== undefined) {
      update.public = pub === null ? admin.firestore.FieldValue.delete() : pub;
    }
    if (criminal !== undefined) {
      update.criminal = criminal === null ? admin.firestore.FieldValue.delete() : criminal;
    }

    await ref.set(update, { merge: true });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
