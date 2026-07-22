// Tính tiến độ tuần từ Plan tuần + gợi ý trạng thái từ Báo cáo ngày.
import {
  isGoalWs,
  isReleaseWs,
  workstreamPct,
  type DailyReport,
  type PlanWorkstream,
  type WeeklyPlan,
  type WorkstreamState,
} from '../pmTypes';
import { parseBody } from './reportFormat';
import { normName as norm } from './pmText';

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

// Báo cáo mới nhất nằm trong khoảng tuần của plan (theo ngày desc); null nếu không có.
export function latestReportInWeek(
  reports: DailyReport[],
  plan: WeeklyPlan,
): DailyReport | null {
  const inWeek = reports
    .filter((r) => r.date >= plan.weekStart && r.date <= plan.weekEnd)
    .sort((a, b) => b.date.localeCompare(a.date));
  return inWeek[0] ?? null;
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

// Suy trạng thái/% cho từng nhánh của plan từ nội dung 1 báo cáo ngày.
// Nguyên tắc: match project theo appId; 1-nhánh → đọc cả body; nhiều-nhánh → theo section
// hoặc milestone.text; luật done STRICT; KHÔNG hạ cấp trạng thái đã set tay.
export function suggestFromReport(
  plan: WeeklyPlan,
  report: DailyReport,
): StateSuggestion[] {
  const out: StateSuggestion[] = [];
  const projects = plan.projects ?? [];
  projects.forEach((pr, pi) => {
    // Nối report-project ↔ plan-project theo appId, rồi theo tên.
    const rp =
      (pr.appId && report.projects.find((x) => x.appId === pr.appId)) ||
      report.projects.find((x) => norm(x.name) === norm(pr.name)) ||
      report.projects.find(
        (x) => norm(x.name).includes(norm(pr.name)) && norm(pr.name).length > 0,
      );
    if (!rp) return;
    const lines = parseBody(rp.body);
    const allArrows = lines.filter((l) => l.kind === 'arrow');
    const contentLines = lines.filter((l) => l.kind !== 'section');
    const wss = pr.workstreams ?? [];
    const singleWs = wss.length === 1;

    wss.forEach((w, wi) => {
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
      if (consider.length === 0) return;

      const hasMs = !!w.milestone;
      const text = consider.map((l) => l.text).join('\n').toLowerCase();
      const pcts = [...text.matchAll(/(\d{1,3})\s*%/g)].map((m) => Number(m[1]));

      // Nhánh CÓ milestone: chỉ xét "đạt mốc" trên dòng nói về build/release/mốc,
      // KHÔNG lấy tín hiệu done từ task lẻ hoàn thành. Nhánh thường: xét toàn bộ dòng liên quan.
      const doneScope = hasMs
        ? consider.filter(
            (l) =>
              /(release|build|submit|publish|store|phát hành|lên store)/.test(
                l.text.toLowerCase(),
              ) || looseMatch(norm(l.text), norm(w.milestone!.text)),
          )
        : consider;
      const doneText = doneScope.map((l) => l.text).join('\n').toLowerCase();
      const donePcts = [...doneText.matchAll(/(\d{1,3})\s*%/g)].map((m) => Number(m[1]));
      const doneMaxPct = donePcts.length ? Math.max(...donePcts) : undefined;

      const hasBuildArrow = consider.some(
        (l) =>
          l.kind === 'arrow' &&
          /(release|build|submit|publish|store)/.test(l.text.toLowerCase()),
      );
      // Đang test/chờ → CHƯA xong (ưu tiên, theo luật strict).
      const pending =
        /(tester|đang check|đang test|đang fix|chưa|pending|review|đang chờ|waiting)/.test(
          text,
        );
      // Cụm ép coi là ĐANG TEST: "fix bug(s) phát sinh" hoặc "build test".
      const forceTest = /(fix\s*bugs?\s*phát\s*sinh|build\s*test)/.test(text);
      // Tín hiệu ĐẠT rõ ràng: hoàn thành / đã release / 100% / ✅ (chỉ trong phạm vi doneText).
      const doneSignal =
        /(hoàn thành|hoàn tất|đã xong|\bxong\b|\bdone\b|đã release|đã build xong|release thành công|đã lên store|đã submit|đã publish|✅)/.test(
          doneText,
        ) ||
        (doneMaxPct !== undefined && doneMaxPct >= 100);

      let state: WorkstreamState;
      if (pending || forceTest) state = 'testing';
      else if (doneSignal) state = 'done';
      else if (hasBuildArrow) state = 'testing';
      else state = 'doing';

      // % gợi ý: nhánh có milestone lấy theo dòng mốc; nhánh thường lấy toàn bộ.
      const maxPct = hasMs ? doneMaxPct : pcts.length ? Math.max(...pcts) : undefined;

      // Luật KHÔNG hạ cấp: chỉ nhận khi tiến lên hạng; bằng hạng chỉ cập nhật % khi cao hơn.
      const from = w.state ?? 'todo';
      const curRank = STATE_RANK[from];
      const newRank = STATE_RANK[state];
      const curPct = workstreamPct(w);
      const sug: StateSuggestion = {
        pi,
        wi,
        project: pr.name,
        wsTitle: w.title,
        state,
        from,
      };
      if (newRank > curRank) {
        if (maxPct !== undefined) sug.progress = maxPct;
      } else if (newRank === curRank) {
        sug.state = from; // giữ nguyên trạng thái, chỉ có thể cập nhật %
        if (maxPct !== undefined && maxPct > curPct) sug.progress = maxPct;
        else return; // không có gì để cập nhật
      } else {
        return; // hạ cấp → bỏ
      }
      out.push(sug);
    });
  });
  return out;
}
