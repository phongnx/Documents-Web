// Tính tiến độ tuần từ Plan tuần + gợi ý trạng thái từ Báo cáo ngày.
import {
  isGoalWs,
  isReleaseWs,
  workstreamPct,
  type DailyReport,
  type PlanProject,
  type PlanWorkstream,
  type ReportProject,
  type WeeklyPlan,
  type WorkstreamState,
} from '../pmTypes';
import { formatDateVi, parseBody } from './reportFormat';
import { normName as norm } from './pmText';
import { weekdayVN } from './pmDates';

// Re-export để các nơi đang import từ đây không phải đổi (nguồn thật ở pmTypes).
export { isGoalWs, isReleaseWs };

// Chọn plan của tuần hiện tại; không có → plan mới nhất (đánh dấu isCurrent=false).
export function pickCurrentPlan(
  plans: WeeklyPlan[],
  today: string,
): { plan: WeeklyPlan; isCurrent: boolean } | null {
  const cur = plans.find((p) => p.weekStart <= today && today <= p.weekEnd);
  if (cur) return { plan: cur, isCurrent: true };
  if (plans.length === 0) return null;
  // `plans` đã sort mới nhất trước ở context.
  return { plan: plans[0], isCurrent: false };
}

// MỌI báo cáo nằm trong khoảng tuần của plan, sắp theo ngày TĂNG dần.
// (Sync tổng hợp cả tuần — mốc done báo giữa tuần không bị mất khi các ngày sau vắng mặt.)
export function reportsInWeek(reports: DailyReport[], plan: WeeklyPlan): DailyReport[] {
  return reports
    .filter((r) => r.date >= plan.weekStart && r.date <= plan.weekEnd)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface WsRef {
  pi: number;
  wi: number;
  project: string;
  w: PlanWorkstream;
  pct: number;
}
export interface PlanProgress {
  total: number;
  /** % tuần = số mục tiêu ĐẠT (Xong) / tổng mục tiêu × 100. */
  overallPct: number;
  counts: Record<WorkstreamState, number>;
  all: WsRef[];
  /** Mục tiêu tuần (release + nhánh có milestone). */
  goals: WsRef[];
  goalDone: number;
  goalTotal: number;
}

// Tổng hợp tiến độ toàn plan (tiến độ tuần đo theo MỤC TIÊU tuần, binary Xong).
export function planProgress(
  plan: WeeklyPlan,
  releaseKeys: Set<string> = new Set(['release']),
): PlanProgress {
  const all: WsRef[] = [];
  const counts: Record<WorkstreamState, number> = {
    todo: 0,
    doing: 0,
    testing: 0,
    done: 0,
    blocked: 0,
  };
  (plan.projects ?? []).forEach((pr, pi) => {
    (pr.workstreams ?? []).forEach((w, wi) => {
      all.push({ pi, wi, project: pr.name, w, pct: workstreamPct(w) });
      counts[w.state ?? 'todo'] += 1;
    });
  });
  const total = all.length;
  const goals = all.filter((r) => isGoalWs(r.w, releaseKeys));
  const goalDone = goals.filter((r) => (r.w.state ?? 'todo') === 'done').length;
  const goalTotal = goals.length;
  const overallPct = goalTotal === 0 ? 0 : Math.round((goalDone / goalTotal) * 100);
  return { total, overallPct, counts, all, goals, goalDone, goalTotal };
}

export interface StateSuggestion {
  pi: number;
  wi: number;
  project: string;
  wsTitle: string;
  state: WorkstreamState;
  progress?: number;
  /** State hiện tại (để chỉ đề xuất khi khác). */
  from: WorkstreamState;
  /** Ngày báo cáo là nguồn của trạng thái gợi ý (hiển thị trong dialog confirm). */
  date?: string;
}

// Hai chuỗi (đã norm) coi là "khớp milestone" nếu chứa nhau hoặc chung tiền tố ≥6 ký tự.
function looseMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i >= 6;
}

// Hạng trạng thái để áp dụng luật "không hạ cấp" (blocked coi như thấp nhất, có thể được gỡ).
const STATE_RANK: Record<WorkstreamState, number> = {
  blocked: 0,
  todo: 0,
  doing: 1,
  testing: 2,
  done: 3,
};

// ---- Các tín hiệu suy trạng thái (nguồn duy nhất cho luật sync) ----
const PENDING_RE =
  /(tester|đang check|đang test|đang fix|chưa|pending|review|đang chờ|waiting)/;
const DONE_RE =
  /(hoàn thành|hoàn tất|đã xong|\bxong\b|\bdone\b|đã release|đã build xong|release thành công|đã lên store|đã submit|đã publish|✅)/;
