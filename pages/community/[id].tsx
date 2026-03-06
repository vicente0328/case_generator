import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "@/components/Layout";
import { useAuth } from "@/lib/contexts/AuthContext";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  updateDoc,
  increment,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  setDoc,
  deleteDoc,
} from "firebase/firestore";

interface Post {
  id: string;
  userId: string;
  userName: string;
  caseNumber: string;
  caseName: string;
  court: string;
  date: string;
  rulingPoints: string;
  rulingRatio: string;
  content: string;
  likes: number;
  needsReview: number;
  createdAt: { seconds: number } | null;
}

interface Comment {
  id: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: { seconds: number } | null;
}

type Reaction = "like" | "needsReview" | null;

function ContentSection({ type, heading, body }: { type: string; heading: string; body: string }) {
  const styles: Record<string, string> = {
    facts: "bg-amber-50 border-l-4 border-amber-400 rounded-r-xl p-5",
    question: "bg-navy-50 border-l-4 border-navy-500 rounded-r-xl p-5",
    answer: "bg-blue-50 border-l-4 border-blue-400 rounded-r-xl p-5",
    precedent: "bg-gray-50 border border-gray-200 rounded-xl p-5 ml-4",
    other: "px-2",
  };
  const headingStyles: Record<string, string> = {
    facts: "font-serif font-bold text-amber-900 mb-3 text-base",
    question: "font-serif font-bold text-navy-900 mb-3 text-base",
    answer: "font-serif font-bold text-blue-900 mb-3 text-base",
    precedent: "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2",
    other: "font-semibold mb-1 text-sm",
  };

  return (
    <div className={styles[type] || styles.other}>
      {heading && <p className={headingStyles[type] || "font-semibold mb-1"}>{heading}</p>}
      {type === "precedent" ? (
        <blockquote className="font-serif text-sm text-gray-700 leading-relaxed border-l-2 border-gold-400 pl-4 italic">
          {body}
        </blockquote>
      ) : (
        <p className="text-sm text-gray-800 leading-loose whitespace-pre-line">{body}</p>
      )}
    </div>
  );
}

function parseContent(text: string) {
  const sections: Array<{ type: string; heading: string; body: string }> = [];
  const lines = text.split("\n");
  let current: { type: string; heading: string; body: string } | null = null;

  const flush = () => {
    if (current && (current.body.trim() || current.heading.trim())) {
      current.body = current.body.trim();
      sections.push(current);
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\[사실관계\]|^\*\*\[사실관계\]\*\*|^##\s*사실관계|^사실관계/.test(trimmed)) {
      flush(); current = { type: "facts", heading: "사실관계", body: "" };
    } else if (/^\[문\s*\d+\]|^\*\*\[문\s*\d+\]|^##\s*문\s*\d+|^문\s*\d+/.test(trimmed)) {
      flush(); current = { type: "question", heading: trimmed.replace(/\*\*/g, ""), body: "" };
    } else if (/^\[해설\]|^\*\*\[해설\]\*\*|^##\s*해설|^해설/.test(trimmed)) {
      flush(); current = { type: "answer", heading: "해설", body: "" };
    } else if (/모델\s*판례/.test(trimmed)) {
      flush();
      const match = trimmed.match(/모델\s*판례[^:]*:\s*(.*)/s);
      current = {
        type: "precedent",
        heading: trimmed.replace(/[""].*/, "").trim(),
        body: match ? match[1].replace(/^[""]/, "").replace(/[""]$/, "") : "",
      };
    } else if (current) {
      current.body += (current.body ? "\n" : "") + line;
    } else {
      flush(); current = { type: "other", heading: "", body: line };
    }
  }
  flush();
  return sections.filter((s) => s.body.trim().length > 0 || s.heading.trim().length > 0);
}

