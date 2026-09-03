// Tổng hợp bảng "Tổng kết KPI tháng" từ log của tất cả member (cấu trúc theo file
// Excel mẫu: mỗi member các đầu mục lớn nhóm theo project + category, cột Tasks gộp
// '# feature' + '- task', Start/End/days, KPI nhóm = Σ điểm log, KPI tháng = 100 + Σ).
// Các hàm build là pure (test được); aggregate đọc sheet qua get() 1 lần, không subscribe.
import { fetchMonthSheet } from './kpiFetch';
import { v4 as uuidv4 } from 'uuid';
import { db } from './firebase';
import { totalWorkDays } from '../estTypes';
import {
  durationMin,
  fmtDelta,
  KPI_MONTH_BASE,
  leavePortionsOf,
  parseHm,
  totalOf,
  type KpiEntry,
  type KpiLeave,
  type KpiMember,
  type KpiScore,
  type KpiSummary,
  type KpiSummaryMember,
  type KpiSummaryMeta,
  type KpiSummaryRow,
  type LeavePortion,
} from '../kpiTypes';

/** 'yyyy-mm-dd' → 'dd/mm' (bảng tổng kết đã có tiêu đề tháng, không lặp năm). */
const ddmm = (iso: string): string => {
  const [, m, d] = iso.split('-');
  return d && m ? `${d}/${m}` : iso;
};

/** Cộng 1 ngày ISO (không import pmDates để giữ lib độc lập, chỉ cần so liền kề). */
const nextDay = (iso: string): string => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
};

/**
 * Tóm tắt nghỉ phép của member TRONG 1 tháng thành text:
 * '02/06–03/06 (2d) · 15/06 (chiều 0.5d) — tổng 2.5d'. Không có → ''.
 * Đợt vắt qua 2 tháng chỉ tính phần ngày rơi vào tháng đang tổng hợp.
 */
export function leaveNoteOf(leaves: KpiLeave[], monthKey: string): string {
  const portions = leavePortionsOf(leaves);
  const days = [...portions.keys()]
    .filter((d) => d.startsWith(monthKey))
    .sort((a, b) => a.localeCompare(b));
  if (days.length === 0) return '';

  // Gom các ngày LIỀN KỀ cùng portion thành 1 khoảng.
  interface Run {
    from: string;
    to: string;
    portion: LeavePortion;
  }
  const runs: Run[] = [];
  for (const d of days) {
    const p = portions.get(d)!;
    const last = runs[runs.length - 1];
    if (last && last.portion === p && nextDay(last.to) === d) last.to = d;
    else runs.push({ from: d, to: d, portion: p });
  }

  let total = 0;
  const parts = runs.map((r) => {
    const count =
      (new Date(r.to + 'T00:00:00').getTime() -
        new Date(r.from + 'T00:00:00').getTime()) /
        86400000 +
      1;
    const dayVal = r.portion === 'full' ? count : count * 0.5;
    total += dayVal;
    const range = r.from === r.to ? ddmm(r.from) : `${ddmm(r.from)}–${ddmm(r.to)}`;
    const half = r.portion === 'am' ? 'sáng ' : r.portion === 'pm' ? 'chiều ' : '';
    return `${range} (${half}${dayVal}d)`;
  });
  return `${parts.join(' · ')} — tổng ${Number(total.toFixed(1))}d`;
}

/** Giới hạn để cột Tasks là TỔNG HỢP, không phải liệt kê chi tiết. */
const BULLET_CAP = 3; // số việc liệt kê tối đa mỗi feature (nhóm thường)
const BULLET_MAX_LEN = 90; // cắt bullet dài
const KPI_NOTE_MAX_LEN = 80; // cắt lý do ± dài

const truncateTo = (s: string, max: number): string =>
  s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;

const truncateLine = (s: string): string => truncateTo(s, BULLET_MAX_LEN);

/** Số ticket trong 1 dòng log fix bug: dòng có chữ "ticket" → đếm các số ≥2 chữ số
 *  (nhận cả dạng gộp "Ticket 931, 932, 933" = 3), không có số nào → 1 ticket. */
const ticketCountOf = (t: string): number => {
  if (!/ticket/i.test(t)) return 0;
  return Math.max(1, t.match(/\d{2,}/g)?.length ?? 0);
};