const RELEASE_KW_RE = /(release|build|submit|publish|store|phát hành|lên store)/;
// Cụm ép coi là ĐANG TEST: "fix bug(s) phát sinh" hoặc "build test".
const FORCE_TEST_RE = /(fix\s*bugs?\s*phát\s*sinh|build\s*test)/;

// Mọi % trong đoạn text (0–100), kể cả dạng "(100)" thiếu dấu % hay gặp trong báo cáo.
function pctsOf(t: string): number[] {
  return [
    ...[...t.matchAll(/(\d{1,3})\s*%/g)].map((m) => Number(m[1])),
    ...[...t.matchAll(/\((\d{1,3})\)/g)].map((m) => Number(m[1])),
  ].filter((n) => n >= 0 && n <= 100);
}

// Nối plan-project ↔ report-project. Đã gắn app → CHỈ khớp appId hoặc tên chính xác
// (bỏ khớp "chứa nhau" để không dính app tên gần giống: WF3 vs WF3_Radar, Music1 vs Music2).
// Chưa gắn app → khớp tên chính xác rồi mới tới chứa nhau (như cũ).
function matchReportProject(pr: PlanProject, report: DailyReport): ReportProject | null {
  const rps = report.projects ?? [];
  if (pr.appId) {
    return (
      rps.find((x) => x.appId === pr.appId) ??
      rps.find((x) => norm(x.name) === norm(pr.name)) ??
      null
    );
  }
  return (
    rps.find((x) => norm(x.name) === norm(pr.name)) ??
    rps.find((x) => norm(x.name).includes(norm(pr.name)) && norm(pr.name).length > 0) ??
    null
  );
}

// Suy {state, pct} cho 1 nhánh từ 1 report-project; null nếu report không nhắc tới nhánh.
// Luật done STRICT theo TỪNG DÒNG MỐC: nhánh có milestone chỉ nhận done trên dòng '->'
// (khớp milestone/chứa từ khóa release) có done-token/100% và KHÔNG pending ngay trên dòng.
// Done trên dòng mốc THẮNG forceTest/pending ở các dòng khác (VD "- Fix bugs phát sinh"
// đi kèm "-> Build release v1.0 (DONE)" phải ra done, không phải testing).
function inferWorkstream(
  w: PlanWorkstream,
  singleWs: boolean,
  rp: ReportProject,
): { state: WorkstreamState; pct?: number } | null {
  const lines = parseBody(rp.body);
  const allArrows = lines.filter((l) => l.kind === 'arrow');
  const contentLines = lines.filter((l) => l.kind !== 'section');

  // Dòng liên quan tới nhánh: 1-nhánh → cả body; nhiều-nhánh → theo section khớp title.
  let relevant: { kind: string; text: string }[];
  if (singleWs) {
    relevant = contentLines;
  } else {
    const wsKey = norm(w.title);
    let active = false;
    const chunk: { kind: string; text: string }[] = [];
    for (const ln of lines) {
      if (ln.kind === 'section') {
        const sk = norm(ln.text);
        active = wsKey.length > 0 && (sk.includes(wsKey) || wsKey.includes(sk));
        continue;
      }
      if (active) chunk.push(ln);
    }
    relevant = chunk;
  }

  // Bổ sung các dòng '->' toàn project khớp milestone.text (nếu nhánh có milestone).
  const msLines: { kind: string; text: string }[] = [];
  if (w.milestone) {
    const mKey = norm(w.milestone.text);
    for (const a of allArrows) {
      if (looseMatch(norm(a.text), mKey) && !relevant.includes(a)) msLines.push(a);
    }
  }
  const consider = [...relevant, ...msLines];
  if (consider.length === 0) return null;

  const hasMs = !!w.milestone;
  const text = consider.map((l) => l.text).join('\n').toLowerCase();

  // "Dòng mốc": nhánh có milestone → CHỈ dòng '->' (không lấy done từ % trên bullet
  // task lẻ kiểu "- Build test cases (100%)"); nhánh thường → mọi dòng liên quan.
  const goalLines = hasMs
    ? consider.filter(
        (l) =>
          l.kind === 'arrow' &&
          (RELEASE_KW_RE.test(l.text.toLowerCase()) ||
            looseMatch(norm(l.text), norm(w.milestone!.text))),
      )
    : consider;
  const lineDone = goalLines.some((l) => {
    const lt = l.text.toLowerCase();
    if (PENDING_RE.test(lt)) return false; // "(tester đang check confirm)" cùng dòng → chưa done
    return DONE_RE.test(lt) || pctsOf(lt).some((p) => p >= 100);
  });

  const pending = PENDING_RE.test(text);
  const forceTest = FORCE_TEST_RE.test(text);
  const hasBuildArrow = consider.some(
    (l) =>
      l.kind === 'arrow' && /(release|build|submit|publish|store)/.test(l.text.toLowerCase()),
  );

  let state: WorkstreamState;
  if (lineDone) state = 'done';
  else if (pending || forceTest) state = 'testing';
  else if (hasBuildArrow) state = 'testing';
  else state = 'doing';

  // % gợi ý: nhánh có milestone lấy theo dòng mốc; nhánh thường lấy toàn bộ.
  const goalPcts = goalLines.flatMap((l) => pctsOf(l.text.toLowerCase()));
  const allPcts = pctsOf(text);
  const pct = hasMs
    ? goalPcts.length
      ? Math.max(...goalPcts)
      : undefined
    : allPcts.length
      ? Math.max(...allPcts)
      : undefined;
  return { state, pct };
}

