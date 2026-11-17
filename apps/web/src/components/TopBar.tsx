// The bar across the top of the main panel: where you are (goal › page), then actions.
import { Fragment, type ReactNode } from "react";
import { ChevronRightIcon } from "./ui/icons.tsx";

// `detail` follows the label in a lighter color and is the first thing dropped when space is short.
export type Crumb = { label: string; detail?: string; onClick?: () => void };

type Props = { crumbs: Crumb[]; badge?: ReactNode; actions?: ReactNode };

export function TopBar({ crumbs, badge, actions }: Props) {
  return (
    <header className="app-drag @container/topbar flex h-12 shrink-0 items-center gap-3 border-b border-line px-4 select-none">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-[13px]">
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return (
            <Fragment key={i}>
              {i > 0 && <ChevronRightIcon className="size-3.5 text-fg-faint" />}
              {/* When space runs out, earlier crumbs shrink first, so the current page stays readable. */}
              {crumb.onClick && !last ? (
                <button
                  type="button"
                  onClick={crumb.onClick}
                  title={crumb.label}
                  className="min-w-8 shrink-[4] truncate rounded-md px-1.5 py-0.5 text-fg-muted hover:bg-fill hover:text-fg"
                >
                  {crumb.label}
                </button>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  title={crumb.detail ? `${crumb.label} · ${crumb.detail}` : crumb.label}
                  className={`min-w-0 truncate px-1.5 ${last ? "font-medium text-fg" : "shrink-[4] text-fg-muted"}`}
                >
                  {crumb.label}
                  {crumb.detail && <span className="font-normal text-fg-muted @max-lg/topbar:hidden"> · {crumb.detail}</span>}
                </span>
              )}
            </Fragment>
          );
        })}
      </nav>
      {badge && <span className="flex shrink-0 @max-md/topbar:hidden">{badge}</span>}
      <span className="flex-1" />
      <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
    </header>
  );
}
