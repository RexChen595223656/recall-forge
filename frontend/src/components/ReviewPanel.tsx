"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { getWrongQuestions, getDueReviews, recordReview, submitAnswer, type QuestionItem, type ReviewItem } from "@/lib/api";

type ReviewMode = "wrong" | "sm2";

interface Props {
  materialId: number;
  onClose: () => void;
  initialMode?: ReviewMode;
}

export function ReviewPanel({ materialId, onClose, initialMode = "wrong" }: Props) {
  const [mode, setMode] = useState<ReviewMode>(initialMode);
  const [items, setItems] = useState<(QuestionItem | ReviewItem)[]>([]);
  const [idx, setIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [finished, setFinished] = useState(false);
  const [remainingWrong, setRemainingWrong] = useState<number | null>(null);
  const challengeRef = useRef({ total: 0, correct: 0, mastered: 0 });

  const loadData = useCallback(() => {
    setLoading(true);
    const fetcher = mode === "wrong"
      ? getWrongQuestions(materialId)
      : getDueReviews(materialId, true);
    fetcher.then(data => { setItems(data); setLoading(false); }).catch(() => setLoading(false));
  }, [mode, materialId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (loading || finished || items.length === 0) return;
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
          if (keyIdx >= 0 && keyIdx <= 3) handleSm2Score(keyIdx);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [loading, finished, items, idx, mode, submitted, showAnswer]);

  function advance() {
    setSelectedAnswer(null);
    setSubmitted(false);
    setShowAnswer(false);
    if (idx >= items.length - 1) {
      setFinished(true);
      if (mode === "wrong") {
        getWrongQuestions(materialId).then(data => setRemainingWrong(data.length)).catch(() => {});
      }
    } else {
      setIdx(i => i + 1);
    }
  }

  async function handleWrongSelect(answer: string) {
    if (submitted) return;
    setSelectedAnswer(answer);
    setSubmitted(true);

    const item = items[idx] as QuestionItem;
    const letter = answer.charAt(0).toUpperCase();
    const result = await submitAnswer(item.id, letter).catch(() => null);
    const isCorrect = result?.is_correct ?? (letter === item.answer.toUpperCase());

    challengeRef.current.total++;
    if (isCorrect) {
      challengeRef.current.correct++;
      if (result?.mastered) challengeRef.current.mastered++;
    }
    // Update streak in local items so the indicator reflects the latest value
    if (result) {
      setItems(prev => {
        const next = [...prev];
        next[idx] = { ...next[idx], challenge_streak: result.challenge_streak, mastered: result.mastered } as QuestionItem;
        return next;
      });
    }
  }

  async function handleSm2Score(score: number) {
    const item = items[idx] as ReviewItem;
    if (!item) return;
    await recordReview(item.question_id, score).catch(() => {});
    advance();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-text-muted text-sm">加载中...</div>
    );
  }

  if (finished || items.length === 0) {
    const isWrongMode = mode === "wrong";
    const allMastered = isWrongMode && items.length > 0 && remainingWrong === 0;
    const hasRemaining = isWrongMode && remainingWrong !== null && remainingWrong > 0;
    const allCorrect = challengeRef.current.correct === challengeRef.current.total && challengeRef.current.total > 0;
    return (
      <div className="text-center py-12 space-y-4">
        {allMastered ? (
          <div className="text-lg font-bold text-green-400">🎉 全部错题已攻克！</div>
        ) : hasRemaining ? (
          <div className="text-lg font-bold">本轮完成</div>
        ) : (
          <div className="text-lg font-bold">
            {items.length === 0
              ? (isWrongMode ? "暂无待攻克错题" : "暂无待巩固卡片")
              : (isWrongMode ? "错题重做完成" : "记忆巩固完成")}
          </div>
        )}
        {isWrongMode && items.length > 0 && (
          <div className="text-text-muted text-sm space-y-1">
            <p>
              本轮正确 {challengeRef.current.correct}/{challengeRef.current.total}
              {challengeRef.current.mastered > 0 && <span className="text-green-400 ml-2">· 已攻克 +{challengeRef.current.mastered}</span>}
            </p>
            {hasRemaining && (
              <p className="text-text-dim text-xs">
                {allCorrect ? "全部做对，但" : ""}需连续做对 3 次才能攻克
                <span className="text-orange-400 ml-1">{remainingWrong} 题还需巩固</span>
              </p>
            )}
          </div>
        )}
        {!isWrongMode && items.length > 0 && (
          <p className="text-text-muted text-sm">已复习 {Math.min(idx, items.length)} 张卡片</p>
        )}
        <div className="flex gap-2 justify-center">
          {!allMastered && (
            <button onClick={() => { setIdx(0); setFinished(false); setRemainingWrong(null); loadData(); }} className="px-4 py-2 bg-brand text-black rounded-lg text-sm">
              {mode === "wrong" ? "继续重做" : "继续复习"}
            </button>
          )}
          <button onClick={onClose} className="px-4 py-2 border border-border-soft rounded-lg text-sm text-text-secondary hover:text-text-primary transition-colors">
            返回
          </button>
        </div>
      </div>
    );
  }

  const item = items[idx];
  const isWrongMode = mode === "wrong";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onClose} className="text-text-muted text-xs hover:text-text-secondary transition-colors">← 返回</button>
        <div className="flex gap-2">
          <button
            onClick={() => { setMode("wrong"); setIdx(0); setFinished(false); }}
            className={`text-xs px-2 py-1 rounded transition-colors ${mode === "wrong" ? "bg-orange-500/20 text-orange-400" : "text-text-muted hover:text-text-secondary"}`}
          >
            错题重做
          </button>
          <button
            onClick={() => { setMode("sm2"); setIdx(0); setFinished(false); }}
            className={`text-xs px-2 py-1 rounded transition-colors ${mode === "sm2" ? "bg-blue-500/20 text-blue-400" : "text-text-muted hover:text-text-secondary"}`}
          >
            记忆巩固
          </button>
        </div>
      </div>

      <div className="text-center text-sm font-medium">
        {isWrongMode ? "错题重做" : "记忆巩固"} <span className="text-text-muted">{idx + 1} / {items.length}</span>
      </div>

      {/* Question */}
      <p className="text-sm leading-relaxed">{isWrongMode ? (item as QuestionItem).question : (item as ReviewItem).question}</p>

      {/* Options */}
      <div className="flex flex-col gap-1.5">
        {(isWrongMode ? (item as QuestionItem).options : (item as ReviewItem).options).map((opt: string, i: number) => {
          let cls = "block w-full text-left px-3 py-2.5 rounded-lg border text-xs transition-all ";
          if (isWrongMode && submitted) {
            const optLetter = opt.charAt(0).toUpperCase();
            const selLetter = (selectedAnswer || "").charAt(0).toUpperCase();
            const isSelected = optLetter === selLetter;
            if (isSelected) cls += "border-brand/50 bg-brand/10 text-brand";
            else cls += "border-border-soft text-text-secondary opacity-40";
          } else if (!isWrongMode && showAnswer) {
            const optLetter = opt.charAt(0).toUpperCase();
            const ansLetter = (item as ReviewItem).answer.charAt(0).toUpperCase();
            cls += optLetter === ansLetter ? "border-green-500/50 bg-green-500/10 text-green-300" : "border-border-soft text-text-secondary";
          } else {
            cls += "border-border-soft text-text-secondary hover:border-border-muted cursor-pointer";
          }
          return (
            <button
              key={i}
              onClick={() => isWrongMode && !submitted ? handleWrongSelect(opt[0]) : undefined}
              disabled={isWrongMode && submitted}
              className={cls}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {/* Wrong mode feedback */}
      {isWrongMode && submitted && (
        <div className="space-y-3">
          {selectedAnswer && (item as QuestionItem).answer && selectedAnswer[0] === (item as QuestionItem).answer[0] ? (
            <p className="text-green-400 text-sm font-medium">✓ 正确</p>
          ) : (
            <p className="text-red-400 text-sm font-medium">✗ 错误</p>
          )}
          <button onClick={advance} className="w-full py-2.5 bg-brand text-black rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
            {idx < items.length - 1 ? "下一题" : "完成"}
          </button>
        </div>
      )}

      {/* SM-2 mode: show answer / score */}
      {!isWrongMode && !showAnswer && (
        <button onClick={() => setShowAnswer(true)} className="w-full py-2 bg-brand-soft text-brand rounded-lg hover:bg-brand-hover text-xs font-medium transition-colors">
          回忆一下，点击查看答案
        </button>
      )}

      {!isWrongMode && showAnswer && (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { s: 0, l: "忘记了", n: "明天重来", c: "border-red-500/30 hover:bg-red-500/10" },
              { s: 1, l: "有印象", n: "1天后", c: "border-yellow-500/30 hover:bg-yellow-500/10" },
              { s: 2, l: "记住了", n: "3天后", c: "border-blue-500/30 hover:bg-blue-500/10" },
              { s: 3, l: "很简单", n: "拉长间隔", c: "border-green-500/30 hover:bg-green-500/10" },
            ].map(({ s, l, n, c }) => (
              <button key={s} onClick={() => handleSm2Score(s)} className={`py-2 rounded-lg border text-xs transition-all flex flex-col items-center ${c}`}>
                <span className="font-medium">{l}</span><span className="text-[10px] opacity-50">{n}</span>
              </button>
            ))}
          </div>
          <button onClick={() => advance()} className="w-full text-text-muted text-[10px] hover:text-text-secondary transition-colors">跳过</button>
        </div>
      )}

      {/* Streak indicator (wrong mode only) */}
      {isWrongMode && !finished && (
        <div className="pt-2 border-t border-border-soft">
          <div className="flex items-center gap-1.5 text-xs mb-1">
            {"▯▯▯".split("").map((c, i) => (
              <span key={i} className={i < (items[idx] as QuestionItem).challenge_streak ? "text-green-400" : "text-text-dim"}>
                {i < (items[idx] as QuestionItem).challenge_streak ? "▮" : "▯"}
              </span>
            ))}
            <span className="text-text-muted ml-1">{(items[idx] as QuestionItem).challenge_streak}/3 次</span>
          </div>
          <div className="text-[10px] text-text-dim">
            {(items[idx] as QuestionItem).challenge_streak >= 3
              ? "已攻克 ✓"
              : `还需连续做对 ${3 - (items[idx] as QuestionItem).challenge_streak} 次即可攻克`}
          </div>
        </div>
      )}
    </div>
  );
}
