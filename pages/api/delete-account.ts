import type { NextApiRequest, NextApiResponse } from "next";
import { admin } from "@/lib/firebaseAdmin";

const ANON_NAME = "(탈퇴한 사용자)";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") return res.status(405).end();

  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  let uid: string;
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }

  const db = admin.firestore();

  try {
    // 1. posts — userId 필드를 null로, userName을 익명으로
    const postsSnap = await db.collection("posts").where("userId", "==", uid).get();
    if (!postsSnap.empty) {
      const batch = db.batch();
      postsSnap.docs.forEach(d => batch.update(d.ref, { userId: null, userName: ANON_NAME }));
      await batch.commit();
    }

    // 2. comments (collectionGroup) — userId 필드를 null로, userName을 익명으로
    const commentsSnap = await db.collectionGroup("comments").where("userId", "==", uid).get();
    if (!commentsSnap.empty) {
      // Firestore batch 한도 500건 — 분할
      const chunks: FirebaseFirestore.QueryDocumentSnapshot[][] = [];
      for (let i = 0; i < commentsSnap.docs.length; i += 400) {
        chunks.push(commentsSnap.docs.slice(i, i + 400));
      }
      for (const chunk of chunks) {
        const batch = db.batch();
        chunk.forEach(d => batch.update(d.ref, { userId: null, userName: ANON_NAME }));
        await batch.commit();
      }
    }

    // 3. votes — userId 컬럼 없음 (익명 처리 불필요)

    // 4. users/{uid}/myCases 서브컬렉션 삭제
    const myCasesSnap = await db.collection("users").doc(uid).collection("myCases").get();
    if (!myCasesSnap.empty) {
      const batch = db.batch();
      myCasesSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    // 5. users/{uid} 문서 삭제
    await db.collection("users").doc(uid).delete();

    // 6. usage/{uid} 문서 삭제
    await db.collection("usage").doc(uid).delete();

    // 7. Firebase Auth 계정 삭제 (마지막으로)
    await admin.auth().deleteUser(uid);

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[delete-account]", e);
    return res.status(500).json({ error: "Failed to delete account" });
  }
}
