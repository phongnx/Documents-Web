// Bộ icon nét (stroke) cho trang Tổng kết KPI tháng — vẽ lại đúng theo bản redesign.
// Icon trang trí luôn aria-hidden; nút chỉ có icon phải tự gắn aria-label.
import type { ReactNode } from 'react';

function Svg({ size = 16, width = 1.6, children }: { size?: number; width?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

type P = { size?: number };

export const IcRefresh = ({ size }: P) => (
  <Svg size={size}>
    <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
    <path d="M13.5 2.5v3h-3" />
  </Svg>
);
export const IcMerge = ({ size }: P) => (
  <Svg size={size}>
    <path d="M3 3h10M3 13h10" />
    <path d="M6 6l2 2 2-2M6 10l2-2 2 2" />
  </Svg>
);
export const IcTrash = ({ size }: P) => (
  <Svg size={size}>
    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />
  </Svg>
);
export const IcUserPlus = ({ size }: P) => (
  <Svg size={size}>
    <circle cx="6.5" cy="5.5" r="2.5" />
    <path d="M2 13.5c.5-2.5 2.3-4 4.5-4s4 1.5 4.5 4M12.5 5v4M10.5 7h4" />
  </Svg>
);
export const IcLink = ({ size }: P) => (
  <Svg size={size}>
    <path d="M7 9a3 3 0 0 0 4.2 0l1.8-1.8a3 3 0 0 0-4.2-4.2L8 3.8" />
    <path d="M9 7a3 3 0 0 0-4.2 0L3 8.8a3 3 0 0 0 4.2 4.2L8 12.2" />
  </Svg>
);
export const IcSave = ({ size }: P) => (
  <Svg size={size} width={1.7}>
    <path d="M3 2.5h8l2.5 2.5v8.5h-10.5z" />
    <path d="M5.5 2.5v3h5v-3M5.5 13.5v-4h5v4" />
  </Svg>
);
export const IcCheck = ({ size }: P) => (
  <Svg size={size} width={1.8}>
    <path d="M3.5 8.5l3 3 6-7" />
  </Svg>
);
export const IcArrowLeft = ({ size = 14 }: P) => (
  <Svg size={size} width={1.7}>
    <path d="M13 8H3M7 4L3 8l4 4" />
  </Svg>
);
export const IcArrowRight = ({ size = 20 }: P) => (
  <Svg size={size}>
    <path d="M3 8h10M9 4l4 4-4 4" />
  </Svg>
);
export const IcChevronDown = ({ size }: P) => (
  <Svg size={size} width={1.8}>
    <path d="M4 6l4 4 4-4" />
  </Svg>
);
export const IcChevronRight = ({ size }: P) => (
  <Svg size={size} width={1.8}>
    <path d="M6 4l4 4-4 4" />
  </Svg>
);
export const IcCalendar = ({ size = 15 }: P) => (
  <Svg size={size}>
    <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
    <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
  </Svg>
);
export const IcFlag = ({ size = 13 }: P) => (
  <Svg size={size} width={1.7}>
    <path d="M4 14V2.5M4 3h7.5l-1.5 2.5L11.5 8H4" />
  </Svg>
);
export const IcWarn = ({ size }: P) => (
  <Svg size={size}>
    <path d="M8 2l6.5 11.5h-13z" />
    <path d="M8 6.5v3M8 11.5v.01" />
  </Svg>
);
export const IcInfo = ({ size }: P) => (
  <Svg size={size}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 7.5v3.5M8 5v.01" />
  </Svg>
);
export const IcClose = ({ size }: P) => (
  <Svg size={size} width={1.7}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Svg>
);
export const IcPlus = ({ size = 14 }: P) => (
  <Svg size={size} width={1.8}>
    <path d="M8 3v10M3 8h10" />
  </Svg>
);
