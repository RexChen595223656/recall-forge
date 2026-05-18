"use client";
import { useState, useEffect } from "react";
import { getStableCards, recordReview, type ReviewItem } from "@/lib/api";

export function StableCardList({ materialId }: { materialId: number }) {
  const [cards, setCards] = useState<ReviewItem[]>([]);
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);

  useEffect(() => { getStableCards(materialId).then(setCards).catch(() => {}); }, [materialId]);

  if (cards.length === 0) {
    return <div className="text-text-muted text-sm py-4 text-center">暂无已掌握卡片</div>;
  }

  return (
    <div className="space-y-2 max-h-80 overflow-y-auto">
      {cards.map(c => (
        <div key={c.review_id} className="p-3 rounded-lg bg-surface-raised border border-border-soft">
          <p className="text-sm text-text-primary">{c.question}</p>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-text-dim">
              间隔 {c.interval_days}天 · 复习 {c.total_reviews}次 · 已掌握
            </span>
            <button
              onClick={() => { setReviewingId(c.review_id); setShowAnswer(false); }}
              className="text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
            >
              手动复习
            </button>
          </div>
          {reviewingId === c.review_id && (
            <div className="mt-2 pt-2 border-t border-border-soft">
              {!showAnswer ? (
                <button onClick={() => setShowAnswer(true)} className="text-xs text-brand hover:underline">显示答案</button>
              ) : (
                <div>
                  <p className="text-xs text-green-400">答案: {c.options?.find((o: string) => o.charAt(0).toUpperCase() === c.answer.charAt(0).toUpperCase()) || c.answer}</p>
                  <div className="flex gap-1 mt-2">
                    {[
                      { s: 0, l: "忘了" },
                      { s: 1, l: "印象" },
                      { s: 2, l: "记住" },
                      { s: 3, l: "简单" },
                    ].map(({ s, l }) => (
                      <button key={s} onClick={async () => {
                        await recordReview(c.question_id, s).catch(() => {});
                        setCards(prev => prev.filter(x => x.review_id !== c.review_id));
                        setReviewingId(null);
                      }} className="text-xs px-2 py-1 rounded bg-surface-raised hover:bg-surface-hover border border-border-soft">
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