// Suy trạng thái/% cho từng nhánh từ MỌI báo cáo trong tuần (duyệt ngày tăng dần):
// mỗi nhánh lấy trạng thái CAO NHẤT đạt được trong tuần (done "dính" — mốc báo giữa tuần
// không mất khi project vắng mặt các ngày sau), % lấy max. KHÔNG hạ cấp trạng thái đã set tay.
export function suggestFromReports(
  plan: WeeklyPlan,
  reports: DailyReport[],
): StateSuggestion[] {
  const sorted = [...reports].sort((a, b) => a.date.localeCompare(b.date));
  const out: StateSuggestion[] = [];
  (plan.projects ?? []).forEach((pr, pi) => {
    const wss = pr.workstreams ?? [];
    wss.forEach((w, wi) => {
      let best: { state: WorkstreamState; pct?: number; date: string } | null = null;
      for (const r of sorted) {
        const rp = matchReportProject(pr, r);
        if (!rp) continue;
        const inf = inferWorkstream(w, wss.length === 1, rp);
        if (!inf) continue;
        if (!best || STATE_RANK[inf.state] > STATE_RANK[best.state]) {
          best = { ...inf, date: r.date };
        } else if (inf.pct !== undefined && (best.pct === undefined || inf.pct > best.pct)) {
          best.pct = inf.pct;
        }
      }
      if (!best) return;

      // Luật KHÔNG hạ cấp: chỉ nhận khi tiến lên hạng; bằng hạng chỉ cập nhật % khi cao hơn.
      const from = w.state ?? 'todo';
      const curRank = STATE_RANK[from];
      const newRank = STATE_RANK[best.state];
      const curPct = workstreamPct(w);
      const sug: StateSuggestion = {
        pi,
        wi,
        project: pr.name,
        wsTitle: w.title,
        state: best.state,
        from,
        date: best.date,
      };
      if (newRank > curRank) {
        if (best.pct !== undefined) sug.progress = best.pct;
      } else if (newRank === curRank) {
        sug.state = from; // giữ nguyên trạng thái, chỉ có thể cập nhật %
        if (best.pct !== undefined && best.pct > curPct) sug.progress = best.pct;
        else return; // không có gì để cập nhật
      } else {
        return; // hạ cấp → bỏ
      }
      out.push(sug);
    });
  });
  return out;
}

// ---- Copy danh sách release đã đạt mốc trong tuần ----

export interface ReleasedWs {
  project: string;
  wsTitle: string;
  milestoneText?: string;
  /** Items của nhánh (nội dung mục tiêu tuần) — làm content của mục khi copy. */
  items: string[];
  /** Ngày ĐẦU TIÊN báo cáo trong tuần suy ra done; undefined = done tay, không rõ ngày. */
  doneDate?: string;
  /** Text mục Timeline match được (chính là "app + phiên bản release" — dùng làm tiêu đề). */
  timelineText?: string;
  /** Vị trí match trong mục Timeline của plan; -1 = không match. */
  timelineIdx: number;
}

