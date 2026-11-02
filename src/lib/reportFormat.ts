// Tiện ích cho "Báo cáo ngày": số La Mã, định dạng ngày, tách dòng theo marker,
// và dựng lại đúng text báo cáo để copy/paste ra ngoài.
import type { DailyReport, ReportProject, WeeklyPlan } from '../pmTypes';
import { hasMarker } from './planItems';
import { mondayOf } from './pmDates';

// Sinh khung project báo cáo từ plan tuần: mỗi nhánh CHƯA done → "# tiêu đề:" +
// "- item" + "-> milestone" (đúng marker bộ sync đọc); nhánh done bị bỏ (không cần
// báo lại); project hết nhánh → bỏ. Trả [] nếu plan không còn gì để báo.
export function reportProjectsFromPlan(plan: WeeklyPlan): ReportProject[] {
  const out: ReportProject[] = [];
  for (const pr of plan.projects ?? []) {
    const wss = (pr.workstreams ?? []).filter((w) => (w.state ?? 'todo') !== 'done');
    if (wss.length === 0) continue;
    const body = wss
      .map((w) => {
        const lines = [`# ${w.title}:`];
        // Item đã mang marker cấp bậc ('- ', '+ ', '# ') thì GIỮ NGUYÊN — ép thêm '- '
        // sẽ ra '- # Scan QR' và parseBody đọc nhầm tiêu đề thành 1 đầu việc.
        for (const it of w.items ?? [])
          if (it.trim()) lines.push(hasMarker(it) ? it.trim() : `- ${it.trim()}`);
        if (w.milestone?.text) lines.push(`-> ${w.milestone.text}`);
        return lines.join('\n');
      })
      .join('\n\n');
    out.push({ name: pr.name, ...(pr.appId ? { appId: pr.appId } : {}), body });
  }
  return out;
}

