"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { listMaterials, deleteMaterial, uploadMaterial, getMaterialStats, type Material, type MaterialStats, API_BASE } from "@/lib/api";
import { UploadModal } from "@/components/UploadModal";

function MasteryBar({ progress }: { progress: number }) {
  let color = "bg-gray-500";
  if (progress >= 65) color = "bg-green-500";
  else if (progress >= 25) color = "bg-yellow-500";
  else if (progress > 0) color = "bg-gray-400";

  return (
    <div className="h-1.5 bg-surface-panel rounded-full overflow-hidden mt-1.5">
      <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${progress || 2}%` }} />
    </div>
  );
}

export function KnowledgePanel({ selectedId, onSelect }: { selectedId: number | null; onSelect: (id: number) => void }) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [statsMap, setStatsMap] = useState<Record<number, MaterialStats>>({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "weak">("all");
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null);
  const router = useRouter();
  const fetchedRef = useRef(false);

  const loadData = () => {
    listMaterials().then((list) => {
      setMaterials(list);
      setLoading(false);
      // Clean up stopped_materials for deleted materials
      try {
        const stopped = JSON.parse(sessionStorage.getItem("stopped_materials") || "[]");
        const validIds = new Set(list.map(m => m.id));
        const cleaned = stopped.filter((id: number) => validIds.has(id));
        if (cleaned.length !== stopped.length) {
          sessionStorage.setItem("stopped_materials", JSON.stringify(cleaned));
        }
      } catch {}
      // 异步加载统计
      list.forEach((m) => {
        getMaterialStats(m.id).then((s) => {
          setStatsMap((prev) => ({ ...prev, [m.id]: s }));
        }).catch(() => {});
      });
    });
  };

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      loadData();
    }
    const handler = () => loadData();
    window.addEventListener("forge-activity", handler);
    return () => window.removeEventListener("forge-activity", handler);
  }, []);

  async function handleTryExample() {
    try {
      const resp = await fetch(`${API_BASE}/seed-example`, { method: "POST" });
      const data = await resp.json();
      loadData();
      onSelect(data.material_id);
    } catch {}
  }

  async function handleDelete(m: Material, e: React.MouseEvent) {
    e.stopPropagation();
    setDeleteTarget(m);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteMaterial(deleteTarget.id);
      setMaterials((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      if (selectedId === deleteTarget.id) onSelect(0);
      setDeleteTarget(null);
      window.dispatchEvent(new Event("forge-activity"));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "删除失败");
      setDeleteTarget(null);
    }
  }

  const filtered = materials.filter((m) => {
    if (search && !m.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === "weak") {
      const allLoaded = materials.every(m => statsMap[m.id]);
      if (!allLoaded) return true;
      const s = statsMap[m.id];
      if (!s) return false;
      const pct = s.total_questions > 0 ? Math.round(s.questions_attempted / s.total_questions * 100) : 0;
      return pct < 25;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-surface-panel rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 搜索 + 筛选 */}
      <div className="p-3 space-y-2 border-b border-border-subtle">
        <input
          type="text"
          placeholder="搜索材料..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-surface-panel border border-border-subtle rounded-md px-3 py-1.5 text-xs text-text-primary placeholder:text-text-dim focus:border-brand focus:outline-none"
        />
        <div className="flex gap-1">
          {([
            { k: "all", l: "全部" },
            { k: "weak", l: "待加强" },
          ] as const).map(({ k, l }) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-2.5 py-0.5 rounded text-xs transition-colors ${
                filter === k ? "bg-brand text-black" : "text-text-muted hover:bg-surface-raised"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* 材料列表 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <button onClick={() => setShowUpload(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary hover:bg-surface-raised transition-colors mb-1 w-full text-left">
          <span className="text-brand">+</span> 添加材料
        </button>
        {filtered.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-text-muted text-xs mb-3">知识库为空</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setShowUpload(true)}
                className="px-3 py-1.5 bg-brand text-black rounded text-xs font-medium hover:opacity-90 transition-opacity"
              >
                上传材料
              </button>
              <button
                onClick={handleTryExample}
                className="px-3 py-1.5 bg-brand-soft text-brand rounded text-xs hover:bg-brand-hover transition-colors"
              >
                试试示例
              </button>
            </div>
          </div>
        ) : (
          filtered.map((m) => {
            const s = statsMap[m.id];
            const isSelected = selectedId === m.id;

            return (
              <div
                key={m.id}
                onClick={() => onSelect(m.id)}
                className={`p-2.5 rounded-lg cursor-pointer transition-all border ${
                  isSelected
                    ? "border-brand/40 bg-brand/5 ring-1 ring-brand/20 shadow-[0_0_8px_rgba(0,229,153,0.06)]"
                    : "border-transparent hover:bg-surface-raised"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-text-primary truncate">{m.title}</div>
                    <div className="text-xs text-text-muted mt-0.5">
                      {s ? (
                        <span>
                          进度 {s.questions_attempted}/{s.total_questions} · 攻克 {s.mastered_questions}
                          {s.due_reviews > 0 && (
                            <span className="text-blue-400 ml-1">待巩固 {s.due_reviews}</span>
                          )}
                        </span>
                      ) : (
                        "加载中..."
                      )}
                    </div>
                  </div>
                  {!s?.is_example && (
                    <button
                      onClick={(e) => handleDelete(m, e)}
                      className="text-text-dim hover:text-red-400 text-xs transition-colors shrink-0"
                    >
                      删
                    </button>
                  )}
                </div>
                {s && <MasteryBar progress={s.total_questions > 0 ? Math.round(s.questions_attempted / s.total_questions * 100) : 0} />}
              </div>
            );
          })
        )}
      </div>

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onDone={(newId) => {
            setShowUpload(false);
            loadData();
            onSelect(newId);
          }}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setDeleteTarget(null)}>
          <div className="bg-background border border-border-default rounded-xl w-full max-w-sm mx-4 p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold">确认删除</h3>
            <p className="text-text-secondary text-sm">
              删除「{deleteTarget.title}」后，关联的所有题目和复习记录也会被清除，此操作不可撤销。
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2 border border-border-soft rounded-lg text-text-secondary text-sm hover:bg-surface-raised transition-colors">
                取消
              </button>
              <button onClick={confirmDelete}
                className="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors">
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
