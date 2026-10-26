// Tổng hợp bảng "Tổng kết KPI tháng" từ log của tất cả member (cấu trúc theo file
// Excel mẫu: mỗi member các đầu mục lớn nhóm theo mốc release (page Task) × giai đoạn, cột Tasks gộp
// '# feature' + '- task', Start/End/days, KPI nhóm = Σ điểm log, KPI tháng = 100 + Σ).
// Các hàm build là pure (test được); aggregate đọc sheet qua get() 1 lần, không subscribe.
import { fetchMonthSheet } from './kpiFetch';
import { v4 as uuidv4 } from 'uuid';
import { db } from './firebase';
import { totalWorkDays } from '../estTypes';
import { normName } from './pmText';
import {
  durationMin,
  fmtDelta,
  KPI_MONTH_BASE,
  leavePortionsOf,
  milestoneKeyOf,
  milestoneLabelOf,
  NO_MILESTONE,
  parseHm,
  totalOf,
  versionKey,
  type KpiEntry,
  type KpiEntryRel,
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

/** Các khoảng ngày CÓ LOG, nối qua T7/CN (nghỉ cuối tuần không cắt đôi 1 đợt làm
 *  việc). Ngày trống giữa tuần thì CẮT — đó mới là 2 đợt riêng. */
function spansOfDates(dates: string[]): { from: string; to: string }[] {
  const uniq = [...new Set(dates)].sort((a, b) => a.localeCompare(b));
  const runs: { from: string; to: string }[] = [];
  for (const d of uniq) {
    const last = runs[runs.length - 1];
    if (!last) {
      runs.push({ from: d, to: d });
      continue;
    }
    // Nhảy tối đa 3 bước, chỉ khi ngày nhảy qua là T7/CN.
    let cur = nextDay(last.to);
    let joined = false;
    for (let i = 0; i < 3; i++) {
      if (cur === d) {
        joined = true;
        break;
      }
      const dow = new Date(cur + 'T00:00:00').getDay();
      if (dow !== 0 && dow !== 6) break;
      cur = nextDay(cur);
    }
    if (joined) last.to = d;
    else runs.push({ from: d, to: d });
  }
  return runs;
}

/** '12/08–14/08 · 18/08 · 25/08–28/08'. */
const fmtSpans = (runs: { from: string; to: string }[]): string =>
  runs.map((r) => (r.from === r.to ? ddmm(r.from) : `${ddmm(r.from)}–${ddmm(r.to)}`)).join(' · ');

/** Giới hạn để cột Tasks là TỔNG HỢP, không phải liệt kê chi tiết. */
const BULLET_CAP = 3; // số việc liệt kê tối đa mỗi feature (nhóm thường)
const BULLET_MAX_LEN = 90; // cắt bullet dài
const KPI_NOTE_MAX_LEN = 80; // cắt lý do ± dài
const KPI_NOTE_CAP = 10; // số dòng lý do ± tối đa (đầu mục gộp nhiều đợt sẽ rất dài)

const truncateTo = (s: string, max: number): string =>
  s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;

const truncateLine = (s: string): string => truncateTo(s, BULLET_MAX_LEN);

/** Nhãn/nội dung có phải "ticket" không: có chữ ticket (chịu typo "ticker") HOẶC
 *  có dạng "#123". Member hay ghi số ticket vào cột Feature thay vì Task. */
const looksLikeTicket = (s: string): boolean =>
  /tick(et|er)/i.test(s) || /#\s*\d+/.test(s);

/** Số ticket trong 1 chuỗi: ưu tiên đếm số lần "#123" ("Ticket #116, #117, #112" = 3),
 *  không có dấu # thì đếm số ≥2 chữ số; là ticket nhưng không có số nào → 1.
 *  Không phải ticket → 0. */
const ticketCountIn = (s: string): number => {
  if (!looksLikeTicket(s)) return 0;
  const hashes = s.match(/#\s*\d+/g);
  if (hashes) return hashes.length;
  return Math.max(1, s.match(/\d{2,}/g)?.length ?? 0);
};

/** '3 ticket + 2 việc' / '3 ticket' / '2 việc'. */
const fixbugCountLabel = (tickets: number, others: number): string => {
  const parts: string[] = [];
  if (tickets > 0) parts.push(`${tickets} ticket`);
  if (others > 0) parts.push(`${others} việc`);
  return parts.join(' + ') || '0 việc';
};

/** Số nhóm feature liệt kê tối đa trong 1 đoạn (giữ nhóm nhiều việc nhất). */
const FEATURE_CAP = 8;

const isFixCategory = (c?: string): boolean => /fix|bug/i.test(c ?? '');

/** Khóa so trùng text (bỏ khác biệt hoa/thường + khoảng trắng thừa). */
const normKey = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Bỏ dấu gạch/bullet member tự gõ ở đầu ô Task — không thì bảng in ra '- - việc'. */
const stripBullet = (s: string): string => s.replace(/^\s*[-•*+]+\s*/, '').trim();

/** 1 nhóm feature trong đoạn: tên hiển thị + danh sách việc (đã bỏ trùng). */
interface FeatureBucket {
  label: string;
  lines: string[];
  seen: Set<string>;
}

/** Gom entries theo feature (key normalize hoa/thường), giữ thứ tự xuất hiện. */
function bucketsByFeature(list: KpiEntry[]): FeatureBucket[] {
  const map = new Map<string, FeatureBucket>();
  for (const e of list) {
    const label = (e.feature ?? '').trim();
    const t = stripBullet(e.task ?? '');
    if (!t) continue;
    const key = normKey(label);
    let b = map.get(key);
    if (!b) map.set(key, (b = { label, lines: [], seen: new Set() }));
    const tk = normKey(t);
    if (!b.seen.has(tk)) {
      b.seen.add(tk);
      b.lines.push(t);
    }
  }
  return [...map.values()];
}

/** Giữ tối đa FEATURE_CAP nhóm (ưu tiên nhóm NHIỀU việc nhất) nhưng in lại theo
 *  thứ tự xuất hiện — phần còn lại trả ở `dropped` để gom thành 1 dòng đếm. */
function capBuckets<T>(
  groups: T[],
  sizeOf: (g: T) => number,
): { keep: T[]; dropped: T[] } {
  if (groups.length <= FEATURE_CAP) return { keep: groups, dropped: [] };
  const top = new Set(
    [...groups].sort((a, b) => sizeOf(b) - sizeOf(a)).slice(0, FEATURE_CAP),
  );
  return {
    keep: groups.filter((g) => top.has(g)),
    dropped: groups.filter((g) => !top.has(g)),
  };
}

/** Độ dài tối đa của phần được coi là "tiền tố" (dài hơn = câu văn có dấu hai chấm). */
const PREFIX_MAX_LEN = 60;

/** 1 mục hiển thị sau khi gom tiền tố: `text` là dòng in ra, `weight` là SỐ VIỆC gốc
 *  mục đó đại diện (để dòng '… và N việc khác' đếm đúng theo việc, không theo mục). */
interface TaskItemLine {
  text: string;
  weight: number;
}

/**
 * Gom các việc CÙNG TIỀN TỐ (phần trước dấu ':' đầu tiên, tối đa PREFIX_MAX_LEN ký tự)
 * thành 1 mục: '- lock firebase event — 7 việc: show_ad_ev; consent_ev; …'.
 * Member hay log kiểu 'lock firebase event: <tên event>' mỗi event 1 dòng → gom lại
 * mới ra bản tổng hợp. Chỉ gom khi có ≥2 dòng cùng tiền tố; còn lại giữ nguyên văn.
 */
function groupByPrefix(lines: string[]): TaskItemLine[] {
  interface PrefixGroup {
    label: string;
    tails: string[];
    count: number;
  }
  const groups = new Map<string, PrefixGroup>();
  const order: (string | { solo: string })[] = [];
  for (const t of lines) {
    const i = t.indexOf(':');
    const label = i > 0 && i <= PREFIX_MAX_LEN ? t.slice(0, i).trim() : '';
    if (!label) {
      order.push({ solo: t });
      continue;
    }
    const key = normKey(label);
    let g = groups.get(key);
    if (!g) {
      groups.set(key, (g = { label, tails: [], count: 0 }));
      order.push(key);
    }
    g.count += 1;
    const tail = t.slice(i + 1).trim();
    if (tail) g.tails.push(tail);
  }

  const out: TaskItemLine[] = [];
  for (const o of order) {
    if (typeof o !== 'string') {
      out.push({ text: o.solo, weight: 1 });
      continue;
    }
    const g = groups.get(o)!;
    // Chỉ 1 dòng mang tiền tố này → giữ nguyên văn, không mất thông tin.
    if (g.count === 1) {
      out.push({ text: g.tails[0] ? `${g.label}: ${g.tails[0]}` : g.label, weight: 1 });
      continue;
    }
    const tails = g.tails.length > 0 ? `: ${g.tails.join('; ')}` : '';
    out.push({ text: `${g.label} — ${g.count} việc${tails}`, weight: g.count });
  }
  return out;
}

/** Ngưỡng gom theo tiền tố chung của TỪ: phải chung ≥3 từ VÀ ≥12 ký tự. Thấp hơn
 *  (VD 2 từ "update logic") thì tiền tố quá chung, gom nhầm các việc không liên quan. */
const WORD_PREFIX_MIN_WORDS = 3;
const WORD_PREFIX_MIN_LEN = 12;

/** Bỏ ký tự phân cách thừa ở hai đầu (tiền tố cắt giữa chừng hay dính ':', '-', ','). */
const trimSep = (s: string): string =>
  s.replace(/^[\s:,\-–—|]+/, '').replace(/[\s:,\-–—|]+$/, '');

/**
 * Tầng gom THỨ HAI: các mục chưa gom được ở `groupByPrefix` (tiền tố chung nằm
 * trước dấu '-', hoặc dấu ':' rơi vào giữa phần đuôi) được gom theo TIỀN TỐ CHUNG
 * CỦA TỪ — VD 5 dòng 'update logic realtime notifications - §3: …' → 1 mục.
 * Nhãn hiển thị là phần chung DÀI NHẤT của cả nhóm, không phải đúng 3 từ.
 */
function mergeByWordPrefix(items: TaskItemLine[]): TaskItemLine[] {
  // Nhóm ứng viên theo 3 từ đầu; chỉ xét mục chưa gom ở tầng 1 (weight === 1).
  const candidates = new Map<string, number[]>();
  items.forEach((it, i) => {
    if (it.weight !== 1) return;
    const words = normKey(it.text).split(' ');
    if (words.length <= WORD_PREFIX_MIN_WORDS) return;
    const key = words.slice(0, WORD_PREFIX_MIN_WORDS).join(' ');
    if (key.length < WORD_PREFIX_MIN_LEN) return;
    const g = candidates.get(key);
    if (g) g.push(i);
    else candidates.set(key, [i]);
  });

  const mergedAt = new Map<number, TaskItemLine>();
  const removed = new Set<number>();
  for (const idxs of candidates.values()) {
    if (idxs.length < 2) continue;
    const words = idxs.map((i) => items[i].text.split(/\s+/));
    // Số từ chung dài nhất của CẢ nhóm.
    let n = 0;
    while (
      n < words[0].length &&
      words.every((w) => w[n] !== undefined && normKey(w[n]) === normKey(words[0][n]))
    )
      n++;
    if (n < WORD_PREFIX_MIN_WORDS) continue;
    const label = trimSep(words[0].slice(0, n).join(' '));
    if (label.length < WORD_PREFIX_MIN_LEN) continue;
    const tails = words.map((w) => trimSep(w.slice(n).join(' '))).filter(Boolean);
    // Mọi đuôi rỗng = các dòng vốn giống nhau → gom cũng không thêm thông tin gì.
    if (tails.length === 0) continue;
    mergedAt.set(idxs[0], {
      text: `${label} — ${idxs.length} việc: ${tails.join('; ')}`,
      weight: idxs.length,
    });
    for (const i of idxs.slice(1)) removed.add(i);
  }
  if (mergedAt.size === 0) return items;

  // Giữ nguyên thứ tự xuất hiện: mục gom nằm ở vị trí dòng đầu tiên của nhóm.
  const out: TaskItemLine[] = [];
  items.forEach((it, i) => {
    if (removed.has(i)) return;
    out.push(mergedAt.get(i) ?? it);
  });
  return out;
}

/** '- Feature: việc' (feature trùng nội dung việc thì chỉ in việc — tránh lặp). */
const oneLineOf = (label: string, task: string): string =>
  label && normKey(label) !== normKey(task)
    ? `- ${truncateLine(`${label}: ${task}`)}`
    : `- ${truncateLine(task)}`;

/** Tổng hợp nhóm FIX BUGS: đếm ticket, không liệt kê từng item.
 *  - Mọi feature dạng ticket (member ghi "Ticket #107" vào cột Feature) gom đúng
 *    1 dòng '- Xử lý ticket — N ticket'.
 *  - Feature thật có ≥2 việc: mỗi feature 1 dòng đếm.
 *  - Feature thật chỉ 1 việc: gom chung 1 dòng liệt kê tên cho gọn. */
function fixbugText(buckets: FeatureBucket[]): string[] {
  let ticketTotal = 0;
  let ticketGroups = 0;
  const named: { label: string; tickets: number; others: number }[] = [];
  for (const b of buckets) {
    if (looksLikeTicket(b.label)) {
      // Ticket đã ghi ở Feature → đếm theo feature, KHÔNG cộng thêm từ task
      // (tránh nhân đôi khi cả hai cùng ghi số ticket).
      ticketGroups += 1;
      ticketTotal += ticketCountIn(b.label);
      continue;
    }
    let tickets = 0;
    let others = 0;
    for (const t of b.lines) {
      const n = ticketCountIn(t);
      if (n > 0) tickets += n;
      else others += 1;
    }
    named.push({ label: b.label, tickets, others });
  }

  const text: string[] = [];
  if (ticketGroups > 0) text.push(`- Xử lý ticket — ${ticketTotal} ticket`);

  // Nhóm chỉ có ĐÚNG 1 việc và không có ticket → gom 1 dòng liệt kê tên.
  const singles = named.filter((n) => n.tickets === 0 && n.others === 1 && n.label);
  const mains = named.filter((n) => !singles.includes(n));
  const { keep, dropped } = capBuckets(mains, (n) => n.tickets + n.others);
  for (const n of keep)
    text.push(`- ${n.label || 'Fix bugs chung'} — ${fixbugCountLabel(n.tickets, n.others)}`);
  if (dropped.length > 0) {
    const t = dropped.reduce((x, n) => x + n.tickets, 0);
    const o = dropped.reduce((x, n) => x + n.others, 0);
    text.push(
      truncateLine(
        `- … và ${fixbugCountLabel(t, o)} ở ${dropped.length} mục khác: ${dropped
          .map((n) => n.label || '(không tên)')
          .join(', ')}`,
      ),
    );
  }
  if (singles.length > 0)
    text.push(
      truncateLine(`- ${singles.map((n) => n.label).join(', ')} — ${singles.length} việc`),
    );
  return text;
}

/** Text tổng hợp phần CHỦ ĐẠO của đoạn (fix bugs đếm ticket / loại khác 3 bullet). */
function dominantText(list: KpiEntry[]): string[] {
  const buckets = bucketsByFeature(list);
  if (isFixCategory(list[0]?.category)) return fixbugText(buckets);

  const text: string[] = [];
  const { keep, dropped } = capBuckets(buckets, (b) => b.lines.length);
  for (const b of keep) {
    // Gom các việc cùng tiền tố trước, rồi mới cắt theo BULLET_CAP — 7 dòng
    // 'lock firebase event: …' chỉ tính là 1 mục. Hai tầng: theo dấu ':' rồi theo
    // tiền tố chung của từ (bắt các dòng phân cách bằng '-').
    const items = mergeByWordPrefix(groupByPrefix(b.lines));
    // Sau khi gom chỉ còn 1 mục → 1 dòng (thay vì '# Feature:' + '- việc').
    if (items.length === 1) {
      text.push(oneLineOf(b.label, items[0].text));
      continue;
    }
    // Tiêu đề nhóm đếm theo SỐ VIỆC GỐC (b.lines.length), không theo số mục.
    if (b.label)
      text.push(`# ${b.label}${b.lines.length > BULLET_CAP ? ` (${b.lines.length} việc)` : ''}:`);
    for (const it of items.slice(0, BULLET_CAP)) text.push(`- ${truncateLine(it.text)}`);
    if (items.length > BULLET_CAP) {
      const rest = items.slice(BULLET_CAP).reduce((x, it) => x + it.weight, 0);
      text.push(`- … và ${rest} việc khác`);
    }
  }
  if (dropped.length > 0) {
    const n = dropped.reduce((x, b) => x + b.lines.length, 0);
    text.push(
      truncateLine(
        `- … và ${n} việc ở ${dropped.length} mục khác: ${dropped
          .map((b) => b.label || '(không tên)')
          .join(', ')}`,
      ),
    );
  }
  return text;
}

/** Dựng 1 dòng đầu mục từ các dòng log của 1 nhóm (cùng mốc + giai đoạn, hoặc cùng
 *  project + giai đoạn khi không thuộc mốc). Ngày công truyền vào từ ngoài vì được
 *  quy đổi theo tỷ lệ giờ trên CẢ tháng của member. */
function rowFromGroup(
  list: KpiEntry[],
  scores: Record<string, KpiScore>,
  head: { category?: string; app?: string; milestone?: string; days: number },
): KpiSummaryRow {
  const all = [...list].sort(byTime);
  const text = dominantText(all);

  // Lý do ±: mỗi dòng log điểm ≠ 0 một dòng (lý do leader ghi, không có thì text task).
  const notes: string[] = [];
  for (const e of all) {
    const s = scores[e.id];
    const d = s ? s.delta : typeof e.selfDelta === 'number' ? e.selfDelta : 0;
    if (d === 0) continue;
    const why = (s?.reason ?? '').trim() || (e.task ?? '').trim();
    notes.push(why ? `${fmtDelta(d)} — ${truncateTo(why, KPI_NOTE_MAX_LEN)}` : fmtDelta(d));
  }

  // Các đợt có log (nối qua T7/CN) — chỉ hiện khi có >1 đợt.
  const runs = spansOfDates(all.map((e) => e.date));
  const delta = totalOf(all, scores).delta;
  return {
    id: uuidv4(),
    order: 0, // gán lại sau theo thứ tự nhóm
    start: all[0].date,
    end: all[all.length - 1].date,
    days: head.days,
    ...(runs.length > 1 ? { spans: fmtSpans(runs) } : {}),
    tasks: text.join('\n') || undefined,
    category: head.category || undefined,
    app: head.app || undefined,
    milestone: head.milestone || undefined,
    kpi: delta !== 0 ? fmtDelta(delta) : undefined,
    kpiNote:
      (notes.length > KPI_NOTE_CAP
        ? [...notes.slice(0, KPI_NOTE_CAP), `… và ${notes.length - KPI_NOTE_CAP} mục nữa`]
        : notes
      ).join('\n') || undefined,
  };
}

const byTime = (a: KpiEntry, b: KpiEntry): number =>
  a.date.localeCompare(b.date) ||
  (parseHm(a.start) ?? 0) - (parseHm(b.start) ?? 0) ||
  a.createdAt.localeCompare(b.createdAt);

/** Dữ liệu page Task của leader để khớp mốc của dòng log về task thật. */
export interface SummaryTaskContext {
  apps: { id: string; name: string }[];
  tasks: { id: string; appId?: string; title: string; version?: string }[];
}

/** Mốc đã khớp của 1 dòng log. */
interface ResolvedMs {
  key: string;
  label: string;
  appId: string;
}

/** Hậu tố gắn vào cột Mốc khi nhãn của log không khớp được task nào trên page Task. */
export const UNLINKED_SUFFIX = ' (chưa liên kết)';

/**
 * Bộ khớp mốc dòng log → mốc trên page Task, theo thứ tự:
 * 1. rel.taskId còn tồn tại → mốc của task đó (tên app + version HIỆN TẠI).
 * 2. rel.appId + rel.version (task đã bị xóa) → mốc app + version.
 * 3. Log cũ chỉ có nhãn: trùng nhãn hiện tại 'App vX'; không trùng (app đã đổi tên)
 *    → tìm task cùng version trong các app được gán của member; có cả iOS lẫn Android
 *    thì chọn theo chữ 'iOS' trong nhãn; vẫn nhiều app → không khớp.
 */
function milestoneResolver(ctx: SummaryTaskContext, assignedAppIds: string[]) {
  const appName = new Map(ctx.apps.map((a) => [a.id, a.name]));
  const tasks = ctx.tasks.filter(
    (t): t is { id: string; appId: string; title: string; version?: string } =>
      !!t.appId && appName.has(t.appId),
  );
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const msOfTask = (t: { id: string; appId: string; title: string; version?: string }): ResolvedMs => ({
    key: milestoneKeyOf(t),
    label: milestoneLabelOf({ ...t, appName: appName.get(t.appId)! }),
    appId: t.appId,
  });
  const byLabel = new Map<string, ResolvedMs>();
  for (const t of tasks) {
    const ms = msOfTask(t);
    if (!byLabel.has(normKey(ms.label))) byLabel.set(normKey(ms.label), ms);
  }
  const assigned = new Set(assignedAppIds);

  return (rel: KpiEntryRel): ResolvedMs | null => {
    const t = rel.taskId ? taskById.get(rel.taskId) : undefined;
    if (t) return msOfTask(t);
    if (rel.appId && appName.has(rel.appId) && versionKey(rel.version)) {
      return {
        key: `v:${rel.appId}|${versionKey(rel.version)}`,
        label: `${appName.get(rel.appId)} ${rel.version!.trim()}`,
        appId: rel.appId,
      };
    }
    const exact = byLabel.get(normKey(rel.label));
    if (exact) return exact;
    const ver = rel.label.match(/\bv\d+(?:\.\d+)+\b/i)?.[0];
    if (!ver) return null;
    let hits = tasks.filter((x) => assigned.has(x.appId) && versionKey(x.version) === versionKey(ver));
    // Nhiều app cùng version: ưu tiên app có tên nằm trong nhãn ('QRCode - Release v1.64'),
    // rồi tới chữ 'iOS' (bản iOS/Android cùng tên gốc đã đổi tên).
    const narrow = (keep: (appId: string) => boolean) => {
      if (new Set(hits.map((x) => x.appId)).size <= 1) return;
      const f = hits.filter((x) => keep(x.appId));
      if (f.length > 0) hits = f;
    };
    narrow((id) => normName(rel.label).includes(normName(appName.get(id)!)));
    narrow((id) => /ios/i.test(appName.get(id)!) === /ios/i.test(rel.label));
    return new Set(hits.map((x) => x.appId)).size === 1 ? msOfTask(hits[0]) : null;
  };
}

/**
 * Gom entries 1 tháng của 1 member thành các đầu mục theo MỐC của TỪNG dòng log
 * (mục tiêu: gom trọn task member log theo mốc release đặt cho dự án ở page Task):
 * - Dòng có mốc khớp page Task → nhóm (mốc × giai đoạn); cột App/Mốc lấy tên app +
 *   version HIỆN TẠI (đổi tên app không làm tách nhóm).
 * - "Không thuộc mốc" / chưa chọn mốc (log trước 04/09/2026) → nhóm (project × giai
 *   đoạn). Tên project cũ được quy về app hiện tại nếu đa số dòng cùng tên đó đã khớp
 *   mốc của 1 app (VD 'AppLock' → 'AppLock2').
 * - Nhãn mốc không khớp task nào → nhóm theo nhãn × giai đoạn, cột Mốc ghi kèm
 *   "(chưa liên kết)".
 * Ngày công = quy đổi theo TỶ LỆ GIỜ trong từng ngày T2–T6 (sáng mốc A, chiều mốc B →
 * mỗi mốc 0.5 ngày), nên tổng cột Ngày = số ngày làm việc có log, không đếm trùng.
 * Thứ tự: mốc theo dòng log đầu tiên của mốc; các giai đoạn của cùng mốc đứng liền nhau.
 */
export function buildMemberRows(
  entries: KpiEntry[],
  scores: Record<string, KpiScore>,
  ctx: SummaryTaskContext = { apps: [], tasks: [] },
  assignedAppIds: string[] = [],
): KpiSummaryRow[] {
  const sorted = [...entries].sort(byTime);
  const resolve = milestoneResolver(ctx, assignedAppIds);
  const appName = new Map(ctx.apps.map((a) => [a.id, a.name]));
  const appIdByName = new Map(ctx.apps.map((a) => [normKey(a.name), a.id]));

  // Lượt 1: khớp mốc từng dòng + học tên project cũ → app (theo dòng đã khớp mốc).
  const resolved = new Map<string, ResolvedMs | null>();
  const votes = new Map<string, Map<string, number>>();
  for (const e of sorted) {
    const rel = e.rel?.label && e.rel.label !== NO_MILESTONE ? e.rel : undefined;
    const ms = rel ? resolve(rel) : null;
    resolved.set(e.id, ms);
    const p = normKey(e.project ?? '');
    if (ms && p && !appIdByName.has(p)) {
      const v = votes.get(p) ?? new Map<string, number>();
      v.set(ms.appId, (v.get(ms.appId) ?? 0) + 1);
      votes.set(p, v);
    }
  }
  const aliasOf = (p: string): string | undefined => {
    const v = votes.get(p);
    if (!v) return undefined;
    const total = [...v.values()].reduce((s, n) => s + n, 0);
    const [best, n] = [...v.entries()].sort((a, b) => b[1] - a[1])[0];
    return n * 2 > total ? best : undefined; // đa số tuyệt đối
  };
  /** App của dòng log: appId lưu kèm → tên trùng app hiện tại → tên cũ đã học. */
  const appOf = (e: KpiEntry): { key: string; name: string } => {
    const raw = (e.project ?? '').trim();
    const id =
      (e.appId && appName.has(e.appId) ? e.appId : undefined) ??
      appIdByName.get(normKey(raw)) ??
      aliasOf(normKey(raw));
    return id ? { key: `a:${id}`, name: appName.get(id)! } : { key: `p:${normKey(raw)}`, name: raw };
  };

  // Lượt 2: chia nhóm.
  interface Group {
    head: { category?: string; app?: string; milestone?: string };
    /** Khóa mốc (không kèm giai đoạn) — các giai đoạn của cùng mốc đứng liền nhau. */
    msKey: string;
    entries: KpiEntry[];
  }
  const groups = new Map<string, Group>();
  const msOrder = new Map<string, number>();
  for (const e of sorted) {
    const cat = (e.category ?? '').trim();
    const ms = resolved.get(e.id);
    let msKey: string;
    let head: Group['head'];
    if (ms) {
      msKey = `ms:${ms.key}`;
      head = { category: cat, app: appName.get(ms.appId), milestone: ms.label };
    } else {
      const app = appOf(e);
      const label = e.rel?.label?.trim() ?? '';
      if (label && label !== NO_MILESTONE) {
        msKey = `lbl:${normKey(label)}`;
        head = { category: cat, app: app.name, milestone: `${label}${UNLINKED_SUFFIX}` };
      } else {
        // "Không thuộc mốc" và log chưa có mốc gom chung theo project × giai đoạn.
        msKey = `none:${app.key}`;
        head = { category: cat, app: app.name, milestone: label || undefined };
      }
    }
    if (!msOrder.has(msKey)) msOrder.set(msKey, msOrder.size);
    const gk = `${msKey}|${normKey(cat)}`;
    const g = groups.get(gk);
    if (g) g.entries.push(e);
    else groups.set(gk, { head, msKey, entries: [e] });
  }

  // Ngày công quy đổi: phần của nhóm trong 1 ngày = phút của nhóm / phút cả ngày
  // (ngày không có giờ hợp lệ → chia theo số dòng). Chỉ tính T2–T6 như trước.
  const dayMin = new Map<string, { min: number; count: number }>();
  for (const e of sorted) {
    const d = dayMin.get(e.date) ?? { min: 0, count: 0 };
    d.min += durationMin(e) ?? 0;
    d.count += 1;
    dayMin.set(e.date, d);
  }
  const isWeekday = (iso: string): boolean => {
    const dow = new Date(iso + 'T00:00:00').getDay();
    return dow !== 0 && dow !== 6;
  };
  const daysOf = (list: KpiEntry[]): number => {
    let sum = 0;
    for (const e of list) {
      if (!isWeekday(e.date)) continue;
      const d = dayMin.get(e.date)!;
      sum += d.min > 0 ? (durationMin(e) ?? 0) / d.min : 1 / d.count;
    }
    return Number(sum.toFixed(1));
  };

  // Mốc theo lần log đầu tiên; trong 1 mốc, giai đoạn theo lần log đầu tiên (sort ổn định).
  const rows = [...groups.values()]
    .sort((a, b) => msOrder.get(a.msKey)! - msOrder.get(b.msKey)!)
    .map((g) => rowFromGroup(g.entries, scores, { ...g.head, days: daysOf(g.entries) }));
  rows.forEach((r, i) => {
    r.order = i;
  });
  return rows;
}

/**
 * Đọc sheet KPI của từng member (get 1 lần) và dựng khối tổng kết tháng.
 * Chỉ đưa vào member có log HOẶC có nghỉ phép trong tháng.
 * `ctx` = app + task hiện tại của leader để khớp mốc về page Task.
 */
export async function aggregateKpiSummaryMembers(
  members: KpiMember[],
  monthKey: string,
  ctx: SummaryTaskContext,
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
          rows: buildMemberRows(monthEntries, scores, ctx, m.projectIds ?? []),
        });
      } catch {
        // Sheet lỗi/bị xóa — bỏ qua member đó.
      }
    }),
  );
  // Promise.all không đảm bảo thứ tự push → sort lại theo thứ tự member.
  return out.sort((a, b) => a.order - b.order);
}