/** '3 ticket + 2 việc' / '3 ticket' / '2 việc'. */
const fixbugCountLabel = (tickets: number, others: number): string => {
  const parts: string[] = [];
  if (tickets > 0) parts.push(`${tickets} ticket`);
  if (others > 0) parts.push(`${others} việc`);
  return parts.join(' + ') || '0 việc';
};

/** Số item lẻ (khác loại chủ đạo) liệt kê tối đa trong 1 đoạn. */
const MINOR_CAP = 5;

const keyOfEntry = (e: KpiEntry): string =>
  `${(e.project ?? '').trim()}|${(e.category ?? '').trim()}`;

/** Text tổng hợp phần CHỦ ĐẠO của đoạn (fix bugs đếm ticket / loại khác 3 bullet). */
function dominantText(list: KpiEntry[]): string[] {
  // Bucket theo feature (key normalize hoa/thường để "AI Tutor"/"Ai Tutor" gộp
  // chung), giữ thứ tự xuất hiện + tên hiển thị theo lần đầu; '' = không feature.
  const buckets = new Map<string, { label: string; lines: string[] }>();
  for (const e of list) {
    const label = (e.feature ?? '').trim();
    const key = label.toLowerCase().replace(/\s+/g, ' ');
    const t = (e.task ?? '').trim();
    if (!t) continue;
    let b = buckets.get(key);
    if (!b) {
      b = { label, lines: [] };
      buckets.set(key, b);
    }
    if (!b.lines.includes(t)) b.lines.push(t);
  }

  const isFixbug = /fix|bug/i.test(list[0]?.category ?? '');
  const text: string[] = [];
  for (const { label, lines } of buckets.values()) {
    if (isFixbug) {
      // Tổng hợp đếm số lượng — không liệt kê chi tiết từng ticket.
      let tickets = 0;
      let others = 0;
      for (const t of lines) {
        const n = ticketCountOf(t);
        if (n > 0) tickets += n;
        else others += 1;
      }
      text.push(`- ${label || 'Fix bugs chung'} — ${fixbugCountLabel(tickets, others)}`);
    } else {
      if (label)
        text.push(
          `# ${label}${lines.length > BULLET_CAP ? ` (${lines.length} việc)` : ''}:`,
        );
      for (const t of lines.slice(0, BULLET_CAP)) text.push(`- ${truncateLine(t)}`);
      if (lines.length > BULLET_CAP)
        text.push(`- … và ${lines.length - BULLET_CAP} việc khác`);
    }
  }
  return text;
}

/** Dựng 1 dòng đầu mục từ 1 ĐOẠN timeline: dominant = loại chủ đạo (điền cột
 *  Giai đoạn/App + phần tổng hợp), minor = item lẻ loại khác trong cùng những ngày
 *  đó — liệt kê rõ '- (Loại) task' cuối ô Tasks. KPI/lý do tính trên MỌI dòng log. */
