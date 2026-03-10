import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import { useAuth } from "@/lib/contexts/AuthContext";
import { auth, db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, updateDoc, doc, increment, limit, getDoc, where, deleteDoc, runTransaction, setDoc } from "firebase/firestore";
import type { CaseData } from "./api/case-lookup";
import AdminBatchGenerator, { type AppendPayload } from "@/components/AdminBatchGenerator";
import AdminImportantCases from "@/components/AdminImportantCases";
import AuthModal from "@/components/AuthModal";

const ADMIN_EMAIL = "admin@casegenerator.com";

async function adminFetch(method: string, path: string, body?: object) {
  const token = await auth.currentUser?.getIdToken();
  return fetch(path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

type Step = "input" | "preview" | "generating" | "done";

interface Comment {
  id: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: { seconds: number } | null;
  deleted?: boolean;
}

interface PostPreview {
  id: string;
  userId?: string | null;
  caseNumber: string;
  caseName: string;
  court: string;
  date: string;
  likes: number;
  needsReview: number;
  userName: string;
  lawArea?: LawArea;
  model?: string;
}

interface Section {
  type: "header" | "facts" | "question" | "answer" | "precedent" | "other";
  heading: string;
  body: string;
}

type LawArea = "민사법" | "공법" | "형사법";

// 사건번호 패턴으로 법역 자동 분류
// 도 → 형사법, 두/헌 → 공법, 그 외(다 등) → 민사법
function classifyLawArea(caseNumber: string): LawArea {
  if (/도\d/.test(caseNumber)) return "형사법";
  if (/두\d/.test(caseNumber) || /헌/.test(caseNumber)) return "공법";
  return "민사법";
}

const SUGGESTED: Record<LawArea, string[]> = {
  민사법: ["2016다271226", "2019다272855", "2021다264253"],
  공법: ["2019두49953", "2010두2005", "2017헌마479"],
  형사법: ["2022도5827", "2021도13108", "2022도6743"],
};

function formatDate(d: string): string {
  const s = String(d).replace(/\D/g, "");
  if (s.length === 8) return `${s.slice(0, 4)}. ${s.slice(4, 6)}. ${s.slice(6, 8)}.`;
  return d;
}

// AI 응답에서 불필요한 메타 문자열 제거
function cleanAiText(text: string): string {
  return text
    .replace(/^(출력 형식 준수|출력 형식|형식 준수|참고|주의사항|주의)[^\n]*/gim, "")
    .replace(/^#+\s*(출력 형식|세부 작성 규칙|작성 규칙)[^\n]*/gim, "")
    .replace(/^\*\*?(출력 형식|세부 작성|참고|주의)[^*\n]*/gim, "")
    .replace(/\*\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseContent(text: string): Section[] {
  const cleaned = cleanAiText(text);
  const sections: Section[] = [];
  const lines = cleaned.split("\n");
  let cur: Section | null = null;

  const flush = () => {
    if (cur && (cur.body.trim() || cur.heading)) {
      cur.body = cur.body.trim();
      sections.push(cur);
    }
  };

  for (const line of lines) {
    const t = line.trim();
    if (/^\[판례\s*제목\]$/.test(t)) {
      flush(); cur = { type: "header", heading: "판례 제목", body: "" };
    } else if (/^<사실관계>$|^\[사실관계\]$/.test(t)) {
      flush(); cur = { type: "facts", heading: "사실관계", body: "" };
    } else if (/^<문\s*\d*>|^<문제>/.test(t)) {
      flush(); cur = { type: "question", heading: t.replace(/^<|>$/g, "").trim(), body: "" };
    } else if (/^\[문\s*\d+\]\s*\(\d+점\)/.test(t) && cur?.type !== "answer") {
      flush(); cur = { type: "question", heading: t.replace(/\*\*/g, ""), body: "" };
    } else if (/^\[해설 및 모범답안\]|^\[해설\]/.test(t)) {
      flush(); cur = { type: "answer", heading: "해설 및 모범답안", body: "" };
    } else if (/^\[모델\s*판례/.test(t)) {
      flush(); cur = { type: "precedent", heading: "모델 판례", body: "" };
    } else if (cur) {
      cur.body += (cur.body ? "\n" : "") + line;
    } else {
      flush(); cur = { type: "other", heading: "", body: line };
    }
  }
  flush();
  return sections.filter(s => s.body.trim() || s.heading);
}

/* ── 사실관계 불렛 분리 (따옴표 내부 줄바꿈/문장분리 방지) ── */
function splitFactsBullets(body: string): string[] {
  const rawLines = body.split("\n").map(l => l.trim()).filter(Boolean);

  // Step 1: 직전 줄에 닫히지 않은 큰따옴표(")가 있으면 다음 줄과 합침
  const joined: string[] = [];
  for (const line of rawLines) {
    if (joined.length > 0) {
      const prev = joined[joined.length - 1];
      if ((prev.match(/"/g) || []).length % 2 !== 0) {
        joined[joined.length - 1] = prev + " " + line;
        continue;
      }
    }
    joined.push(line);
  }

  // Step 2: 각 줄을 따옴표 바깥의 '다. ' 기준으로만 문장 분리
  return joined.flatMap(line => {
    const parts: string[] = [];
    let cur = "";
    let quotes = 0;
    for (let i = 0; i < line.length; i++) {
      cur += line[i];
      if (line[i] === '"') quotes++;
      if (
        quotes % 2 === 0 &&
        cur.endsWith("다.") &&
        i + 1 < line.length &&
        /\s/.test(line[i + 1])
      ) {
        while (i + 1 < line.length && /\s/.test(line[i + 1])) i++;
        parts.push(cur.trim());
        cur = "";
      }
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts;
  });
}

/* ── PDF 내보내기용 HTML 렌더러 ── */
function renderSectionsHtml(content: string): string {
  const sections = parseContent(content);
  return sections.map(s => {
    if (s.type === "header") return `<div class="section header-section"><strong class="prec-citation">${s.body}</strong></div>`;
    if (s.type === "facts") {
      const bullets = splitFactsBullets(s.body);
      return `<div class="section"><div class="sh facts-sh">사실관계</div><div class="sb facts-sb"><ul class="bl">${bullets.map(b => `<li>${b}</li>`).join("")}</ul></div></div>`;
    }
    if (s.type === "question") return `<div class="section"><div class="sh q-sh">${s.heading}</div><div class="sb q-sb">${s.body.replace(/\n/g, "<br>")}</div></div>`;
    if (s.type === "answer") return `<div class="section"><div class="sh ans-sh">해설 및 모범답안</div><div class="sb ans-sb">${s.body.replace(/\n/g, "<br>")}</div></div>`;
    if (s.type === "precedent") return `<div class="section"><div class="sh prec-sh">모델 판례</div><div class="sb prec-sb">${s.body.replace(/\n/g, "<br>")}</div></div>`;
    return s.body.trim() ? `<div class="other">${s.body.replace(/\n/g, "<br>")}</div>` : "";
  }).join("");
}

/* ── 판례 확인 카드 ── */
function CaseCard({ data, onReset }: { data: CaseData; onReset: () => void }) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      {/* 헤더 */}
      <div className="px-6 py-5 border-b border-zinc-100 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">판례 확인</span>
          </div>
          <p className="text-[21px] font-bold tracking-tight font-mono text-zinc-900">{data.caseNumber}</p>
          <p className="text-[13px] text-zinc-400 mt-1.5">
            {[data.court, data.date && formatDate(data.date), data.caseName].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button
          onClick={onReset}
          className="flex-shrink-0 text-[13px] text-zinc-400 hover:text-zinc-700 transition-colors mt-1 px-2 py-1 rounded-lg hover:bg-zinc-50"
        >
          ← 다시 입력
        </button>
      </div>

      {/* 판시사항 */}
      <div className="px-6 py-6 border-b border-zinc-100">
        <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mb-4">판시사항</p>
        {data.rulingPoints
          ? <p className="text-[14px] text-zinc-700 leading-[1.85] whitespace-pre-line">{data.rulingPoints}</p>
          : <p className="text-[13px] text-zinc-300 italic">정보 없음</p>
        }
      </div>

      {/* 판결요지 */}
      <div className="px-6 py-6">
        <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mb-4">판결요지</p>
        {data.rulingRatio
          ? <p className="text-[14px] text-zinc-700 leading-[1.85] whitespace-pre-line">{data.rulingRatio}</p>
          : <p className="text-[13px] text-zinc-300 italic">정보 없음</p>
        }
      </div>
    </div>
  );
}

/* ── 생성된 콘텐츠 ── */
function GeneratedContent({ content }: { content: string }) {
  const sections = parseContent(content);
  return (
    <div className="space-y-4">
      {sections.map((s, i) => {
        if (s.type === "header") return (
          <p key={i} className="text-[14px] font-bold text-zinc-900 leading-snug">{s.body}</p>
        );
        if (s.type === "facts") {
          const bullets = splitFactsBullets(s.body);
          return (
            <div key={i} className="bg-white rounded-xl border border-zinc-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-amber-100 bg-amber-50/60 flex items-center gap-3">
                <div className="w-[3px] h-5 rounded-full bg-amber-400 flex-shrink-0" />
                <span className="text-[11px] font-bold text-amber-600 uppercase tracking-widest">사실관계</span>
              </div>
              <ul className="px-6 py-5 space-y-2.5">
                {bullets.map((b, j) => (
                  <li key={j} className="flex gap-3 text-[14px] text-zinc-800 leading-[1.85]">
                    <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        }
        if (s.type === "question") return (
          <div key={i} className="bg-white rounded-xl border border-zinc-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-blue-100 bg-blue-50/60 flex items-center gap-3">
              <div className="w-[3px] h-5 rounded-full bg-blue-400 flex-shrink-0" />
              <span className="text-[11px] font-bold text-blue-600 uppercase tracking-widest">{s.heading}</span>
            </div>
            <div className="px-6 py-6">
              <p className="text-[15px] text-zinc-800 leading-[1.9] whitespace-pre-line font-medium">{s.body}</p>
            </div>
          </div>
        );
        if (s.type === "answer") return (
          <div key={i} className="bg-white rounded-xl border border-zinc-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-100 bg-zinc-50 flex items-center gap-3">
              <div className="w-[3px] h-5 rounded-full bg-zinc-300 flex-shrink-0" />
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">해설 및 모범답안</span>
            </div>
            <div className="px-6 py-6">
              <p className="text-[15px] text-zinc-700 leading-[1.9] whitespace-pre-line">{s.body}</p>
            </div>
          </div>
        );
        if (s.type === "precedent") return (
          <div key={i} className="rounded-xl border border-zinc-100 bg-zinc-50/80 overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center gap-3">
              <div className="w-[3px] h-5 rounded-full bg-zinc-300 flex-shrink-0" />
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">모델 판례</span>
            </div>
            <div className="px-6 py-6">
              <p className="text-[14px] text-zinc-500 leading-[1.9] whitespace-pre-line">{s.body}</p>
            </div>
          </div>
        );
        return s.body.trim() ? (
          <div key={i} className="px-1">
            {s.heading && <p className="text-[12px] font-semibold text-zinc-500 mb-1">{s.heading}</p>}
            <p className="text-[15px] text-zinc-700 leading-[1.9] whitespace-pre-line">{s.body}</p>
          </div>
        ) : null;
      })}
    </div>
  );
}

/* ── 댓글 ── */
function Comments({ postId }: { postId: string }) {
  const { user, customDisplayName } = useAuth();
  const isAdmin = user?.email === ADMIN_EMAIL;
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getDocs(query(collection(db, "posts", postId, "comments"), orderBy("createdAt", "asc")))
      .then(snap => {
        setComments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Comment)));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [postId]);

  const submit = async () => {
    if (!text.trim() || !user || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const name = customDisplayName || user.displayName || user.email?.split("@")[0] || "익명";
      const ref = await addDoc(collection(db, "posts", postId, "comments"), {
        userId: user.uid, userName: name, text: text.trim(), createdAt: serverTimestamp(), deleted: false,
      });
      setComments(p => [...p, { id: ref.id, userId: user.uid, userName: name, text: text.trim(), createdAt: null, deleted: false }]);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "댓글 등록에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteComment = async (c: Comment) => {
    if (!user || (user.uid !== c.userId && !isAdmin)) return;
    try {
      if (isAdmin && user.uid !== c.userId) {
        await adminFetch("DELETE", `/api/admin/comment?postId=${postId}&commentId=${c.id}`);
      } else {
        await updateDoc(doc(db, "posts", postId, "comments", c.id), { deleted: true, text: "" });
      }
      setComments(p => p.map(x => x.id === c.id ? { ...x, deleted: true, text: "" } : x));
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    }
  };

  const visibleCount = comments.filter(c => !c.deleted).length;

  return (
    <div className="mt-8 pt-7 border-t border-zinc-100">
      <p className="text-[13px] font-semibold text-zinc-900 mb-5">
        댓글{visibleCount > 0 ? ` ${visibleCount}` : ""}
      </p>

      {!loading && comments.length > 0 && (
        <div className="space-y-5 mb-6">
          {comments.map(c => (
            <div key={c.id} className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center flex-shrink-0 text-[11px] font-semibold text-zinc-500">
                {c.deleted ? "−" : c.userName.charAt(0).toUpperCase()}
              </div>
              <div className="pt-0.5 flex-1">
                {c.deleted ? (
                  <p className="text-[13px] text-zinc-300 italic">(삭제됨)</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-medium text-zinc-500">{c.userName}</span>
                      {user && (user.uid === c.userId || isAdmin) && (
                        <button
                          onClick={() => deleteComment(c)}
                          className="text-[11px] text-zinc-300 hover:text-red-400 transition-colors"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                    <p className="text-[14px] text-zinc-700 leading-snug mt-0.5">{c.text}</p>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && comments.length === 0 && (
        <p className="text-[13px] text-zinc-300 mb-5">첫 댓글을 남겨보세요.</p>
      )}

      {user ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && submit()}
              placeholder="댓글 남기기…"
              className="flex-1 h-9 bg-zinc-50 border border-zinc-200 rounded-lg px-3 text-[14px] text-zinc-900 placeholder-zinc-300 focus:outline-none focus:border-zinc-400 transition-colors"
            />
            <button
              onClick={submit}
              disabled={!text.trim() || submitting}
              className="text-[13px] font-medium text-zinc-400 hover:text-zinc-700 disabled:text-zinc-200 px-2 transition-colors"
            >
              {submitting ? "등록 중…" : "등록"}
            </button>
          </div>
          {error && <p className="text-[12px] text-red-500">{error}</p>}
        </div>
      ) : (
        <p className="text-[13px] text-zinc-400">댓글을 남기려면 로그인하세요.</p>
      )}
    </div>
  );
}

/* ── 판례 원문 ── */
function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function formatOutlineBody(text: string): string {
  // 목차 마커 앞에 줄바꿈 삽입.
  // (?<!\d) : 직전 문자가 숫자인 경우(날짜: 2016. 5. 1.) 제외
  // [1-9]\d{0,2} : 1~3자리 숫자만 (4자리 연도 2016 등 제외)
  return text
    .replace(/(?<!\d)(\S[ \t]+)([1-9]\d{0,2}\. )/g, (_m, pre, marker) => pre.trimEnd() + "\n" + marker)
    .replace(/(\S[ \t]+)([가나다라마바사아자차카타파하]\. )/g, (_m, pre, marker) => pre.trimEnd() + "\n" + marker)
    .replace(/(\S[ \t]+)(\(\d+\) )/g, (_m, pre, marker) => pre.trimEnd() + "\n" + marker)
    .replace(/(?<!\d)(\S[ \t]+)([1-9]\d?\) )/g, (_m, pre, marker) => pre.trimEnd() + "\n" + marker)
    .replace(/(\S[ \t]+)([가나다라마바사아자차카타파하]\) )/g, (_m, pre, marker) => pre.trimEnd() + "\n" + marker);
}

function parseLegalSections(text: string): { heading: string; body: string }[] {
  // 헌재 결정문: [주 문] 등 마커 바로 뒤에 내용이 붙는 경우 줄바꿈 삽입
  const preprocessed = text.replace(/\[([가-힣][가-힣\s]{0,13})\]/g, (m) => "\n" + m);

  const sections: { heading: string; body: string }[] = [];
  // 【주문】형식(대법원) 및 [주 문] 형식(헌재, 한글+공백만) 모두 지원
  const markerRe = /【([^】]+)】|\[([가-힣][가-힣\s]{0,13})\]/g;
  let lastIndex = 0;
  let lastHeading = "";
  let m: RegExpExecArray | null;
  while ((m = markerRe.exec(preprocessed)) !== null) {
    const body = preprocessed.slice(lastIndex, m.index).trim();
    if (lastIndex > 0 || body) sections.push({ heading: lastHeading, body });
    lastHeading = (m[1] ?? m[2]).trim();
    lastIndex = m.index + m[0].length;
  }
  const remaining = preprocessed.slice(lastIndex).trim();
  if (remaining || lastHeading) sections.push({ heading: lastHeading, body: remaining });
  return sections.filter(s => s.heading || s.body);
}

function FullTextSection({ fullText, court }: { fullText: string; court?: string }) {
  const [open, setOpen] = useState(false);
  const clean = stripHtml(fullText);
  const sections = parseLegalSections(clean);
  const hasSections = sections.some(s => s.heading);
  const isConstitutional = court === "헌법재판소";
  const label = isConstitutional ? "결정 원문 보기" : "판례 원문 보기";
  // 마침표 없이 끝나면 API에서 잘린 것으로 판단
  const isTruncated = clean.length > 100 && !/[.。」]$/.test(clean.trimEnd());

  return (
    <div className="mt-4 rounded-xl border border-zinc-100 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full px-6 py-4 flex items-center justify-between bg-zinc-50 hover:bg-zinc-100 transition-colors"
      >
        <span className="text-[13px] font-semibold text-zinc-500">{label}</span>
        <svg
          className={`w-4 h-4 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="bg-white border-t border-zinc-100 max-h-[600px] overflow-y-auto">
          {hasSections ? (
            <div className="divide-y divide-zinc-50">
              {sections.map((s, i) => (
                <div key={i} className="px-6 py-5">
                  {s.heading && (
                    <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-2.5">
                      {s.heading}
                    </p>
                  )}
                  {s.body && (
                    <p className="text-[14px] text-zinc-700 leading-[1.85] whitespace-pre-line">{formatOutlineBody(s.body)}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="px-6 py-6">
              <p className="text-[14px] text-zinc-700 leading-[1.85] whitespace-pre-line">{formatOutlineBody(clean)}</p>
            </div>
          )}
          {isTruncated && (
            <div className="px-6 py-3 border-t border-zinc-100 bg-zinc-50">
              <p className="text-[12px] text-zinc-400">※ 법제처 API 제공 분량 제한으로 원문 일부가 표시되지 않을 수 있습니다.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── 익명 닉네임 ── */
const ADJS = ["은빛", "푸른", "붉은", "초록", "황금", "하얀", "검은", "보랏빛", "투명한", "용감한"];
const NOUNS = ["고양이", "여우", "늑대", "독수리", "호랑이", "판다", "토끼", "오리", "곰", "사자"];
function getAnonName(): string {
  if (typeof window === "undefined") return "익명";
  const stored = localStorage.getItem("anonName");
  if (stored) return stored;
  const name = ADJS[Math.floor(Math.random() * ADJS.length)] + "-" + NOUNS[Math.floor(Math.random() * NOUNS.length)];
  localStorage.setItem("anonName", name);
  return name;
}

/* ── 메인 페이지 ── */
export default function Home() {
  const { user, customDisplayName } = useAuth();
  const router = useRouter();
  const isAdmin = user?.email === ADMIN_EMAIL;
  const [showAuthModal, setShowAuthModal] = useState(false);

  const [activeTab, setActiveTab] = useState<LawArea>("민사법");
  const [step, setStep] = useState<Step>("input");
  const [input, setInput] = useState("");
  const [caseData, setCaseData] = useState<CaseData | null>(null);
  const [generated, setGenerated] = useState("");
  const [loadingCase, setLoadingCase] = useState(false);
  const [, setLoadingGen] = useState(false);
  const [error, setError] = useState("");
  const [postId, setPostId] = useState<string | null>(null);
  const [voted, setVoted] = useState<"likes" | "needsReview" | null>(null);
  const [feedPosts, setFeedPosts] = useState<PostPreview[]>([]);
  const [existingPost, setExistingPost] = useState<PostPreview | null>(null);
  const [feedSearch, setFeedSearch] = useState("");
  const [feedFilter, setFeedFilter] = useState<"all" | "mine">("all");
  const [feedSort, setFeedSort] = useState<"recent" | "date" | "likes">("recent");
  const [displayCount, setDisplayCount] = useState(10);
  const [feedLoading, setFeedLoading] = useState(true);
  const [checkedSteps, setCheckedSteps] = useState<boolean[]>([false, false, false, false, false]);
  const [showAlmostDone, setShowAlmostDone] = useState(false);
  const [showEncouragement, setShowEncouragement] = useState(false);
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(new Set());
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualText, setManualText] = useState("");
  const [batchAppendPayload, setBatchAppendPayload] = useState<AppendPayload>({ cases: [], version: 0 });
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  const [guestModeEnabled, setGuestModeEnabled] = useState(true);

  const prefetchAbortRef = useRef<AbortController | null>(null);
  const autoSaveRef = useRef(false);
  const swipeTouchRef = useRef<{ x: number; y: number } | null>(null);
  const prefetchRef = useRef<{
    text: string;
    done: boolean;
    error: string | null;
    model: string | null;
    notify: (() => void) | null;
  } | null>(null);

  useEffect(() => {
    if (router.isReady && typeof router.query.case === "string") setInput(router.query.case);
  }, [router.isReady, router.query.case]);

  const PROGRESS_STEPS = ["판례 원문 분석", "핵심 법리 추출", "사실관계 구성", "문항 및 배점 설정", "해설 및 모범답안 작성"];
  // 각 단계를 약 5초 간격으로 균등 분배 (총 ~25s 가정)
  // 0→4s, 1→9s, 2→14s, 3→20s, 4(마지막)→완료 시
  const STEP_DELAYS = [4000, 9000, 14000, 20000];

  // done 진입 시 스크롤 초기화 — smooth scroll 애니메이션을 건너뛰고 즉시 맨 위로
  useEffect(() => {
    if (step === "done") window.scrollTo({ top: 0, behavior: "instant" });
  }, [step]);

  useEffect(() => {
    if (step !== "generating") {
      setCheckedSteps([false, false, false, false, false]);
      setShowAlmostDone(false);
      setShowEncouragement(false);
      return;
    }
    const timers = STEP_DELAYS.map((delay, i) =>
      setTimeout(() => setCheckedSteps(prev => prev.map((v, j) => j <= i ? true : v)), delay)
    );
    // 마지막 단계 체크(20s) 후 4초 지나도 완료 안 되면 안내 메시지 표시
    const almostDoneTimer = setTimeout(() => setShowAlmostDone(true), 24000);
    const encouragementTimer = setTimeout(() => setShowEncouragement(true), 29000);
    return () => { timers.forEach(clearTimeout); clearTimeout(almostDoneTimer); clearTimeout(encouragementTimer); };
  }, [step]);

  useEffect(() => {
    getDoc(doc(db, "settings", "config")).then(snap => {
      if (snap.exists()) setGuestModeEnabled(!!snap.data().guestGenerationEnabled);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setFeedLoading(true);
    getDocs(query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(200)))
      .then(snap => setFeedPosts(snap.docs.map(d => ({ id: d.id, ...d.data() } as PostPreview))))
      .catch(() => {})
      .finally(() => setFeedLoading(false));
  }, []);

  useEffect(() => {
    if (step === "done" && generated && !postId && !autoSaveRef.current && caseData) {
      autoSaveRef.current = true;
      const userName = user
        ? (customDisplayName || user.displayName || user.email?.split("@")[0] || "익명")
        : getAnonName();
      const postLawArea = classifyLawArea(caseData.caseNumber);
      addDoc(collection(db, "posts"), {
        userId: user?.uid || null,
        userName,
        lawArea: postLawArea,
        caseNumber: caseData.caseNumber,
        caseName: caseData.caseName || "",
        court: caseData.court || "",
        date: caseData.date || "",
        rulingPoints: caseData.rulingPoints || "",
        rulingRatio: caseData.rulingRatio || "",
        fullText: caseData.fullText?.slice(0, 8000) || "",
        content: generated,
        likes: 0, needsReview: 0,
        model: modelUsed || null,
        createdAt: serverTimestamp(),
      }).then(ref => {
        setPostId(ref.id);
        // 피드 실시간 반영 — 새 포스트를 맨 앞에 추가
        setFeedPosts(prev => [{
          id: ref.id,
          userId: user?.uid || null,
          userName,
          lawArea: postLawArea,
          caseNumber: caseData.caseNumber,
          caseName: caseData.caseName || "",
          court: caseData.court || "",
          date: caseData.date || "",
          likes: 0,
          needsReview: 0,
          model: modelUsed || undefined,
        }, ...prev]);
      }).catch(console.error);
    }
    if (step !== "done") autoSaveRef.current = false;
  }, [step, generated, postId, caseData, user]);

  const runPrefetch = (data: CaseData, lawArea: LawArea = activeTab) => {
    prefetchAbortRef.current?.abort();
    const controller = new AbortController();
    prefetchAbortRef.current = controller;

    const state = { text: "", done: false, error: null as string | null, model: null as string | null, notify: null as (() => void) | null };
    prefetchRef.current = state;

    (async () => {
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caseData: data, lawArea }),
          signal: controller.signal,
        });
        if (!res.body) { state.error = "스트림을 받을 수 없습니다."; return; }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const payload = JSON.parse(line.slice(6));
              if (payload.error) { state.error = payload.error; state.notify?.(); return; }
              if (payload.done) { state.done = true; state.model = payload.model || null; state.notify?.(); return; }
              if (payload.text) { state.text += payload.text; state.notify?.(); }
            } catch {}
          }
        }
        state.done = true;
        state.notify?.();
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        state.error = e instanceof Error ? e.message : "오류";
        state.notify?.();
      }
    })();
  };

  const lookup = async () => {
    const num = input.trim();
    if (!num) return;
    setError(""); setLoadingCase(true); setExistingPost(null);
    prefetchAbortRef.current?.abort();
    prefetchRef.current = null;
    try {
      const res = await fetch(`/api/case-lookup?caseNumber=${encodeURIComponent(num)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "판례 조회 실패");
      setCaseData(data); setStep("preview");

      // 프리페치를 즉시 시작 — 로그인한 경우에만 (Firestore 조회 완료를 기다리지 않음)
      if (user) runPrefetch(data);

      // 기존 문제 조회 (병렬) — orderBy 없이 where만 사용해 복합 인덱스 불필요
      getDocs(query(
        collection(db, "posts"),
        where("caseNumber", "==", data.caseNumber),
        limit(1)
      )).then(snap => {
        if (!snap.empty) {
          const d = snap.docs[0];
          setExistingPost({ id: d.id, ...d.data() } as PostPreview);
          prefetchAbortRef.current?.abort(); // 기존 문제 있으면 프리페치 중단
          prefetchRef.current = null;
        }
        // 기존 문제 없으면 이미 시작된 프리페치를 그대로 유지
      }).catch(() => {/* 이미 프리페치 중 — 무시 */});
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "조회 중 오류가 발생했습니다.";
      setError(msg);
      setShowManualInput(true);
    } finally {
      setLoadingCase(false);
    }
  };

  const submitManualText = () => {
    const text = manualText.trim();
    if (!text) return;
    // 붙여넣은 텍스트에서 기본 메타데이터 추출 시도
    const caseNoMatch = text.match(/([0-9]{2,4}[가-힣]+[0-9]+)/);
    const courtMatch = text.match(/(대법원|고등법원|지방법원|가정법원|행정법원)/);
    const dateMatch = text.match(/([0-9]{4})\.\s*([0-9]{1,2})\.\s*([0-9]{1,2})/);
    const caseNameMatch = text.match(/\[([^\]]{2,30})\]/);
    const date = dateMatch
      ? `${dateMatch[1]}${dateMatch[2].padStart(2, "0")}${dateMatch[3].padStart(2, "0")}`
      : "";
    setCaseData({
      caseNumber: caseNoMatch?.[1] || input.trim(),
      caseName: caseNameMatch?.[1] || "",
      court: courtMatch?.[1] || "",
      date,
      rulingPoints: "",
      rulingRatio: "",
      fullText: text,
    });
    setShowManualInput(false);
    setManualText("");
    setError("");
    setStep("preview");
  };

  const generate = async (fresh = false) => {
    if (!caseData) return;
    if (!user && !guestModeEnabled) { setError("로그인이 필요합니다."); return; }

    if (fresh) {
      prefetchAbortRef.current?.abort();
      prefetchRef.current = null;
      autoSaveRef.current = false;
      setVoted(null);
      setPostId(null);
    }

    setError(""); setLoadingGen(true); setStep("generating"); setGenerated("");

    const prefetch = prefetchRef.current;

    if (prefetch && !prefetch.error) {
      const flush = () => {
        if (prefetch.error) {
          setError(prefetch.error);
          setStep("preview");
          setLoadingGen(false);
          return;
        }
        if (prefetch.done) {
          setGenerated(prefetch.text);
          setModelUsed(prefetch.model);
          setStep("done");
          setLoadingGen(false);
        }
      };

      flush();
      if (!prefetch.done) prefetch.notify = flush;
      return;
    }

    prefetchRef.current = null;
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseData, lawArea: activeTab }),
      });
      if (!res.body) throw new Error("스트림을 받을 수 없습니다.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      let usedModel: string | null = null;

      while (true) {
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
            if (payload.done) { usedModel = payload.model || null; setModelUsed(usedModel); setGenerated(fullText); setStep("done"); return; }
            if (payload.text) fullText += payload.text;
          } catch (e) {
            if (e instanceof Error && e.message !== "Unexpected end of JSON input") throw e;
          }
        }
      }
      setGenerated(fullText);
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "문제 생성 중 오류가 발생했습니다.");
      setStep("preview");
    } finally {
      setLoadingGen(false);
    }
  };

  const vote = async (field: "likes" | "needsReview") => {
    if (!postId || !user) return;
    const voteRef = doc(db, "posts", postId, "votes", user.uid);
    const postRef = doc(db, "posts", postId);
    try {
      let nextVoted: "likes" | "needsReview" | null = null;
      await runTransaction(db, async (tx) => {
        const voteSnap = await tx.get(voteRef);
        const existing = voteSnap.exists() ? (voteSnap.data().field as string) : null;
        if (existing === field) {
          // 같은 버튼 재클릭 → 취소
          tx.delete(voteRef);
          tx.update(postRef, { [field]: increment(-1) });
          nextVoted = null;
        } else {
          if (existing) {
            // 다른 버튼으로 전환 → 이전 것 차감
            tx.update(postRef, { [existing]: increment(-1) });
          }
          tx.set(voteRef, { field });
          tx.update(postRef, { [field]: increment(1) });
          nextVoted = field;
        }
      });
      setVoted(nextVoted);
    } catch (e) { console.error("vote failed:", e); }
  };

  const viewPost = async (post: PostPreview) => {
    try {
      const snap = await getDoc(doc(db, "posts", post.id));
      if (!snap.exists()) return;
      const data = snap.data();
      setCaseData({
        caseNumber: data.caseNumber,
        caseName: data.caseName,
        court: data.court,
        date: data.date,
        rulingPoints: data.rulingPoints,
        rulingRatio: data.rulingRatio,
        fullText: data.fullText || "",
      } as CaseData);
      setGenerated(data.content);
      setModelUsed(data.model || null);
      setPostId(post.id);
      setVoted(null);
      setStep("done"); // 네비게이션 먼저 — votes 읽기 실패와 무관하게 이동
      // 기존 투표 상태 복원 (실패해도 네비게이션에 영향 없음)
      if (user) {
        try {
          const voteSnap = await getDoc(doc(db, "posts", post.id, "votes", user.uid));
          setVoted(voteSnap.exists() ? (voteSnap.data().field as "likes" | "needsReview") : null);
        } catch {
          // 보안 규칙 미설정 등 — voted는 null 유지
        }
      }
    } catch (e) { console.error("viewPost failed:", e); }
  };

  const adminDeletePost = async (id: string) => {
    if (!window.confirm("이 게시물을 삭제하시겠습니까?")) return;
    await adminFetch("DELETE", `/api/admin/post?id=${id}`);
    setFeedPosts(prev => prev.filter(p => p.id !== id));
    if (postId === id) reset();
  };

  const adminReclassify = async (id: string, lawArea: LawArea) => {
    await adminFetch("PATCH", `/api/admin/post?id=${id}`, { lawArea });
    setFeedPosts(prev => prev.map(p => p.id === id ? { ...p, lawArea } : p));
  };

  const exportToPdf = async () => {
    if (selectedPostIds.size === 0) return;
    const ids = [...selectedPostIds];
    type PostData = { id: string; lawArea?: string; caseNumber: string; court?: string; date?: string; caseName?: string; content?: string; rulingPoints?: string; rulingRatio?: string };
    const posts = await Promise.all(
      ids.map(id => getDoc(doc(db, "posts", id)).then(snap => ({ id: snap.id, ...snap.data() } as PostData)))
    );
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>변시 사례형 문제</title><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Apple SD Gothic Neo','Nanum Gothic','맑은 고딕',sans-serif;font-size:10.5pt;color:#1a1a1a;background:#fff;line-height:1.6}
.post{padding:32px 40px;page-break-after:always}
.post:last-child{page-break-after:auto}
.ph{margin-bottom:18px;padding-bottom:14px;border-bottom:2.5px solid #1e3a8a}
.badge{display:inline-block;font-size:8pt;font-weight:700;padding:2px 8px;border-radius:4px;margin-bottom:8px}
.bc{background:#dbeafe;color:#1d4ed8}.ba{background:#dcfce7;color:#15803d}.bk{background:#fef3c7;color:#b45309}
.cn{font-size:17pt;font-weight:800;font-family:'Courier New',monospace;color:#1e3a8a;letter-spacing:.02em}
.meta{font-size:9pt;color:#6b7280;margin-top:4px}
.section{margin-bottom:13px;border-radius:6px;overflow:hidden;border:1px solid #f0f0f0}
.sh{padding:8px 14px;font-size:8.5pt;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
.sb{padding:12px 14px;font-size:10.5pt;line-height:1.85}
.facts-sh{background:#fffbeb;color:#92400e;border-left:3px solid #f59e0b}
.facts-sb{background:#fffdf5}
.bl{list-style:none}.bl li{display:flex;gap:8px;margin-bottom:6px}
.bl li::before{content:"•";color:#f59e0b;font-size:11pt;flex-shrink:0}
.q-sh{background:#eff6ff;color:#1d4ed8;border-left:3px solid #3b82f6}
.q-sb{background:#f8faff;font-weight:500}
.ans-sh{background:#f9fafb;color:#6b7280;border-left:3px solid #d1d5db}
.ans-sb{background:#fff}
.prec-sh{background:#f9fafb;color:#9ca3af;border-left:3px solid #e5e7eb}
.prec-sb{background:#fafafa;color:#6b7280}
.other{padding:6px 0;color:#4b5563}
.summary{margin-top:14px;padding:12px 16px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0}
.st{font-size:8pt;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px}
.sb2{font-size:9.5pt;color:#475569;line-height:1.8;white-space:pre-wrap}
@page{margin:15mm 20mm}
@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body>
${posts.map(post => {
  const lawArea = (post.lawArea as string) ?? classifyLawArea(post.caseNumber as string);
  const badgeClass = lawArea === "민사법" ? "bc" : lawArea === "공법" ? "ba" : "bk";
  const dateParts = [post.court, post.date && formatDate(post.date as string), post.caseName].filter(Boolean).join(" · ");
  return `<div class="post">
<div class="ph"><span class="badge ${badgeClass}">${lawArea}</span><div class="cn">${post.caseNumber}</div>${dateParts ? `<div class="meta">${dateParts}</div>` : ""}</div>
${renderSectionsHtml(post.content as string || "")}
</div>`;
}).join("")}
</body></html>`;
    const win = window.open("", "_blank", "width=850,height=950");
    if (!win) { alert("팝업이 차단되었습니다. 팝업을 허용해 주세요."); return; }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.addEventListener("load", () => setTimeout(() => win.print(), 300));
  };

  const reset = () => {
    prefetchAbortRef.current?.abort();
    prefetchRef.current = null;
    autoSaveRef.current = false;
    setStep("input"); setCaseData(null); setGenerated(""); setError("");
    setPostId(null); setInput(""); setVoted(null); setExistingPost(null);
    setShowManualInput(false); setManualText(""); setModelUsed(null);
  };

  return (
    <>
    <Layout title="Case Generator" onLogoClick={reset}>
      <div className="max-w-[800px] mx-auto px-6">

        {/* 헤더 텍스트 */}
        <div className="pt-12 pb-8 text-center">
          <h1 className="text-[26px] font-bold tracking-tight text-zinc-900 mb-1.5">Case Generator</h1>
          <p className="text-[14px] text-zinc-400">사건번호로 변시 사례형 문제를 생성합니다</p>
        </div>

        {/* 공지사항 */}
        {step === "input" && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/70 px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="text-amber-400 mt-0.5 flex-shrink-0 text-[15px]">🎉</span>
              <div>
                <p className="text-[12px] font-bold text-amber-700 mb-1.5 tracking-wide">오픈 기념 이벤트 · ~3월 15일(일)</p>
                <p className="text-[12px] text-amber-800 leading-relaxed">
                  문제를 <span className="font-semibold">3개 이상 생성</span>하고 캡처해서 하단 &quot;개발자에게 문의하기&quot;로 메일 보내주시면, 소정의 감사 선물을 드립니다.
                </p>
                <p className="text-[11px] text-amber-600 mt-2">
                  선착순 5분 · 랜덤 추첨 5분 (총 10분) — 스타벅스 아메리카노 기프티콘
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 법역 탭 */}
        <div className="flex gap-1 mb-6 bg-white border border-zinc-100 rounded-xl p-1 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          {(["민사법", "공법", "형사법"] as LawArea[]).map(tab => (
            <button
              key={tab}
              onClick={() => {
                if (tab === activeTab) return;
                prefetchAbortRef.current?.abort();
                prefetchRef.current = null;
                autoSaveRef.current = false;
                setActiveTab(tab);
                setStep("input");
                setCaseData(null);
                setGenerated("");
                setError("");
                setPostId(null);
                setInput("");
                setVoted(null);
                setExistingPost(null);
                setDisplayCount(10);
              }}
              className={`flex-1 py-2 text-[13px] rounded-lg transition-colors ${
                activeTab === tab
                  ? "font-semibold text-blue-900 bg-blue-50"
                  : "font-medium text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* 에러 */}
        {error && (
          <div className="mb-5 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-[13px] text-red-500">
            {error}
          </div>
        )}

        {/* 판례 직접 입력 (조회 실패 시) */}
        {showManualInput && step === "input" && (
          <div className="mb-5 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-[12px] font-semibold text-zinc-500 mb-1">판례 본문 직접 입력</p>
            <p className="text-[11px] text-zinc-400 mb-3">
              국가법령정보센터(law.go.kr) 또는 대법원 종합법률정보(glaw.scourt.go.kr)에서
              판례 전문을 복사해 붙여넣으세요.
            </p>
            <textarea
              value={manualText}
              onChange={e => setManualText(e.target.value)}
              placeholder={"【전문】\n원고, 피고 ...\n\n【주문】\n...\n\n【이유】\n..."}
              rows={8}
              className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2.5 text-[12px] font-mono text-zinc-900 placeholder-zinc-300 focus:outline-none focus:border-zinc-400 transition-colors resize-none"
            />
            <div className="mt-2.5 flex gap-2 justify-end">
              <button
                onClick={() => { setShowManualInput(false); setManualText(""); setError(""); }}
                className="h-8 px-3 rounded-lg text-[12px] text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                취소
              </button>
              <button
                onClick={submitManualText}
                disabled={!manualText.trim()}
                className="h-8 px-4 bg-blue-900 text-white rounded-lg text-[12px] font-semibold hover:bg-blue-800 transition-colors disabled:opacity-40"
              >
                문제 생성
              </button>
            </div>
          </div>
        )}

        {/* ── 입력 ── */}
        {step === "input" && (
          <div>
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && lookup()}
                placeholder="사건번호 입력  예) 2016다271226"
                className="flex-1 h-[52px] bg-white border border-zinc-200 rounded-xl px-4 text-[15px] text-zinc-900 placeholder-zinc-300 focus:outline-none focus:border-blue-700 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-colors"
                disabled={loadingCase}
                autoFocus
              />
              <button
                onClick={lookup}
                disabled={!input.trim() || loadingCase}
                className="h-[52px] px-5 bg-blue-900 text-white rounded-xl text-[14px] font-semibold hover:bg-blue-800 transition-colors disabled:opacity-40 flex-shrink-0 min-w-[72px] flex items-center justify-center gap-2"
              >
                {loadingCase
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : "조회"}
              </button>
            </div>

            {!user && (
              <p className="mt-3 text-[12px] text-zinc-400">
                베타 서비스 기간 중에는 로그인 없이도 문제를 생성하실 수 있습니다.
              </p>
            )}

            <div className="mt-4 flex items-center gap-4">
              <span className="text-[11px] font-semibold text-zinc-300 uppercase tracking-widest">추천</span>
              <div className="flex gap-3 flex-wrap">
                {SUGGESTED[activeTab].map(n => (
                  <button
                    key={n}
                    onClick={() => setInput(n)}
                    className="text-[12px] font-mono text-zinc-400 hover:text-zinc-700 transition-colors"
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* ── 문제 피드 ── */}
            <div className="mt-10">
              {/* 헤더: 탭 + 정렬 + 검색 */}
              <div className="flex flex-col gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <div className="flex bg-zinc-100 p-0.5 rounded-lg flex-shrink-0">
                    <button
                      onClick={() => { setFeedFilter("all"); setDisplayCount(10); }}
                      className={`px-3 py-1 text-[12px] font-medium rounded-md transition-all ${feedFilter === "all" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-400 hover:text-zinc-600"}`}
                    >
                      전체
                    </button>
                    <button
                      onClick={() => { setFeedFilter("mine"); setDisplayCount(10); }}
                      className={`px-3 py-1 text-[12px] font-medium rounded-md transition-all ${feedFilter === "mine" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-400 hover:text-zinc-600"}`}
                    >
                      내 문제
                    </button>
                  </div>
                  <div className="relative flex-1">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-300 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                    </svg>
                    <input
                      value={feedSearch}
                      onChange={e => { setFeedSearch(e.target.value); setDisplayCount(10); }}
                      placeholder="사건번호 또는 사건명 검색…"
                      className="w-full h-8 bg-white border border-zinc-200 rounded-lg pl-8 pr-3 text-[13px] text-zinc-900 placeholder-zinc-300 focus:outline-none focus:border-zinc-400 transition-colors"
                    />
                  </div>
                </div>
                {/* 정렬 */}
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-zinc-300 mr-1">정렬</span>
                  {(["recent", "date", "likes"] as const).map((s) => {
                    const label = s === "recent" ? "최신 등록순" : s === "date" ? "선고일 최신순" : "추천 많은순";
                    return (
                      <button
                        key={s}
                        onClick={() => { setFeedSort(s); setDisplayCount(10); }}
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors border ${
                          feedSort === s
                            ? "bg-zinc-800 text-white border-zinc-800"
                            : "text-zinc-400 border-zinc-200 hover:border-zinc-400 hover:text-zinc-600"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 목록 */}
              {(() => {
                const byTab = feedPosts.filter(p =>
                  (p.lawArea ?? classifyLawArea(p.caseNumber)) === activeTab
                );
                const source = feedFilter === "mine"
                  ? byTab.filter(p => p.userId === user?.uid)
                  : byTab;
                const q = feedSearch.trim().toLowerCase();
                const searched = q
                  ? source.filter(p =>
                      p.caseNumber.toLowerCase().includes(q) ||
                      (p.caseName || "").toLowerCase().includes(q)
                    )
                  : source;
                const filtered = [...searched].sort((a, b) => {
                  if (feedSort === "likes") return (b.likes ?? 0) - (a.likes ?? 0);
                  if (feedSort === "date") return (b.date ?? "").localeCompare(a.date ?? "");
                  return 0; // "recent" — Firestore createdAt desc 순서 유지
                });
                const visible = filtered.slice(0, displayCount);

                if (feedLoading) return (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="bg-white rounded-xl border border-zinc-100 px-5 py-4 animate-pulse">
                        <div className="h-3.5 bg-zinc-100 rounded-full w-[40%] mb-2" />
                        <div className="h-3 bg-zinc-100 rounded-full w-[25%]" />
                      </div>
                    ))}
                  </div>
                );

                if (feedFilter === "mine" && !user) return (
                  <p className="text-[13px] text-zinc-400 py-4">로그인하면 내 문제를 볼 수 있습니다.</p>
                );

                if (filtered.length === 0) return (
                  <p className="text-[13px] text-zinc-300 py-4">
                    {q ? `"${feedSearch}"에 해당하는 문제가 없습니다.` : feedFilter === "mine" ? "아직 생성한 문제가 없습니다." : "아직 생성된 문제가 없습니다."}
                  </p>
                );

                return (
                  <>
                    {isAdmin && (
                      <div className="flex items-center justify-between mb-2 pb-2 border-b border-zinc-50">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={visible.length > 0 && visible.every(p => selectedPostIds.has(p.id))}
                            onChange={e => {
                              if (e.target.checked) setSelectedPostIds(prev => new Set([...prev, ...visible.map(p => p.id)]));
                              else setSelectedPostIds(prev => { const n = new Set(prev); visible.forEach(p => n.delete(p.id)); return n; });
                            }}
                            className="rounded border-zinc-300"
                          />
                          <span className="text-[11px] text-zinc-400">전체 선택</span>
                        </label>
                        {selectedPostIds.size > 0 && (
                          <button
                            onClick={exportToPdf}
                            className="h-7 px-3 bg-blue-900 text-white rounded-lg text-[11px] font-semibold hover:bg-blue-800 transition-colors flex items-center gap-1.5"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                            </svg>
                            PDF 내보내기 ({selectedPostIds.size}개)
                          </button>
                        )}
                      </div>
                    )}
                    <div className="space-y-2">
                      {visible.map(post => (
                        <div key={post.id} className="bg-white rounded-xl border border-zinc-100 hover:border-zinc-300 transition-colors">
                          <button
                            onClick={() => viewPost(post)}
                            className="w-full px-5 py-4 text-left"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-[14px] font-mono font-semibold text-zinc-800 truncate">{post.caseNumber}</p>
                                <p className="text-[12px] text-zinc-400 mt-0.5 truncate">
                                  {[post.court, post.date && formatDate(post.date), post.caseName].filter(Boolean).join(" · ")}
                                </p>
                              </div>
                              <div className="flex items-center gap-3 text-[12px] text-zinc-400 flex-shrink-0">
                                <span>추천 {post.likes}</span>
                                <span className="text-zinc-200">·</span>
                                <span className="max-w-[60px] truncate">{post.userName}</span>
                              </div>
                            </div>
                          </button>
                          {isAdmin && (
                            <div className="px-5 pb-3 flex items-center gap-3 border-t border-zinc-50 pt-2">
                              <input
                                type="checkbox"
                                checked={selectedPostIds.has(post.id)}
                                onChange={() => setSelectedPostIds(prev => {
                                  const n = new Set(prev);
                                  n.has(post.id) ? n.delete(post.id) : n.add(post.id);
                                  return n;
                                })}
                                onClick={e => e.stopPropagation()}
                                className="rounded border-zinc-300"
                              />
                              <select
                                value={post.lawArea ?? classifyLawArea(post.caseNumber)}
                                onChange={e => adminReclassify(post.id, e.target.value as LawArea)}
                                className="text-[11px] text-zinc-500 bg-zinc-50 border border-zinc-200 rounded px-1.5 py-0.5"
                              >
                                <option value="민사법">민사법</option>
                                <option value="공법">공법</option>
                                <option value="형사법">형사법</option>
                              </select>
                              {post.model && (
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                                  post.model === "claude-opus-4-6"
                                    ? "text-orange-500 bg-orange-50 border-orange-200"
                                    : "text-violet-500 bg-violet-50 border-violet-200"
                                }`}>
                                  {post.model === "claude-opus-4-6" ? "Claude" : "Gemini"}
                                </span>
                              )}
                              <button
                                onClick={() => adminDeletePost(post.id)}
                                className="text-[11px] text-red-400 hover:text-red-600 transition-colors"
                              >
                                삭제
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {filtered.length > displayCount && (
                      <button
                        onClick={() => setDisplayCount(c => c + 10)}
                        className="w-full mt-3 h-9 text-[13px] text-zinc-400 hover:text-zinc-700 border border-zinc-200 hover:border-zinc-300 rounded-xl transition-colors"
                      >
                        더 보기 ({filtered.length - displayCount}개 남음)
                      </button>
                    )}
                  </>
                );
              })()}
            </div>

            {isAdmin && user && (
              <>
                <div className="bg-white rounded-xl border border-zinc-100 px-5 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-semibold text-zinc-700">비로그인 문제 생성 허용</p>
                    <p className="text-[12px] text-zinc-400 mt-0.5">
                      {guestModeEnabled
                        ? "현재 누구나 로그인 없이 문제를 생성할 수 있습니다."
                        : "현재 로그인한 사용자만 문제를 생성할 수 있습니다."}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      const newVal = !guestModeEnabled;
                      setGuestModeEnabled(newVal);
                      await setDoc(doc(db, "settings", "config"), { guestGenerationEnabled: newVal }, { merge: true });
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${guestModeEnabled ? "bg-blue-900" : "bg-zinc-200"}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${guestModeEnabled ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>
                <AdminImportantCases
                  onAppendCases={(nums) =>
                    setBatchAppendPayload((prev) => ({ cases: nums, version: prev.version + 1 }))
                  }
                />
                <AdminBatchGenerator
                  user={user}
                  onNewPost={post => setFeedPosts(prev => [post as PostPreview, ...prev])}
                  appendPayload={batchAppendPayload}
                />
              </>
            )}
          </div>
        )}

        {/* ── 판례 확인 ── */}
        {step === "preview" && caseData && (
          <div>
            <p className="mb-3 text-[13px] text-zinc-400 px-1">
              판결요지를 확인하신 후 요청하신 판례가 맞다면 하단에 있는 &quot;문제 생성하기&quot; 버튼을 눌러주세요.
            </p>
            <CaseCard data={caseData} onReset={reset} />

            {existingPost ? (
              /* 기존 문제 있음 → 선택지 제시 */
              <div className="mt-4 bg-white rounded-xl border border-zinc-100 px-5 py-4">
                <p className="text-[13px] text-zinc-500 mb-3">
                  이 판례로 생성된 문제가 이미 있습니다.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => viewPost(existingPost)}
                    className="flex-1 h-10 bg-blue-900 text-white rounded-xl text-[14px] font-semibold hover:bg-blue-800 transition-colors"
                  >
                    기존 문제 보기
                  </button>
                  <button
                    onClick={() => { setExistingPost(null); runPrefetch(caseData); generate(); }}
                    className="flex-1 h-10 bg-white border border-zinc-200 text-zinc-600 rounded-xl text-[14px] font-semibold hover:border-zinc-400 hover:text-zinc-900 transition-colors"
                  >
                    새로 생성하기
                  </button>
                </div>
              </div>
            ) : (user || guestModeEnabled) ? (
              /* 기존 문제 없음 + 로그인(또는 게스트 허용) → 바로 생성 */
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => generate()}
                  className="h-10 px-5 bg-blue-900 text-white rounded-xl text-[14px] font-semibold hover:bg-blue-800 transition-colors flex items-center gap-2"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  문제 생성하기
                </button>
              </div>
            ) : (
              /* 기존 문제 없음 + 비로그인 → 로그인 안내 */
              <div className="mt-4 flex justify-end items-center gap-3">
                <span className="text-[13px] text-zinc-500">문제를 생성하려면 로그인이 필요합니다.</span>
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="h-10 px-5 bg-zinc-800 text-white rounded-xl text-[14px] font-semibold hover:bg-zinc-700 transition-colors"
                >
                  로그인
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── 생성 중 (첫 응답 전) — 스켈레톤 ── */}
        {step === "generating" && (
          <div className="space-y-4">
            {/* 진행 상황 카드 */}
            <div className="bg-white rounded-xl border border-zinc-100 px-6 py-5 flex gap-4 items-start">
              <div className="w-4 h-4 border-2 border-zinc-200 border-t-zinc-600 rounded-full animate-spin mt-0.5 flex-shrink-0" />
              <div className="space-y-2.5">
                <p className="text-[11px] text-zinc-400 pb-1">문제 생성에 30초~1분가량 소요됩니다.</p>
                {PROGRESS_STEPS.map((label, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    {checkedSteps[i] ? (
                      <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-zinc-200 flex-shrink-0" />
                    )}
                    <span className={`text-[13px] transition-colors ${checkedSteps[i] ? "text-zinc-300 line-through" : "text-zinc-600"}`}>
                      {label}
                    </span>
                  </div>
                ))}
                {showAlmostDone && (
                  <p className="text-[12px] text-zinc-400 pt-1 pl-6">
                    잠시만 기다려 주세요. 거의 다 완성되었습니다.
                  </p>
                )}
                {showEncouragement && (
                  <p className="text-[12px] text-zinc-400 pt-1 pl-6">
                    문제 만드는 게 진짜 어려운 일이군요. 정말 다 됐으니까 믿어주세요.
                  </p>
                )}
              </div>
            </div>
          <div className="space-y-4 animate-pulse">
            <div className="bg-white rounded-xl border border-zinc-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-amber-100 bg-amber-50/60 flex items-center gap-3">
                <div className="w-[3px] h-5 rounded-full bg-amber-200 flex-shrink-0" />
                <span className="text-[11px] font-bold text-amber-300 uppercase tracking-widest">사실관계</span>
              </div>
              <div className="px-6 py-6 space-y-2.5">
                <div className="h-3.5 bg-zinc-100 rounded-full w-full" />
                <div className="h-3.5 bg-zinc-100 rounded-full w-[95%]" />
                <div className="h-3.5 bg-zinc-100 rounded-full w-[88%]" />
                <div className="h-3.5 bg-zinc-100 rounded-full w-full" />
                <div className="h-3.5 bg-zinc-100 rounded-full w-[72%]" />
              </div>
            </div>
            <div className="bg-white rounded-xl border border-zinc-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-blue-100 bg-blue-50/60 flex items-center gap-3">
                <div className="w-[3px] h-5 rounded-full bg-blue-200 flex-shrink-0" />
                <span className="text-[11px] font-bold text-blue-300 uppercase tracking-widest">문 1</span>
              </div>
              <div className="px-6 py-6 space-y-2.5">
                <div className="h-3.5 bg-zinc-100 rounded-full w-[90%]" />
                <div className="h-3.5 bg-zinc-100 rounded-full w-[60%]" />
              </div>
            </div>
            <div className="bg-white rounded-xl border border-zinc-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-100 bg-zinc-50 flex items-center gap-3">
                <div className="w-[3px] h-5 rounded-full bg-zinc-200 flex-shrink-0" />
                <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-widest">해설 및 모범답안</span>
              </div>
              <div className="px-6 py-6 space-y-2.5">
                <div className="h-3.5 bg-zinc-100 rounded-full w-full" />
                <div className="h-3.5 bg-zinc-100 rounded-full w-[93%]" />
                <div className="h-3.5 bg-zinc-100 rounded-full w-[85%]" />
                <div className="h-3.5 bg-zinc-100 rounded-full w-full" />
                <div className="h-3.5 bg-zinc-100 rounded-full w-[78%]" />
                <div className="h-3.5 bg-zinc-100 rounded-full w-[88%]" />
                <div className="h-3.5 bg-zinc-100 rounded-full w-[65%]" />
              </div>
            </div>
          </div>
          </div>
        )}

        {/* ── 완료 ── */}
        {step === "done" && generated && (
          <div
            style={{ touchAction: "pan-y" }}
            onTouchStart={e => {
              const t = e.touches[0];
              swipeTouchRef.current = { x: t.clientX, y: t.clientY };
            }}
            onTouchCancel={() => {
              swipeTouchRef.current = null;
            }}
            onTouchEnd={e => {
              const start = swipeTouchRef.current;
              if (!start) return;
              swipeTouchRef.current = null;
              const t = e.changedTouches[0];
              const dx = t.clientX - start.x;
              const dy = Math.abs(t.clientY - start.y);
              // 오른쪽으로 60px 이상 & 세로 이동이 가로보다 작을 때만 뒤로가기
              if (dx > 60 && dy < dx * 0.6) reset();
            }}
          >
            {/* 상단 sticky 네비 바 */}
            <div className="sticky top-0 z-20 -mx-6 px-6 py-2.5 bg-[#F6F6F7]/90 backdrop-blur-sm border-b border-zinc-200/60 flex items-center justify-between mb-4">
              <button
                onClick={reset}
                className="flex items-center gap-1.5 text-[13px] text-zinc-500 hover:text-zinc-900 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                {postId ? "목록으로" : "새 문제"}
              </button>
              <div className="flex items-center gap-2">
                {isAdmin && modelUsed && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                    modelUsed === "claude-opus-4-6"
                      ? "text-orange-600 bg-orange-50 border-orange-200"
                      : "text-violet-600 bg-violet-50 border-violet-200"
                  }`}>
                    {modelUsed === "claude-opus-4-6" ? "Claude Opus 4.6" : "Gemini 2.5 Pro"}
                  </span>
                )}
                <button
                  onClick={() => generate(true)}
                  className="flex items-center gap-1.5 text-[13px] text-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  다시 생성
                </button>
              </div>
            </div>

            <p className="text-[11px] text-zinc-400 text-center leading-relaxed">
              * 본 문제의 사실관계는 판례를 바탕으로 학습 목적에 맞게 일부 각색되었을 수 있습니다. 참고용으로만 활용하여 주시기 바랍니다.
            </p>

            <GeneratedContent content={generated} />

            {caseData?.fullText && <FullTextSection fullText={caseData.fullText} court={caseData.court} />}

            {/* 액션 바 */}
            <div className="mt-8 pt-6 border-t border-zinc-100 flex items-center justify-end">
              <div className="flex items-center gap-3">
                {isAdmin && postId && (
                  <button
                    onClick={() => adminDeletePost(postId)}
                    className="text-[13px] text-red-400 hover:text-red-600 transition-colors mr-2"
                  >
                    게시물 삭제
                  </button>
                )}
                <div className="w-px h-4 bg-zinc-200" />
                <button
                  onClick={() => vote("likes")}
                  className={`h-8 px-3.5 rounded-lg text-[13px] font-medium flex items-center gap-1.5 transition-colors ${
                    voted === "likes" ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "text-zinc-500 hover:bg-zinc-100"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                  </svg>
                  추천
                </button>
                <button
                  onClick={() => vote("needsReview")}
                  className={`h-8 px-3.5 rounded-lg text-[13px] font-medium transition-colors ${
                    voted === "needsReview" ? "bg-amber-50 text-amber-600 border border-amber-200" : "text-zinc-500 hover:bg-zinc-100"
                  }`}
                >
                  검수 요청
                </button>
              </div>
            </div>

            {postId && <Comments postId={postId} />}
          </div>
        )}

        <div className="h-20" />
      </div>
    </Layout>

    {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </>
  );
}