// ---------- Tối ưu bảng ĐÃ tổng hợp (nút 🧹 trên trang tổng kết) ----------
// Khác `buildMemberRows` ở chỗ nguồn là CÁC DÒNG TRONG BẢNG (leader đã sửa tay, bổ
// sung mốc release) chứ không phải log KPI — dùng khi tổng hợp xong mới điền mốc,
// các dòng lẽ ra thuộc cùng 1 mốc đang nằm rời.

/** 'dd/mm' + năm → ISO; sai định dạng → null. */
function parseDdmm(s: string, year: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** Liệt kê các ngày trong [from, to] (đã chặn trên để không loop vô hạn). */
function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let d = from;
  for (let i = 0; i < 400 && d <= to; i++) {
    out.push(d);
    d = nextDay(d);
  }
  return out;
}

/** Tập ngày 1 dòng bảng chiếm: ưu tiên cột ⏱ spans (chính xác từng đợt), không có
 *  thì lấy nguyên khoảng Start–End. Thiếu Start → không đóng góp ngày nào. */
function datesOfRow(r: KpiSummaryRow): string[] {
  if (!r.start) return [];
  const year = r.start.slice(0, 4);
  if (r.spans?.trim()) {
    const out: string[] = [];
    let ok = true;
    for (const part of r.spans.split('·')) {
      const seg = part.trim();
      if (!seg) continue;
      const [a, b] = seg.split(/[–—-]/).map((x) => x.trim());
      const from = parseDdmm(a ?? '', year);
      const to = b ? parseDdmm(b, year) : from;
      if (!from || !to) {
        ok = false;
        break;
      }
      out.push(...daysBetween(from, to));
    }
    // spans đọc được thì dùng; hỏng định dạng (leader sửa tay) → fallback Start–End.
    if (ok && out.length > 0) return out;
  }
  return daysBetween(r.start, r.end && r.end >= r.start ? r.end : r.start);
}

