export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span className="inline-flex items-baseline font-bold select-none tracking-tight" style={{ fontSize: size * 0.85, lineHeight: 1 }}>
      <span className="text-brand">铭</span>
      <span className="text-text-primary">知</span>
    </span>
  );
}

export function BrandName({ className = "" }: { className?: string }) {
  return (
    <span className={`font-bold ${className}`}>
      <span className="text-brand">铭</span>
      <span className="text-text-primary">知</span>
      {" "}
      <span className="text-brand">Recall</span>
      <span className="text-text-primary">Forge</span>
    </span>
  );
}
