"use client";
import { type QuestionItem } from "@/lib/api";

export function MasteredList({ questions }: { questions: QuestionItem[] }) {
  if (questions.length === 0) {
    return <div className="text-text-muted text-sm py-4 text-center">暂无已攻克题目</div>;
  }
  return (
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {questions.map(q => (
        <div key={q.id} className="p-3 rounded-lg bg-surface-raised border border-border-soft text-sm">
          <div className="flex items-start gap-2">
            <span className="text-green-400 shrink-0 mt-0.5">✓</span>
            <div>
              <p className="text-text-primary">{q.question}</p>
              <p className="text-text-dim text-xs mt-1">连续做对 {q.challenge_streak} 次 · 已攻克</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