function rowFromSegment(
  dominant: KpiEntry[],
  minor: KpiEntry[],
  scores: Record<string, KpiScore>,
): KpiSummaryRow {
  const text = dominantText(dominant);

  // Item lẻ: nêu rõ loại (project khác thì kèm cả project) — tối đa MINOR_CAP dòng.
  // Riêng item lẻ FIX BUGS không liệt kê chi tiết — gom đếm '- (Fix bugs) — N ticket'.
  const domProject = (dominant[0]?.project ?? '').trim();
  const minorLabel = (e: KpiEntry): string => {
    const parts: string[] = [];
    if ((e.project ?? '').trim() && (e.project ?? '').trim() !== domProject)
      parts.push((e.project ?? '').trim());
    if ((e.category ?? '').trim()) parts.push((e.category ?? '').trim());
    return parts.join(' · ') || 'Khác';
  };
  const minorLines: string[] = [];
  // Gom fix bugs lẻ theo nhãn (mỗi project 1 dòng đếm), giữ thứ tự xuất hiện.
  const fixCounts = new Map<string, { tickets: number; others: number }>();
  for (const e of minor) {
    const t = (e.task ?? '').trim();
    if (!t) continue;
    const label = minorLabel(e);
    if (/fix|bug/i.test(e.category ?? '')) {
      let c = fixCounts.get(label);
      if (!c) {
        fixCounts.set(label, (c = { tickets: 0, others: 0 }));
        minorLines.push(label); // giữ chỗ theo thứ tự — thay bằng dòng đếm bên dưới
      }
      const n = ticketCountOf(t);
      if (n > 0) c.tickets += n;
      else c.others += 1;
    } else {
      const line = `- (${label}) ${truncateLine(t)}`;
      if (!minorLines.includes(line)) minorLines.push(line);
    }
  }
  const resolved = minorLines.map((l) => {
    const c = fixCounts.get(l);
    return c ? `- (${l}) — ${fixbugCountLabel(c.tickets, c.others)}` : l;
  });
  text.push(...resolved.slice(0, MINOR_CAP));
  if (resolved.length > MINOR_CAP)
    text.push(`- … và ${resolved.length - MINOR_CAP} việc khác`);

  // KPI + lý do: trên TẤT CẢ dòng log của đoạn (kể cả item lẻ).
  const all = [...dominant, ...minor].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (parseHm(a.start) ?? 0) - (parseHm(b.start) ?? 0) ||
      a.createdAt.localeCompare(b.createdAt),
  );
  const notes: string[] = [];
  for (const e of all) {
    const s = scores[e.id];
    const d = s ? s.delta : typeof e.selfDelta === 'number' ? e.selfDelta : 0;
    if (d === 0) continue;
    const why = (s?.reason ?? '').trim() || (e.task ?? '').trim();
    notes.push(why ? `${fmtDelta(d)} — ${truncateTo(why, KPI_NOTE_MAX_LEN)}` : fmtDelta(d));
  }

  // Mốc release/milestone: gom nhãn duy nhất từ MỌI dòng log trong đoạn.
  const milestones: string[] = [];
  for (const e of all)
    if (e.rel?.label && !milestones.includes(e.rel.label)) milestones.push(e.rel.label);

  const start = all[0].date;
  const end = all[all.length - 1].date;
  const delta = totalOf(all, scores).delta;
  return {
    id: uuidv4(),
    order: 0, // gán lại sau theo thứ tự đoạn
    start,
    end,
    days: totalWorkDays(start, end, 0) ?? undefined,
    tasks: text.join('\n') || undefined,
    category: dominant[0]?.category || undefined,
    app: dominant[0]?.project || undefined,
    milestone: milestones.join(' · ') || undefined,
    kpi: delta !== 0 ? fmtDelta(delta) : undefined,
    kpiNote: notes.join('\n') || undefined,
  };
}

/**
 * Gom entries 1 tháng của 1 member thành các đầu mục PHÂN VÙNG THEO DÒNG THỜI GIAN
 * (không chồng lấn — mỗi ngày thuộc đúng 1 đoạn):
 * 1. Mỗi ngày xác định loại việc CHỦ ĐẠO (project + category): tổng phút log lớn
 *    nhất thắng; hòa → nhiều dòng hơn; vẫn hòa → nối mạch loại của ngày trước.
 * 2. Các ngày liên tiếp cùng loại chủ đạo gộp thành 1 đoạn (ngày trống không cắt).
 * 3. Item lẻ loại khác trong đoạn được note rõ '- (Loại) task' cuối ô Tasks;
 *    KPI + lý do ± của đoạn tính trên mọi dòng log trong các ngày đó.
 */
export function buildMemberRows(
  entries: KpiEntry[],
  scores: Record<string, KpiScore>,
): KpiSummaryRow[] {
  const sorted = [...entries].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (parseHm(a.start) ?? 0) - (parseHm(b.start) ?? 0) ||
      a.createdAt.localeCompare(b.createdAt),
  );

  // Gom theo ngày (giữ thứ tự tăng dần vì sorted).
  const byDay = new Map<string, KpiEntry[]>();
  for (const e of sorted) {
    const list = byDay.get(e.date);
    if (list) list.push(e);
    else byDay.set(e.date, [e]);
  }

  // Phân đoạn: dominant từng ngày → gộp ngày liên tiếp cùng dominant.
  interface Segment {
    key: string;
    entries: KpiEntry[];
  }
  const segments: Segment[] = [];
  let prevKey: string | null = null;
  for (const list of byDay.values()) {
    // Thống kê phút + số dòng theo loại việc trong ngày.
    const stats = new Map<string, { min: number; count: number }>();
    for (const e of list) {
      const k = keyOfEntry(e);
      let st = stats.get(k);
      if (!st) stats.set(k, (st = { min: 0, count: 0 }));
      st.min += durationMin(e) ?? 0;
      st.count += 1;
    }
    let best: string | null = null;
    for (const [k, st] of stats) {
      if (best === null) {
        best = k;
        continue;
      }
      const b = stats.get(best)!;
      const cmp = st.min - b.min || st.count - b.count;
      // Hòa cả phút lẫn số dòng → ưu tiên nối mạch loại của ngày trước.
      if (cmp > 0 || (cmp === 0 && k === prevKey)) best = k;
    }
    const key: string = best!;
    const last = segments[segments.length - 1];
    if (last && last.key === key) last.entries.push(...list);
    else segments.push({ key, entries: [...list] });
    prevKey = key;
  }

  const rows = segments.map((s) =>
    rowFromSegment(
      s.entries.filter((e) => keyOfEntry(e) === s.key),
      s.entries.filter((e) => keyOfEntry(e) !== s.key),
      scores,
    ),
  );
  rows.forEach((r, i) => {
    r.order = i;
  });
  return rows;
}

