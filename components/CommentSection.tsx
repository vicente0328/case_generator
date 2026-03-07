import { useState, useEffect } from "react";
import { useAuth } from "@/lib/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  type Timestamp 
} from "firebase/firestore";
import { PaperAirplaneIcon, UserCircleIcon } from "@heroicons/react/24/outline";

interface Comment {
  id: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: Timestamp;
}

interface CommentSectionProps {
  postId: string;
}

export default function CommentSection({ postId }: CommentSectionProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!postId) return;
    
    const q = query(
      collection(db, "posts", postId, "comments"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const comms: Comment[] = [];
      snapshot.forEach((doc) => {
        comms.push({ id: doc.id, ...doc.data() } as Comment);
      });
      setComments(comms);
    });

    return () => unsubscribe();
  }, [postId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newComment.trim()) return;

    setLoading(true);
    try {
      await addDoc(collection(db, "posts", postId, "comments"), {
        userId: user.uid,
        userName: user.displayName || user.email?.split("@")[0] || "익명",
        content: newComment.trim(),
        createdAt: serverTimestamp(),
      });
      setNewComment("");
    } catch (error) {
      console.error("Error adding comment:", error);
      alert("댓글 작성 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-8 pt-8 border-t border-[#E5E5EA]">
      <h3 className="text-[18px] font-bold text-[#1C1C1E] mb-6">
        댓글 <span className="text-[#007AFF]">{comments.length}</span>
      </h3>

      {/* Comment Form */}
      <form onSubmit={handleSubmit} className="relative mb-8">
        <div className="flex gap-3">
          <div className="flex-1">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={user ? "댓글을 남겨보세요..." : "로그인이 필요합니다."}
              className="w-full bg-[#F2F2F7] rounded-[16px] px-4 py-3 text-[15px] text-[#1C1C1E] placeholder-[#8E8E93] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:bg-white transition-all resize-none h-[80px]"
              disabled={!user || loading}
            />
          </div>
          <button
            type="submit"
            disabled={!user || !newComment.trim() || loading}
            className="h-[80px] w-[60px] flex items-center justify-center bg-[#007AFF] text-white rounded-[16px] hover:bg-[#0062cc] disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            <PaperAirplaneIcon className="w-5 h-5 -rotate-45 translate-x-0.5" />
          </button>
        </div>
      </form>

      {/* Comment List */}
      <div className="space-y-6">
        {comments.map((comment) => (
          <div key={comment.id} className="flex gap-3 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#E5E5EA] flex items-center justify-center text-[#8E8E93]">
               <UserCircleIcon className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[14px] font-semibold text-[#1C1C1E]">
                  {comment.userName}
                </span>
                <span className="text-[12px] text-[#8E8E93]">
                  {comment.createdAt?.toDate().toLocaleDateString()}
                </span>
              </div>
              <p className="text-[15px] text-[#3A3A3C] leading-relaxed whitespace-pre-wrap">
                {comment.content}
              </p>
            </div>
          </div>
        ))}

        {comments.length === 0 && (
          <div className="text-center py-10 text-[#8E8E93] text-[15px]">
            아직 댓글이 없습니다. 첫 번째 댓글을 남겨보세요!
          </div>
        )}
      </div>
    </div>
  );
}
