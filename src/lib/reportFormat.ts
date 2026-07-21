// Tiện ích cho "Báo cáo ngày": số La Mã, định dạng ngày, tách dòng theo marker,
// và dựng lại đúng text báo cáo để copy/paste ra ngoài.
import type { DailyReport } from '../pmTypes';

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
}

// Tách 1 khối body thành các dòng đã phân loại theo marker (bỏ dòng trống).
export function parseBody(body: string): ReportLine[] {
  const out: ReportLine[] = [];
  for (const raw of (body ?? '').split('\n')) {
    const s = raw.trim();
    if (!s) continue;
    if (s.startsWith('#')) out.push({ kind: 'section', text: s.replace(/^#+\s*/, '') });
    else if (s.startsWith('->'))
      out.push({ kind: 'arrow', text: s.replace(/^->\s*/, '') });
    else if (s.startsWith('+')) out.push({ kind: 'sub', text: s.replace(/^\+\s*/, '') });
    else if (s.startsWith('-'))
      out.push({ kind: 'bullet', text: s.replace(/^-\s*/, '') });
    else out.push({ kind: 'text', text: s });
  }
  return out;
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
