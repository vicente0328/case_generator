import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, setDoc, collection, query, where, getDocs, writeBatch } from "firebase/firestore";
import { auth, db, googleProvider, isConfigured } from "@/lib/firebase";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  customDisplayName: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  updateDisplayName: (name: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [customDisplayName, setCustomDisplayName] = useState<string | null>(null);

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const snap = await getDoc(doc(db, "users", u.uid));
        if (snap.exists() && snap.data().displayName) {
          setCustomDisplayName(snap.data().displayName);
        } else {
          setCustomDisplayName(null);
        }
      } else {
        setCustomDisplayName(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(user, { displayName });
    await setDoc(doc(db, "users", user.uid), { displayName }, { merge: true });
    setCustomDisplayName(displayName);
  };

  const signInWithGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const logout = async () => {
    await signOut(auth);
  };

  const updateDisplayName = async (name: string) => {
    if (!user) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    // 1. Firebase Auth 업데이트
    await updateProfile(user, { displayName: trimmed });

    // 2. Firestore users/{uid} 저장
    await setDoc(doc(db, "users", user.uid), { displayName: trimmed }, { merge: true });

    // 3. 본인 게시글 userName 일괄 업데이트
    const postsQuery = query(collection(db, "posts"), where("userId", "==", user.uid));
    const postsSnap = await getDocs(postsQuery);
    if (!postsSnap.empty) {
      const batch = writeBatch(db);
      postsSnap.docs.forEach(d => batch.update(d.ref, { userName: trimmed }));
      await batch.commit();
    }

    // 4. 로컬 상태 즉시 반영
    setCustomDisplayName(trimmed);
    setUser({ ...user, displayName: trimmed } as User);
  };

  return (
    <AuthContext.Provider value={{ user, loading, customDisplayName, signIn, signUp, signInWithGoogle, logout, updateDisplayName }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
