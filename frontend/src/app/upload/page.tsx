"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadMaterial } from "@/lib/api";

type InputMode = "text" | "url" | "file";

const MODE_LABELS: Record<InputMode, string> = {
  text: "文本输入",
  url: "网页链接",
  file: "文件上传",
};

export default function UploadPage() {
  const router = useRouter();
  const [mode, setMode] = useState<InputMode>("text");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("请输入材料标题");
      return;
    }

    setUploading(true);
    setError("");

    try {
      const result = await uploadMaterial(
        title,
        mode === "text" ? content || undefined : undefined,
        mode === "url" ? url || undefined : undefined,
        mode === "file" ? file || undefined : undefined
      );
      router.push(`/quiz/${result.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-8 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary mb-1">上传材料</h1>
        <p className="text-text-muted text-sm">支持文本、网页链接、文件三种方式</p>
      </header>

      <div className="flex gap-2 mb-6">
        {(Object.keys(MODE_LABELS) as InputMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              mode === m
                ? "bg-brand text-black font-medium hover:opacity-90"
                : "bg-surface-panel text-text-secondary hover:bg-surface-raised"
            }`}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          placeholder="材料标题（如：AI PM 工作方法论）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-surface-panel border border-border-soft rounded-lg px-4 py-3 text-foreground placeholder:text-text-muted focus:border-brand focus:outline-none"
        />

        {mode === "text" && (
          <textarea
            placeholder="粘贴或输入学习材料内容..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={12}
            className="w-full bg-surface-panel border border-border-soft rounded-lg px-4 py-3 text-foreground placeholder:text-text-muted focus:border-brand focus:outline-none resize-y"
          />
        )}

        {mode === "url" && (
          <input
            type="url"
            placeholder="https://..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full bg-surface-panel border border-border-soft rounded-lg px-4 py-3 text-foreground placeholder:text-text-muted focus:border-brand focus:outline-none"
          />
        )}

        {mode === "file" && (
          <div className="space-y-3">
            {/* 拖拽上传区域 */}
            <label
              className={`flex flex-col items-center justify-center gap-3 p-8 rounded-lg border-2 border-dashed cursor-pointer transition-all ${
                file
                  ? "border-brand bg-brand-soft/50"
                  : "border-border-soft hover:border-border-strong hover:bg-surface-panel"
              }`}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-brand", "bg-brand-soft/50"); }}
              onDragLeave={(e) => { e.currentTarget.classList.remove("border-brand", "bg-brand-soft/50"); }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove("border-brand", "bg-brand-soft/50");
                const f = e.dataTransfer.files?.[0];
                if (f) setFile(f);
              }}
            >
              {file ? (
                <>
                  <div className="text-3xl">{file.name.endsWith(".pdf") ? "PDF" : file.name.endsWith(".md") ? "MD" : "TXT"}</div>
                  <div className="text-text-primary font-medium">{file.name}</div>
                  <div className="text-text-muted text-sm">
                    {(file.size / 1024).toFixed(1)} KB
                    {file.size > 10 * 1024 * 1024 && (
                      <span className="text-red-400 ml-2">超过 10MB 限制</span>
                    )}
                  </div>
                  <span className="text-text-muted text-xs">点击或拖拽更换文件</span>
                </>
              ) : (
                <>
                  <div className="text-text-muted text-3xl">+</div>
                  <div className="text-text-secondary text-sm">点击选择文件或拖拽到此处</div>
                  <div className="text-text-muted text-xs">支持 PDF / Markdown / TXT / HTML，最大 10MB</div>
                </>
              )}
              <input
                type="file"
                accept=".pdf,.md,.txt,.html"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="hidden"
              />
            </label>

            {file && (
              <button
                type="button"
                onClick={() => setFile(null)}
                className="text-text-muted hover:text-red-400 text-sm transition-colors"
              >
                清除已选文件
              </button>
            )}
          </div>
        )}

        {error && (
          <div className="text-red-400 text-sm bg-red-400/10 px-4 py-2 rounded-lg">{error}</div>
        )}

        {uploading && (
          <div className="glass-panel p-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className="inline-block w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-text-secondary">
                {mode === "file" ? "上传文件并解析..." : mode === "url" ? "抓取网页内容..." : "处理材料..."}
              </span>
            </div>
            <div className="h-1 bg-surface-panel rounded-full overflow-hidden">
              <div className="h-full bg-brand animate-pulse rounded-full" style={{ width: "60%" }} />
            </div>
            <p className="text-text-muted text-xs">正在提取文本、分块、建立索引</p>
          </div>
        )}

        <button
          type="submit"
          disabled={uploading}
          className="w-full bg-brand text-black font-semibold py-3 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {uploading ? "处理中..." : "上传并开始刷题"}
        </button>
      </form>
    </div>
  );
}