/**
 * Đọc sheet KPI của từng member (get 1 lần) và dựng khối tổng kết tháng.
 * Chỉ đưa vào member có log HOẶC có nghỉ phép trong tháng.
 */
export async function aggregateKpiSummaryMembers(
  members: KpiMember[],
  monthKey: string,
): Promise<KpiSummaryMember[]> {
  if (!db) return [];
  const out: KpiSummaryMember[] = [];
  await Promise.all(
    members.map(async (m, i) => {
      try {
        // Chỉ đọc entries của tháng cần tổng kết (query index 'date'), không tải cả sheet.
        const { entries: monthEntries, scores, leaves } = await fetchMonthSheet(
          m.token,
          monthKey,
        );
        const leaveNote = leaveNoteOf(leaves, monthKey);
        if (monthEntries.length === 0 && !leaveNote) return;
        out.push({
          memberId: m.id,
          name: m.name,
          order: i,
          kpiScore: Number(
            (KPI_MONTH_BASE + totalOf(monthEntries, scores).delta).toFixed(2),
          ),
          ...(leaveNote ? { leaveNote } : {}),
          rows: buildMemberRows(monthEntries, scores),
        });
      } catch {
        // Sheet lỗi/bị xóa — bỏ qua member đó.
      }
    }),
  );
  // Promise.all không đảm bảo thứ tự push → sort lại theo thứ tự member.
  return out.sort((a, b) => a.order - b.order);
}

/** Chuẩn hóa khi ĐỌC từ RTDB: đảm bảo mảng lồng nhau tồn tại (RTDB bỏ mảng rỗng). */
export function normalizeSummaryRead(val: {
  meta: KpiSummaryMeta;
  members?: KpiSummaryMember[];
}): KpiSummary {
  return {
    meta: val.meta,
    members: (val.members ?? []).map((m) => ({ ...m, rows: m.rows ?? [] })),
  };
}

/** Chuẩn hóa trước khi ghi RTDB: bỏ field rỗng/undefined (RTDB ném lỗi nếu còn undefined). */
export function normalizeSummaryMembers(members: KpiSummaryMember[]): unknown {
  return members.map((m, i) => ({
    memberId: m.memberId,
    name: m.name,
    kpiScore: m.kpiScore,
    order: i,
    ...(m.leaveNote?.trim() ? { leaveNote: m.leaveNote.trim() } : {}),
    rows: (m.rows ?? []).map((r, j) => ({
      id: r.id,
      order: j,
      ...(r.category?.trim() ? { category: r.category.trim() } : {}),
      ...(r.app?.trim() ? { app: r.app.trim() } : {}),
      ...(r.milestone?.trim() ? { milestone: r.milestone.trim() } : {}),
      ...(r.tasks?.trim() ? { tasks: r.tasks } : {}),
      ...(r.start ? { start: r.start } : {}),
      ...(r.end ? { end: r.end } : {}),
      ...(typeof r.days === 'number' && !Number.isNaN(r.days) ? { days: r.days } : {}),
      ...(r.progress?.trim() ? { progress: r.progress } : {}),
      ...(r.kpi?.trim() ? { kpi: r.kpi.trim() } : {}),
      ...(r.kpiNote?.trim() ? { kpiNote: r.kpiNote } : {}),
    })),
  }));
}
