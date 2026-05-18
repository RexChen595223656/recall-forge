"use client";
import { useState, useEffect } from "react";
import { getKeyStatus, saveApiKey } from "@/lib/api";

export function ApiKeyModal({ onClose }: { onClose: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<{ configured: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    getKeyStatus().then(setStatus).catch(() => {});
  }, []);

  async function handleSave() {
    if (!apiKey.trim()) { setMsg({ type: "err", text: "请输入 API Key" }); return; }
    setSaving(true);
    setMsg(null);
    try {
      await saveApiKey(apiKey.trim());
      setApiKey("");
      getKeyStatus().then(setStatus).catch(() => {});
      window.dispatchEvent(new CustomEvent("api-key-saved"));
      onClose();
    } catch (e: unknown) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "保存失败" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-background border border-border-default rounded-xl w-full max-w-sm mx-4 p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">API 设置</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary text-lg leading-none">&times;</button>
        </div>

        <div className="text-xs text-text-secondary space-y-2">
          <p>使用你自己的 DeepSeek API Key 来生成题目，Key 加密存储在服务端，不会泄露。</p>
          {status && (
            <p className={status.configured ? "text-green-400" : "text-yellow-400"}>
              {status.configured ? "✓ 已配置自定义 Key" : "⚠ 使用服务器默认 Key"}
            </p>
          )}
        </div>

        <div>
          <input
            type="password"
            placeholder="粘贴 DeepSeek API Key（sk-...）"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            className="w-full bg-surface-panel border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-dim focus:border-brand focus:outline-none"
          />
        </div>

        {msg && (
          <div className={`text-xs px-3 py-2 rounded-lg ${msg.type === "ok" ? "text-green-400 bg-green-400/10" : "text-red-400 bg-red-400/10"}`}>
            {msg.text}
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 border border-border-soft rounded-lg text-text-secondary text-sm hover:bg-surface-raised transition-colors">
            关闭
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2 bg-brand text-black rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