export default function PostDetail() {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useAuth();

  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [userReaction, setUserReaction] = useState<Reaction>(null);
  const [loadingPost, setLoadingPost] = useState(true);
  const [reacting, setReacting] = useState(false);

  useEffect(() => {
    if (!id || typeof id !== "string") return;
    (async () => {
      const snap = await getDoc(doc(db, "posts", id));
      if (snap.exists()) setPost({ id: snap.id, ...snap.data() } as Post);
      setLoadingPost(false);

      const cmtQ = query(collection(db, "posts", id, "comments"), orderBy("createdAt", "asc"));
      const cmtSnap = await getDocs(cmtQ);
      setComments(cmtSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Comment)));
    })();
  }, [id]);

  useEffect(() => {
    if (!id || !user || typeof id !== "string") return;
    getDoc(doc(db, "reactions", `${id}_${user.uid}`)).then((snap) => {
      if (snap.exists()) setUserReaction(snap.data().type as Reaction);
    });
  }, [id, user]);

  const handleReaction = async (type: "like" | "needsReview") => {
    if (!user || !post || reacting) return;
    setReacting(true);
    const rDocRef = doc(db, "reactions", `${post.id}_${user.uid}`);
    const postRef = doc(db, "posts", post.id);
    const field = type === "like" ? "likes" : "needsReview";

    try {
      if (userReaction === type) {
        // Remove reaction
        await deleteDoc(rDocRef);
        await updateDoc(postRef, { [field]: increment(-1) });
        setPost((p) => p ? { ...p, [field]: p[field] - 1 } : p);
        setUserReaction(null);
      } else {
        // Remove old reaction if exists
        if (userReaction) {
          const oldField = userReaction === "like" ? "likes" : "needsReview";
          await updateDoc(postRef, { [oldField]: increment(-1) });
          setPost((p) => p ? { ...p, [oldField]: (p as Post)[oldField as keyof Post] as number - 1 } : p);
        }
        // Add new reaction
        await setDoc(rDocRef, { postId: post.id, userId: user.uid, type });
        await updateDoc(postRef, { [field]: increment(1) });
        setPost((p) => p ? { ...p, [field]: p[field] + 1 } : p);
        setUserReaction(type);
      }
    } finally {
      setReacting(false);
    }
  };

  const handleComment = async () => {
    if (!user || !commentText.trim() || !id || typeof id !== "string") return;
    setSubmittingComment(true);
    try {
      const ref = await addDoc(collection(db, "posts", id, "comments"), {
        userId: user.uid,
        userName: user.displayName || user.email?.split("@")[0] || "익명",
        text: commentText.trim(),
        createdAt: serverTimestamp(),
      });
      setComments((prev) => [...prev, {
        id: ref.id,
        userId: user.uid,
        userName: user.displayName || user.email?.split("@")[0] || "익명",
        text: commentText.trim(),
        createdAt: null,
      }]);
      setCommentText("");
    } finally {
      setSubmittingComment(false);
    }
  };

  const formatDate = (ts: { seconds: number } | null) => {
    if (!ts) return "방금";
    return new Date(ts.seconds * 1000).toLocaleDateString("ko-KR", {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  };

  if (loadingPost) {
    return (
      <Layout title="로딩 중...">
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <svg className="animate-spin w-8 h-8 text-navy-400 mx-auto" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </Layout>
    );
  }

  if (!post) {
    return (
      <Layout title="게시물 없음">
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <p className="text-gray-500 mb-4">게시물을 찾을 수 없습니다.</p>
          <Link href="/community" className="btn-primary rounded-xl text-sm">목록으로</Link>
        </div>
      </Layout>
    );
  }

  const sections = parseContent(post.content);

  return (
    <Layout title={`${post.caseName || post.caseNumber} - 커뮤니티`}>
      <div className="max-w-4xl mx-auto px-4 py-10">
        {/* Back */}
        <Link href="/community" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-navy-700 mb-6">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          커뮤니티 목록
        </Link>

        {/* Header */}
        <div className="bg-white rounded-xl border border-gray-100 p-6 mb-6">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs font-mono bg-navy-50 text-navy-700 px-2.5 py-1 rounded border border-navy-100">
              {post.caseNumber}
            </span>
            {post.court && <span className="text-xs text-gray-400">{post.court}</span>}
          </div>
          <h1 className="text-2xl font-serif font-bold text-navy-900 mb-3">
            {post.caseName || post.caseNumber}
          </h1>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span>{post.userName}</span>
              <span>·</span>
              <span>{formatDate(post.createdAt)}</span>
            </div>
            {/* Reactions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleReaction("like")}
                disabled={reacting || !user}
                title={user ? "추천" : "로그인 후 이용 가능"}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                  userReaction === "like"
                    ? "bg-blue-100 border-blue-300 text-blue-700"
                    : "border-gray-200 text-gray-500 hover:border-blue-200 hover:text-blue-600 hover:bg-blue-50"
                } disabled:opacity-50`}
              >
                <svg className="w-4 h-4" fill={userReaction === "like" ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                </svg>
                추천 {post.likes}
              </button>
              <button
                onClick={() => handleReaction("needsReview")}
                disabled={reacting || !user}
                title={user ? "검수 필요" : "로그인 후 이용 가능"}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                  userReaction === "needsReview"
                    ? "bg-orange-100 border-orange-300 text-orange-700"
                    : "border-gray-200 text-gray-500 hover:border-orange-200 hover:text-orange-600 hover:bg-orange-50"
                } disabled:opacity-50`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                검수 필요 {post.needsReview}
              </button>
            </div>
          </div>
        </div>

        {/* Case Info Summary */}
        {(post.rulingPoints || post.rulingRatio) && (
          <details className="bg-white rounded-xl border border-gray-100 mb-6 overflow-hidden">
            <summary className="px-6 py-4 cursor-pointer flex items-center justify-between text-sm font-medium text-gray-700 hover:bg-gray-50">
              <span>원본 판례 정보 보기</span>
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <div className="px-6 pb-5 space-y-3 border-t border-gray-100 pt-4">
              {post.rulingPoints && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase mb-1.5">판시사항</p>
                  <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-lg p-3">{post.rulingPoints}</p>
                </div>
              )}
              {post.rulingRatio && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase mb-1.5">판결요지</p>
                  <p className="text-sm text-gray-700 leading-relaxed bg-amber-50 rounded-lg p-3">{post.rulingRatio}</p>
                </div>
              )}
            </div>
          </details>
        )}

        {/* Generated Content */}
        <div className="bg-white rounded-xl border border-gray-100 p-6 sm:p-8 mb-8">
          <div className="space-y-4 legal-content">
            {sections.map((s, i) => (
              <ContentSection key={i} type={s.type} heading={s.heading} body={s.body} />
            ))}
            {sections.length === 0 && (
              <p className="text-sm text-gray-700 leading-loose whitespace-pre-line">{post.content}</p>
            )}
          </div>
        </div>

        {/* Comments */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="font-serif font-bold text-navy-900 mb-4 flex items-center gap-2">
            댓글
            <span className="text-sm font-normal text-gray-400">{comments.length}</span>
          </h2>

          {/* Comment form */}
          {user ? (
            <div className="mb-6">
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-navy-100 flex items-center justify-center text-navy-700 text-xs font-bold flex-shrink-0">
                  {(user.displayName || user.email || "?")[0].toUpperCase()}
                </div>
                <div className="flex-1">
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="판례 해석, 학습 관련 의견을 남겨보세요..."
                    rows={3}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-navy-400 focus:border-transparent"
                  />
                  <div className="flex justify-end mt-2">
                    <button
                      onClick={handleComment}
                      disabled={!commentText.trim() || submittingComment}
                      className="btn-primary rounded-lg text-xs px-4 py-2"
                    >
                      {submittingComment ? "등록 중..." : "댓글 등록"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 mb-6 bg-gray-50 rounded-xl px-4 py-3">
              댓글을 작성하려면 로그인이 필요합니다.
            </p>
          )}

          {/* Comment list */}
          <div className="space-y-4">
            {comments.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">아직 댓글이 없습니다.</p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-bold flex-shrink-0">
                    {c.userName[0].toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-800">{c.userName}</span>
                      <span className="text-xs text-gray-400">{formatDate(c.createdAt)}</span>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{c.text}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
