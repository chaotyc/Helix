// The UI's icons: small line drawings on a 24 × 24 grid, drawn in the current text color.
// Drawn here rather than taken from an icon package, so there's no dependency to keep up.
import type { ReactNode } from "react";

type IconProps = { className?: string };

function icon(paths: ReactNode) {
  return function Icon({ className = "size-4" }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`shrink-0 ${className}`}
        aria-hidden="true"
      >
        {paths}
      </svg>
    );
  };
}

export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />);
export const MinusIcon = icon(<path d="M5 12h14" />);
export const XIcon = icon(<path d="M6 6l12 12M18 6L6 18" />);
export const CheckIcon = icon(<path d="M5 12.5l4.5 4.5L19 7" />);
export const ChevronRightIcon = icon(<path d="M9.5 6l6 6-6 6" />);
export const ChevronDownIcon = icon(<path d="M6 9.5l6 6 6-6" />);
export const ArrowUpIcon = icon(<path d="M12 19V5M6 11l6-6 6 6" />);
export const ArrowRightIcon = icon(<path d="M5 12h14M13 6l6 6-6 6" />);
export const ArrowDownIcon = icon(<path d="M12 5v14M6 13l6 6 6-6" />);

export const SearchIcon = icon(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2" />
  </>,
);

// Settings: two sliders.
export const SlidersIcon = icon(
  <>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </>,
);

// A goal's overview page.
export const OverviewIcon = icon(
  <>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </>,
);

// The concept map: three linked nodes.
export const GraphIcon = icon(
  <>
    <circle cx="12" cy="5.5" r="2.25" />
    <circle cx="5.5" cy="18" r="2.25" />
    <circle cx="18.5" cy="18" r="2.25" />
    <path d="M10.9 7.5l-4.3 8.5M13.1 7.5l4.3 8.5M7.75 18h8.5" />
  </>,
);

// A tutoring session: a speech bubble.
export const ChatIcon = icon(<path d="M5 5h14a2 2 0 012 2v8a2 2 0 01-2 2h-7l-4.5 3.5V17H5a2 2 0 01-2-2V7a2 2 0 012-2z" />);

// A diagnostic: a target.
export const TargetIcon = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="0.75" fill="currentColor" />
  </>,
);

export const PanelRightIcon = icon(
  <>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <path d="M15 4v16" />
  </>,
);

export const RefreshIcon = icon(
  <>
    <path d="M19.5 12a7.5 7.5 0 11-2.2-5.3" />
    <path d="M19.5 4.5V9H15" />
  </>,
);

export const PlayIcon = icon(<path d="M8 5.5v13l10-6.5z" />);
export const StopIcon = icon(<rect x="6.5" y="6.5" width="11" height="11" rx="2" />);

export const AlertTriangleIcon = icon(
  <>
    <path d="M10.3 4.2L2.9 17a2 2 0 001.7 3h14.8a2 2 0 001.7-3L13.7 4.2a2 2 0 00-3.4 0z" />
    <path d="M12 9.5v4M12 17h.01" />
  </>,
);

export const InfoIcon = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 8h.01" />
  </>,
);

export const CheckCircleIcon = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.5 12.5l2.5 2.5 4.5-5" />
  </>,
);

export const XCircleIcon = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" />
  </>,
);

export const CalendarIcon = icon(
  <>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </>,
);

// The capstone: a flag at the finish.
// A page with a folded corner: an uploaded document.
export const FileIcon = icon(
  <>
    <path d="M14 3.5H7.5A1.5 1.5 0 006 5v14a1.5 1.5 0 001.5 1.5h9A1.5 1.5 0 0018 19V7.5z" />
    <path d="M14 3.5v4h4M9 12.5h6M9 16h4" />
  </>,
);
// An arrow rising out of a tray: add files.
export const UploadIcon = icon(<path d="M12 15V4.5M7.5 9L12 4.5 16.5 9M5 14.5v3A2.5 2.5 0 007.5 20h9a2.5 2.5 0 002.5-2.5v-3" />);
export const FlagIcon = icon(<path d="M5 21V4M5 4h11l-2 4 2 4H5" />);

export const KeyIcon = icon(
  <>
    <circle cx="8" cy="15" r="4" />
    <path d="M11 12l8.5-8.5M16 7l2.5 2.5" />
  </>,
);

// A model: a chip.
export const ChipIcon = icon(
  <>
    <rect x="6" y="6" width="12" height="12" rx="2" />
    <path d="M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3" />
  </>,
);

export const TrashIcon = icon(<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5" />);

export const SummaryIcon = icon(
  <>
    <path d="M7 3.5h7l5 5V19a1.5 1.5 0 01-1.5 1.5h-10A1.5 1.5 0 016 19V5a1.5 1.5 0 011-1.5z" />
    <path d="M14 3.5V8.5h5M9 13h6M9 16.5h4" />
  </>,
);

export const FitIcon = icon(<path d="M4 9V5.5A1.5 1.5 0 015.5 4H9M15 4h3.5A1.5 1.5 0 0120 5.5V9M20 15v3.5a1.5 1.5 0 01-1.5 1.5H15M9 20H5.5A1.5 1.5 0 014 18.5V15" />);

export const LayersIcon = icon(
  <>
    <path d="M12 4l8 4-8 4-8-4z" />
    <path d="M4 12l8 4 8-4M4 16l8 4 8-4" />
  </>,
);

// The kinds of concept (Concept["kind"]): an idea, a procedure, a choice.
export const ConceptKindIcon = icon(
  <>
    <circle cx="12" cy="12" r="7.5" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
  </>,
);
export const SkillKindIcon = icon(<path d="M5 7h3M5 12h3M5 17h3M11 7h8M11 12h8M11 17h8" />);
export const DecisionKindIcon = icon(<path d="M12 21v-7.5L5.5 7M12 13.5L18.5 7M5 11V6.5h4.5M19 11V6.5h-4.5" />);
