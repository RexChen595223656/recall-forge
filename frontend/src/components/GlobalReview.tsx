"use client";
import { useEffect, useState, useRef } from "react";
import { getDueReviews, getWrongQuestions, recordReview, submitAnswer, type ReviewItem, type QuestionItem } from "@/lib/api";

type GlobalReviewMode = "wrong" | "sm2";

function normalizeAns(ans: string): string {
  return ans.split(",").map(a => a.trim().toUpperCase()).filter(Boolean).sort().join(",");
}

export function GlobalReview({ onClose, mode = "sm2" }: { onClose: () => void; mode?: GlobalReviewMode }) {
  const [items, setItems] = useState<(ReviewItem | QuestionItem)[]>([]);
  const [idx, setIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const challengeRef = useRef({ total: 0, correct: 0, mastered: 0 });

  useEffect(() => {
    const fetcher = mode === "wrong" ? getWrongQuestions() : getDueReviews(undefined, true);
    fetcher.then(data => { setItems(data); setLoading(false); }).catch(() => setLoading(false));
  }, [mode]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (loading || items.length === 0 || idx >= items.length) return;
      const item = items[idx];
      if (!item) return;
      if (mode === "wrong") {
        const qItem = item as QuestionItem;
        if (!submitted) {
          const keyIdx = parseInt(e.key) - 1;
          if (keyIdx >= 0 && keyIdx < qItem.options.length) handleWrongSelect(qItem.options[keyIdx]);
        } else if (e.key === "Enter") {
          advance();
        }
      } else {
        if (!showAnswer) {
          if (e.key === "Enter") setShowAnswer(true);
        } else {
          const keyIdx = parseInt(e.key);
          if (keyIdx >= 0 && keyIdx <= 3) handleScore(keyIdx);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [loading, items, idx, mode, submitted, showAnswer]);

  function advance() {
    setSelectedAnswer(null);
    setSubmitted(false);
    setShowAnswer(false);
    if (idx >= items.length - 1) {
      window.dispatchEvent(new Event("forge-activity"));
    } else {
      setIdx(i => i + 1);
    }
  }

  async function handleScore(score: number) {
    const item = items[idx] as ReviewItem;
    if (!item) return;
    await recordReview(item.question_id, score).catch(() => {});
    advance();
  }

  async function handleWrongSelect(answer: string) {
    if (submitted) return;
    setSelectedAnswer(answer);
    setSubmitted(true);
    const item = items[idx] as QuestionItem;
    const letter = answer.charAt(0).toUpperCase();
    const result = await submitAnswer(item.id, letter).catch(() => null);
    const isCorrect = result?.is_correct ?? (normalizeAns(letter) === normalizeAns(item.answer));
    challengeRef.current.total++;
    if (isCorrect) {
      challengeRef.current.correct++;
      if (result?.mastered) challengeRef.current.mastered++;
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-text-muted text-sm">加载中...</div>;

  const isWrongMode = mode === "wrong";

  if (items.length === 0 || idx >= items.length) {
    return (
      <div className="text-center py-16 space-y-4">
        <div className="text-lg font-bold">
          {isWrongMode ? "全局错题重做完成" : "全局复习完成"}
        </div>
        {items.length === 0 ? (
          <p className="text-text-muted text-sm">{isWrongMode ? "暂无待攻克错题" : "暂无待巩固卡片"}</p>
        ) : isWrongMode ? (
          <p className="text-text-muted text-sm">
            正确 {challengeRef.current.correct}/{challengeRef.current.total}
            {challengeRef.current.mastered > 0 && <span className="text-green-400 ml-2">已攻克 +{challengeRef.current.mastered}</span>}
          </p>
        ) : (
          <p className="text-text-muted text-sm">已复习 {Math.min(idx, items.length)} 张卡片</p>
        )}
        <button onClick={onClose} className="px-4 py-2 bg-brand text-black rounded-lg text-sm">返回</button>
      </div>
    );
  }

  const item = items[idx];

  if (isWrongMode) {
    const qi = item as QuestionItem;
    return (
      <div className="space-y-4">
        <div className="flex justify-between text-xs text-text-muted">
          <button onClick={onClose} className="text-text-muted hover:text-text-secondary transition-colors">← 返回</button>
          <span>{idx + 1} / {items.length}</span>
        </div>
        <p className="text-sm leading-relaxed">{qi.question}</p>
        <div className="flex flex-col gap-1.5">
          {qi.options.map((opt, i) => {
            let cls = "block w-full text-left px-3 py-2.5 rounded-lg border text-xs transition-all ";
            if (submitted) {
              const optLetter = opt.charAt(0).toUpperCase();
              const selLetter = (selectedAnswer || "").charAt(0).toUpperCase();
              const isSelected = optLetter === selLetter;
              if (isSelected) cls += "border-brand/50 bg-brand/10 text-brand";
              else cls += "border-border-soft text-text-secondary opacity-40";
            } else {
              cls += "border-border-soft text-text-secondary hover:border-border-muted cursor-pointer";
            }
            return (
              <button key={i} onClick={() => handleWrongSelect(opt[0])} disabled={submitted} className={cls}>{opt}</button>
            );
          })}
        </div>
        {submitted && (
          <div className="space-y-3">
            {selectedAnswer && qi.answer && normalizeAns(selectedAnswer) === normalizeAns(qi.answer) ? (
              <p className="text-green-400 text-sm font-medium">✓ 正确</p>
            ) : (
              <p className="text-red-400 text-sm font-medium">✗ 错误</p>
            )}
            <button onClick={advance} className="w-full py-2.5 bg-brand text-black rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
              {idx < items.length - 1 ? "下一题" : "完成"}
            </button>
          </div>
        )}
      </div>
    );
  }

  // SM-2 mode (existing behavior)
  const ri = item as ReviewItem;
  return (
    <div className="space-y-4">
      <div className="flex justify-between text-xs text-text-muted">
        <button onClick={onClose} className="text-text-muted hover:text-text-secondary transition-colors">← 返回</button>
        <span>复习 {idx + 1} / {items.length}</span>
        {!ri.is_due && <span className="text-yellow-400 text-[10px]">{new Date(ri.next_review).toLocaleDateString("zh-CN")} 到期</span>}
      </div>

      <p className="text-sm leading-relaxed">{ri.question}</p>
      <div className="flex flex-col gap-1">
        {ri.options.map((opt: string, i: number) => (
          <div key={i} className={`block w-full px-3 py-2 rounded-lg border text-xs ${showAnswer && opt.charAt(0).toUpperCase() === ri.answer.charAt(0).toUpperCase() ? "border-green-500/50 bg-green-500/10 text-green-300" : "border-border-soft text-text-secondary"}`}>
            {opt}
          </div>
        ))}
      </div>

      {!showAnswer ? (
        <button onClick={() => setShowAnswer(true)} className="w-full py-2 bg-brand-soft text-brand rounded-lg hover:bg-brand-hover text-xs font-medium transition-colors">
          回忆一下，点击查看答案
        </button>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { s: 0, l: "忘记了", n: "明天重来", c: "border-red-500/30 hover:bg-red-500/10" },
              { s: 1, l: "有印象", n: "1天后", c: "border-yellow-500/30 hover:bg-yellow-500/10" },
              { s: 2, l: "记住了", n: "3天后", c: "border-blue-500/30 hover:bg-blue-500/10" },
              { s: 3, l: "很简单", n: "拉长间隔", c: "border-green-500/30 hover:bg-green-500/10" },
            ].map(({ s, l, n, c }) => (
              <button key={s} onClick={() => handleScore(s)} className={`py-2 rounded-lg border text-xs transition-all flex flex-col items-center ${c}`}>
                <span className="font-medium">{l}</span><span className="text-[10px] opacity-50">{n}</span>
              </button>
            ))}
          </div>
          <button onClick={() => { setShowAnswer(false); setIdx(i => i + 1); }} className="w-full text-text-muted text-[10px] hover:text-text-secondary transition-colors">跳过</button>
        </div>
      )}
    </div>
  );
}
