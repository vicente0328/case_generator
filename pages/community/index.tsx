import { useState, useEffect } from "react";
import Link from "next/link";
import Layout from "@/components/Layout";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  startAfter,
  DocumentSnapshot,
} from "firebase/firestore";

interface Post {
  id: string;
  userId: string;
  userName: string;
  caseNumber: string;
  caseName: string;
  court: string;
  content: string;
  likes: number;
  needsReview: number;
  createdAt: { seconds: number } | null;
}

const PAGE_SIZE = 12;

function PostCard({ post }: { post: Post }) {
  const preview = post.content.slice(0, 180).replace(/\n+/g, " ").trim();
  const date = post.createdAt
    ? new Date(post.createdAt.seconds * 1000).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";

  return (
    <Link href={`/community/${post.id}`} className="block group">
      <div className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md hover:border-navy-200 transition-all h-full flex flex-col">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <span className="text-xs font-mono bg-navy-50 text-navy-700 px-2 py-0.5 rounded border border-navy-100">
              {post.caseNumber}
            </span>
          </div>
          <span className="text-xs text-gray-400 whitespace-nowrap">{date}</span>
        </div>

        <h3 className="font-serif font-bold text-navy-900 text-base mb-1 group-hover:text-navy-600 transition-colors line-clamp-1">
          {post.caseName || post.caseNumber}
        </h3>
        {post.court && (
          <p className="text-xs text-gray-400 mb-2">{post.court}</p>
        )}
        <p className="text-sm text-gray-500 leading-relaxed flex-1 line-clamp-3">{preview}</p>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
          <span className="text-xs text-gray-400">{post.userName}</span>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1 text-blue-600">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
              </svg>
              {post.likes}
            </span>
            {post.needsReview > 0 && (
              <span className="flex items-center gap-1 text-orange-500">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                {post.needsReview}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function CommunityPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sortBy, setSortBy] = useState<"createdAt" | "likes">("createdAt");

  const fetchPosts = async (after: DocumentSnapshot | null = null) => {
    const q = after
      ? query(collection(db, "posts"), orderBy(sortBy, "desc"), startAfter(after), limit(PAGE_SIZE))
      : query(collection(db, "posts"), orderBy(sortBy, "desc"), limit(PAGE_SIZE));

    const snap = await getDocs(q);
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Post));
    return { items, last: snap.docs[snap.docs.length - 1] || null, done: snap.docs.length < PAGE_SIZE };
  };

  useEffect(() => {
    setLoading(true);
    setPosts([]);
    setLastDoc(null);
    setHasMore(true);
    fetchPosts().then(({ items, last, done }) => {
      setPosts(items);
      setLastDoc(last);
      setHasMore(!done);
      setLoading(false);
    }).catch(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy]);

  const loadMore = async () => {
    if (!lastDoc || loadingMore) return;
    setLoadingMore(true);
    const { items, last, done } = await fetchPosts(lastDoc);
    setPosts((prev) => [...prev, ...items]);
    setLastDoc(last);
    setHasMore(!done);
    setLoadingMore(false);
  };

  return (
    <Layout title="커뮤니티 - 변시 민사법 사례 생성기">
      <div className="max-w-7xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-serif font-bold text-navy-900 mb-1">커뮤니티</h1>
            <p className="text-sm text-gray-500">수험생들이 공유한 사례형 문제를 열람하고 함께 학습하세요.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setSortBy("createdAt")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  sortBy === "createdAt" ? "bg-white text-navy-900 shadow-sm" : "text-gray-500"
                }`}
              >
                최신순
              </button>
              <button
                onClick={() => setSortBy("likes")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  sortBy === "likes" ? "bg-white text-navy-900 shadow-sm" : "text-gray-500"
                }`}
              >
                추천순
              </button>
            </div>
            <Link
              href="/generate"
              className="btn-gold rounded-xl text-sm whitespace-nowrap flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              문제 생성
            </Link>
          </div>
        </div>

        {/* Posts grid */}
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
                <div className="h-4 bg-gray-100 rounded w-1/3 mb-3" />
                <div className="h-5 bg-gray-100 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-full mb-1" />
                <div className="h-3 bg-gray-100 rounded w-4/5" />
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4 text-2xl">
              📋
            </div>
            <h3 className="font-serif font-bold text-navy-900 text-lg mb-2">아직 게시물이 없습니다</h3>
            <p className="text-gray-500 text-sm mb-6">첫 번째로 사례형 문제를 생성하고 공유해 보세요!</p>
            <Link href="/generate" className="btn-gold rounded-xl text-sm">
              문제 생성하기
            </Link>
          </div>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
            {hasMore && (
              <div className="text-center mt-8">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="btn-secondary rounded-xl text-sm"
                >
                  {loadingMore ? "불러오는 중..." : "더 보기"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
