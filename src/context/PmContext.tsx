import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ref, onValue, set, update, get } from 'firebase/database';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../lib/firebase';
import { useAuth } from '../auth/useAuth';
import { computeSplit, keyOfTask } from '../lib/flavorSplit';
import {
  DEFAULT_KPI_RULES,
  type KpiMember,
  type KpiRuleGroup,
  type KpiSheetMeta,
} from '../kpiTypes';
import {
  DEFAULT_MILESTONE_TYPES,
  DEFAULT_PLAN_CATEGORIES,
  DEFAULT_STATUSES,
  DEFAULT_TASK_TYPES,
  isPresetMilestoneType,
  msKeyFromLabel,
  releaseKeysOf,
  type AppItem,
  type DailyReport,
  type PmImportPayload,
  type PmMeta,
  type TaskItem,
  type WeeklyPlan,
  type WorkstreamState,
} from '../pmTypes';

// Meta mặc định (dùng chung cho init state, reset khi đăng xuất, fallback import).
function defaultMeta(): PmMeta {
  return {
    taskTypes: DEFAULT_TASK_TYPES,
    statuses: DEFAULT_STATUSES,
    milestoneTypes: DEFAULT_MILESTONE_TYPES,
    planCategories: DEFAULT_PLAN_CATEGORIES,
    kpiRules: DEFAULT_KPI_RULES,
  };
}

// Chuẩn hóa task: chỉ giữ field optional khi có giá trị (loại undefined trước khi set/ghi RTDB).
function normalizeTask(t: TaskItem): TaskItem {
  return {
    id: t.id,
    title: t.title ?? '',
    type: t.type,
    status: t.status,
    order: t.order,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    ...(t.appId ? { appId: t.appId } : {}),
    ...(t.version ? { version: t.version } : {}),
    ...(t.description ? { description: t.description } : {}),
    ...(t.startDate ? { startDate: t.startDate } : {}),
    ...(t.endDate ? { endDate: t.endDate } : {}),
    ...(t.planDate ? { planDate: t.planDate } : {}),
    ...(t.milestone ? { milestone: t.milestone } : {}),
    ...(t.assignee ? { assignee: t.assignee } : {}),
    ...(t.flavor ? { flavor: t.flavor } : {}),
  };
}

// Các trường cho phép sửa/tạo task (bỏ id/order/createdAt/updatedAt do context quản lý).
type TaskInput = Partial<
  Omit<TaskItem, 'id' | 'order' | 'createdAt' | 'updatedAt'>
> & { title: string };
type TaskUpdates = Partial<Omit<TaskItem, 'id' | 'createdAt'>>;

// Trường được phép truyền khi tạo plan (id/order/createdAt/updatedAt do context điền).
type PlanInput = Omit<WeeklyPlan, 'id' | 'order' | 'createdAt' | 'updatedAt'>;

// Trường được phép truyền khi tạo báo cáo ngày.
type ReportInput = Omit<DailyReport, 'id' | 'order' | 'createdAt' | 'updatedAt'>;

