"use client";
import { UploadForm } from "./UploadForm";

export function UploadModal({ onClose, onDone }: { onClose: () => void; onDone: (materialId: number) => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-background border border-border-default rounded-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <UploadForm onClose={onClose} onDone={onDone} />
        </div>
      </div>
    </div>
  );
}
