export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatMultiplier(currentValue: number, startingValue: number): string {
  if (!Number.isFinite(currentValue) || !Number.isFinite(startingValue) || startingValue <= 0) {
    return "×1";
  }
  const multiple = currentValue / startingValue;
  const digits = multiple < 10 ? 1 : 0;
  return `×${new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(multiple)}`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
