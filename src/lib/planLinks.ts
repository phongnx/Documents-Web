import type { WeeklyPlan } from '../pmTypes';

// yyyy-mm-dd theo giờ địa phương.
export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

// Plan của tuần hiện tại: tuần chứa hôm nay (weekStart ≤ today ≤ weekEnd).
export function currentPlans(plans: WeeklyPlan[], today: string): WeeklyPlan[] {
  return plans.filter((p) => p.weekStart <= today && today <= p.weekEnd);
}

// Tập id task + id app được tham chiếu trong các plan (dùng để đánh dấu "trong plan tuần").
export function planLinks(plans: WeeklyPlan[]): {
  taskIds: Set<string>;
  appIds: Set<string>;
} {
  const taskIds = new Set<string>();
  const appIds = new Set<string>();
  for (const p of plans) {
    for (const pr of p.projects ?? []) {
      if (pr.appId) appIds.add(pr.appId);
      for (const w of pr.workstreams ?? []) {
        for (const tid of w.sourceTaskIds ?? []) taskIds.add(tid);
      }
    }
  }
  return { taskIds, appIds };
}