interface PmState {
  apps: AppItem[];
  tasks: TaskItem[];
  meta: PmMeta;
  plans: WeeklyPlan[];
  loading: boolean;
  addApp: (name?: string, platform?: string) => AppItem | null;
  updateApp: (id: string, updates: Partial<Omit<AppItem, 'id'>>) => void;
  /** Xóa app + tất cả task thuộc app đó. */
  deleteApp: (id: string) => void;
  /** Tách app thành nhiều app theo `flavor`. Trả list flavor đã tách. */
  splitAppByFlavor: (id: string) => string[];
  /** Bỏ group cho các app (đưa về app độc lập theo platform). */
  ungroupApps: (ids: string[]) => void;
  addTask: (data: TaskInput) => TaskItem | null;
  updateTask: (id: string, updates: TaskUpdates) => void;
  deleteTask: (id: string) => void;
  deleteTasks: (ids: string[]) => void;
  /** Gán nhiều task vào 1 app (appId rỗng = bỏ gán). */
  assignTasksToApp: (taskIds: string[], appId: string) => void;
  addTaskType: (name: string) => void;
  /** Đổi tên loại task + cascade các task đang dùng. */
  updateTaskType: (oldName: string, newName: string) => void;
  /** Xóa loại task; trả về số task đang dùng (>0 = bị chặn, chưa xóa). */
  deleteTaskType: (name: string) => number;
  addMilestoneType: (label: string, isRelease: boolean) => void;
  updateMilestoneType: (
    key: string,
    patch: { label?: string; isRelease?: boolean },
  ) => void;
  deleteMilestoneType: (key: string) => void;
  addPlanCategory: (name: string) => void;
  /** Đổi tên loại nhánh (chỉ loại tự thêm) + cascade category trong mọi plan. */
  updatePlanCategory: (oldName: string, newName: string) => void;
  deletePlanCategory: (name: string) => void;
  /** Ghi đè toàn bộ users/{uid}/pm bằng payload (dùng cho import). */
  importData: (payload: PmImportPayload) => Promise<void>;
  addPlan: (data: PlanInput) => WeeklyPlan | null;
  /** Ghi đè toàn bộ plan (trình sửa lưu cả object). */
  updatePlan: (id: string, data: PlanInput) => void;
  deletePlan: (id: string) => void;
  /** Cập nhật trạng thái/tiến độ nhiều nhánh trong 1 plan (ghi 1 lần). */
  setWorkstreamProgress: (
    planId: string,
    updates: { pi: number; wi: number; state?: WorkstreamState; progress?: number }[],
  ) => void;
  reports: DailyReport[];
  addReport: (data: ReportInput) => DailyReport | null;
  /** Ghi đè toàn bộ báo cáo ngày (trình sửa lưu cả object). */
  updateReport: (id: string, data: ReportInput) => void;
  deleteReport: (id: string) => void;
  // ---------- KPI member log ----------
  members: KpiMember[];
  /** Tạo member + sheet KPI tại shared/kpi/{token} (1 lần ghi nguyên tử). */
  addMember: (name: string) => KpiMember | null;
  /** Sửa member (đổi tên thì đồng bộ memberName sang sheet). */
  updateMember: (id: string, patch: Partial<Omit<KpiMember, 'id' | 'token'>>) => void;
  /** Xóa member + TOÀN BỘ sheet KPI của member đó. */
  deleteMember: (id: string) => void;
  /** Đổi link (token mới): chuyển dữ liệu sheet sang node mới, link cũ chết ngay. */
  rotateMemberToken: (id: string) => Promise<void>;
  /** Khóa/mở sheet (member nghỉ/lộ link): chặn member ghi, giữ log để đọc. */
  setMemberLocked: (id: string, locked: boolean) => void;
  /** Gán list project (app id) cho member — member chỉ chọn được các project này khi log. */
  setMemberProjects: (id: string, projectIds: string[]) => void;
  /** Ghi đè quy chế chấm điểm KPI. */
  updateKpiRules: (rules: KpiRuleGroup[]) => void;
  /** Đồng bộ snapshot categories/projectNames/memberName sang sheet của member. */
  syncKpiSheetMeta: (memberId: string) => void;
}

// RTDB bỏ mảng rỗng → chuẩn hóa để mọi mảng lồng nhau luôn tồn tại khi đọc về.
function normalizePlan(p: WeeklyPlan): WeeklyPlan {
  return {
    ...p,
    projects: (p.projects ?? []).map((pr) => ({
      name: pr.name ?? '',
      ...(pr.appId ? { appId: pr.appId } : {}),
      workstreams: (pr.workstreams ?? []).map((w) => ({
        title: w.title ?? '',
        category: w.category ?? 'other',
        items: w.items ?? [],
        ...(w.milestone ? { milestone: w.milestone } : {}),
        ...(w.sourceTaskIds ? { sourceTaskIds: w.sourceTaskIds } : {}),
        ...(w.state ? { state: w.state } : {}),
        ...(typeof w.progress === 'number' ? { progress: w.progress } : {}),
      })),
    })),
    timeline: p.timeline ?? [],
  };
}

// Chuẩn hóa báo cáo ngày (đảm bảo mảng tồn tại, loại key undefined trước khi ghi).
function normalizeReport(r: DailyReport): DailyReport {
  return {
    ...r,
    projects: (r.projects ?? []).map((p) => ({
      name: p.name ?? '',
      ...(p.appId ? { appId: p.appId } : {}),
      body: p.body ?? '',
    })),
  };
}

const PmContext = createContext<PmState | null>(null);

