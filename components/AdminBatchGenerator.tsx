import { useState } from "react";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import type { User } from "firebase/auth";

type LawArea = "민사법" | "공법" | "형사법";

function classifyLawArea(caseNumber: string): LawArea {
  if (/도\d/.test(caseNumber)) return "형사법";
  if (/두\d/.test(caseNumber) || /헌/.test(caseNumber)) return "공법";
  return "민사법";
}

interface BatchItem {
  caseNumber: string;
  status: "pending" | "looking" | "generating" | "done" | "error";
  error?: string;
}

interface PostPreviewLike {
  id: string;
  userId?: string | null;
  userName: string;
  lawArea: LawArea;
  caseNumber: string;
  caseName: string;
  court: string;
  date: string;
  likes: number;
  needsReview: number;
}

interface Props {
  user: User;
  onNewPost: (post: PostPreviewLike) => void;
}

function StatusBadge({ status, error }: { status: BatchItem["status"]; error?: string }) {
  if (status === "pending") return <span className="text-[11px] text-zinc-300">대기 중</span>;
  if (status === "looking") return (
    <div className="flex items-center gap-1.5">
      <span className="w-3 h-3 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin flex-shrink-0" />
      <span className="text-[11px] text-zinc-500">판례 조회 중</span>
    </div>
  );
  if (status === "generating") return (
    <div className="flex items-center gap-1.5">
      <span className="w-3 h-3 border-2 border-blue-200 border-t-blue-700 rounded-full animate-spin flex-shrink-0" />
      <span className="text-[11px] text-blue-600">문제 생성 중</span>
    </div>
  );
  if (status === "done") return (
    <div className="flex items-center gap-1.5">
      <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      <span className="text-[11px] text-emerald-600">완료</span>
    </div>
  );
  return <span className="text-[11px] text-red-500 truncate max-w-[120px]" title={error}>오류: {error?.slice(0, 20)}</span>;
}

export default function AdminBatchGenerator({ user, onNewPost }: Props) {
  const [open, setOpen] = useState(false);
  const [batchInput, setBatchInput] = useState("");
  const [queue, setQueue] = useState<BatchItem[]>([]);
  const [running, setRunning] = useState(false);

  const updateItem = (i: number, updates: Partial<BatchItem>) =>
    setQueue(prev => prev.map((x, j) => j === i ? { ...x, ...updates } : x));

  const runBatch = async () => {
    const numbers = batchInput.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
    if (!numbers.length) return;
    const items: BatchItem[] = numbers.map(n => ({ caseNumber: n, status: "pending" }));
    setQueue(items);
    setRunning(true);

    for (let i = 0; i < items.length; i++) {
      try {
        updateItem(i, { status: "looking" });
        const res = await fetch(`/api/case-lookup?caseNumber=${encodeURIComponent(items[i].caseNumber)}`);
        const caseData = await res.json();
        if (!res.ok) throw new Error(caseData.error || "판례 조회 실패");

        updateItem(i, { status: "generating" });
        const genRes = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caseData, lawArea: classifyLawArea(caseData.caseNumber) }),
        });
        if (!genRes.body) throw new Error("스트림 오류");

        const reader = genRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "", fullText = "";

        loop: while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const payload = JSON.parse(line.slice(6));
              if (payload.error) throw new Error(payload.error);
              if (payload.done) break loop;
              if (payload.text) fullText += payload.text;
            } catch (e) {
              if (e instanceof Error && e.message !== "Unexpected end of JSON input") throw e;
            }
          }
        }

        const lawArea = classifyLawArea(caseData.caseNumber);
        const userName = user.displayName || user.email?.split("@")[0] || "admin";
        const ref = await addDoc(collection(db, "posts"), {
          userId: user.uid, userName, lawArea,
          caseNumber: caseData.caseNumber,
          caseName: caseData.caseName || "",
          court: caseData.court || "",
          date: caseData.date || "",
          rulingPoints: caseData.rulingPoints || "",
          rulingRatio: caseData.rulingRatio || "",
          fullText: caseData.fullText?.slice(0, 8000) || "",
          content: fullText,
          likes: 0, needsReview: 0,
          createdAt: serverTimestamp(),
        });

        onNewPost({
          id: ref.id, userId: user.uid, userName, lawArea,
          caseNumber: caseData.caseNumber, caseName: caseData.caseName || "",
          court: caseData.court || "", date: caseData.date || "",
          likes: 0, needsReview: 0,
        });

        updateItem(i, { status: "done" });
      } catch (e) {
        updateItem(i, { status: "error", error: e instanceof Error ? e.message : "오류" });
      }
    }

    setRunning(false);
  };

  const doneCount = queue.filter(q => q.status === "done").length;
  const errCount = queue.filter(q => q.status === "error").length;
  const finished = queue.length > 0 && !running;

  return (
    <div className="mt-6 rounded-xl border border-dashed border-zinc-200 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full px-5 py-3 flex items-center justify-between hover:bg-zinc-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
          </svg>
          <span className="text-[12px] font-semibold text-zinc-400">일괄 생성</span>
          <span className="text-[11px] text-zinc-300">여러 판례 한번에 생성</span>
        </div>
        <svg className={`w-3.5 h-3.5 text-zinc-300 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-zinc-100 p-4">
          <textarea
            value={batchInput}
            onChange={e => setBatchInput(e.target.value)}
            placeholder={"사건번호를 한 줄에 하나씩 입력\n예) 2022도5827\n    2019두49953\n    2021다264253"}
            rows={5}
            disabled={running}
            className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2.5 text-[13px] font-mono text-zinc-900 placeholder-zinc-300 focus:outline-none focus:border-zinc-400 transition-colors resize-none"
          />
          <div className="mt-2.5 flex justify-end">
            <button
              onClick={runBatch}
              disabled={running || !batchInput.trim()}
              className="h-8 px-4 bg-blue-900 text-white rounded-lg text-[12px] font-semibold hover:bg-blue-800 transition-colors disabled:opacity-40 flex items-center gap-2"
            >
              {running && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {running ? "생성 중…" : "생성 시작"}
            </button>
          </div>

          {queue.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {queue.map((item, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-100">
                  <span className="text-[12px] font-mono text-zinc-700">{item.caseNumber}</span>
                  <StatusBadge status={item.status} error={item.error} />
                </div>
              ))}
              {finished && (
                <p className="text-[11px] text-zinc-400 text-center pt-1">
                  완료: {doneCount}개 성공{errCount > 0 ? `, ${errCount}개 실패` : ""}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
