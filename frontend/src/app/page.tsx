"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { KnowledgePanel } from "@/components/KnowledgePanel";
import { ForgePanel } from "@/components/ForgePanel";
import { GlobalReview } from "@/components/GlobalReview";
import { UploadModal } from "@/components/UploadModal";
import { UploadForm } from "@/components/UploadForm";
import { BrandName } from "@/components/Logo";
import { getStats, type Stats } from "@/lib/api";

function ForgeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const materialParam = searchParams.get("material");
  const [selectedId, setSelectedId] = useState<number | null>(materialParam ? parseInt(materialParam) : null);
  const [globalStats, setGlobalStats] = useState<Stats | null>(null);

  useEffect(() => {
    getStats().then(setGlobalStats).catch(() => {});

    // Check if there's a pending intent search result from before a refresh
    const intentId = sessionStorage.getItem("intent_material_id");
    if (intentId) {
      sessionStorage.removeItem("intent_material_id");
      const id = parseInt(intentId);
      if (id > 0) {
        setSelectedId(id);
        router.replace(`/?material=${id}`, { scroll: false });
      }
    }
  }, []);

  const [refreshKey, setRefreshKey] = useState(0);
  const [globalReview, setGlobalReview] = useState<"wrong" | "sm2" | false>(false);
  const [showUpload, setShowUpload] = useState(false);

  function handleSelect(id: number) {
    setSelectedId(id);
    if (id > 0) {
      router.replace(`/?material=${id}`, { scroll: false });
    } else {
      router.replace("/", { scroll: false });
    }
  }

  function handleActivity() {
    setRefreshKey(k => k + 1);
    getStats().then(setGlobalStats).catch(() => {});
  }

  return (
    <div className="flex h-[calc(100vh-2.5rem)]">
      {/* 左栏：知识库 */}
      <div className="w-56 lg:w-64 flex-shrink-0 border-r border-border-subtle bg-background overflow-hidden hidden sm:block">
        <KnowledgePanel key={refreshKey} selectedId={selectedId} onSelect={handleSelect} />
      </div>

      {/* 右栏：锻造区 */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        {globalReview ? (
          <GlobalReview mode={globalReview === "wrong" ? "wrong" : "sm2"} onClose={() => { setGlobalReview(false); handleActivity(); }} />
        ) : selectedId && selectedId > 0 ? (
          <ForgePanel key={selectedId} materialId={selectedId} />
        ) : (
          <div className="flex flex-col items-center py-8 px-4">
            <div className="w-full max-w-2xl">
              {/* Header */}
              <div className="text-center mb-8">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <BrandName className="text-xl" />
                </div>
                <p className="text-text-muted text-sm">上传材料，自动出题，科学复习</p>
              </div>

              {/* Upload form directly embedded */}
              <UploadForm
                onDone={(newId) => {
                  handleSelect(newId);
                  handleActivity();
                }}
              />

              {/* Global stats below upload */}
              {globalStats && globalStats.total_questions > 0 && (
                <div className="mt-8 pt-8 border-t border-border-subtle">
                  <div className="grid grid-cols-4 gap-4 mb-6">
                    {[
                      { l: "总题数", v: globalStats.total_questions },
                      { l: "已攻克", v: globalStats.mastered_questions },
                      { l: "待巩固", v: globalStats.due_reviews },
                      { l: "连续", v: `${globalStats.streak_days}天` },
                    ].map(({ l, v }) => (
                      <div key={l} className="text-center">
                        <div className="text-lg font-bold text-brand">{v}</div>
                        <div className="text-text-muted text-xs">{l}</div>
                      </div>
                    ))}
                  </div>
                  {(globalStats.wrong_questions > 0 || globalStats.due_reviews > 0) && (
                    <div className="flex gap-2 justify-center">
                      {globalStats.wrong_questions > 0 && (
                        <button onClick={() => setGlobalReview("wrong")}
                          className="px-4 py-2 border border-orange-500/30 text-orange-400 rounded-lg text-sm hover:bg-orange-500/10 transition-colors">
                          错题重做 ({globalStats.wrong_questions})
                        </button>
                      )}
                      {globalStats.due_reviews > 0 && (
                        <button onClick={() => setGlobalReview("sm2")}
                          className="px-4 py-2 border border-blue-500/30 text-blue-400 rounded-lg text-sm hover:bg-blue-500/10 transition-colors">
                          记忆巩固 ({globalStats.due_reviews})
                        </button>
                      )}
                    </div>
                  )}
                  {Object.keys(globalStats.tag_distribution).length > 0 && (
                    <div className="flex flex-wrap justify-center gap-1 mt-4">
                      {Object.entries(globalStats.tag_distribution).slice(0, 6).map(([tag, count]) => (
                        <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-brand-soft text-brand">{tag}:{count}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        {showUpload && (
          <UploadModal
            onClose={() => setShowUpload(false)}
            onDone={(newId) => {
              setShowUpload(false);
              handleSelect(newId);
              handleActivity();
            }}
          />
        )}
      </div>
    </div>
  );
}

export default function ForgePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64 text-text-muted">加载中...</div>}>
      <ForgeContent />
    </Suspense>
  );
}
