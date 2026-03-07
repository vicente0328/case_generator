import admin from "firebase-admin";

if (!admin.apps.length) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (raw) {
    try {
      const serviceAccount = JSON.parse(raw);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } catch (e) {
      console.error("Firebase Admin 초기화 실패:", e);
    }
  }
}

export { admin };