/** '+2' / '−0.5' / '-1' → số; không phải số → null (giữ nguyên text, không cộng bừa). */
export function parseDelta(s?: string): number | null {
  const t = (s ?? '').trim().replace('−', '-').replace('+', '');
  if (!t) return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Nối text nhiều dòng của các ô, bỏ dòng TRÙNG (không phân biệt hoa/thường). */
function uniqLines(values: (string | undefined)[]): string | undefined {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    for (const line of (v ?? '').split('\n')) {
      const t = line.trimEnd();
      if (!t.trim()) continue;
      const k = normKey(t);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t);
    }
  }
  return out.length > 0 ? out.join('\n') : undefined;
}

/**
 * Gộp các dòng CÙNG (App | Giai đoạn | Mốc) của 1 member — đúng khóa mà bước tổng
 * hợp dùng. Dòng trống cả App lẫn Giai đoạn (leader tự thêm để ghi chú) KHÔNG gộp.
 * Idempotent: chạy lần 2 không đổi gì.
 */
export function optimizeSummaryRows(rows: KpiSummaryRow[]): KpiSummaryRow[] {
  const groups = new Map<string, KpiSummaryRow[]>();
  const order: string[] = [];
  rows.forEach((r, i) => {
    const app = (r.app ?? '').trim();
    const cat = (r.category ?? '').trim();
    // Không có App lẫn Giai đoạn → dòng ghi chú, giữ riêng (khóa theo vị trí).
    const key =
      app || cat
        ? `${normKey(app)}|${normKey(cat)}|${normKey(r.milestone ?? '')}`
        : `__solo_${i}`;
    let g = groups.get(key);
    if (!g) {
      groups.set(key, (g = []));
      order.push(key);
    }
    g.push(r);
  });

  return order.map((key, idx) => {
    const g = groups.get(key)!;
    return g.length === 1 ? { ...g[0], order: idx } : { ...mergeSummaryRows(g), order: idx };
  });
}

