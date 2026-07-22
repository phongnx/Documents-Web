import type { WeeklyPlan } from '../pmTypes';

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
