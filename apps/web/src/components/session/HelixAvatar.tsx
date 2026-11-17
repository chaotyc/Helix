// Helix's mark in a small tile, beside everything the tutor says.
export function HelixAvatar() {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-raised shadow-xs" aria-hidden="true">
      <img src="/brand/helix-mark.svg" alt="" className="size-3.5 dark:hidden" />
      <img src="/brand/helix-mark-on-dark.svg" alt="" className="hidden size-3.5 dark:block" />
    </span>
  );
}
