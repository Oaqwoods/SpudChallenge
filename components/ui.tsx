import type { HTMLAttributes, ReactNode } from "react";

export function SectionHeading({
  id,
  children,
}: {
  id?: string;
  children: ReactNode;
}) {
  return (
    <h2
      id={id}
      className="font-display text-xs uppercase tracking-widest text-accent sm:text-sm"
    >
      <span aria-hidden="true">▸ </span>
      {children}
    </h2>
  );
}

export function Panel({
  className = "",
  children,
  ...rest
}: { className?: string; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`border-[3px] border-edge bg-panel ${className}`} {...rest}>
      {children}
    </div>
  );
}