/**
 * Gộp nhiều dòng bảng tổng kết thành 1 (dùng chung cho Tối ưu bảng và dialog Gộp tay):
 * - Giai đoạn/App/Mốc: của dòng NHIỀU NGÀY nhất (hòa → dòng đứng trước).
 * - Start/End: sớm nhất/muộn nhất; đợt = hợp tập ngày các dòng (nối qua T7/CN).
 * - Ngày: min(Σ Ngày các dòng, ngày công của hợp các đợt) — Ngày giờ là quy đổi theo tỷ
 *   lệ giờ nên Σ mới đúng; min chặn đếm trùng khi các dòng chồng ngày. Có dòng chưa có
 *   Ngày → dùng hợp các đợt.
 * - Tasks/Tiến độ/Lý do ±: nối theo thứ tự dòng, bỏ dòng trùng.
 * - KPI: cộng được thì cộng, có ô gõ tay không phải số thì nối bằng ' · '.
 * Giữ id + order của dòng đầu tiên.
 */
export function mergeSummaryRows(g: KpiSummaryRow[]): KpiSummaryRow {
  const first = g[0];
  const head = g.reduce((best, r) => ((r.days ?? 0) > (best.days ?? 0) ? r : best), first);

  const dates = g.flatMap(datesOfRow);
  const runs = spansOfDates(dates);
  const starts = g.map((r) => r.start).filter((d): d is string => !!d);
  const ends = g.map((r) => r.end || r.start).filter((d): d is string => !!d);
  const start = starts.length > 0 ? starts.sort((a, b) => a.localeCompare(b))[0] : undefined;
  const end = ends.length > 0 ? ends.sort((a, b) => b.localeCompare(a))[0] : undefined;
  const unionDays = runs.reduce((s, r) => s + (totalWorkDays(r.from, r.to, 0) ?? 0), 0);
  const sumDays = g.reduce((s, r) => s + (typeof r.days === 'number' ? r.days : 0), 0);
  const allHaveDays = g.every((r) => typeof r.days === 'number');
  const days = Number(
    (runs.length === 0 ? sumDays : allHaveDays ? Math.min(sumDays, unionDays) : unionDays).toFixed(1),
  );

  const deltas = g.map((r) => parseDelta(r.kpi));
  const kpi = deltas.every((d) => d !== null)
    ? (() => {
        const sum = Number((deltas as number[]).reduce((s, d) => s + d, 0).toFixed(2));
        return sum !== 0 ? fmtDelta(sum) : undefined;
      })()
    : g
        .map((r) => (r.kpi ?? '').trim())
        .filter(Boolean)
        .join(' · ') || undefined;

  return {
    id: first.id,
    order: first.order,
    category: head.category,
    app: head.app,
    milestone: head.milestone,
    tasks: uniqLines(g.map((r) => r.tasks)),
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
    ...(days > 0 ? { days } : {}),
    ...(runs.length > 1 ? { spans: fmtSpans(runs) } : {}),
    progress: uniqLines(g.map((r) => r.progress)),
    kpi,
    kpiNote: uniqLines(g.map((r) => r.kpiNote)),
  };
}