// Tách chuỗi thành token chữ/số (≥2 ký tự) — match tên app với text Timeline
// KHÔNG phụ thuộc thứ tự từ ("CalcAI iOS" khớp được "iOS CalcAI v1.0").
function tokensOf(s: string): string[] {
  return (s ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

// Điểm match nhánh release ↔ mục Timeline: tổng ký tự token khớp (bắt buộc có
// token TÊN APP khớp); frac = tỉ lệ token app khớp trọn — để "WF3" ưu tiên đúng
// mục "WF3 v2.1" thay vì "WF3_Radar v1" và ngược lại.
function tlMatchScore(
  r: ReleasedWs,
  tlNorm: string,
): { score: number; frac: number } {
  const appTokens = tokensOf(r.project);
  let appHit = 0;
  let score = 0;
  for (const t of appTokens)
    if (tlNorm.includes(t)) {
      appHit += t.length;
      score += t.length;
    }
  if (appHit === 0) return { score: 0, frac: 0 };
  for (const t of tokensOf(`${r.milestoneText ?? ''} ${r.wsTitle}`))
    if (tlNorm.includes(t)) score += t.length;
  const appTotal = appTokens.reduce((s, t) => s + t.length, 0) || 1;
  return { score, frac: appHit / appTotal };
}

// Các nhánh release đã done của plan, kèm ngày done suy từ báo cáo trong tuần.
// Sắp xếp: theo thứ tự mục Timeline của plan trước; nhánh không match Timeline
// xếp sau, theo ngày done tăng dần (không rõ ngày → cuối).
export function releasedInWeek(
  plan: WeeklyPlan,
  reports: DailyReport[],
  releaseKeys: Set<string> = new Set(['release']),
): ReleasedWs[] {
  const weekReports = reportsInWeek(reports, plan);
  const out: ReleasedWs[] = [];
  (plan.projects ?? []).forEach((pr) => {
    const wss = pr.workstreams ?? [];
    wss.forEach((w) => {
      if (!isReleaseWs(w, releaseKeys) || (w.state ?? 'todo') !== 'done') return;
      // Ngày done = ngày đầu tiên báo cáo suy ra done cho nhánh (cùng bộ luật sync).
      let doneDate: string | undefined;
      for (const r of weekReports) {
        const rp = matchReportProject(pr, r);
        if (!rp) continue;
        if (inferWorkstream(w, wss.length === 1, rp)?.state === 'done') {
          doneDate = r.date;
          break;
        }
      }
      out.push({
        project: pr.name,
        wsTitle: w.title,
        milestoneText: w.milestone?.text,
        items: (w.items ?? []).filter((it) => it.trim()),
        doneDate,
        timelineIdx: -1,
      });
    });
  });

  // Gán mục Timeline theo thứ tự: mỗi mục nhận nhánh CHƯA gán có điểm cao nhất
  // (điểm bằng nhau → ưu tiên khớp trọn tên app). Mỗi nhánh chỉ nhận 1 mục.
  (plan.timeline ?? []).forEach((t, ti) => {
    const raw = t.release.trim();
    const tlNorm = norm(t.release);
    if (!tlNorm) return;
    let best: { r: ReleasedWs; score: number; frac: number } | null = null;
    for (const r of out) {
      if (r.timelineIdx !== -1) continue;
      const m = tlMatchScore(r, tlNorm);
      if (m.score === 0) continue;
      if (!best || m.score > best.score || (m.score === best.score && m.frac > best.frac))
        best = { r, ...m };
    }
    if (best) {
      best.r.timelineIdx = ti;
      best.r.timelineText = raw;
    }
  });

  return out.sort((a, b) => {
    if (a.timelineIdx !== b.timelineIdx) {
      if (a.timelineIdx === -1) return 1;
      if (b.timelineIdx === -1) return -1;
      return a.timelineIdx - b.timelineIdx;
    }
    return (
      (a.doneDate ?? '9999').localeCompare(b.doneDate ?? '9999') ||
      a.project.localeCompare(b.project)
    );
  });
}

// Text copy gửi team: header tuần + mỗi release done 1 MỤC — tiêu đề đánh số
// (ưu tiên text mục Timeline = app + phiên bản) + ngày done, content là items
// của nhánh đúng như nội dung mục tiêu tuần.
export function buildReleaseDoneText(
  plan: WeeklyPlan,
  reports: DailyReport[],
  releaseKeys: Set<string> = new Set(['release']),
): string | null {
  const rel = releasedInWeek(plan, reports, releaseKeys);
  if (rel.length === 0) return null;
  const blocks = rel.map((r, i) => {
    const title = r.timelineText || `${r.project} — ${r.milestoneText || r.wsTitle}`;
    const when = r.doneDate
      ? `✅ ${weekdayVN(r.doneDate)} (${formatDateVi(r.doneDate)})`
      : '✅ done (không rõ ngày)';
    return [`${i + 1}. ${title} — ${when}`, ...r.items.map((it) => `- ${it}`)].join('\n');
  });
  return [
    `🚀 Release tuần ${formatDateVi(plan.weekStart)} – ${formatDateVi(plan.weekEnd)}`,
    '',
    blocks.join('\n\n'),
  ].join('\n');
}
