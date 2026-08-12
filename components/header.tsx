const NAV: Array<[string, string]> = [
  ["#current", "Current Trade"],
  ["#journey", "Journey"],
  ["#how", "How It Works"],
  ["#rules", "Rules"],
  ["#follow", "Follow"],
];

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b-[3px] border-edge bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <div className="flex items-baseline gap-3">
          <a href="#top" className="font-display text-xs text-accent sm:text-sm">
            ONE → FIVE
          </a>
          <span className="hidden text-[11px] text-faded md:inline">
            A Trade Challenge by Spud
          </span>
        </div>
        <nav
          aria-label="Page sections"
          className="flex flex-wrap gap-x-3 gap-y-1 font-display text-[9px] sm:text-[10px]"
        >
          {NAV.map(([href, label]) => (
            <a key={href} href={href} className="text-faded transition-colors hover:text-accent">
              {label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
