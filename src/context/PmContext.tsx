import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ref, onValue, set, update } from 'firebase/database';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../lib/firebase';
import { useAuth } from '../auth/useAuth';
import { computeSplit, keyOfTask } from '../lib/flavorSplit';
import {
  DEFAULT_STATUSES,
  DEFAULT_TASK_TYPES,
  type AppItem,
  type PmImportPayload,
  type PmMeta,
  type TaskItem,
  type WeeklyPlan,
} from '../pmTypes';

// Các trường cho phép sửa/tạo task (bỏ id/order/createdAt/updatedAt do context quản lý).
type TaskInput = Partial<
  Omit<TaskItem, 'id' | 'order' | 'createdAt' | 'updatedAt'>
> & { title: string };
type TaskUpdates = Partial<Omit<TaskItem, 'id' | 'createdAt'>>;

// Trường được phép truyền khi tạo plan (id/order/createdAt/updatedAt do context điền).
type PlanInput = Omit<WeeklyPlan, 'id' | 'order' | 'createdAt' | 'updatedAt'>;

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
  /** Ghi đè toàn bộ users/{uid}/pm bằng payload (dùng cho import). */
  importData: (payload: PmImportPayload) => Promise<void>;
  addPlan: (data: PlanInput) => WeeklyPlan | null;
  /** Ghi đè toàn bộ plan (trình sửa lưu cả object). */
  updatePlan: (id: string, data: PlanInput) => void;
  deletePlan: (id: string) => void;
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
      })),
    })),
    timeline: p.timeline ?? [],
  };
}

const PmContext = createContext<PmState | null>(null);

export function PmProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid;

  const [apps, setApps] = useState<AppItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [meta, setMeta] = useState<PmMeta>({
    taskTypes: DEFAULT_TASK_TYPES,
    statuses: DEFAULT_STATUSES,
  });
  const [plans, setPlans] = useState<WeeklyPlan[]>([]);
  const [loading, setLoading] = useState(true);

  // Đọc state mới nhất trong mutator (không đọc closure) — như DocumentsContext.
  const stateRef = useRef<{
    apps: AppItem[];
    tasks: TaskItem[];
    meta: PmMeta;
    plans: WeeklyPlan[];
  }>({
    apps: [],
    tasks: [],
    meta: { taskTypes: DEFAULT_TASK_TYPES, statuses: DEFAULT_STATUSES },
    plans: [],
  });
  stateRef.current.apps = apps;
  stateRef.current.tasks = tasks;
  stateRef.current.meta = meta;
  stateRef.current.plans = plans;

  useEffect(() => {
    if (!db || !uid) {
      setApps([]);
      setTasks([]);
      setMeta({ taskTypes: DEFAULT_TASK_TYPES, statuses: DEFAULT_STATUSES });
      setPlans([]);
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
      });
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

    return () => {
      unsubApps();
      unsubTasks();
      unsubMeta();
      unsubPlans();
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
      const created: TaskItem = {
        id: uuidv4(),
        title: data.title,
        type: data.type ?? m.taskTypes[0] ?? 'Release',
        status: data.status ?? m.statuses[0] ?? 'Chưa bắt đầu',
        order: cur.length,
        createdAt: now,
        updatedAt: now,
        // Chỉ ghi các trường tùy chọn khi có giá trị (tránh undefined trong RTDB).
        ...(data.appId ? { appId: data.appId } : {}),
        ...(data.version ? { version: data.version } : {}),
        ...(data.description ? { description: data.description } : {}),
        ...(data.startDate ? { startDate: data.startDate } : {}),
        ...(data.endDate ? { endDate: data.endDate } : {}),
        ...(data.planDate ? { planDate: data.planDate } : {}),
        ...(data.milestone ? { milestone: data.milestone } : {}),
        ...(data.assignee ? { assignee: data.assignee } : {}),
        ...(data.flavor ? { flavor: data.flavor } : {}),
      };
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

  const importData = useCallback(
    async (payload: PmImportPayload) => {
      if (!db || !uid) return;
      // Ghi đè apps/tasks/meta nhưng GIỮ NGUYÊN plans (không đụng node plans).
      await update(ref(db, `users/${uid}/pm`), {
        apps: payload.apps ?? {},
        tasks: payload.tasks ?? {},
        meta: payload.meta ?? {
          taskTypes: DEFAULT_TASK_TYPES,
          statuses: DEFAULT_STATUSES,
        },
      });
    },
    [uid],
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
      set(ref(db, `users/${uid}/pm/plans/${created.id}`), created);
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
      set(ref(db, `users/${uid}/pm/plans/${id}`), next);
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
        importData,
        addPlan,
        updatePlan,
        deletePlan,
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