/** Áp `optimizeSummaryRows` cho mọi member; trả kèm số dòng trước/sau để báo UI. */
export function optimizeSummaryMembers(members: KpiSummaryMember[]): {
  members: KpiSummaryMember[];
  before: number;
  after: number;
} {
  let before = 0;
  let after = 0;
  const out = members.map((m) => {
    const rows = optimizeSummaryRows(m.rows ?? []);
    before += (m.rows ?? []).length;
    after += rows.length;
    return { ...m, rows };
  });
  return { members: out, before, after };
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
      ...(r.spans?.trim() ? { spans: r.spans.trim() } : {}),
      ...(r.progress?.trim() ? { progress: r.progress } : {}),
      ...(r.kpi?.trim() ? { kpi: r.kpi.trim() } : {}),
      ...(r.kpiNote?.trim() ? { kpiNote: r.kpiNote } : {}),
    })),
  }));
}

// ---------- Hiển thị (trang Tổng kết + trang share) ----------

/** Số ± để hiển thị: '+2', '−0.5' (dấu trừ chuẩn), '0'. Làm tròn 2 chữ số. */
export function fmtSigned(n: number): string {
  const r = Number(n.toFixed(2));
  if (r > 0) return `+${r}`;
  if (r < 0) return `−${Math.abs(r)}`;
  return '0';
}

