/**
 * Inline SVG icons.
 *
 * Hand-drawn rather than pulled from an icon package: there are eight of them,
 * they are a few hundred bytes each, and a dependency that ships thousands of
 * icons to a phone on a mobile connection to render eight is a poor trade.
 *
 * All are `aria-hidden` by default — every icon in this app sits beside a text
 * label, so announcing it twice would only add noise.
 */
const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  className: "size-5",
};

export function HomeIcon() {
  return (
    <svg {...base}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}

export function BoxIcon() {
  return (
    <svg {...base}>
      <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" />
      <path d="M3 7.5 12 12l9-4.5M12 12v9" />
    </svg>
  );
}

export function CartIcon() {
  return (
    <svg {...base}>
      <path d="M3 4h2l2.2 10.4a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.55L20.5 7H6" />
      <circle cx="10" cy="20" r="1.2" />
      <circle cx="17" cy="20" r="1.2" />
    </svg>
  );
}

export function ReceiptIcon() {
  return (
    <svg {...base}>
      <path d="M6 2.5h12v19l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  );
}

export function WalletIcon() {
  return (
    <svg {...base}>
      <path d="M3 7a2 2 0 0 1 2-2h12v4" />
      <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2z" />
      <circle cx="17" cy="14" r="1" />
    </svg>
  );
}

export function PeopleIcon() {
  return (
    <svg {...base}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 5.5a3 3 0 0 1 0 5.6M17.5 20a5.5 5.5 0 0 0-3-4.9" />
    </svg>
  );
}

export function ChartIcon() {
  return (
    <svg {...base}>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8 16v-4M12.5 16V8M17 16v-6" />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.2M12 18.8V21M4.9 7.5l1.9 1.1M17.2 15.4l1.9 1.1M4.9 16.5l1.9-1.1M17.2 8.6l1.9-1.1" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg {...base} className="size-5">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function AlertIcon() {
  return (
    <svg {...base} className="size-8">
      <path d="M12 4 2.5 20h19z" />
      <path d="M12 10v4M12 17v.5" />
    </svg>
  );
}
