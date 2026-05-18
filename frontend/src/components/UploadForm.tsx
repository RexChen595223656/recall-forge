"use client";
import { useState, useRef } from "react";
import { uploadMaterial, generateQuestions, getKeyStatus, intentSearch } from "@/lib/api";

const MIN_CHARS = 50;
const WARN_CHARS = 200;

function detectInputType(text: string): "url" | "text" | "empty" {
  if (!text.trim()) return "empty";
  if (/^https?:\/\/\S+/i.test(text.trim())) return "url";
  return "text";
}

function autoTitle(text: string, file: File | null): string {
  if (file) return file.name.replace(/\.[^.]+$/, "");
  if (!text.trim()) return "";
  const t = detectInputType(text);
  if (t === "url") {
    const u = new URL(text.trim());
    return u.hostname + u.pathname.slice(0, 20);
  }
  if (t === "text") return text.trim().slice(0, 30) + (text.trim().length > 30 ? "..." : "");
  return "";
}

interface Props {
  onClose?: () => void;
  onDone: (materialId: number) => void;
}

export function UploadForm({ onClose, onDone }: Props) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [title, setTitle] = useState("");

  const inputType = detectInputType(text);
  const contentLen = inputType === "text" ? text.length : 0;
  const canSubmit = (file !== null) || (inputType === "url" && text.trim().length > 0) || (inputType === "text" && text.length >= MIN_CHARS);

  const titleManEdited = useRef(false);

  function handleTextChange(value: string) {
    setText(value);
    if (!titleManEdited.current) {
      const newTitle = autoTitle(value, file);
      if (newTitle) setTitle(newTitle);
    }
  }

  function handleFileChange(f: File | null) {
    setFile(f);
    if (f && !titleManEdited.current) setTitle(f.name.replace(/\.[^.]+$/, ""));
  }

  async function handleSubmit() {
    if (!title.trim()) { setError("请输入标题"); return; }
    if (!canSubmit) { setError("请提供足够的学习材料"); return; }

    // Check API key before uploading
    const ks = await getKeyStatus().catch(() => ({ configured: true } as const));
    if (!ks.configured) {
      window.dispatchEvent(new Event("open-settings"));
      setError("请先配置 DeepSeek API Key");
      return;
    }

    setUploading(true);
    setError("");
    try {
      const isUrl = inputType === "url" && !file;
      const isText = inputType === "text" && !file;
      const result = await uploadMaterial(
        title,
        isText ? text || undefined : undefined,
        isUrl ? text.trim() || undefined : undefined,
        file || undefined
      );
      setUploading(false);

      generateQuestions(result.id, false, {
        tag: file && text.trim() ? text.trim() : undefined,
      }).catch(() => {});

      const chunkCount = result.chunk_count;
      if (chunkCount !== undefined && chunkCount > 0) {
        setSuccessMsg(`上传成功，已拆分为 ${chunkCount} 个知识点块，正在生成题目...`);
        setTimeout(() => onDone(result.id), 1500);
      } else if (chunkCount === 0) {
        setSuccessMsg("上传成功，正在生成题目...");
        setTimeout(() => onDone(result.id), 1200);
      } else {
        onDone(result.id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "上传失败");
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">添加材料</h2>
        {onClose && <button onClick={onClose} className="text-text-muted hover:text-text-primary text-lg leading-none">&times;</button>}
      </div>

      {/* 文本/URL 输入 */}
      <div>
        <textarea
          placeholder="输入想学的内容、网页链接，或直接粘贴学习材料..."
          value={text}
          onChange={e => handleTextChange(e.target.value)}
          rows={5}
          className="w-full bg-surface-panel border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-dim focus:border-brand focus:outline-none resize-y"
        />
        <div className="flex justify-between items-center mt-1.5">
          <span className={`text-xs ${inputType === "url" ? "text-brand" : inputType === "text" && contentLen >= WARN_CHARS ? "text-green-400" : inputType === "text" && contentLen >= MIN_CHARS ? "text-yellow-400" : "text-text-dim"}`}>
            {inputType === "url" ? "识别为网页链接" :
             inputType === "text" && contentLen >= WARN_CHARS ? `${contentLen} 字 · 内容充足` :
             inputType === "text" && contentLen >= MIN_CHARS ? `${contentLen} 字 · 可以出题` :
             inputType === "text" && contentLen > 0 ? `还需 ${MIN_CHARS - contentLen} 字` :
             "输入学习材料或网页链接"}
          </span>
          {contentLen > 0 && contentLen < WARN_CHARS && inputType === "text" && (
            <span className="text-yellow-400 text-[10px]">建议 200 字以上</span>
          )}
        </div>
      </div>

      {/* 文件拖拽 */}
      <div>
        <label
          className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-dashed cursor-pointer transition-all ${file ? "border-brand bg-brand-dim" : dragOver ? "border-brand bg-brand-soft" : "border-border-subtle hover:border-border-default"}`}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }}
          onDrop={(e) => {
            e.preventDefault(); e.stopPropagation();
            setDragOver(false);
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) handleFileChange(dropped);
          }}
        >
          {file ? (
            <>
              <span className="text-text-primary text-sm font-medium">{file.name}</span>
              <span className="text-text-muted text-xs">{(file.size / 1024).toFixed(1)} KB</span>
            </>
          ) : (
            <>
              <span className="text-text-muted text-xl">+</span>
              <span className="text-text-muted text-xs">{dragOver ? "释放文件" : "点击或拖拽文件到此处"}</span>
              <span className="text-text-muted text-xs">支持 PDF / Markdown / TXT / HTML，最大 10MB</span>
            </>
          )}
          <input type="file" accept=".pdf,.md,.txt,.html" onChange={e => handleFileChange(e.target.files?.[0] || null)} className="hidden" />
        </label>
        {file && (
          <div className="flex items-center gap-2 mt-1">
            <button type="button" onClick={() => handleFileChange(null)} className="text-text-muted hover:text-red-400 text-xs transition-colors">清除文件</button>
            {text.trim() && (
              <span className="text-text-muted text-xs">文本将作为出题偏好补充</span>
            )}
          </div>
        )}
      </div>

      {/* 标题 */}
      <div>
        <div className="text-text-dim text-[10px] mb-1">标题（可修改）</div>
        <input
          type="text"
          placeholder="自动识别或手动输入"
          value={title}
          onChange={e => { titleManEdited.current = true; setTitle(e.target.value); }}
          className="w-full bg-surface-panel border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-dim focus:border-brand focus:outline-none"
        />
      </div>

      {successMsg && <div className="text-green-400 text-xs bg-green-400/10 px-3 py-2 rounded-lg">{successMsg}</div>}
      {error && <div className="text-red-400 text-xs bg-red-400/10 px-3 py-2 rounded-lg">{error}</div>}

      {/* 意图搜索按钮：短文本 + 非 URL + 无文件 */}
      {inputType === "text" && contentLen > 0 && contentLen < MIN_CHARS && !file ? (
        <div className="space-y-2">
          <div className="text-text-muted text-xs text-center">输入的学习意图较短，AI 将自动搜索并生成学习材料</div>
          <button onClick={async () => {
            setUploading(true);
            setError("");
            try {
              const ks = await getKeyStatus().catch(() => ({ configured: true } as const));
              if (!ks.configured) {
                window.dispatchEvent(new Event("open-settings"));
                setError("请先配置 DeepSeek API Key");
                setUploading(false);
                return;
              }
              sessionStorage.setItem("intent_pending", text.trim());
              const result = await intentSearch(text.trim());
              sessionStorage.setItem("intent_material_id", String(result.material_id));
              sessionStorage.removeItem("intent_pending");
              onDone(result.material_id);
            } catch (err: unknown) {
              setError(err instanceof Error ? err.message : "搜索失败");
              setUploading(false);
            }
          }} disabled={uploading}
            className="w-full bg-brand text-black font-medium py-2.5 rounded-lg text-sm hover:opacity-90 disabled:opacity-30 transition-opacity">
            {uploading ? "AI 正在生成学习材料..." : "搜索学习"}
          </button>
        </div>
      ) : (
        <button onClick={handleSubmit} disabled={uploading || !canSubmit}
          className="w-full bg-brand text-black font-medium py-2.5 rounded-lg text-sm hover:opacity-90 disabled:opacity-30 transition-opacity">
          {uploading ? "上传中..." : "确认上传"}
        </button>
      )}
    </div>
  );
}
