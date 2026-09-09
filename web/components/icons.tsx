/**
 * Inline SVG icons, the convention across the aether-zone frontends.
 *
 * They size themselves rather than leaning on a parent rule: kosmos wraps an
 * icon slot in a `size-4` span but sets nothing on the svg inside it, and a
 * bare `Button` wraps it in nothing at all — an svg with a viewBox and no width
 * would be left to the browser's replaced-element default in there.
 *
 * kosmos depends on `react-icons` and uses Ionicons internally, but it does not
 * re-export them, and taking a direct dependency on the icon set to draw five
 * glyphs is more than this app needs.
 */
const svg = {
  className: 'size-4',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
  'aria-hidden': true,
} as const;

export function DownloadIcon() {
  return (
    <svg {...svg}>
      <path d="M12 3v12M8 11l4 4 4-4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

export function CopyIcon() {
  return (
    <svg {...svg}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M15 5.5A2.5 2.5 0 0 0 12.5 3h-7A2.5 2.5 0 0 0 3 5.5v7A2.5 2.5 0 0 0 5.5 15" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg {...svg}>
      <path d="M4 12.5 9.5 18 20 7" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg {...svg}>
      <path d="M4 7h16M10 4h4M9.5 11v6M14.5 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
    </svg>
  );
}


export function SunIcon() {
  return (
    <svg {...svg}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

export function MoonIcon() {
  return (
    <svg {...svg}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </svg>
  );
}

export function BoxIcon() {
  return (
    <svg {...svg} className="size-6">
      <path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5Z" />
      <path d="M3 8.5v7L12 20l9-4.5v-7M12 13v7" />
    </svg>
  );
}

/** A branch in the object tree: the requestor that filed the objects. */
export function ServiceIcon() {
  return (
    <svg {...svg}>
      <rect x="3" y="4" width="18" height="7" rx="2" />
      <rect x="3" y="13" width="18" height="7" rx="2" />
      <path d="M7 7.5h.01M7 16.5h.01" />
    </svg>
  );
}

/** A branch in the object tree: the organization an object was filed for. */
export function FolderIcon() {
  return (
    <svg {...svg}>
      <path d="M3 7a2 2 0 0 1 2-2h3.6a2 2 0 0 1 1.4.6L11.5 7H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  );
}

/** A leaf in the object tree: one stored object. */
export function FileIcon() {
  return (
    <svg {...svg}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}
