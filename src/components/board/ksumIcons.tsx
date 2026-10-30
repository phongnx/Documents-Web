// Bộ icon nét (stroke) cho các trang KPI (Tổng kết tháng, Log KPI của member) — vẽ lại
// theo bản redesign, thay emoji để đồng bộ màu theo theme.
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

// ---------- Bổ sung cho trang Log KPI của member ----------
export const IcChevronLeft = ({ size }: P) => (
  <Svg size={size} width={1.8}>
    <path d="M10 4L6 8l4 4" />
  </Svg>
);
export const IcChevronUp = ({ size }: P) => (
  <Svg size={size} width={1.8}>
    <path d="M4 10l4-4 4 4" />
  </Svg>
);
export const IcRocket = ({ size }: P) => (
  <Svg size={size}>
    <path d="M9.5 2.5c2.2-.6 3.6-.4 4 0 .4.4.6 1.8 0 4L9 11l-4-4z" />
    <path d="M5 7L2.5 8l2-3h3M9 11l-1 2.5 3-2V8.5" />
    <circle cx="10.5" cy="5.5" r=".9" />
  </Svg>
);
export const IcLock = ({ size }: P) => (
  <Svg size={size}>
    <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
  </Svg>
);
export const IcEdit = ({ size }: P) => (
  <Svg size={size}>
    <path d="M10.5 3l2.5 2.5L6 12.5H3.5V10z" />
  </Svg>
);
export const IcCopy = ({ size }: P) => (
  <Svg size={size}>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
    <path d="M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
  </Svg>
);
export const IcNote = ({ size }: P) => (
  <Svg size={size}>
    <path d="M3 2.5h10v7l-4 4H3z" />
    <path d="M9 13.5v-4h4M5.5 5.5h5M5.5 8h3" />
  </Svg>
);
/** Thước — "Estimate". */
export const IcRuler = ({ size }: P) => (
  <Svg size={size}>
    <path d="M2.5 13.5V2.5l11 11z" />
    <path d="M2.5 7h2M2.5 10h2M5.5 13.5V12" />
  </Svg>
);
/** Danh sách có dấu tích — "Quy chế". */
export const IcRules = ({ size }: P) => (
  <Svg size={size}>
    <path d="M2.5 4l1 1 2-2M2.5 9l1 1 2-2M7.5 4.5h6M7.5 9.5h6M7.5 13h6" />
  </Svg>
);
export const IcSun = ({ size }: P) => (
  <Svg size={size}>
    <circle cx="8" cy="8" r="2.75" />
    <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" />
  </Svg>
);
export const IcMoon = ({ size }: P) => (
  <Svg size={size}>
    <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z" />
  </Svg>
);
/** Lịch có mũi tên — dòng plan / plan hôm sau. */
export const IcCalendarNext = ({ size }: P) => (
  <Svg size={size}>
    <path d="M13.5 8V5a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 5v7A1.5 1.5 0 0 0 4 13.5h4" />
    <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3M10 12h4M12.5 10.5l1.5 1.5-1.5 1.5" />
  </Svg>
);
/** Ô che — nghỉ phép. */
export const IcUmbrella = ({ size }: P) => (
  <Svg size={size}>
    <path d="M2 8a6 6 0 0 1 12 0z" />
    <path d="M8 8v4.5a1.5 1.5 0 0 1-3 0" />
  </Svg>
);
export const IcMinus = ({ size }: P) => (
  <Svg size={size} width={1.8}>
    <path d="M4 8h8" />
  </Svg>
);
export const IcAlert = ({ size }: P) => (
  <Svg size={size}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 4.5v4M8 11v.01" />
  </Svg>
);
/** Đồng hồ cát rút gọn — điểm tự chấm chờ leader. */
export const IcPending = ({ size }: P) => (
  <Svg size={size}>
    <circle cx="8" cy="8" r="6" />
    <path d="M5.5 8h.01M8 8h.01M10.5 8h.01" />
  </Svg>
);
export const IcLinkOff = ({ size }: P) => (
  <Svg size={size}>
    <path d="M7 9a3 3 0 0 0 4.2 0l1.8-1.8a3 3 0 0 0-4.2-4.2L8 3.8M9 7a3 3 0 0 0-4.2 0L3 8.8a3 3 0 0 0 4.2 4.2L8 12.2" />
    <path d="M2.5 2.5l11 11" />
  </Svg>
);
export const IcList = ({ size }: P) => (
  <Svg size={size}>
    <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
    <path d="M5 6h6M5 8.5h6M5 11h3.5" />
  </Svg>
);

// ---------- Bổ sung cho màn Estimate ----------
/** Đường đi lên — thực tế vượt est. */
export const IcTrendUp = ({ size = 12 }: P) => (
  <Svg size={size} width={1.8}>
    <path d="M2.5 11.5l4-4 2.5 2.5 4.5-4.5" />
    <path d="M10 5.5h3.5V9" />
  </Svg>
);
export const IcUsers = ({ size = 13 }: P) => (
  <Svg size={size}>
    <circle cx="6" cy="5.5" r="2.5" />
    <path d="M1.5 13.5c.5-2.5 2.3-4 4.5-4s4 1.5 4.5 4M11 3a2.5 2.5 0 0 1 0 5M12.5 9.7c1.2.5 2 1.8 2.2 3.8" />
  </Svg>
);
/** Mũi tên quay lại — "Mở lại Draft". */
export const IcUndo = ({ size }: P) => (
  <Svg size={size}>
    <path d="M5 4L2.5 6.5 5 9" />
    <path d="M2.5 6.5h7a3.5 3.5 0 0 1 0 7H7" />
  </Svg>
);
export const IcUnlock = ({ size }: P) => (
  <Svg size={size}>
    <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 4.9-.7" />
  </Svg>
);
/** Trạng thái sub task: vòng tròn rỗng / nửa đặc / có dấu tích. */
export const IcStTodo = ({ size }: P) => (
  <Svg size={size}>
    <circle cx="8" cy="8" r="5.5" />
  </Svg>
);
export const IcStDoing = ({ size }: P) => (
  <Svg size={size}>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" />
  </Svg>
);
export const IcStDone = ({ size }: P) => (
  <Svg size={size}>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M5.6 8.2l1.7 1.7 3.2-3.6" />
  </Svg>
);
export const IcSearch = ({ size }: P) => (
  <Svg size={size}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5l3 3" />
  </Svg>
);
