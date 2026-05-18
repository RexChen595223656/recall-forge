"use client";
import { useEffect, useState, useRef } from "react";
import { getStats, getKeyStatus, type Stats } from "@/lib/api";
import { ApiKeyModal } from "./ApiKeyModal";
import { BrandName } from "./Logo";

export function TopBar() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [keyOk, setKeyOk] = useState<boolean | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const checkedRef = useRef(false);

  useEffect(() => {
    getStats().then(setStats).catch(() => {});
    const handler = () => getStats().then(setStats).catch(() => {});
    window.addEventListener("forge-activity", handler);

    // Check API key on mount
    if (!checkedRef.current) {
      checkedRef.current = true;
      getKeyStatus().then(s => {
        setKeyOk(s.configured);
        if (!s.configured) setShowSettings(true);
      }).catch(() => {});
    }

    // Listen for open-settings event from other components
    const settingsHandler = () => setShowSettings(true);
    window.addEventListener("open-settings", settingsHandler);

    // Listen for api-key-saved toast
    const toastHandler = () => {
      setToast("API Key 已保存，加密存储于服务端");
      setTimeout(() => setToast(null), 5000);
    };
    window.addEventListener("api-key-saved", toastHandler);

    return () => {
      window.removeEventListener("forge-activity", handler);
      window.removeEventListener("open-settings", settingsHandler);
      window.removeEventListener("api-key-saved", toastHandler);
    };
  }, []);

  const handleSettingsClose = () => {
    setShowSettings(false);
    // Refresh key status
    getKeyStatus().then(s => setKeyOk(s.configured)).catch(() => {});
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-10 bg-background border-b border-border-subtle flex items-center px-4 gap-4">
      <a href="/" className="flex items-center gap-2 shrink-0">
        <BrandName className="text-sm" />
      </a>

      {stats && (
        <div className="flex items-center gap-4 text-sm text-text-secondary ml-auto">
          <span>总题 {stats.total_questions}</span>
          <span>已攻克 {stats.mastered_questions} 题</span>
          <span>连续 {stats.streak_days} 天</span>
          {stats.due_reviews > 0 && (
            <span className="text-blue-400">待巩固 {stats.due_reviews}</span>
          )}
        </div>
      )}
      <button onClick={() => setShowSettings(true)}
        className={`text-xs transition-colors ml-2 ${keyOk === false ? "text-yellow-400" : "text-text-muted hover:text-text-secondary"}`}
        title="API 设置">
        {keyOk === false ? "⚙ 需配 Key" : "⚙"}
      </button>

      {showSettings && <ApiKeyModal onClose={handleSettingsClose} />}

      {toast && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 bg-green-500/20 border border-green-500/40 rounded-lg text-green-400 text-sm animate-pulse">
          {toast}
        </div>
      )}
    </header>
  );
}
