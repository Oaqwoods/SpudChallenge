// Spud — the original retro pixel potato mascot (playbook PROMPT 35).
// Hand-drawn on a 16×12 pixel grid as inline SVG rects: an original
// console-era mascot, not a copy of any existing character. Crisp edges,
// scales cleanly, no font or raster dependency.

const COLORS: Record<string, string> = {
  O: "#6b4423", // outline
  B: "#c98d4f", // potato body
  h: "#e6b877", // highlight
  s: "#a06b38", // spots
  W: "#ffffff", // eye white
  K: "#1a1a1a", // pupil
  M: "#6b4423", // mouth
};

const PIXELS = [
  "....OOOOOOOO....",
  "..OOBBBBBBBBOO..",
  ".OBhhBBBBBBBsBO.",
  ".OBBBBBBBBBBBBO.",
  "OBBBWWBBBBWWBBBO",
  "OBBBWKBBBBWKBBBO",
  "OBBBBBBBBBBBBBBO",
  "OBBBBBMMMMBBBBBO",
  ".OBBBBBMMBBsBBO.",
  ".OBsBBBBBBBBBBO.",
  "..OOBBBBBBBBOO..",
  "....OOOOOOOO....",
];

export function SpudMascot({
  className = "",
  decorative = false,
}: {
  className?: string;
  decorative?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 16 12"
      className={className}
      shapeRendering="crispEdges"
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : "Spud, the challenge potato mascot"}
    >
      {PIXELS.flatMap((row, y) =>
        [...row].map((ch, x) =>
          COLORS[ch] ? (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={COLORS[ch]} />
          ) : null,
        ),
      )}
    </svg>
  );
}