export function PmProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid;

  const [apps, setApps] = useState<AppItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [meta, setMeta] = useState<PmMeta>(defaultMeta());
  const [plans, setPlans] = useState<WeeklyPlan[]>([]);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [members, setMembers] = useState<KpiMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Đọc state mới nhất trong mutator (không đọc closure) — như DocumentsContext.
  const stateRef = useRef<{
    apps: AppItem[];
    tasks: TaskItem[];
    meta: PmMeta;
    plans: WeeklyPlan[];
    reports: DailyReport[];
    members: KpiMember[];
  }>({
    apps: [],
    tasks: [],
    meta: defaultMeta(),
    plans: [],
    reports: [],
    members: [],
  });
  stateRef.current.apps = apps;
  stateRef.current.tasks = tasks;
  stateRef.current.meta = meta;
  stateRef.current.plans = plans;
  stateRef.current.reports = reports;
  stateRef.current.members = members;

  useEffect(() => {
    if (!db || !uid) {
      setApps([]);
      setTasks([]);
      setMeta(defaultMeta());
      setPlans([]);
      setReports([]);
      setMembers([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    const appsRef = ref(db, `users/${uid}/pm/apps`);
    const unsubApps = onValue(appsRef, (snap) => {
      const val = snap.val() as Record<string, AppItem> | null;
      const list = val ? Object.values(val) : [];
      list.sort(
        (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt),
      );
      setApps(list);
      setLoading(false);
    });

    const tasksRef = ref(db, `users/${uid}/pm/tasks`);
    const unsubTasks = onValue(tasksRef, (snap) => {
      const val = snap.val() as Record<string, TaskItem> | null;
      const list = val ? Object.values(val) : [];
      list.sort(
        (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt),
      );
      setTasks(list);
    });

    const metaRef = ref(db, `users/${uid}/pm/meta`);
    const unsubMeta = onValue(metaRef, (snap) => {
      const val = snap.val() as Partial<PmMeta> | null;
      setMeta({
        taskTypes:
          val?.taskTypes && val.taskTypes.length
            ? val.taskTypes
            : DEFAULT_TASK_TYPES,
        statuses:
          val?.statuses && val.statuses.length
            ? val.statuses
            : DEFAULT_STATUSES,
        milestoneTypes:
          val?.milestoneTypes && val.milestoneTypes.length
            ? val.milestoneTypes
            : DEFAULT_MILESTONE_TYPES,
        planCategories:
          val?.planCategories && val.planCategories.length
            ? val.planCategories
            : DEFAULT_PLAN_CATEGORIES,
        kpiRules:
          val?.kpiRules && val.kpiRules.length ? val.kpiRules : DEFAULT_KPI_RULES,
      });
    });

    const membersRef = ref(db, `users/${uid}/pm/members`);
    const unsubMembers = onValue(membersRef, (snap) => {
      const val = snap.val() as Record<string, KpiMember> | null;
      const list = val ? Object.values(val) : [];
      list.sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
      setMembers(list);
    });

    const plansRef = ref(db, `users/${uid}/pm/plans`);
    const unsubPlans = onValue(plansRef, (snap) => {
      const val = snap.val() as Record<string, WeeklyPlan> | null;
      const list = val ? Object.values(val).map(normalizePlan) : [];
      // Mới nhất trước: theo tuần, rồi order/thời gian tạo.
      list.sort(
        (a, b) =>
          b.weekStart.localeCompare(a.weekStart) ||
          b.order - a.order ||
          b.createdAt.localeCompare(a.createdAt),
      );
      setPlans(list);
    });

    const reportsRef = ref(db, `users/${uid}/pm/reports`);
    const unsubReports = onValue(reportsRef, (snap) => {
      const val = snap.val() as Record<string, DailyReport> | null;
      const list = val ? Object.values(val).map(normalizeReport) : [];
      // Mới nhất trước: theo ngày, rồi order/thời gian tạo.
      list.sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          b.order - a.order ||
          b.createdAt.localeCompare(a.createdAt),
      );
      setReports(list);
    });

    return () => {
      unsubApps();
      unsubTasks();
      unsubMeta();
      unsubPlans();
      unsubReports();
      unsubMembers();
    };
  }, [uid]);

  const addApp = useCallback(
    (name?: string, platform?: string): AppItem | null => {
      if (!db || !uid) return null;
      const cur = stateRef.current.apps;
      const now = new Date().toISOString();
      const created: AppItem = {
        id: uuidv4(),
        name: name ?? 'App mới',
        platform: platform ?? 'Android',
        order: cur.length,
        createdAt: now,
      };
      set(ref(db, `users/${uid}/pm/apps/${created.id}`), created);
      return created;
    },
    [uid],
  );

  const updateApp = useCallback(
    (id: string, updates: Partial<Omit<AppItem, 'id'>>) => {
      if (!db || !uid) return;
      const writes: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(updates)) {
        writes[`users/${uid}/pm/apps/${id}/${k}`] = v;
      }
      update(ref(db), writes);
    },
    [uid],
  );

  const deleteApp = useCallback(
    (id: string) => {
      if (!db || !uid) return;
      const writes: Record<string, unknown> = {
        [`users/${uid}/pm/apps/${id}`]: null,
      };
      // Xóa luôn task thuộc app này.
      for (const t of stateRef.current.tasks) {
        if (t.appId === id) writes[`users/${uid}/pm/tasks/${t.id}`] = null;
      }
      update(ref(db), writes);
    },
    [uid],
  );

  const splitAppByFlavor = useCallback(
    (appId: string): string[] => {
      if (!db || !uid) return [];
      const app = stateRef.current.apps.find((a) => a.id === appId);
      if (!app) return [];
      const appTasks = stateRef.current.tasks.filter((t) => t.appId === appId);
      // Phân loại flavor: từ trường flavor + suy từ tiêu đề (VD Weather).
      const { allKeys, coreKeys } = computeSplit(appTasks);
      if (allKeys.length < 2) return allKeys; // không đủ để tách

      const now = new Date().toISOString();
      const baseOrder = stateRef.current.apps.length;
      const writes: Record<string, unknown> = {};
      const idByKey: Record<string, string> = {};
      // Tạo các app độc lập (KHÔNG gom group) — cùng platform với app gốc.
      allKeys.forEach((k, i) => {
        const nid = uuidv4();
        idByKey[k] = nid;
        writes[`users/${uid}/pm/apps/${nid}`] = {
          id: nid,
          name: k,
          platform: app.platform,
          order: baseOrder + i,
          createdAt: now,
        };
      });

      // Task "All flavor" (không nhận ra flavor) nhân cho các flavor gốc (coreKeys).
      const dupTargets = coreKeys.length ? coreKeys : allKeys;
      for (const t of appTasks) {
        const k = keyOfTask(t);
        if (k && idByKey[k]) {
          writes[`users/${uid}/pm/tasks/${t.id}/appId`] = idByKey[k];
        } else {
          writes[`users/${uid}/pm/tasks/${t.id}/appId`] = idByKey[dupTargets[0]];
          for (let j = 1; j < dupTargets.length; j++) {
            const cid = uuidv4();
            writes[`users/${uid}/pm/tasks/${cid}`] = {
              ...t,
              id: cid,
              appId: idByKey[dupTargets[j]],
            };
          }
        }
      }

      writes[`users/${uid}/pm/apps/${appId}`] = null; // xóa app gốc
      update(ref(db), writes);
      return allKeys;
    },
    [uid],
  );

  const ungroupApps = useCallback(
    (ids: string[]) => {
      if (!db || !uid || ids.length === 0) return;
      const writes: Record<string, unknown> = {};
      for (const id of ids) writes[`users/${uid}/pm/apps/${id}/group`] = null;
      update(ref(db), writes);
    },
    [uid],
  );

  const addTask = useCallback(
    (data: TaskInput): TaskItem | null => {
      if (!db || !uid) return null;
      const cur = stateRef.current.tasks;
      const m = stateRef.current.meta;
      const now = new Date().toISOString();
      // normalizeTask loại các trường optional undefined (tránh undefined trong RTDB).
      const created: TaskItem = normalizeTask({
        id: uuidv4(),
        title: data.title,
        type: data.type ?? m.taskTypes[0] ?? 'Release',
        status: data.status ?? m.statuses[0] ?? 'Chưa bắt đầu',
        order: cur.length,
        createdAt: now,
        updatedAt: now,
        appId: data.appId,
        version: data.version,
        description: data.description,
        startDate: data.startDate,
        endDate: data.endDate,
        planDate: data.planDate,
        milestone: data.milestone,
        assignee: data.assignee,
        flavor: data.flavor,
      });
      set(ref(db, `users/${uid}/pm/tasks/${created.id}`), created);
      return created;
    },
    [uid],
  );

  const updateTask = useCallback(
    (id: string, updates: TaskUpdates) => {
      if (!db || !uid) return;
      const now = new Date().toISOString();
      const writes: Record<string, unknown> = {
        [`users/${uid}/pm/tasks/${id}/updatedAt`]: now,
      };
      for (const [k, v] of Object.entries(updates)) {
        // v === undefined ⇒ xóa trường (ghi null); còn lại ghi giá trị.
        writes[`users/${uid}/pm/tasks/${id}/${k}`] = v === undefined ? null : v;
      }
      update(ref(db), writes);
    },
    [uid],
  );

  const deleteTask = useCallback(
    (id: string) => {
      if (!db || !uid) return;
      set(ref(db, `users/${uid}/pm/tasks/${id}`), null);
    },
    [uid],
  );

  const deleteTasks = useCallback(
    (ids: string[]) => {
      if (!db || !uid || ids.length === 0) return;
      const writes: Record<string, unknown> = {};
      for (const id of ids) writes[`users/${uid}/pm/tasks/${id}`] = null;
      update(ref(db), writes);
    },
    [uid],
  );

  const assignTasksToApp = useCallback(
    (taskIds: string[], appId: string) => {
      if (!db || !uid || taskIds.length === 0) return;
      const writes: Record<string, unknown> = {};
      for (const id of taskIds) {
        writes[`users/${uid}/pm/tasks/${id}/appId`] = appId || null;
        writes[`users/${uid}/pm/tasks/${id}/updatedAt`] = new Date().toISOString();
      }
      update(ref(db), writes);
    },
    [uid],
  );

  const addTaskType = useCallback(
    (name: string) => {
      if (!db || !uid) return;
      const n = name.trim();
      if (!n) return;
      const cur = stateRef.current.meta.taskTypes;
      if (cur.includes(n)) return;
      set(ref(db, `users/${uid}/pm/meta/taskTypes`), [...cur, n]);
    },
    [uid],
  );

  // Đổi tên loại task: cập nhật danh mục + cascade mọi task đang dùng (ghi 1 lần).
  const updateTaskType = useCallback(
    (oldName: string, newName: string) => {
      if (!db || !uid) return;
      const n = newName.trim();
      const cur = stateRef.current.meta.taskTypes;
      if (!n || oldName === n || !cur.includes(oldName) || cur.includes(n)) return;
      const now = new Date().toISOString();
      const writes: Record<string, unknown> = {};
      writes[`users/${uid}/pm/meta/taskTypes`] = cur.map((t) => (t === oldName ? n : t));
      for (const t of stateRef.current.tasks) {
        if (t.type === oldName) {
          writes[`users/${uid}/pm/tasks/${t.id}/type`] = n;
          writes[`users/${uid}/pm/tasks/${t.id}/updatedAt`] = now;
        }
      }
      update(ref(db), writes);
    },
    [uid],
  );

  // Xóa loại task: chặn nếu còn task dùng — trả về SỐ task đang dùng (0 = đã xóa).
  const deleteTaskType = useCallback(
    (name: string): number => {
      if (!db || !uid) return 0;
      const used = stateRef.current.tasks.filter((t) => t.type === name).length;
      if (used > 0) return used;
      const cur = stateRef.current.meta.taskTypes;
      if (!cur.includes(name)) return 0;
      set(
        ref(db, `users/${uid}/pm/meta/taskTypes`),
        cur.filter((t) => t !== name),
      );
      return 0;
    },
    [uid],
  );

  const addMilestoneType = useCallback(
    (label: string, isRelease: boolean) => {
      if (!db || !uid) return;
      const l = label.trim();
      if (!l) return;
      const cur = stateRef.current.meta.milestoneTypes;
      const key = msKeyFromLabel(l, cur.length);
      if (cur.some((t) => t.key === key)) return;
      set(ref(db, `users/${uid}/pm/meta/milestoneTypes`), [
        ...cur,
        { key, label: l, isRelease },
      ]);
    },
    [uid],
  );

  const updateMilestoneType = useCallback(
    (key: string, patch: { label?: string; isRelease?: boolean }) => {
      if (!db || !uid) return;
      const cur = stateRef.current.meta.milestoneTypes;
      const next = cur.map((t) =>
        t.key === key
          ? {
              ...t,
              ...(patch.label !== undefined ? { label: patch.label.trim() || t.label } : {}),
              ...(patch.isRelease !== undefined ? { isRelease: patch.isRelease } : {}),
            }
          : t,
      );
      set(ref(db, `users/${uid}/pm/meta/milestoneTypes`), next);
    },
    [uid],
  );

  // Xóa loại milestone: chặn 2 loại gốc; plan đang dùng key cũ vẫn giữ (chỉ bỏ khỏi danh mục).
  const deleteMilestoneType = useCallback(
    (key: string) => {
      if (!db || !uid) return;
      if (isPresetMilestoneType(key)) return;
      const cur = stateRef.current.meta.milestoneTypes;
      set(
        ref(db, `users/${uid}/pm/meta/milestoneTypes`),
        cur.filter((t) => t.key !== key),
      );
    },
    [uid],
  );

  const addPlanCategory = useCallback(
    (name: string) => {
      if (!db || !uid) return;
      const n = name.trim();
      if (!n) return;
      const cur = stateRef.current.meta.planCategories;
      if (cur.includes(n)) return;
      set(ref(db, `users/${uid}/pm/meta/planCategories`), [...cur, n]);
    },
    [uid],
  );

  // Đổi tên loại nhánh (chỉ loại tự thêm) + cascade category trong mọi plan (ghi 1 lần).
  const updatePlanCategory = useCallback(
    (oldName: string, newName: string) => {
      if (!db || !uid) return;
      const n = newName.trim();
      const cur = stateRef.current.meta.planCategories;
      if (DEFAULT_PLAN_CATEGORIES.includes(oldName)) return; // không sửa preset
      if (!n || oldName === n || !cur.includes(oldName) || cur.includes(n)) return;
      const now = new Date().toISOString();
      const writes: Record<string, unknown> = {};
      writes[`users/${uid}/pm/meta/planCategories`] = cur.map((c) =>
        c === oldName ? n : c,
      );
      for (const p of stateRef.current.plans) {
        let touched = false;
        const projects = (p.projects ?? []).map((pr) => ({
          ...pr,
          workstreams: (pr.workstreams ?? []).map((w) => {
            if (w.category === oldName) {
              touched = true;
              return { ...w, category: n };
            }
            return w;
          }),
        }));
        if (touched) {
          writes[`users/${uid}/pm/plans/${p.id}/projects`] = projects;
          writes[`users/${uid}/pm/plans/${p.id}/updatedAt`] = now;
        }
      }
      update(ref(db), writes);
    },
    [uid],
  );

  // Xóa loại nhánh (chỉ loại tự thêm); plan đang dùng vẫn giữ giá trị (chỉ bỏ khỏi danh mục).
  const deletePlanCategory = useCallback(
    (name: string) => {
      if (!db || !uid) return;
      if (DEFAULT_PLAN_CATEGORIES.includes(name)) return; // không xóa preset
      const cur = stateRef.current.meta.planCategories;
      set(
        ref(db, `users/${uid}/pm/meta/planCategories`),
        cur.filter((c) => c !== name),
      );
    },
    [uid],
  );

  const importData = useCallback(
    async (payload: PmImportPayload) => {
      if (!db || !uid) return;
      // Ghi đè apps/tasks/meta nhưng GIỮ NGUYÊN plans/members (không đụng 2 node đó).
      // meta bị ghi đè cả node → giữ lại kpiRules hiện tại nếu payload không mang theo.
      const meta = payload.meta ?? defaultMeta();
      await update(ref(db, `users/${uid}/pm`), {
        apps: payload.apps ?? {},
        tasks: payload.tasks ?? {},
        meta: {
          ...meta,
          kpiRules:
            meta.kpiRules && meta.kpiRules.length
              ? meta.kpiRules
              : stateRef.current.meta.kpiRules,
        },
      });
    },
    [uid],
  );

  // ---------- KPI member log ----------

  // Snapshot meta cho sheet member (member ẩn danh không đọc được users/{uid}/pm/meta).
  // Member đã gán project → projectNames CHỈ gồm các project gán + strictProjects=true;
  // chưa gán (hoặc app gán đã bị xóa hết) → gợi ý tất cả app, nhập tự do.
  const kpiSnapshot = useCallback(
    (
      member?: KpiMember,
    ): Pick<KpiSheetMeta, 'categories' | 'projectNames' | 'strictProjects'> => {
      const apps = stateRef.current.apps;
      const assigned = (member?.projectIds ?? [])
        .map((id) => apps.find((a) => a.id === id))
        .filter((a): a is AppItem => !!a);
      const strict = assigned.length > 0;
      return {
        categories: stateRef.current.meta.kpiRules.map((g) => g.label),
        projectNames: strict
          ? assigned.map((a) => a.name)
          : apps.filter((a) => !a.archived).map((a) => a.name),
        strictProjects: strict,
      };
    },
    [],
  );

  const addMember = useCallback(
    (name: string): KpiMember | null => {
      if (!db || !uid) return null;
      const n = name.trim();
      if (!n) return null;
      const now = new Date().toISOString();
      const member: KpiMember = {
        id: uuidv4(),
        name: n,
        token: uuidv4(),
        active: true,
        order: stateRef.current.members.length,
        createdAt: now,
      };
      const sheetMeta: KpiSheetMeta = {
        ownerId: uid,
        memberName: n,
        ...kpiSnapshot(),
        createdAt: now,
      };
      // 1 lần ghi nguyên tử: bản ghi member riêng tư + meta sheet công khai.
      update(ref(db), {
        [`users/${uid}/pm/members/${member.id}`]: member,
        [`shared/kpi/${member.token}/meta`]: sheetMeta,
      });
      return member;
    },
    [uid, kpiSnapshot],
  );

  const updateMember = useCallback(
    (id: string, patch: Partial<Omit<KpiMember, 'id' | 'token'>>) => {
      if (!db || !uid) return;
      const cur = stateRef.current.members.find((m) => m.id === id);
      if (!cur) return;
      const writes: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (v !== undefined) writes[`users/${uid}/pm/members/${id}/${k}`] = v;
      }
      // Đổi tên → đồng bộ memberName sang sheet công khai.
      if (patch.name && patch.name.trim() && patch.name.trim() !== cur.name) {
        writes[`users/${uid}/pm/members/${id}/name`] = patch.name.trim();
        writes[`shared/kpi/${cur.token}/meta/memberName`] = patch.name.trim();
      }
      if (Object.keys(writes).length > 0) update(ref(db), writes);
    },
    [uid],
  );

  const deleteMember = useCallback(
    (id: string) => {
      if (!db || !uid) return;
      const cur = stateRef.current.members.find((m) => m.id === id);
      if (!cur) return;
      update(ref(db), {
        [`users/${uid}/pm/members/${id}`]: null,
        [`shared/kpi/${cur.token}`]: null,
      });
    },
    [uid],
  );

  const rotateMemberToken = useCallback(
    async (id: string) => {
      if (!db || !uid) return;
      const cur = stateRef.current.members.find((m) => m.id === id);
      if (!cur) return;
      // Đọc toàn bộ sheet cũ → ghi sang token mới + xóa node cũ trong 1 lần (nguyên tử).
      const snap = await get(ref(db, `shared/kpi/${cur.token}`));
      const data = snap.val() as { meta?: KpiSheetMeta } | null;
      const newToken = uuidv4();
      const sheet = data?.meta
        ? data
        : {
            meta: {
              ownerId: uid,
              memberName: cur.name,
              ...kpiSnapshot(cur),
              createdAt: new Date().toISOString(),
            } satisfies KpiSheetMeta,
          };
      await update(ref(db), {
        [`shared/kpi/${newToken}`]: sheet,
        [`shared/kpi/${cur.token}`]: null,
        [`users/${uid}/pm/members/${id}/token`]: newToken,
      });
    },
    [uid, kpiSnapshot],
  );

  const setMemberLocked = useCallback(
    (id: string, locked: boolean) => {
      if (!db || !uid) return;
      const cur = stateRef.current.members.find((m) => m.id === id);
      if (!cur) return;
      update(ref(db), {
        [`users/${uid}/pm/members/${id}/active`]: !locked,
        [`shared/kpi/${cur.token}/meta/locked`]: locked,
      });
    },
    [uid],
  );

  const updateKpiRules = useCallback(
    (rules: KpiRuleGroup[]) => {
      if (!db || !uid) return;
      set(ref(db, `users/${uid}/pm/meta/kpiRules`), rules);
    },
    [uid],
  );

  // Đồng bộ snapshot danh mục sang sheet (gọi khi leader mở trang member) —
  // ghi các field con của meta (không đụng ownerId).
  const syncKpiSheetMeta = useCallback(
    (memberId: string) => {
      if (!db || !uid) return;
      const cur = stateRef.current.members.find((m) => m.id === memberId);
      if (!cur) return;
      update(ref(db, `shared/kpi/${cur.token}/meta`), {
        memberName: cur.name,
        ...kpiSnapshot(cur),
      });
    },
    [uid, kpiSnapshot],
  );

  // Gán danh sách project cho member + đồng bộ ngay sang sheet (1 lần ghi).
  const setMemberProjects = useCallback(
    (memberId: string, projectIds: string[]) => {
      if (!db || !uid) return;
      const cur = stateRef.current.members.find((m) => m.id === memberId);
      if (!cur) return;
      // Chỉ giữ id app còn tồn tại; rỗng = bỏ gán (member nhập tự do trở lại).
      const cleanIds = projectIds.filter((id) =>
        stateRef.current.apps.some((a) => a.id === id),
      );
      const snapshot = kpiSnapshot({ ...cur, projectIds: cleanIds });
      update(ref(db), {
        [`users/${uid}/pm/members/${memberId}/projectIds`]: cleanIds.length
          ? cleanIds
          : null,
        [`shared/kpi/${cur.token}/meta/projectNames`]: snapshot.projectNames,
        [`shared/kpi/${cur.token}/meta/strictProjects`]: snapshot.strictProjects,
      });
    },
    [uid, kpiSnapshot],
  );

  const addPlan = useCallback(
    (data: PlanInput): WeeklyPlan | null => {
      if (!db || !uid) return null;
      const now = new Date().toISOString();
      const created: WeeklyPlan = {
        ...data,
        id: uuidv4(),
        order: stateRef.current.plans.length,
        createdAt: now,
        updatedAt: now,
      };
      // Chuẩn hóa để loại các key undefined (RTDB set sẽ ném lỗi nếu còn undefined).
      set(ref(db, `users/${uid}/pm/plans/${created.id}`), normalizePlan(created));
      return created;
    },
    [uid],
  );

  const updatePlan = useCallback(
    (id: string, data: PlanInput) => {
      if (!db || !uid) return;
      const prev = stateRef.current.plans.find((p) => p.id === id);
      const now = new Date().toISOString();
      const next: WeeklyPlan = {
        ...data,
        id,
        order: prev?.order ?? stateRef.current.plans.length,
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
      };
      // Chuẩn hóa để loại các key undefined (RTDB set sẽ ném lỗi nếu còn undefined).
      set(ref(db, `users/${uid}/pm/plans/${id}`), normalizePlan(next));
    },
    [uid],
  );

  const deletePlan = useCallback(
    (id: string) => {
      if (!db || !uid) return;
      set(ref(db, `users/${uid}/pm/plans/${id}`), null);
    },
    [uid],
  );

  const setWorkstreamProgress = useCallback(
    (
      planId: string,
      updates: { pi: number; wi: number; state?: WorkstreamState; progress?: number }[],
    ) => {
      if (!db || !uid || updates.length === 0) return;
      const prev = stateRef.current.plans.find((p) => p.id === planId);
      if (!prev) return;
      // Gom patch theo (pi,wi) để tra nhanh.
      const byKey = new Map(updates.map((u) => [`${u.pi}:${u.wi}`, u]));
      const next: WeeklyPlan = {
        ...prev,
        updatedAt: new Date().toISOString(),
        projects: (prev.projects ?? []).map((pr, pi) => ({
          ...pr,
          workstreams: (pr.workstreams ?? []).map((w, wi) => {
            const u = byKey.get(`${pi}:${wi}`);
            if (!u) return w;
            const merged = { ...w };
            if (u.state !== undefined) merged.state = u.state;
            if (u.progress !== undefined) merged.progress = u.progress;
            return merged;
          }),
        })),
      };
      // Chuẩn hóa để loại key undefined trước khi ghi.
      set(ref(db, `users/${uid}/pm/plans/${planId}`), normalizePlan(next));
    },
    [uid],
  );

  const addReport = useCallback(
    (data: ReportInput): DailyReport | null => {
      if (!db || !uid) return null;
      const now = new Date().toISOString();
      const created: DailyReport = {
        ...data,
        id: uuidv4(),
        order: stateRef.current.reports.length,
        createdAt: now,
        updatedAt: now,
      };
      set(ref(db, `users/${uid}/pm/reports/${created.id}`), normalizeReport(created));
      return created;
    },
    [uid],
  );

  const updateReport = useCallback(
    (id: string, data: ReportInput) => {
      if (!db || !uid) return;
      const prev = stateRef.current.reports.find((r) => r.id === id);
      const now = new Date().toISOString();
      const next: DailyReport = {
        ...data,
        id,
        order: prev?.order ?? stateRef.current.reports.length,
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
      };
      // Chuẩn hóa để loại các key undefined (RTDB set sẽ ném lỗi nếu còn undefined).
      set(ref(db, `users/${uid}/pm/reports/${id}`), normalizeReport(next));
    },
    [uid],
  );

  const deleteReport = useCallback(
    (id: string) => {
      if (!db || !uid) return;
      set(ref(db, `users/${uid}/pm/reports/${id}`), null);
    },
    [uid],
  );

  return (
    <PmContext.Provider
      value={{
        apps,
        tasks,
        meta,
        plans,
        loading,
        addApp,
        updateApp,
        deleteApp,
        splitAppByFlavor,
        ungroupApps,
        addTask,
        updateTask,
        deleteTask,
        deleteTasks,
        assignTasksToApp,
        addTaskType,
        updateTaskType,
        deleteTaskType,
        addMilestoneType,
        updateMilestoneType,
        deleteMilestoneType,
        addPlanCategory,
        updatePlanCategory,
        deletePlanCategory,
        importData,
        addPlan,
        updatePlan,
        deletePlan,
        setWorkstreamProgress,
        reports,
        addReport,
        updateReport,
        deleteReport,
        members,
        addMember,
        updateMember,
        deleteMember,
        rotateMemberToken,
        setMemberLocked,
        setMemberProjects,
        updateKpiRules,
        syncKpiSheetMeta,
      }}
    >
      {children}
    </PmContext.Provider>
  );
}

export function usePm() {
  const ctx = useContext(PmContext);
  if (!ctx) throw new Error('usePm must be used within PmProvider');
  return ctx;
}

/** Tập key milestone được đánh dấu là release (dẫn xuất từ meta.milestoneTypes) — dùng chung. */
export function useReleaseKeys(): Set<string> {
  const { meta } = usePm();
  return useMemo(() => releaseKeysOf(meta.milestoneTypes), [meta.milestoneTypes]);
}