const ROMAN: [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

// 1 → 'I', 2 → 'II'… (đủ dùng cho danh sách dự án).
export function roman(n: number): string {
  let r = '';
  let v = n;
  for (const [num, sym] of ROMAN) {
    while (v >= num) {
      r += sym;
      v -= num;
    }
  }
  return r || String(n);
}

// ISO 'yyyy-mm-dd' → 'dd/mm/yyyy'.
export function formatDateVi(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export type ReportLineKind = 'section' | 'bullet' | 'arrow' | 'sub' | 'text';
export interface ReportLine {
  kind: ReportLineKind;
  text: string;
  /** Chỉ số dòng thô trong body (kể cả dòng trống) — để editor gắn chip sync đúng dòng. */
  idx: number;
}

// Tách 1 khối body thành các dòng đã phân loại theo marker (bỏ dòng trống).
export function parseBody(body: string): ReportLine[] {
  const out: ReportLine[] = [];
  (body ?? '').split('\n').forEach((raw, idx) => {
    const s = raw.trim();
    if (!s) return;
    if (s.startsWith('#')) out.push({ kind: 'section', text: s.replace(/^#+\s*/, ''), idx });
    else if (s.startsWith('->'))
      out.push({ kind: 'arrow', text: s.replace(/^->\s*/, ''), idx });
    else if (s.startsWith('+')) out.push({ kind: 'sub', text: s.replace(/^\+\s*/, ''), idx });
    else if (s.startsWith('-'))
      out.push({ kind: 'bullet', text: s.replace(/^-\s*/, ''), idx });
    else out.push({ kind: 'text', text: s, idx });
  });
  return out;
}

// Phân loại 1 dòng THÔ (giữ nguyên khoảng trắng) cho lớp tô màu của ô nội dung:
// `lead` = khoảng trắng đầu dòng + marker (tô màu riêng), `rest` = phần còn lại.
// Luật nhận marker trùng parseBody (thứ tự '#', '->', '+', '-') để màu khớp bản copy.
export function classifyRawLine(raw: string): {
  kind: ReportLineKind | 'empty';
  lead: string;
  rest: string;
} {
  const s = raw.trimStart();
  if (!s.trim()) return { kind: 'empty', lead: '', rest: raw };
  const ws = raw.slice(0, raw.length - s.length);
  const mk = s.match(/^(#+|->|\+|-)/)?.[0];
  if (!mk) return { kind: 'text', lead: '', rest: raw };
  const kind: ReportLineKind =
    mk === '->' ? 'arrow' : mk === '+' ? 'sub' : mk === '-' ? 'bullet' : 'section';
  return { kind, lead: ws + mk, rest: s.slice(mk.length) };
}

// Marker gõ nhầm hay gặp (bàn phím Mac tự đổi '-' thành '–', gõ '=>' thay '->'…):
// trả marker đúng để gợi ý sửa; null = dòng hợp lệ (dòng không marker vẫn là text thường).
const MARKER_TYPOS: [RegExp, string][] = [
  [/^=>/, '->'],
  [/^[–—]>/, '->'],
  [/^[–—•*]/, '-'],
];
export function markerTypo(raw: string): { wrong: string; fix: string } | null {
  const s = raw.trimStart();
  for (const [re, fix] of MARKER_TYPOS) {
    const m = s.match(re);
    if (m) return { wrong: m[0], fix };
  }
  return null;
}

// Dựng lại text đúng format báo cáo (chuẩn hóa thụt lề bằng tab) để copy/paste.
export function buildReportText(r: DailyReport): string {
  const lines: string[] = [];
  lines.push(`${r.title || 'Report Mobile Team'} ${formatDateVi(r.date)}`.trim());
  lines.push('');
  const projects = (r.projects ?? []).filter((p) => p.name.trim() || p.body.trim());
  projects.forEach((p, i) => {
    lines.push(`${roman(i + 1)} - ${p.name.trim()}`);
    for (const ln of parseBody(p.body)) {
      switch (ln.kind) {
        case 'section':
          lines.push(`\t# ${ln.text}`);
          break;
        case 'bullet':
          lines.push(`\t- ${ln.text}`);
          break;
        case 'arrow':
          lines.push(`\t-> ${ln.text}`);
          break;
        case 'sub':
          lines.push(`\t\t+ ${ln.text}`);
          break;
        default:
          lines.push(`\t${ln.text}`);
      }
    }
    lines.push('');
  });
  return `${lines.join('\n').trimEnd()}\n`;
}

// ---------- Danh sách báo cáo: nhóm tuần, tìm kiếm ----------

const WEEKDAY_LONG = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
const WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function dayOfWeek(iso: string): number {
  return new Date(iso + 'T00:00:00').getDay();
}

// 'Thứ sáu' / 'T6' cho ô ngày trong danh sách; '' nếu ngày hỏng.
export function weekdayLong(iso: string): string {
  return WEEKDAY_LONG[dayOfWeek(iso)] ?? '';
}
export function weekdayShort(iso: string): string {
  return WEEKDAY_SHORT[dayOfWeek(iso)] ?? '';
}

// 'dd/mm' (bỏ năm) cho nhãn tuần, dòng phụ.
export function formatDayMonth(iso: string): string {
  return formatDateVi(iso).slice(0, 5);
}

// Số dự án có nội dung — khớp số mục trong bản copy.
export function countReportProjects(r: DailyReport): number {
  return (r.projects ?? []).filter((p) => p.name.trim() || p.body.trim()).length;
}

export interface ReportWeek {
  /** Thứ Hai của tuần (khoá nhóm). */
  start: string;
  /** 'dd/mm – dd/mm' từ ngày đầu tới ngày cuối CÓ báo cáo; 1 ngày thì 'dd/mm'. */
  range: string;
  /** Báo cáo trong tuần, mới nhất trước (giữ thứ tự đầu vào). */
  reports: DailyReport[];
}

// Gom báo cáo (đã sort mới nhất trước) theo tuần T2–CN; tuần mới nhất trước.
export function groupReportsByWeek(reports: DailyReport[]): ReportWeek[] {
  const map = new Map<string, DailyReport[]>();
  for (const r of reports) {
    const k = mondayOf(r.date);
    const arr = map.get(k);
    if (arr) arr.push(r);
    else map.set(k, [r]);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([start, rs]) => {
      const dates = rs.map((r) => r.date).sort();
      const first = formatDayMonth(dates[0]);
      const last = formatDayMonth(dates[dates.length - 1]);
      return { start, range: first === last ? first : `${first} – ${last}`, reports: rs };
    });
}

// Bỏ dấu + chữ thường để tìm "android" khớp "Android", "bao cao" khớp "báo cáo".
// (Export để danh sách Plan tuần tìm cùng luật.)
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase();
}

export type ReportQuery =
  | { kind: 'none' }
  | { kind: 'date'; d: number; m?: number; y?: number }
  | { kind: 'text'; text: string };

// Ô tìm: '28' / '28/10' / '28/10/2026' (hoặc 28-10, 28.10) → tìm theo ngày;
// còn lại → tìm chữ trong tiêu đề, tên dự án, nội dung.
export function parseReportQuery(q: string): ReportQuery {
  const s = q.trim();
  if (!s) return { kind: 'none' };
  const m = s.match(/^(\d{1,2})(?:[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?)?$/);
  if (m) {
    const y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : undefined;
    return { kind: 'date', d: Number(m[1]), m: m[2] ? Number(m[2]) : undefined, y };
  }
  return { kind: 'text', text: fold(s) };
}

export function matchReport(r: DailyReport, q: ReportQuery): boolean {
  if (q.kind === 'none') return true;
  if (q.kind === 'date') {
    const [y, m, d] = r.date.split('-').map(Number);
    return d === q.d && (q.m === undefined || m === q.m) && (q.y === undefined || y === q.y);
  }
  if (fold(r.title || '').includes(q.text)) return true;
  return (r.projects ?? []).some(
    (p) => fold(p.name).includes(q.text) || fold(p.body).includes(q.text),
  );
}
