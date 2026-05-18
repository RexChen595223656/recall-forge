"use client";
import { useState } from "react";
import { updateQuestion, createQuestion, deleteQuestion, type QuestionItem } from "@/lib/api";

interface Props {
  question?: QuestionItem;
  materialId?: number;
  onDone: () => void;
  onCancel: () => void;
}

export function QuestionEditor({ question, materialId, onDone, onCancel }: Props) {
  const isNew = !question;
  const [qText, setQText] = useState(question?.question || "");
  const [options, setOptions] = useState<string[]>(question?.options || ["", "", "", ""]);
  const [answer, setAnswer] = useState(question?.answer || "");
  const [explanation, setExplanation] = useState(question?.explanation || "");
  const [tags, setTags] = useState((question?.tags || []).join(", "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!qText.trim() || options.some(o => !o.trim())) {
      setError("题目和选项不能为空");
      return;
    }
    if (!answer.trim()) {
      setError("请选择正确答案");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const data = {
        question: qText.trim(),
        options: options.map(o => o.trim()),
        answer: answer.trim(),
        explanation: explanation.trim(),
        tags: tags.split(",").map(t => t.trim()).filter(Boolean),
      };
      if (isNew && materialId) {
        await createQuestion(materialId, data);
      } else if (question) {
        await updateQuestion(question.id, data);
      }
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!question) return;
    if (!confirm("确认删除这道题目？关联的答题记录和复习卡片也会被清除。")) return;
    try {
      await deleteQuestion(question.id);
      onDone();
    } catch {
      setError("删除失败");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-background border border-border-default rounded-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{isNew ? "新增题目" : "编辑题目"}</h2>
            <button onClick={onCancel} className="text-text-muted hover:text-text-primary text-lg leading-none">&times;</button>
          </div>

          <div>
            <div className="text-text-muted text-xs mb-1">题目</div>
            <textarea value={qText} onChange={e => setQText(e.target.value)} rows={3}
              className="w-full bg-surface-panel border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:border-brand focus:outline-none resize-y" />
          </div>

          <div className="space-y-2">
            <div className="text-text-muted text-xs mb-1">选项</div>
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-text-muted text-xs w-5">{String.fromCharCode(65 + i)}.</span>
                <input value={opt} onChange={e => {
                  const next = [...options];
                  next[i] = e.target.value;
                  setOptions(next);
                }}
                  className="flex-1 bg-surface-panel border border-border-subtle rounded px-3 py-1.5 text-sm text-text-primary focus:border-brand focus:outline-none" />
              </div>
            ))}
          </div>

          <div>
            <div className="text-text-muted text-xs mb-1">正确答案</div>
            <div className="flex gap-2">
              {options.map((opt, i) => {
                const letter = String.fromCharCode(65 + i);
                const selected = answer.includes(letter);
                return (
                  <button key={i} onClick={() => {
                    // multi-select toggle
                    const cur = answer ? answer.split(",").map(a => a.trim()) : [];
                    const idx = cur.indexOf(letter);
                    if (idx >= 0) cur.splice(idx, 1);
                    else cur.push(letter);
                    setAnswer(cur.sort().join(", "));
                  }}
                    className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${selected ? "bg-brand text-black" : "bg-surface-panel text-text-muted border border-border-soft hover:bg-surface-raised"}`}>
                    {letter}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-text-muted text-xs mb-1">解析（可选）</div>
            <textarea value={explanation} onChange={e => setExplanation(e.target.value)} rows={2}
              className="w-full bg-surface-panel border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:border-brand focus:outline-none resize-y" />
          </div>

          {isNew && (
            <div>
              <div className="text-text-muted text-xs mb-1">知识标签（逗号分隔，可选）</div>
              <input value={tags} onChange={e => setTags(e.target.value)}
                className="w-full bg-surface-panel border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:border-brand focus:outline-none" />
            </div>
          )}

          {error && <div className="text-red-400 text-xs bg-red-400/10 px-3 py-2 rounded-lg">{error}</div>}

          <div className="flex gap-2">
            {!isNew && (
              <button onClick={handleDelete}
                className="py-2.5 px-4 border border-red-500/30 text-red-400 rounded-lg text-sm hover:bg-red-500/10 transition-colors">
                删除
              </button>
            )}
            <button onClick={onCancel}
              className="flex-1 py-2.5 border border-border-soft rounded-lg text-text-secondary text-sm hover:bg-surface-raised transition-colors">
              取消
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2.5 bg-brand text-black rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