/** Lớp màu cho số ± của dòng / lý do. */
export function pmClass(n: number): 'pos' | 'neg' | 'zero' {
  return n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero';
}

/** 1 lý do cộng/trừ điểm tách từ kpiNote. `value` null = dòng không theo dạng '±x — lý do'. */
export interface KpiReason {
  value: number | null;
  text: string;
}

/**
 * Tách kpiNote (mỗi dòng 1 lý do, dạng '+1 — Vượt tiến độ' hoặc chỉ '-0.5') thành danh
 * sách. Dòng không theo dạng đó (VD '… và 3 mục nữa', hoặc leader gõ tay tự do) vẫn giữ
 * nguyên chữ, value = null để UI hiện dấu '•'.
 */
export function parseKpiReasons(note?: string): KpiReason[] {
  if (!note) return [];
  return note
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^([+\-−]?\d+(?:\.\d+)?)\s*(?:—\s*(.*))?$/);
      if (!m) return { value: null, text: l };
      return { value: Number(m[1].replace('−', '-')), text: (m[2] ?? '').trim() };
    });
}

/**
 * Σ ± các dòng của 1 khối. Có ô KPI không phải số (sau khi gộp/gõ tay) → null: không
 * tính được nên KHÔNG so lệch với KPI tháng (tránh cảnh báo sai).
 */
export function sumRowKpi(rows: KpiSummaryRow[]): number | null {
  let sum = 0;
  for (const r of rows) {
    const d = parseDelta(r.kpi);
    if (d === null) return null;
    sum += d;
  }
  return Number(sum.toFixed(2));
}

/** KPI tháng lệch 100 + Σ ± dòng → trả giá trị kỳ vọng để hiện cảnh báo; khớp/không tính được → null. */
export function kpiScoreMismatch(m: KpiSummaryMember): number | null {
  const sum = sumRowKpi(m.rows ?? []);
  if (sum === null) return null;
  const expected = Number((KPI_MONTH_BASE + sum).toFixed(2));
  return Math.abs(m.kpiScore - expected) > 0.005 ? expected : null;
}

/** Xem trước 🧹 Tối ưu: số dòng trước/sau của từng khối (chỉ khối có gộp) + tổng. */
export function optimizePreviewByMember(members: KpiSummaryMember[]): {
  members: KpiSummaryMember[];
  before: number;
  after: number;
  changed: { memberId: string; name: string; before: number; after: number }[];
} {
  const res = optimizeSummaryMembers(members);
  const changed = members
    .map((m, i) => ({
      memberId: m.memberId,
      name: m.name,
      before: (m.rows ?? []).length,
      after: res.members[i].rows.length,
    }))
    .filter((x) => x.after !== x.before);
  return { ...res, changed };
}

/** Số liệu cho 4 ô tổng quan ở trang share. */
export function summaryStats(members: KpiSummaryMember[]) {
  const scores = members.map((m) => m.kpiScore);
  const n = scores.length;
  const avg = n ? Number((scores.reduce((s, x) => s + x, 0) / n).toFixed(1)) : 0;
  return {
    members: n,
    withReasons: members.filter((m) =>
      (m.rows ?? []).some((r) => parseKpiReasons(r.kpiNote).length > 0),
    ).length,
    avg,
    min: n ? Math.min(...scores) : 0,
    max: n ? Math.max(...scores) : 0,
    pos: scores.filter((s) => s > KPI_MONTH_BASE).length,
    base: scores.filter((s) => s === KPI_MONTH_BASE).length,
    neg: scores.filter((s) => s < KPI_MONTH_BASE).length,
    rows: members.reduce((s, m) => s + (m.rows ?? []).length, 0),
    days: Number(
      members
        .reduce(
          (s, m) =>
            s + (m.rows ?? []).reduce((a, r) => a + (typeof r.days === 'number' ? r.days : 0), 0),
          0,
        )
        .toFixed(2),
    ),
  };
}

/** ISO → 'HH:mm · dd/mm/yyyy' (giờ máy người xem); ISO lỗi → ''. */
export function fmtDateTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())} · ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}
