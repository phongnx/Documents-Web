// Editor Plan tuần (bản redesign Material 3, 02/11/2026) — cùng hệ với editor Báo cáo ngày:
// - ≥ 1200px: cột sửa + khung xem trước dính bên phải (ẩn được); < 1200px: tab Sửa / Xem trước.
// - Trạng thái nhánh CHỈ XEM ở đây (sửa ở Tổng quan). Lưu / Export / xem trước lấy trạng thái
//   mới nhất trong DB đè lên form (mergeLatestState) → Lưu không ghi đè trạng thái đã đổi ở
//   nơi khác trong lúc editor đang mở.
// - Dự án / nhánh / dòng timeline mang key nội bộ `_k` (không ghi DB) để biết mục nào đã sửa
//   khi đổi thứ tự, và để focus / tô mục vừa thêm.
// - Ngày kết thúc trước ngày bắt đầu → chặn Lưu và Export.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { usePm, useReleaseKeys } from '../context/PmContext';
import { useDocuments } from '../context/DocumentsContext';
import { useSeededForm } from '../hooks/useSeededForm';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';
import { useMediaQuery } from '../hooks/useMediaQuery';
import BoardNav from '../components/board/BoardNav';
import ReportBodyEditor from '../components/board/ReportBodyEditor';
import ReportAppPicker from '../components/board/ReportAppPicker';
import ReportSortDialog from '../components/board/ReportSortDialog';
import ReportPopMenu from '../components/board/ReportPopMenu';
import KpiDialog from '../components/board/KpiDialog';
import KsumConfirmDialog from '../components/board/KsumConfirmDialog';
import TaskPickerDialog, { type TaskInPlan } from '../components/board/TaskPickerDialog';
import PlanDayPicker from '../components/board/PlanDayPicker';
import PlanPreviewPane, { catTone, msTone, ST_CLS, ST_ICON } from '../components/board/PlanPreviewPane';
import { EstSnackbar, useEstNotice } from '../components/board/EstSheetTable';
import {
  IcArrowLeft,
  IcCalendar,
  IcCheck,
  IcChevronDown,
  IcChevronUp,
  IcClose,
  IcCopy,
  IcDoc,
  IcDownload,
  IcEdit,
  IcExternal,
  IcEye,
  IcFlag,
  IcFolder,
  IcGrip,
  IcInfo,
  IcLink,
  IcLinkOff,
  IcList,
  IcMoreV,
  IcPlus,
  IcRefresh,
  IcRocket,
  IcSave,
  IcSort,
  IcTrash,
  IcWarn,
} from '../components/board/ksumIcons';
import {
  catMeta,
  dayRank,
  isReleaseWs,
  msKeyFromLabel,
  WORKSTREAM_STATE_META,
  type AppItem,
  type PlanMilestone,
  type PlanProject,
  type PlanTimelineItem,
  type PlanWorkstream,
  type WeeklyPlan,
} from '../pmTypes';
import { buildDetailedHtml, buildReleaseTestHtml } from '../lib/planExport';
import { taskLines } from '../lib/planAutofill';
import { normName, suggestAppId } from '../lib/pmText';
import { dateOfWeekday, isoLocal, isoWeek, mondayOf, weekdayVN } from '../lib/pmDates';
import { formatDateVi, formatDayMonth, roman } from '../lib/reportFormat';
import {
  matchTimelineRow,
  mergeLatestState,
  msVersion,
  reconcileTimeline,
  timelineRowSource,
  tokensOf,
} from '../lib/planProgress';

type FormWs = PlanWorkstream & { _k: string };
interface FormProject {
  name: string;
  appId?: string;
  workstreams: FormWs[];
  _k: string;
}
type FormTl = PlanTimelineItem & { _k: string };
interface PlanForm {
  title: string;
  description: string;
  weekStart: string;
  weekEnd: string;
  projects: FormProject[];
  timeline: FormTl[];
}
type PlanData = Omit<WeeklyPlan, 'id' | 'order' | 'createdAt' | 'updatedAt'>;

function toForm(p: WeeklyPlan): PlanForm {
  return {
    title: p.title ?? '',
    description: p.description ?? '',
    weekStart: p.weekStart,
    weekEnd: p.weekEnd,
    projects: (p.projects ?? []).map((pr, i) => ({
      name: pr.name,
      ...(pr.appId ? { appId: pr.appId } : {}),
      _k: `s${i}`,
      workstreams: (pr.workstreams ?? []).map((w, wi) => ({
        ...w,
        items: w.items ?? [],
        _k: `s${i}.${wi}`,
      })),
    })),
    timeline: (p.timeline ?? []).map((t, i) => ({ day: t.day, release: t.release, _k: `t${i}` })),
  };
}

// Bỏ key nội bộ trước khi ghi DB / dựng bản export.
function wsData(w: FormWs): PlanWorkstream {
  return {
    title: w.title,
    category: w.category,
    items: w.items,
    ...(w.milestone ? { milestone: w.milestone } : {}),
    ...(w.sourceTaskIds?.length ? { sourceTaskIds: w.sourceTaskIds } : {}),
    ...(w.state ? { state: w.state } : {}),
    ...(typeof w.progress === 'number' ? { progress: w.progress } : {}),
  };
}
const projData = (p: FormProject): PlanProject => ({
  name: p.name,
  ...(p.appId ? { appId: p.appId } : {}),
  workstreams: p.workstreams.map(wsData),
});
function toData(f: PlanForm): PlanData {
  return {
    title: f.title,
    description: f.description,
    weekStart: f.weekStart,
    weekEnd: f.weekEnd,
    projects: f.projects.map(projData),
    timeline: f.timeline.map((t) => ({ day: t.day, release: t.release })),
  };
}

// Chữ ký so "đã sửa" — bỏ state/progress (không sửa ở editor; đổi ở nơi khác không tính).
const projSig = (p: FormProject) =>
  JSON.stringify([
    p.name,
    p.appId ?? '',
    p.workstreams.map((w) => [w.title, w.category, w.items, w.milestone ?? null, w.sourceTaskIds ?? []]),
  ]);
const tlSig = (tl: FormTl[]) => JSON.stringify(tl.map((t) => [t.day, t.release]));
// Sort timeline theo thứ (giữ key) — cùng luật sortTimeline.
const sortTl = (list: FormTl[]) => [...list].sort((a, b) => dayRank(a.day) - dayRank(b.day));

// Tên file export gọn (bỏ ký tự cấm).
function fileBase(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_').slice(0, 80) || 'plan';
}
// 'yyyy-mm-dd' → 'MM-DD' / 'MM-DD-YYYY' (format tên file export).
const mmdd = (iso: string) => iso.slice(5);
const mmddyyyy = (iso: string) => `${iso.slice(5)}-${iso.slice(0, 4)}`;

const PLAN_FOLDER = 'THSOFT - Weekly Plan';
const TESTER_SUBFOLDER = 'Tester';
// 1 lần export đã dựng xong nội dung, chờ ghi (hoặc chờ chọn khi trùng tên).
interface ExportJob {
  kind: 'detailed' | 'release';
  base: string;
  html: string;
  folderId: string;
  dest: string;
  savedFirst: boolean;
}
const ITEMS_PLACEHOLDER = '- Đầu việc\n+ Ý con\n-> Mốc / kết quả';
const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Remount theo id: đổi plan thì reset sạch form, ảnh chụp "đã lưu" và mọi state cục bộ.
export default function BoardPlanEditPage() {
  const { id = '' } = useParams();
  return <PlanEditor key={id} id={id} />;
}

function PlanEditor({ id }: { id: string }) {
  const navigate = useNavigate();
  const {
    plans,
    apps,
    tasks,
    meta,
    loading,
    updatePlan,
    deletePlan,
    addMilestoneType,
    addPlanCategory,
  } = usePm();
  const releaseKeys = useReleaseKeys();
  const plan = plans.find((p) => p.id === id);

  const { form, setForm } = useSeededForm<PlanForm, WeeklyPlan>(plan, toForm);
  // Ảnh chụp bản đã lưu — so với form để biết dự án nào đã sửa.
  const [saved, setSaved] = useState<PlanForm | null>(null);
  const narrow = useMediaQuery('(max-width: 839px)');
  const wide = useMediaQuery('(min-width: 1200px)');
  const { notice, notify } = useEstNotice();

  // Dự án mở thân: desktop mở hết, màn hẹp thu gọn hết (đặt 1 lần lúc nạp form).
  const [openSet, setOpenSet] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (form && !saved) {
      setSaved(form);
      setOpenSet(narrow ? new Set() : new Set(form.projects.map((p) => p._k)));
    }
  }, [form, saved, narrow]);

  // `?tab=preview` (mở từ danh sách < 1200px) → vào thẳng tab Xem trước.
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<'edit' | 'preview'>(() =>
    searchParams.get('tab') === 'preview' ? 'preview' : 'edit',
  );
  const [pvHidden, setPvHidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [curK, setCurK] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ k: string; el: 'name' | 'ws' | 'card'; wk?: string } | null>(
    null,
  );
  const [pickFor, setPickFor] = useState<string | null>(null); // _k dự án hoặc '__add'
  const [menuFor, setMenuFor] = useState<string | null>(null); // 'p:'/'w:'/'c:'/'m:'+key, '__head', '__export'
  const [dayFor, setDayFor] = useState<string | null>(null); // _k dòng timeline đang chọn thứ
  const [sortOpen, setSortOpen] = useState(false);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const [dupAsk, setDupAsk] = useState<{ app: AppItem; name: string; k: string } | null>(null);
  const [taskFor, setTaskFor] = useState<string | null>(null); // _k dự án mở dialog chọn task
  const [catAsk, setCatAsk] = useState<{ pk: string; wk: string } | null>(null);
  const [catName, setCatName] = useState('');
  const [msAsk, setMsAsk] = useState<{ pk: string; wk: string } | null>(null);
  const [msLabel, setMsLabel] = useState('');
  const [msRel, setMsRel] = useState(true);
  const [syncAsk, setSyncAsk] = useState<{ projects: FormProject[]; list: string[] } | null>(null);
  const [delAsk, setDelAsk] = useState(false);
  const [dragK, setDragK] = useState<string | null>(null);
  // Dòng timeline vừa tự thêm từ milestone (key → "nhánh · dự án") để hiện dòng giải thích.
  const [autoTl, setAutoTl] = useState<Map<string, string>>(new Map());

  const keySeq = useRef(0);
  const nameRefs = useRef(new Map<string, HTMLInputElement>());
  const wsRefs = useRef(new Map<string, HTMLInputElement>());
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  const pvRef = useRef<HTMLDivElement>(null);
  const newKey = (p: string) => `${p}${keySeq.current++}`;

  // ----- Hook upload file export vào quản lý tài liệu (đặt TRƯỚC mọi early return) -----
  const {
    documents,
    folders,
    addFolder,
    addDocuments,
    updateDocument,
    loading: docsLoading,
  } = useDocuments();
  // Export trùng tên đang chờ chọn Huỷ / Bỏ qua / Ghi đè; export xong → dialog kết quả.
  const [expDup, setExpDup] = useState<{ job: ExportJob; existingId: string } | null>(null);
  const [expDone, setExpDone] = useState<(ExportJob & { docId: string; replaced: boolean }) | null>(null);
  // Cache id folder vừa tạo trong phiên: export 2 bản liên tiếp trước khi onValue
  // dội folder mới về sẽ không tạo folder trùng.
  const createdFolders = useRef<Record<string, string>>({});

  // Reconcile timeline theo task nguồn 1 LẦN khi mở plan (data cũ có thể lệch). Chỉ plan
  // tuần hiện tại / tương lai; kết quả chỉ đổi form (thành "chưa lưu") — bấm Lưu mới ghi DB.
  const reconciled = useRef(false);
  useEffect(() => {
    if (!form || loading || reconciled.current) return;
    reconciled.current = true;
    if (form.weekEnd < isoLocal(new Date())) return; // plan quá khứ: giữ lịch sử
    const fixed = reconcileTimeline(toData(form), tasks, apps, releaseKeys);
    if (!fixed) return;
    setForm((f) => {
      if (!f) return f;
      // Giữ key của dòng cũ cùng nhãn → chỉ dòng thật sự mới / đổi nhãn được tô "mới".
      const used = new Set<string>();
      const timeline = fixed.map((t) => {
        const m = f.timeline.find((o) => !used.has(o._k) && o.release === t.release);
        if (m) used.add(m._k);
        return { ...t, _k: m ? m._k : `r${keySeq.current++}` };
      });
      return { ...f, timeline };
    });
  }, [form, loading, tasks, apps, releaseKeys, setForm]);

  // ----- Trạng thái thay đổi so với bản đã lưu -----
  const savedSig = new Map((saved?.projects ?? []).map((p) => [p._k, projSig(p)]));
  const changedKeys = new Set(
    (form?.projects ?? []).filter((p) => savedSig.get(p._k) !== projSig(p)).map((p) => p._k),
  );
  const dirty =
    !!form &&
    !!saved &&
    (changedKeys.size > 0 ||
      form.title !== saved.title ||
      form.description !== saved.description ||
      form.weekStart !== saved.weekStart ||
      form.weekEnd !== saved.weekEnd ||
      form.projects.map((p) => p._k).join('|') !== saved.projects.map((p) => p._k).join('|') ||
      tlSig(form.timeline) !== tlSig(saved.timeline));
  useUnsavedGuard(dirty);
  const dateErr = !!form && !!form.weekStart && !!form.weekEnd && form.weekEnd < form.weekStart;

  // Mục vừa thêm: cuộn tới + focus ô tên dự án / ô tên nhánh.
  useEffect(() => {
    if (!fresh) return;
    const el =
      fresh.el === 'name'
        ? nameRefs.current.get(fresh.k)
        : fresh.el === 'ws' && fresh.wk
          ? wsRefs.current.get(fresh.wk)
          : undefined;
    const target = (fresh.el === 'ws' && el) || cardRefs.current.get(fresh.k);
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el?.focus({ preventScroll: true });
    el?.select();
  }, [fresh]);

  // Khung xem trước (desktop) tự cuộn tới dự án đang sửa — chỉ cuộn trong khung.
  const hi = form && curK ? form.projects.findIndex((p) => p._k === curK) : -1;
  useEffect(() => {
    const box = pvRef.current;
    if (!box || hi < 0) return;
    const el = box.querySelector<HTMLElement>(`[data-pidx="${hi}"]`);
    if (!el) return;
    const top = el.offsetTop;
    if (top < box.scrollTop || top + el.offsetHeight > box.scrollTop + box.clientHeight)
      box.scrollTo({ top: Math.max(0, top - 12), behavior: 'smooth' });
  }, [hi, wide, tab, pvHidden]);

  // ----- Lưu (ref để nút "Thử lại" trong snackbar luôn lưu form mới nhất) -----
  const save = async (): Promise<boolean> => {
    if (!form || saving) return false;
    if (dateErr) {
      notify({ text: 'Ngày kết thúc đang trước ngày bắt đầu — sửa lại rồi lưu.', kind: 'error' });
      return false;
    }
    const snap = form;
    const data = toData(snap);
    data.projects = mergeLatestState(data.projects, plan?.projects);
    setSaving(true);
    setSaveErr(false);
    try {
      await updatePlan(id, data);
      setSaved(snap);
      setSaving(false);
      notify({ text: `Đã lưu plan ${formatDayMonth(snap.weekStart)} – ${formatDateVi(snap.weekEnd)}` });
      return true;
    } catch {
      setSaving(false);
      setSaveErr(true);
      notify({
        text: 'Không lưu được. Thay đổi vẫn còn trên trang.',
        kind: 'error',
        action: { label: 'Thử lại', onClick: () => void saveRef.current() },
      });
      return false;
    }
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  if (loading && !form) {
    return (
      <div className="container kml-page rpt-page pl-page">
        <BoardNav />
        <div className="kml-empty">
          <p>Đang tải plan…</p>
        </div>
      </div>
    );
  }
  if (!plan || !form) {
    return (
      <div className="container kml-page rpt-page pl-page">
        <BoardNav />
        <div className="kml-empty">
          {deleting ? (
            <p>Đang xoá plan…</p>
          ) : (
            <>
              <span className="kml-empty-ic">
                <IcInfo size={28} />
              </span>
              <h2>Không tìm thấy plan này</h2>
              <p>Plan có thể đã bị xoá, hoặc link không đúng.</p>
              <Link to="/board/plan" className="kml-btn kml-btn-tonal">
                <IcArrowLeft size={16} />
                Về danh sách plan
              </Link>
            </>
          )}
        </div>
      </div>
    );
  }

  // ----- Cập nhật form (dạng hàm để các thao tác liên tiếp không đè nhau) -----
  const updateProjects = (fn: (ps: FormProject[]) => FormProject[]) =>
    setForm((f) => (f ? { ...f, projects: fn(f.projects) } : f));
  const setProject = (k: string, u: Partial<FormProject>) =>
    updateProjects((ps) => ps.map((p) => (p._k === k ? { ...p, ...u } : p)));
  const setWs = (pk: string, wk: string, u: Partial<PlanWorkstream>) =>
    updateProjects((ps) =>
      ps.map((p) =>
        p._k !== pk
          ? p
          : { ...p, workstreams: p.workstreams.map((w) => (w._k === wk ? { ...w, ...u } : w)) },
      ),
    );
  const setTl = (fn: (tl: FormTl[]) => FormTl[]) =>
    setForm((f) => (f ? { ...f, timeline: fn(f.timeline) } : f));
  const setOpen = (k: string, on: boolean) =>
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (on) next.add(k);
      else next.delete(k);
      return next;
    });

  const findProject = (pk: string) => form.projects.find((p) => p._k === pk);
  const appNameOf = (pr: { name: string; appId?: string }) =>
    (apps.find((a) => a.id === pr.appId)?.name ?? pr.name).trim();
  // 'Thứ N' → 'dd/mm' của ngày đó trong khoảng ngày plan; không có / khoảng lỗi → ''.
  const dayDate = (day: string): string => {
    const iso = dateOfWeekday(day, form.weekStart, form.weekEnd);
    return iso ? formatDayMonth(iso) : '';
  };
  const usedAppIds = new Set(form.projects.map((p) => p.appId).filter(Boolean) as string[]);
  const usedByOthers = (k: string | null) => {
    const m = new Map<string, number>();
    form.projects.forEach((p, i) => {
      if (p.appId && p._k !== k) m.set(p.appId, i);
    });
    return m;
  };

  // ----- Rời trang (hỏi lưu nếu còn thay đổi) -----
  const go = (to: string) => (dirty ? setLeaveTo(to) : navigate(to));
  const saveAndLeave = async () => {
    const to = leaveTo ?? '/board/plan';
    if (await save()) navigate(to);
    else setLeaveTo(null);
  };

  // ----- Timeline tự cập nhật theo milestone release -----
  // Timeline đã có dòng của app này chưa? version đã biết: dòng đúng version HOẶC dòng chưa
  // có version (reconcile sẽ nâng cấp); version chưa biết: bất kỳ dòng nào của app.
  const hasTimelineFor = (list: PlanTimelineItem[], appName: string, version: string) =>
    list.some((x) =>
      version
        ? matchTimelineRow(x.release, appName, version)
        : tokensOf(appName).every((k) => normName(x.release).includes(k)),
    );
  const addTlRows = (rows: { release: string; day: string; src: string }[]) => {
    if (rows.length === 0) return;
    const keyed = rows.map((r) => ({ day: r.day, release: r.release, _k: newKey('a'), src: r.src }));
    setTl((tl) => sortTl([...tl, ...keyed.map(({ day, release, _k }) => ({ day, release, _k }))]));
    setAutoTl((m) => {
      const next = new Map(m);
      for (const r of keyed) next.set(r._k, r.src);
      return next;
    });
    const keys = new Set(keyed.map((r) => r._k));
    notify(
      {
        text:
          keyed.length === 1
            ? `Đã thêm dòng timeline «${keyed[0].release}»${keyed[0].day ? '' : ' — chọn thứ ở mục Timeline'}`
            : `Đã thêm ${keyed.length} dòng timeline`,
        action: { label: 'Hoàn tác', onClick: () => setTl((tl) => tl.filter((x) => !keys.has(x._k))) },
      },
      8000,
    );
  };

  // Nhánh vừa TRỞ THÀNH release (bật milestone / đổi loại) → đảm bảo timeline có dòng của app.
  // forceRelease: loại milestone mới thêm chưa kịp có trong releaseKeys.
  const ensureTimelineForRelease = (pk: string, wsTitle: string, ms: PlanMilestone, forceRelease = false) => {
    if (!forceRelease && !releaseKeys.has(ms.type)) return;
    const pr = findProject(pk);
    if (!pr) return;
    const appName = appNameOf(pr);
    if (!appName) return;
    const version = msVersion(ms.text);
    if (hasTimelineFor(form.timeline, appName, version)) return;
    addTlRows([
      { day: '', release: `${appName} ${version}`.trim(), src: `${wsTitle || 'nhánh'} · ${pr.name}` },
    ]);
  };

  // Nhánh KHÔNG còn là release → gỡ dòng timeline của mốc đó. Giữ dòng nếu app vẫn còn
  // nhánh release khác cùng mốc (cùng version, hoặc 1 trong 2 chưa có version).
  const removeTimelineForRelease = (pk: string, wk: string, prev: PlanMilestone) => {
    if (!releaseKeys.has(prev.type)) return;
    const pr = findProject(pk);
    if (!pr) return;
    const appName = appNameOf(pr);
    if (!appName) return;
    const version = msVersion(prev.text);
    const stillRelease = form.projects.some((p2) =>
      p2.workstreams.some((w2) => {
        if (p2._k === pk && w2._k === wk) return false;
        if (!w2.milestone || !releaseKeys.has(w2.milestone.type)) return false;
        if (normName(appNameOf(p2)) !== normName(appName)) return false;
        const v2 = msVersion(w2.milestone.text);
        return !version || !v2 || normName(v2) === normName(version);
      }),
    );
    if (stillRelease) return;
    const idx = form.timeline.findIndex((x) => matchTimelineRow(x.release, appName, version));
    if (idx < 0) return;
    const row = form.timeline[idx];
    setTl((tl) => tl.filter((x) => x._k !== row._k));
    notify(
      {
        text: `Đã gỡ dòng timeline «${row.release}» vì nhánh không còn là release`,
        action: {
          label: 'Hoàn tác',
          onClick: () =>
            setTl((tl) => {
              if (tl.some((x) => x._k === row._k)) return tl;
              const next = [...tl];
              next.splice(Math.min(idx, next.length), 0, row);
              return next;
            }),
        },
      },
      8000,
    );
  };

  // Nhánh thêm từ dialog chọn task: nhánh có milestone Release → thêm dòng "App vX" (task có
  // planDate trong tuần → điền đúng thứ).
  const addTimelineFromTasks = (ws: PlanWorkstream[], projName: string) => {
    const rows: { release: string; day: string; src: string }[] = [];
    for (const w of ws) {
      if (!w.milestone || !releaseKeys.has(w.milestone.type)) continue;
      for (const tid of w.sourceTaskIds ?? []) {
        const t = tasks.find((x) => x.id === tid);
        if (!t) continue;
        const appName = apps.find((a) => a.id === t.appId)?.name ?? '';
        const release = `${appName} ${t.version ?? ''}`.trim();
        if (!release) continue;
        if (hasTimelineFor([...form.timeline, ...rows], appName || release, t.version ?? '')) continue;
        const inWeek = !!t.planDate && form.weekStart <= t.planDate && t.planDate <= form.weekEnd;
        rows.push({ day: inWeek ? weekdayVN(t.planDate!) : '', release, src: `${w.title} · ${projName}` });
      }
    }
    addTlRows(rows);
  };

  // ----- Dự án -----
  const addManual = () => {
    const k = newKey('n');
    updateProjects((ps) => [...ps, { name: 'Dự án mới', workstreams: [], _k: k }]);
    setOpen(k, true);
    setFresh({ k, el: 'name' });
    setTab('edit');
  };
  const addFromApp = (appId: string, mode: 'ask' | 'new' | 'attach' = 'ask') => {
    const app = apps.find((a) => a.id === appId);
    if (!app || usedAppIds.has(app.id)) return;
    // Dự án nhập tay chưa gắn app nhưng trùng tên → có thể là cùng dự án, hỏi lại.
    const same = form.projects.find((p) => !p.appId && sameText(p.name, app.name));
    if (same && mode === 'ask') {
      setDupAsk({ app, name: same.name, k: same._k });
      return;
    }
    if (same && mode === 'attach') {
      setProject(same._k, { appId: app.id });
      setOpen(same._k, true);
      setFresh({ k: same._k, el: 'card' });
      notify({ text: `Đã gắn ${app.name} vào dự án «${same.name}»` });
      return;
    }
    const k = newKey('n');
    updateProjects((ps) => [...ps, { name: app.name, appId: app.id, workstreams: [], _k: k }]);
    setOpen(k, true);
    setFresh({ k, el: 'card' });
    setTab('edit');
  };
  const removeProject = (k: string) => {
    const idx = form.projects.findIndex((p) => p._k === k);
    const removed = form.projects[idx];
    if (!removed) return;
    updateProjects((ps) => ps.filter((p) => p._k !== k));
    notify(
      {
        text: `Đã xoá dự án ${roman(idx + 1)} · ${removed.name.trim() || '(chưa đặt tên)'}`,
        action: {
          label: 'Hoàn tác',
          onClick: () =>
            updateProjects((ps) => {
              if (ps.some((p) => p._k === removed._k)) return ps;
              const next = [...ps];
              next.splice(Math.min(idx, next.length), 0, removed);
              return next;
            }),
        },
      },
      8000,
    );
  };
  const moveTo = (k: string, to: number) =>
    updateProjects((ps) => {
      const from = ps.findIndex((p) => p._k === k);
      if (from < 0 || from === to) return ps;
      const next = [...ps];
      const [it] = next.splice(from, 1);
      next.splice(Math.max(0, Math.min(to, next.length)), 0, it);
      return next;
    });
  const applyOrder = (keys: string[]) =>
    updateProjects((ps) =>
      keys.map((k) => ps.find((p) => p._k === k)).filter((p): p is FormProject => !!p),
    );

  // ----- Nhánh -----
  const addBlankWs = (pk: string) => {
    const wk = newKey('w');
    updateProjects((ps) =>
      ps.map((p) =>
        p._k === pk
          ? { ...p, workstreams: [...p.workstreams, { title: 'Android', category: 'release', items: [''], _k: wk }] }
          : p,
      ),
    );
    setFresh({ k: pk, el: 'ws', wk });
  };
  const addWsFromTasks = (pk: string, ws: PlanWorkstream[]) => {
    if (ws.length === 0) return;
    const keyed = ws.map((w) => ({ ...w, _k: newKey('w') }));
    updateProjects((ps) =>
      ps.map((p) => (p._k === pk ? { ...p, workstreams: [...p.workstreams, ...keyed] } : p)),
    );
    setFresh({ k: pk, el: 'ws', wk: keyed[0]._k });
  };
  const removeWs = (pk: string, wk: string) => {
    const pr = findProject(pk);
    const idx = pr?.workstreams.findIndex((w) => w._k === wk) ?? -1;
    const removed = pr?.workstreams[idx];
    if (!pr || !removed) return;
    updateProjects((ps) =>
      ps.map((p) => (p._k === pk ? { ...p, workstreams: p.workstreams.filter((w) => w._k !== wk) } : p)),
    );
    notify(
      {
        text: `Đã xoá nhánh «${removed.title.trim() || '(chưa đặt tên)'}» của ${pr.name.trim() || 'dự án'}`,
        action: {
          label: 'Hoàn tác',
          onClick: () =>
            updateProjects((ps) =>
              ps.map((p) => {
                if (p._k !== pk || p.workstreams.some((w) => w._k === wk)) return p;
                const next = [...p.workstreams];
                next.splice(Math.min(idx, next.length), 0, removed);
                return { ...p, workstreams: next };
              }),
            ),
        },
      },
      8000,
    );
  };
  const moveWs = (pk: string, wk: string, dir: -1 | 1) =>
    updateProjects((ps) =>
      ps.map((p) => {
        if (p._k !== pk) return p;
        const i = p.workstreams.findIndex((w) => w._k === wk);
        const to = i + dir;
        if (i < 0 || to < 0 || to >= p.workstreams.length) return p;
        const next = [...p.workstreams];
        [next[i], next[to]] = [next[to], next[i]];
        return { ...p, workstreams: next };
      }),
    );

  // ----- Milestone -----
  const toggleMilestone = (pk: string, w: FormWs, on: boolean) => {
    const prev = w.milestone;
    const ms = { type: 'release', text: 'Build release v…' };
    setWs(pk, w._k, { milestone: on ? ms : undefined });
    // Bật (mặc định loại release) → thêm dòng timeline; tắt nhánh release → gỡ dòng.
    if (on) ensureTimelineForRelease(pk, w.title, ms);
    else if (prev) removeTimelineForRelease(pk, w._k, prev);
  };
  const changeMsType = (pk: string, w: FormWs, type: string) => {
    const prev = w.milestone;
    if (!prev || prev.type === type) return;
    const ms = { type, text: prev.text };
    setWs(pk, w._k, { milestone: ms });
    if (releaseKeys.has(type)) ensureTimelineForRelease(pk, w.title, ms);
    else removeTimelineForRelease(pk, w._k, prev);
  };

  // Danh sách loại nhánh: danh mục + loại đang dùng trong plan (giữ loại lạ để không mất).
  const usedCats = form.projects.flatMap((p) => p.workstreams.map((w) => w.category));
  const catOptions = [...new Set([...meta.planCategories, ...usedCats])].filter(Boolean);
  const catDup = !!catName.trim() && catOptions.some((c) => sameText(c, catName) || sameText(catMeta(c).label, catName));
  const confirmCat = () => {
    const name = catName.trim();
    if (!catAsk || !name || catDup) return;
    addPlanCategory(name);
    setWs(catAsk.pk, catAsk.wk, { category: name });
    setCatAsk(null);
    notify({ text: `Đã thêm loại nhánh «${name}» vào danh mục` });
  };

  const msKeyNew = msKeyFromLabel(msLabel, meta.milestoneTypes.length);
  const msDup =
    !!msLabel.trim() &&
    meta.milestoneTypes.some((t) => sameText(t.label, msLabel) || t.key === msKeyNew);
  const confirmMsType = () => {
    const label = msLabel.trim();
    if (!msAsk || !label || msDup) return;
    const w = findProject(msAsk.pk)?.workstreams.find((x) => x._k === msAsk.wk);
    addMilestoneType(label, msRel);
    if (w) {
      const prev = w.milestone;
      const ms = { type: msKeyNew, text: prev?.text ?? '' };
      setWs(msAsk.pk, w._k, { milestone: ms });
      // Loại mới là release (meta chưa kịp dội về releaseKeys) → thêm dòng timeline luôn.
      if (msRel) ensureTimelineForRelease(msAsk.pk, w.title, ms, true);
      else if (prev) removeTimelineForRelease(msAsk.pk, w._k, prev);
    }
    setMsAsk(null);
    notify({ text: `Đã thêm loại milestone «${label}»${msRel ? ' (tính là release)' : ''}` });
  };

  // ----- Đồng bộ nội dung nhánh từ mô tả task nguồn -----
  // Nhánh không có task nguồn, hoặc task nguồn đã xoá → giữ nguyên.
  const openSync = () => {
    const list: string[] = [];
    const projects = form.projects.map((pr) => ({
      ...pr,
      workstreams: pr.workstreams.map((w) => {
        const ids = w.sourceTaskIds ?? [];
        if (ids.length === 0) return w;
        // Nhánh gộp nhiều task → nối theo đúng thứ tự sourceTaskIds (luật của PmContext).
        const items = ids.flatMap((tid) => {
          const src = tasks.find((t) => t.id === tid);
          return src ? taskLines(src) : [];
        });
        if (items.length === 0 || JSON.stringify(items) === JSON.stringify(w.items ?? [])) return w;
        list.push(`${pr.name.trim() || '(chưa đặt tên)'} · ${w.title.trim() || '(chưa đặt tên)'}`);
        return { ...w, items };
      }),
    }));
    if (list.length === 0) {
      notify({ text: 'Không có nhánh nào cần đồng bộ — nội dung đã khớp mô tả task nguồn.' });
      return;
    }
    setSyncAsk({ projects, list });
  };

  // ----- Export: upload thẳng vào quản lý tài liệu -----
  // Tìm-hoặc-tạo folder theo tên (không phân biệt hoa/thường) trong đúng cấp cha.
  const ensureFolder = (name: string, parentId?: string): string | null => {
    const key = `${parentId ?? ''}:${name.toLowerCase()}`;
    const cached = createdFolders.current[key];
    if (cached) return cached;
    // Trùng tên (đã lỡ tạo bản sao) → luôn lấy folder TẠO SỚM NHẤT.
    const matches = folders
      .filter(
        (f) =>
          f.name.trim().toLowerCase() === name.toLowerCase() &&
          (f.parentId ?? '') === (parentId ?? ''),
      )
      .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
    if (matches.length > 0) return matches[0].id;
    const created = addFolder(name, parentId);
    if (created) createdFolders.current[key] = created.id;
    return created?.id ?? null;
  };

  // Ghi bản export: tạo mới hoặc ghi đè (giữ id → link chia sẻ cũ vẫn sống), rồi mở dialog kết quả.
  const writeExport = (job: ExportJob, existingId?: string) => {
    if (existingId) {
      updateDocument(existingId, { content: job.html, type: 'html' });
      setExpDone({ ...job, docId: existingId, replaced: true });
      return;
    }
    const made = addDocuments([{ type: 'html', title: job.base, content: job.html }], job.folderId)[0];
    if (!made) {
      notify({ text: 'Không upload được (thiếu cấu hình Firebase).', kind: 'error' });
      return;
    }
    setExpDone({ ...job, docId: made.id, replaced: false });
  };

  // Bản chi tiết → folder "THSOFT - Weekly Plan", bản release/test → sub-folder "Tester".
  // Còn thay đổi chưa lưu → lưu trước (lưu lỗi thì dừng). Trùng tên trong folder đích → dialog
  // Huỷ / Bỏ qua / Ghi đè (thay window.confirm của useUploadDocuments).
  const exportHtml = async (kind: 'detailed' | 'release') => {
    // Chưa tải xong tài liệu/folder thì KHÔNG export: ensureFolder sẽ tạo folder trùng tên.
    if (docsLoading || exporting || dateErr) return;
    setExporting(true);
    try {
      const savedFirst = dirty;
      if (dirty && !(await save())) return;
      const data = toData(form);
      const full: WeeklyPlan = { ...plan, ...data, projects: mergeLatestState(data.projects, plan.projects) };
      const html =
        kind === 'detailed'
          ? buildDetailedHtml(full, releaseKeys, tasks)
          : buildReleaseTestHtml(full, releaseKeys, tasks);
      const base = fileBase(
        kind === 'detailed'
          ? `mobile_team_weekly_plan_${mmdd(form.weekStart)}_to_${mmddyyyy(form.weekEnd)}`
          : `plan_team_mobile_release_test_${mmdd(form.weekStart)}_to_${mmddyyyy(form.weekEnd)}`,
      );
      const rootId = ensureFolder(PLAN_FOLDER);
      const folderId = rootId && kind === 'release' ? ensureFolder(TESTER_SUBFOLDER, rootId) : rootId;
      if (!folderId) {
        notify({ text: 'Không upload được (thiếu cấu hình Firebase hoặc lỗi tạo folder).', kind: 'error' });
        return;
      }
      const dest = kind === 'release' ? `${PLAN_FOLDER} / ${TESTER_SUBFOLDER}` : PLAN_FOLDER;
      const job: ExportJob = { kind, base, html, folderId, dest, savedFirst };
      const key = base.trim().toLowerCase();
      const existing = documents.find(
        (d) => (d.folderId ?? '') === folderId && d.title.trim().toLowerCase() === key,
      );
      if (existing) setExpDup({ job, existingId: existing.id });
      else writeExport(job);
    } finally {
      setExporting(false);
    }
  };

  const confirmDelete = async () => {
    setDelAsk(false);
    setDeleting(true);
    try {
      await deletePlan(id);
      navigate('/board/plan');
    } catch {
      setDeleting(false);
      notify({ text: 'Không xoá được plan. Thử lại sau.', kind: 'error' });
    }
  };

  // ----- Header -----
  const changedCount = changedKeys.size;
  const status = saving
    ? { cls: 'is-saving', text: 'Đang lưu…' }
    : saveErr && dirty
      ? { cls: 'is-err', text: 'Lưu thất bại' }
      : dirty
        ? {
            cls: 'is-dirty',
            text: changedCount > 0 && !narrow ? `Chưa lưu · ${changedCount} dự án đã sửa` : 'Chưa lưu',
          }
        : { cls: 'is-clean', text: 'Đã lưu' };
  const saveBtn = (
    <button
      type="button"
      className="kml-btn kml-btn-filled"
      disabled={!dirty || saving || dateErr}
      title={dateErr ? 'Ngày kết thúc đang trước ngày bắt đầu' : undefined}
      onClick={() => void save()}
    >
      {dirty ? <IcSave size={16} /> : <IcCheck size={16} />}
      {saving ? 'Đang lưu…' : saveErr && dirty ? 'Lưu lại' : dirty ? 'Lưu' : 'Đã lưu'}
    </button>
  );
  const exportBlocked = docsLoading || exporting || dateErr;
  const exportItems = (
    <>
      {dirty && (
        <div className="kml-menu-warn">
          <div className="kml-banner is-info">
            <IcSave size={18} />
            <span>Có thay đổi chưa lưu. Export sẽ lưu plan trước rồi mới upload.</span>
          </div>
        </div>
      )}
      <button
        type="button"
        className="kml-menu-item is-tall"
        disabled={exportBlocked}
        onClick={() => {
          setMenuFor(null);
          void exportHtml('detailed');
        }}
      >
        <IcDoc size={18} />
        <span>
          <span>Bản chi tiết</span>
          <small>{PLAN_FOLDER}</small>
        </span>
      </button>
      <button
        type="button"
        className="kml-menu-item is-tall"
        disabled={exportBlocked}
        onClick={() => {
          setMenuFor(null);
          void exportHtml('release');
        }}
      >
        <IcRocket size={18} />
        <span>
          <span>Bản release/test</span>
          <small>
            {PLAN_FOLDER} / {TESTER_SUBFOLDER}
          </small>
        </span>
      </button>
    </>
  );
  const deleteItem = (
    <button
      type="button"
      className="kml-menu-item is-danger"
      onClick={() => {
        setMenuFor(null);
        setDelAsk(true);
      }}
    >
      <IcTrash size={18} />
      <span>
        <span>Xoá plan</span>
      </span>
    </button>
  );

  const todayIso = isoLocal(new Date());
  const isThisWeek = !!form.weekStart && mondayOf(form.weekStart) === mondayOf(todayIso);
  const rangeLabel = `${formatDayMonth(form.weekStart)} – ${formatDateVi(form.weekEnd)}`;
  const linkedCount = form.projects.filter((p) => p.appId).length;
  const wsCount = form.projects.reduce((s, p) => s + p.workstreams.length, 0);
  const relWsCount = form.projects.reduce(
    (s, p) => s + p.workstreams.filter((w) => isReleaseWs(w, releaseKeys)).length,
    0,
  );
  const freeApps = apps.filter((a) => !usedAppIds.has(a.id)).length;
  const dayCount =
    form.weekStart && form.weekEnd && !dateErr
      ? Math.round(
          (new Date(form.weekEnd + 'T00:00:00').getTime() - new Date(form.weekStart + 'T00:00:00').getTime()) /
            86400000,
        ) + 1
      : 0;
  const openPicker = (el: HTMLInputElement | null) => {
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
    }
  };

  // Plan đang sửa + trạng thái mới nhất trong DB → xem trước.
  const data = toData(form);
  const full: WeeklyPlan = { ...plan, ...data, projects: mergeLatestState(data.projects, plan.projects) };
  const latestWs = new Map<string, PlanWorkstream>();
  form.projects.forEach((p, pi) =>
    p.workstreams.forEach((w, wi) => {
      const lw = full.projects[pi]?.workstreams[wi];
      if (lw) latestWs.set(w._k, lw);
    }),
  );

  // ----- Khung xem trước -----
  const preview = (
    <section className={`rpt-pv${wide ? ' is-side' : ''}`}>
      <div className="rpt-pv-head">
        <IcEye size={18} />
        <h2>Xem trước</h2>
        <span className="kml-spacer" />
        <span className="rpt-pv-note">trạng thái mới nhất</span>
        {wide && (
          <button
            type="button"
            className="kml-iconbtn"
            aria-label="Ẩn khung xem trước"
            onClick={() => setPvHidden(true)}
          >
            <IcClose size={18} />
          </button>
        )}
      </div>
      <div ref={pvRef} className="rpt-pv-body">
        <PlanPreviewPane
          plan={full}
          apps={apps}
          tasks={tasks}
          milestoneTypes={meta.milestoneTypes}
          releaseKeys={releaseKeys}
          highlight={wide && hi >= 0 ? hi : undefined}
          onOpenOverview={() => go('/board')}
        />
      </div>
    </section>
  );

  // ----- 1 nhánh -----
  const renderWs = (p: FormProject, pi: number, w: FormWs, wi: number) => {
    const pk = p._k;
    const wk = w._k;
    const lw = latestWs.get(wk) ?? w;
    const st = lw.state ?? 'todo';
    const rel = isReleaseWs(w, releaseKeys);
    const msRel = !!w.milestone && releaseKeys.has(w.milestone.type);
    const msMeta = w.milestone ? meta.milestoneTypes.find((t) => t.key === w.milestone!.type) : undefined;
    const srcIds = w.sourceTaskIds ?? [];
    const src = srcIds.length ? tasks.find((t) => t.id === srcIds[0]) : undefined;
    const wsName = w.title.trim() || '(chưa đặt tên)';
    // Chip ngày trên hàng milestone release: dòng timeline khớp nhánh (version từ text
    // milestone + task nguồn — cùng luật timelineRowSource), theo form đang sửa.
    const msDay = (() => {
      if (!msRel || !w.milestone) return null;
      const appName = appNameOf(p);
      const vers = new Set([msVersion(w.milestone.text)]);
      for (const tid of srcIds) {
        const v = tasks.find((t) => t.id === tid)?.version;
        if (v) vers.add(v);
      }
      const row = appName
        ? form.timeline.find((x) => [...vers].some((v) => matchTimelineRow(x.release, appName, v)))
        : undefined;
      if (!row) return { warn: true, text: 'Chưa có trên timeline', title: 'Chưa có dòng timeline cho mốc này' };
      if (!row.day.trim()) return { warn: true, text: 'Chưa chọn thứ', title: `Dòng timeline: ${row.release}` };
      return {
        warn: false,
        text: dayDate(row.day) ? `${row.day} · ${dayDate(row.day)}` : row.day,
        title: `Dòng timeline: ${row.day} · ${row.release}`,
      };
    })();

    const catMenu = (
      <div className="kml-menu-anchor">
        <button
          type="button"
          className={`pl-cat ${catTone(w.category)}`}
          aria-haspopup="menu"
          aria-expanded={menuFor === `c:${wk}`}
          aria-label={`Loại nhánh: ${catMeta(w.category).label}. Đổi loại`}
          onClick={() => setMenuFor(menuFor === `c:${wk}` ? null : `c:${wk}`)}
        >
          Loại <b>{catMeta(w.category).label}</b>
          <IcChevronDown size={14} />
        </button>
        {menuFor === `c:${wk}` && (
          <ReportPopMenu label="Loại nhánh" className="pl-menu-left" onClose={() => setMenuFor(null)}>
            {catOptions.map((c) => (
              <button
                key={c}
                type="button"
                className={`kml-menu-item${c === w.category ? ' is-cur' : ''}`}
                onClick={() => {
                  setWs(pk, wk, { category: c });
                  setMenuFor(null);
                }}
              >
                <span>
                  <span>{catMeta(c).label}</span>
                </span>
                {c === w.category && <IcCheck size={18} />}
              </button>
            ))}
            <div className="kml-menu-sep" />
            <button
              type="button"
              className="kml-menu-item"
              onClick={() => {
                setMenuFor(null);
                setCatName('');
                setCatAsk({ pk, wk });
              }}
            >
              <IcPlus size={18} />
              <span>
                <span>Thêm loại nhánh…</span>
              </span>
            </button>
          </ReportPopMenu>
        )}
      </div>
    );

    const stTag =
      rel && st === 'done' ? (
        <span className="pl-st is-done is-rel" title="Nhánh release đã xong · sửa trạng thái ở Tổng quan">
          <IcRocket size={14} />
          Đã release
        </span>
      ) : (
        <span className={`pl-st ${ST_CLS[st]}`} title="Trạng thái: chỉ xem, sửa ở Tổng quan">
          {ST_ICON[st]({ size: 14 })}
          {WORKSTREAM_STATE_META[st].label}
        </span>
      );

    const wsMenu = (
      <div className="kml-menu-anchor">
        <button
          type="button"
          className="kml-iconbtn pl-xs"
          aria-label={`Thao tác nhánh ${wsName}`}
          aria-haspopup="menu"
          aria-expanded={menuFor === `w:${wk}`}
          onClick={() => setMenuFor(menuFor === `w:${wk}` ? null : `w:${wk}`)}
        >
          <IcMoreV size={18} />
        </button>
        {menuFor === `w:${wk}` && (
          <ReportPopMenu label="Thao tác với nhánh" onClose={() => setMenuFor(null)}>
            <button
              type="button"
              className="kml-menu-item"
              disabled={wi === 0}
              onClick={() => {
                moveWs(pk, wk, -1);
                setMenuFor(null);
              }}
            >
              <IcChevronUp size={18} />
              <span>
                <span>Lên trên</span>
              </span>
            </button>
            <button
              type="button"
              className="kml-menu-item"
              disabled={wi === p.workstreams.length - 1}
              onClick={() => {
                moveWs(pk, wk, 1);
                setMenuFor(null);
              }}
            >
              <IcChevronDown size={18} />
              <span>
                <span>Xuống dưới</span>
              </span>
            </button>
            <div className="kml-menu-sep" />
            <button
              type="button"
              className="kml-menu-item is-danger"
              onClick={() => {
                setMenuFor(null);
                removeWs(pk, wk);
              }}
            >
              <IcTrash size={18} />
              <span>
                <span>Xoá nhánh</span>
              </span>
            </button>
          </ReportPopMenu>
        )}
      </div>
    );

    return (
      <div key={wk} className={`pl-ws${rel ? ' is-rel' : ''}${st === 'done' ? ' is-done' : ''}`}>
        <div className="pl-ws-h">
          <input
            ref={(el) => {
              if (el) wsRefs.current.set(wk, el);
              else wsRefs.current.delete(wk);
            }}
            className="pl-ws-title"
            value={w.title}
            placeholder="Tên nhánh (VD: Android)"
            aria-label={`Tên nhánh ${wi + 1} của dự án ${roman(pi + 1)}`}
            onChange={(e) => setWs(pk, wk, { title: e.target.value })}
          />
          {catMenu}
          {srcIds.length > 0 &&
            (src ? (
              <Link
                to={src.appId ? `/board/tasks/${src.appId}` : '/board/tasks'}
                target="_blank"
                rel="noopener"
                className="pl-src"
                title="Mở task nguồn (tab mới)"
              >
                <IcLink size={14} />
                <span>
                  {/* Tiêu đề task thường đã mở đầu bằng version → không lặp lại */}
                  Task {src.version && !src.title.includes(src.version) ? `${src.version} - ` : ''}
                  {src.title}
                  {srcIds.length > 1 ? ` +${srcIds.length - 1}` : ''}
                </span>
              </Link>
            ) : (
              <span className="pl-src is-missing">
                <IcLinkOff size={14} />
                Task nguồn đã xoá
              </span>
            ))}
          <span className="kml-spacer" />
          {stTag}
          {wsMenu}
        </div>
        <div className="pl-ws-b">
          <ReportBodyEditor
            value={w.items.join('\n')}
            placeholder={ITEMS_PLACEHOLDER}
            ariaLabel={`Đầu việc nhánh ${wsName}`}
            onChange={(v) => setWs(pk, wk, { items: v.split('\n') })}
          />
          {w.milestone ? (
            <div className={`pl-ms${msRel ? ' is-rel' : ' is-mk'}`}>
              <div className="kml-menu-anchor">
                <button
                  type="button"
                  className={`pl-ms-badge${msRel ? ' is-rel' : ` is-mk ${msTone(w.milestone.type, releaseKeys, meta.milestoneTypes)}`}`}
                  aria-haspopup="menu"
                  aria-expanded={menuFor === `m:${wk}`}
                  aria-label={`Loại milestone: ${msMeta?.label ?? w.milestone.type}. Đổi loại`}
                  onClick={() => setMenuFor(menuFor === `m:${wk}` ? null : `m:${wk}`)}
                >
                  {msRel ? <IcRocket size={14} /> : <IcFlag size={14} />}
                  {msMeta?.label ?? w.milestone.type}
                  <IcChevronDown size={14} />
                </button>
                {menuFor === `m:${wk}` && (
                  <ReportPopMenu label="Loại milestone" className="pl-menu-left" onClose={() => setMenuFor(null)}>
                    {meta.milestoneTypes.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        className={`kml-menu-item${t.key === w.milestone!.type ? ' is-cur' : ''}`}
                        onClick={() => {
                          changeMsType(pk, w, t.key);
                          setMenuFor(null);
                        }}
                      >
                        {t.isRelease ? <IcRocket size={18} /> : <IcFlag size={18} />}
                        <span>
                          <span>{t.label}</span>
                          {t.isRelease && <small>Tính là release · thêm dòng timeline</small>}
                        </span>
                      </button>
                    ))}
                    <div className="kml-menu-sep" />
                    <button
                      type="button"
                      className="kml-menu-item"
                      onClick={() => {
                        setMenuFor(null);
                        setMsLabel('');
                        setMsRel(true);
                        setMsAsk({ pk, wk });
                      }}
                    >
                      <IcPlus size={18} />
                      <span>
                        <span>Thêm loại milestone…</span>
                      </span>
                    </button>
                  </ReportPopMenu>
                )}
              </div>
              <input
                className="pl-ms-text"
                value={w.milestone.text}
                placeholder="VD: Build release v1.60"
                aria-label={`Nội dung milestone nhánh ${wsName}`}
                onChange={(e) =>
                  setWs(pk, wk, { milestone: { type: w.milestone!.type, text: e.target.value } })
                }
              />
              {msDay && (
                <span className={`pl-ms-day${msDay.warn ? ' is-warn' : ''}`} title={msDay.title}>
                  {msDay.warn ? <IcWarn size={14} /> : <IcCalendar size={14} />}
                  {msDay.text}
                </span>
              )}
              <button
                type="button"
                className="kml-iconbtn pl-xs"
                aria-label="Bỏ milestone"
                onClick={() => toggleMilestone(pk, w, false)}
              >
                <IcClose size={16} />
              </button>
            </div>
          ) : (
            <button type="button" className="pl-ms-add" onClick={() => toggleMilestone(pk, w, true)}>
              <IcPlus size={16} />
              Thêm milestone
            </button>
          )}
        </div>
      </div>
    );
  };

  // ----- Danh sách dự án -----
  const projectCards = form.projects.map((p, i) => {
    const k = p._k;
    const open = openSet.has(k);
    const app = p.appId ? apps.find((a) => a.id === p.appId) : undefined;
    const sugId = p.appId ? '' : suggestAppId(p.name, apps.filter((a) => !usedAppIds.has(a.id)));
    const sugApp = sugId ? apps.find((a) => a.id === sugId) : undefined;
    const chipState = p.appId ? (app ? 'linked' : 'missing') : sugApp ? 'warn' : 'none';
    const chipText =
      chipState === 'linked'
        ? `${app!.name} · ${app!.platform}`
        : chipState === 'missing'
          ? 'App không tồn tại'
          : chipState === 'warn'
            ? 'Chưa gắn app'
            : 'Không gắn app';
    const pName = p.name.trim() || roman(i + 1);
    // Dòng timeline của app này (khớp đủ token tên app).
    const appTokens = tokensOf(appNameOf(p));
    const tlRows =
      appTokens.length > 0
        ? form.timeline.filter((t) => t.release.trim() && appTokens.every((tk) => normName(t.release).includes(tk)))
        : [];

    const chip = (
      <div className="kml-menu-anchor rpt-chip-anchor">
        <button
          type="button"
          className={`rpt-appchip is-${chipState}${pickFor === k ? ' is-open' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={pickFor === k}
          aria-label={chipState === 'linked' ? `App đã gắn: ${chipText}. Đổi app` : `${chipText}. Chọn app`}
          onClick={() => setPickFor(pickFor === k ? null : k)}
        >
          {chipState === 'linked' ? (
            <IcLink size={16} />
          ) : chipState === 'none' ? (
            <IcLinkOff size={16} />
          ) : (
            <IcWarn size={16} />
          )}
          <span>{chipText}</span>
          <IcChevronDown size={14} />
        </button>
        {pickFor === k && (
          <ReportAppPicker
            apps={apps}
            usedBy={usedByOthers(k)}
            currentAppId={p.appId}
            title={`Chọn app cho dự án ${pName}`}
            sheet={narrow}
            onPick={(appId) => setProject(k, { appId })}
            onUnlink={p.appId ? () => setProject(k, { appId: undefined }) : undefined}
            onClose={() => setPickFor(null)}
          />
        )}
      </div>
    );
    const collapseBtn = (
      <button
        type="button"
        className="kml-iconbtn"
        aria-label={open ? `Thu gọn dự án ${pName}` : `Mở dự án ${pName}`}
        aria-expanded={open}
        onClick={() => setOpen(k, !open)}
      >
        {open ? <IcChevronUp size={18} /> : <IcChevronDown size={18} />}
      </button>
    );
    const menu = (
      <div className="kml-menu-anchor">
        <button
          type="button"
          className="kml-iconbtn"
          aria-label={`Thao tác với dự án ${pName}`}
          aria-haspopup="menu"
          aria-expanded={menuFor === `p:${k}`}
          onClick={() => setMenuFor(menuFor === `p:${k}` ? null : `p:${k}`)}
        >
          <IcMoreV size={18} />
        </button>
        {menuFor === `p:${k}` && (
          <ReportPopMenu label="Thao tác với dự án" onClose={() => setMenuFor(null)}>
            <button
              type="button"
              className="kml-menu-item"
              disabled={i === 0}
              onClick={() => {
                moveTo(k, 0);
                setMenuFor(null);
              }}
            >
              <IcChevronUp size={18} />
              <span>
                <span>Đưa lên đầu</span>
              </span>
            </button>
            <button
              type="button"
              className="kml-menu-item"
              disabled={i === form.projects.length - 1}
              onClick={() => {
                moveTo(k, form.projects.length - 1);
                setMenuFor(null);
              }}
            >
              <IcChevronDown size={18} />
              <span>
                <span>Đưa xuống cuối</span>
              </span>
            </button>
            <button
              type="button"
              className="kml-menu-item"
              disabled={form.projects.length < 2}
              onClick={() => {
                setSortOpen(true);
                setMenuFor(null);
              }}
            >
              <IcSort size={18} />
              <span>
                <span>Sắp xếp dự án…</span>
              </span>
            </button>
            <div className="kml-menu-sep" />
            <button
              type="button"
              className="kml-menu-item is-danger"
              onClick={() => {
                setMenuFor(null);
                removeProject(k);
              }}
            >
              <IcTrash size={18} />
              <span>
                <span>Xoá dự án</span>
              </span>
            </button>
          </ReportPopMenu>
        )}
      </div>
    );
    const dirtyMark = changedKeys.has(k) && (
      <span className="rpt-pc-dirty" title="Đã sửa, chưa lưu">
        <i />
        đã sửa
      </span>
    );

    return (
      <section
        key={k}
        ref={(el) => {
          if (el) cardRefs.current.set(k, el);
          else cardRefs.current.delete(k);
        }}
        className={`rpt-pc pl-pc${curK === k ? ' is-focus' : ''}${fresh?.k === k && curK === k ? ' is-new' : ''}${dragK === k ? ' is-drag' : ''}${open ? '' : ' is-col'}`}
        aria-label={`Dự án ${roman(i + 1)}`}
        onFocus={() => setCurK(k)}
        onDragOver={(e) => {
          if (!dragK) return;
          e.preventDefault();
          if (dragK !== k) moveTo(dragK, i);
        }}
        // Chặn thả chữ (key kéo) vào ô nhập.
        onDrop={(e) => {
          if (dragK) e.preventDefault();
        }}
      >
        <div className="rpt-pc-h">
          {!narrow && (
            <button
              type="button"
              className="kml-iconbtn rpt-grip"
              aria-label={`Kéo để đổi thứ tự ${pName}`}
              draggable
              onDragStart={(e) => {
                setDragK(k);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', k);
                const card = cardRefs.current.get(k);
                if (card) e.dataTransfer.setDragImage(card, 24, 24);
              }}
              onDragEnd={() => setDragK(null)}
            >
              <IcGrip size={18} />
            </button>
          )}
          <span className="rpt-pc-num">{roman(i + 1)}</span>
          <input
            ref={(el) => {
              if (el) nameRefs.current.set(k, el);
              else nameRefs.current.delete(k);
            }}
            className="rpt-pc-name"
            value={p.name}
            placeholder="Tên dự án"
            aria-label={`Tên dự án ${roman(i + 1)}`}
            onChange={(e) => setProject(k, { name: e.target.value })}
          />
          {dirtyMark}
          {!narrow && chip}
          {!narrow && collapseBtn}
          {menu}
          {narrow && (
            <div className="rpt-pc-row2">
              {chip}
              <span className="kml-spacer" />
              {collapseBtn}
            </div>
          )}
        </div>

        {open && chipState === 'warn' && sugApp && (
          <div className="rpt-pc-hint is-warn">
            <span>Chưa gắn app · chọn task và khớp timeline sẽ đoán theo tên.</span>
            <button
              type="button"
              className="kml-btn kml-btn-tonal"
              onClick={() => setProject(k, { appId: sugApp.id })}
            >
              <IcLink size={16} />
              Gắn {sugApp.name} · {sugApp.platform}
            </button>
          </div>
        )}
        {open && chipState === 'missing' && (
          <div className="rpt-pc-hint is-warn">
            <span>App đã gắn không còn trong danh sách app. Chọn app khác hoặc bỏ gắn.</span>
          </div>
        )}
        {tlRows.length > 0 && (
          <div className="rpt-pc-hint pl-pc-tl">
            <IcCalendar size={14} />
            <span>
              Timeline:{' '}
              {tlRows.map((t, ti) => (
                <span key={t._k}>
                  {ti > 0 && '; '}
                  <b className={!t.day.trim() ? 'is-warn' : ''}>{t.day.trim() || 'chưa chọn thứ'}</b> ·{' '}
                  {t.release}
                </span>
              ))}
            </span>
          </div>
        )}

        {open ? (
          <div className="pl-pc-body">
            {p.workstreams.map((w, wi) => renderWs(p, i, w, wi))}
            {p.workstreams.length === 0 && <p className="pl-pc-empty">Chưa có nhánh.</p>}
            <div className="pl-ws-add">
              <button type="button" className="kml-btn kml-btn-text" onClick={() => setTaskFor(k)}>
                <IcList size={16} />
                Thêm nhánh từ task
              </button>
              <button type="button" className="kml-btn kml-btn-text" onClick={() => addBlankWs(k)}>
                <IcPlus size={16} />
                Nhánh trắng
              </button>
            </div>
          </div>
        ) : (
          <div className="pl-pc-sum">
            {p.workstreams.length === 0
              ? 'Chưa có nhánh'
              : p.workstreams.map((w) => {
                  const lw = latestWs.get(w._k) ?? w;
                  const st = lw.state ?? 'todo';
                  const n = w.items.filter((it) => it.trim()).length;
                  return (
                    <span key={w._k}>
                      <b>{w.title.trim() || '(chưa đặt tên)'}</b> ·{' '}
                      {isReleaseWs(w, releaseKeys) && st === 'done' ? 'Đã release' : WORKSTREAM_STATE_META[st].label}{' '}
                      · {n} dòng
                    </span>
                  );
                })}
          </div>
        )}
      </section>
    );
  });

  // ----- Timeline -----
  const timelineRows = form.timeline.map((t, ti) => {
    const auto = autoTl.get(t._k);
    const srcHit = auto ? null : timelineRowSource(t.release, full.projects, apps, tasks, releaseKeys);
    const isNew = !(saved?.timeline ?? []).some((x) => x._k === t._k);
    return (
      <div key={t._k} className={`pl-tl-row${isNew ? ' is-new' : ''}`}>
        <PlanDayPicker
          value={t.day}
          weekStart={form.weekStart}
          weekEnd={form.weekEnd}
          open={dayFor === t._k}
          narrow={narrow}
          label={`Thứ của ${t.release.trim() || `dòng ${ti + 1}`}`}
          onToggle={(on) => setDayFor(on ? t._k : null)}
          onChange={(day) => setTl((tl) => sortTl(tl.map((x) => (x._k === t._k ? { ...x, day } : x))))}
        />
        <div className="pl-tl-rel">
          <input
            className="kml-input"
            value={t.release}
            placeholder="VD: Music2 v1.60"
            aria-label={`Mốc release dòng ${ti + 1}`}
            onChange={(e) => {
              const release = e.target.value;
              setTl((tl) => tl.map((x) => (x._k === t._k ? { ...x, release } : x)));
            }}
          />
          {t.release.trim() && (
            <p className={`pl-tl-match${auto || srcHit ? '' : ' is-warn'}`}>
              {auto ? (
                <>
                  <IcRocket size={14} />
                  Vừa thêm từ milestone {auto}
                </>
              ) : srcHit ? (
                <>
                  <IcLink size={14} />
                  Khớp nhánh {srcHit.ws || '(chưa đặt tên)'} · {srcHit.project}
                </>
              ) : (
                <>
                  <IcWarn size={14} />
                  Không khớp nhánh release nào trong plan
                </>
              )}
            </p>
          )}
        </div>
        <button
          type="button"
          className="kml-iconbtn"
          aria-label={`Xoá dòng ${t.release.trim() || ti + 1}`}
          onClick={() => {
            const row = t;
            setTl((tl) => tl.filter((x) => x._k !== row._k));
            notify(
              {
                text: `Đã xoá dòng timeline «${row.release.trim() || 'trống'}»`,
                action: {
                  label: 'Hoàn tác',
                  onClick: () =>
                    setTl((tl) => {
                      if (tl.some((x) => x._k === row._k)) return tl;
                      const next = [...tl];
                      next.splice(Math.min(ti, next.length), 0, row);
                      return next;
                    }),
                },
              },
              8000,
            );
          }}
        >
          <IcTrash size={18} />
        </button>
      </div>
    );
  });

  const editPane = (
    <div className="rpt-eg-main">
      <section className="rpt-info pl-info">
        <label className="kml-field pl-info-title">
          <span className="kml-field-label">Tiêu đề</span>
          <input
            className="kml-input"
            value={form.title}
            onChange={(e) => {
              const title = e.target.value;
              setForm((f) => (f ? { ...f, title } : f));
            }}
          />
        </label>
        {(
          [
            ['weekStart', 'Từ ngày', startRef],
            ['weekEnd', 'Đến ngày', endRef],
          ] as const
        ).map(([key, lbl, r]) => {
          const val = form[key];
          const err = key === 'weekEnd' && dateErr;
          const sup =
            key === 'weekStart'
              ? `${weekdayVN(val)} · tuần ${isoWeek(val)}`
              : err
                ? 'Trước ngày bắt đầu — chưa lưu / export được'
                : `${weekdayVN(val)} · ${dayCount} ngày`;
          return (
            <div key={key} className={`kml-field rpt-date${err ? ' is-err' : ''}`}>
              <span className="kml-field-label">{lbl}</span>
              <input
                className="kml-input"
                readOnly
                value={val ? formatDateVi(val) : ''}
                aria-label={lbl}
                aria-invalid={err || undefined}
                aria-describedby={`pl-sup-${key}`}
                onClick={() => openPicker(r.current)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openPicker(r.current);
                  }
                }}
              />
              <span className="rpt-field-trail">
                <button
                  type="button"
                  className="kml-iconbtn"
                  aria-label={`Chọn ${lbl.toLowerCase()}`}
                  onClick={() => openPicker(r.current)}
                >
                  <IcCalendar size={18} />
                </button>
              </span>
              {/* Ô date gốc ẩn: chỉ để mở lịch của trình duyệt, hiển thị dd/mm/yyyy ở ô trên */}
              <input
                ref={r}
                type="date"
                className="rpt-date-native"
                tabIndex={-1}
                aria-hidden="true"
                value={val}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) setForm((f) => (f ? { ...f, [key]: v } : f));
                }}
              />
              <span className={`kml-field-sup${err ? ' is-err' : ''}`} id={`pl-sup-${key}`}>
                {err && <IcWarn size={14} />}
                {sup}
              </span>
            </div>
          );
        })}
        <label className="kml-field pl-info-desc">
          <span className="kml-field-label">Mô tả</span>
          <textarea
            className="kml-input pl-desc"
            value={form.description}
            rows={2}
            onChange={(e) => {
              const description = e.target.value;
              setForm((f) => (f ? { ...f, description } : f));
            }}
          />
        </label>
        <div className="rpt-legend">
          <span>
            <code className="lg-sec">#</code>tiêu đề
          </span>
          <span>
            <code className="lg-mk">-</code>đầu việc
          </span>
          <span>
            <code className="lg-mk">+</code>ý con
          </span>
          <span>
            <code className="lg-arr">-&gt;</code>mốc
          </span>
          <span className="rpt-legend-sync">dòng không dấu = nối dòng trên</span>
          <span className="rpt-legend-sync">
            Trạng thái nhánh chỉ xem ·{' '}
            <button type="button" className="pl-linkbtn" onClick={() => go('/board')}>
              sửa ở Tổng quan
            </button>
          </span>
          <span className="rpt-legend-apps">
            <IcLink size={14} />
            gắn app {linkedCount}/{form.projects.length}
          </span>
        </div>
      </section>

      <div className="rpt-sec-h">
        <h2>Dự án</h2>
        <span className="rpt-sec-sub">
          {form.projects.length} · {wsCount} nhánh · {relWsCount} release
        </span>
        <span className="kml-spacer" />
        {form.projects.length > 0 && (
          <button
            type="button"
            className="kml-btn kml-btn-text"
            onClick={() =>
              setOpenSet(
                openSet.size >= form.projects.length ? new Set() : new Set(form.projects.map((p) => p._k)),
              )
            }
          >
            {openSet.size >= form.projects.length ? <IcChevronUp size={16} /> : <IcChevronDown size={16} />}
            {openSet.size >= form.projects.length ? 'Thu gọn tất cả' : 'Mở tất cả'}
          </button>
        )}
        {form.projects.length > 1 && !narrow && (
          <button type="button" className="kml-btn kml-btn-text" onClick={() => setSortOpen(true)}>
            <IcSort size={16} />
            Sắp xếp
          </button>
        )}
      </div>
      <div className="rpt-plist">
        {projectCards}
        {form.projects.length === 0 && (
          <p className="rpt-plist-empty">Chưa có dự án. Thêm từ app hoặc nhập tay bên dưới.</p>
        )}
      </div>
      <div className="rpt-addrow">
        <div className="kml-menu-anchor">
          <button
            type="button"
            className="kml-btn kml-btn-outlined"
            aria-haspopup="listbox"
            aria-expanded={pickFor === '__add'}
            onClick={() => setPickFor(pickFor === '__add' ? null : '__add')}
          >
            <IcLink size={16} />
            Thêm dự án từ app
          </button>
          {pickFor === '__add' && (
            <ReportAppPicker
              apps={apps}
              usedBy={usedByOthers(null)}
              title="Thêm dự án từ app"
              sheet={narrow}
              onPick={(appId) => addFromApp(appId)}
              onClose={() => setPickFor(null)}
            />
          )}
        </div>
        <button type="button" className="kml-btn kml-btn-text" onClick={addManual}>
          <IcPlus size={16} />
          Dự án nhập tay
        </button>
        <span className="pl-addrow-note">còn {freeApps} app chưa dùng</span>
      </div>

      <div className="rpt-sec-h">
        <h2>Timeline release</h2>
        <span className="rpt-sec-sub">{form.timeline.length}</span>
      </div>
      <section className="pl-tl">
        {timelineRows}
        {form.timeline.length === 0 && (
          <p className="rpt-plist-empty">
            Chưa có mốc release. Bật milestone loại release ở nhánh sẽ tự thêm dòng.
          </p>
        )}
        <div className="pl-tl-add">
          <button
            type="button"
            className="kml-btn kml-btn-text"
            onClick={() => {
              const k = newKey('m');
              setTl((tl) => [...tl, { day: '', release: '', _k: k }]);
            }}
          >
            <IcPlus size={16} />
            Thêm dòng
          </button>
        </div>
      </section>
    </div>
  );

  const showSide = wide && !pvHidden;

  return (
    <div className="container kml-page rpt-page pl-page">
      <BoardNav />

      <div className={`rpt-ebar${narrow ? ' is-narrow' : ''}`}>
        <div className="rpt-ebar-row">
          <button
            type="button"
            className="kml-iconbtn"
            aria-label="Về danh sách plan"
            onClick={() => go('/board/plan')}
          >
            <IcArrowLeft size={20} />
          </button>
          <div className="kml-topbar-title">
            <h1>
              {narrow
                ? `${formatDayMonth(form.weekStart)} – ${formatDayMonth(form.weekEnd)}`
                : `Plan ${rangeLabel}`}
              {isThisWeek && !narrow && <span className="kml-tag is-today pl-h1-tag">Tuần này</span>}
            </h1>
            <p>
              <span className={`rpt-status ${status.cls}`}>
                {status.cls === 'is-clean' ? <IcCheck size={14} /> : <i />}
                {status.text}
              </span>
            </p>
          </div>
          <div className="kml-topbar-actions">
            {narrow ? (
              <>
                {saveBtn}
                <div className="kml-menu-anchor">
                  <button
                    type="button"
                    className="kml-iconbtn"
                    aria-label="Thêm thao tác"
                    aria-haspopup="menu"
                    aria-expanded={menuFor === '__head'}
                    onClick={() => setMenuFor(menuFor === '__head' ? null : '__head')}
                  >
                    <IcMoreV size={18} />
                  </button>
                  {menuFor === '__head' && (
                    <ReportPopMenu label="Thêm thao tác" className="pl-head-menu" onClose={() => setMenuFor(null)}>
                      <button
                        type="button"
                        className="kml-menu-item"
                        onClick={() => {
                          setMenuFor(null);
                          openSync();
                        }}
                      >
                        <IcRefresh size={18} />
                        <span>
                          <span>Đồng bộ từ task</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="kml-menu-item"
                        disabled={form.projects.length < 2}
                        onClick={() => {
                          setMenuFor(null);
                          setSortOpen(true);
                        }}
                      >
                        <IcSort size={18} />
                        <span>
                          <span>Sắp xếp dự án</span>
                        </span>
                      </button>
                      <div className="kml-menu-sep" />
                      {exportItems}
                      <div className="kml-menu-sep" />
                      {deleteItem}
                    </ReportPopMenu>
                  )}
                </div>
              </>
            ) : (
              <>
                {wide && pvHidden && (
                  <button type="button" className="kml-btn kml-btn-text" onClick={() => setPvHidden(false)}>
                    <IcEye size={16} />
                    Xem trước
                  </button>
                )}
                <button
                  type="button"
                  className="kml-btn kml-btn-text"
                  title="Dựng lại nội dung các nhánh từ mô tả task nguồn"
                  onClick={openSync}
                >
                  <IcRefresh size={16} />
                  Đồng bộ từ task
                </button>
                <div className="kml-menu-anchor">
                  <button
                    type="button"
                    className="kml-btn kml-btn-outlined"
                    aria-haspopup="menu"
                    aria-expanded={menuFor === '__export'}
                    disabled={exportBlocked}
                    title={
                      docsLoading
                        ? 'Đang tải danh sách tài liệu…'
                        : dateErr
                          ? 'Ngày kết thúc đang trước ngày bắt đầu'
                          : undefined
                    }
                    onClick={() => setMenuFor(menuFor === '__export' ? null : '__export')}
                  >
                    <IcDownload size={16} />
                    {docsLoading ? 'Đang tải tài liệu…' : exporting ? 'Đang export…' : 'Export'}
                    <IcChevronDown size={14} />
                  </button>
                  {menuFor === '__export' && (
                    <ReportPopMenu label="Export" className="pl-export-menu" onClose={() => setMenuFor(null)}>
                      {exportItems}
                    </ReportPopMenu>
                  )}
                </div>
                {saveBtn}
                <div className="kml-menu-anchor">
                  <button
                    type="button"
                    className="kml-iconbtn"
                    aria-label="Thêm thao tác"
                    aria-haspopup="menu"
                    aria-expanded={menuFor === '__head'}
                    onClick={() => setMenuFor(menuFor === '__head' ? null : '__head')}
                  >
                    <IcMoreV size={18} />
                  </button>
                  {menuFor === '__head' && (
                    <ReportPopMenu label="Thêm thao tác" onClose={() => setMenuFor(null)}>
                      {deleteItem}
                    </ReportPopMenu>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        {!wide && (
          <div className="rpt-seg" role="tablist" aria-label="Chế độ">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'edit'}
              className={tab === 'edit' ? 'on' : ''}
              onClick={() => setTab('edit')}
            >
              <IcEdit size={16} />
              Sửa
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'preview'}
              className={tab === 'preview' ? 'on' : ''}
              onClick={() => setTab('preview')}
            >
              <IcEye size={16} />
              Xem trước
            </button>
          </div>
        )}
      </div>

      {showSide ? (
        <div className="rpt-eg">
          {editPane}
          <aside className="rpt-eg-side">{preview}</aside>
        </div>
      ) : wide || tab === 'edit' ? (
        editPane
      ) : (
        preview
      )}

      {sortOpen && (
        <ReportSortDialog
          narrow={narrow}
          items={form.projects.map((p) => {
            const a = p.appId ? apps.find((x) => x.id === p.appId) : undefined;
            return {
              key: p._k,
              name: p.name,
              sub: `${p.workstreams.length} nhánh · ${a ? a.platform : p.appId ? 'app không tồn tại' : 'không gắn app'}`,
            };
          })}
          onApply={applyOrder}
          onClose={() => setSortOpen(false)}
        />
      )}

      {taskFor !== null &&
        (() => {
          const pr = findProject(taskFor);
          if (!pr) return null;
          // App focus mặc định: appId của dự án, rồi khớp tên dự án ↔ tên app.
          const initialAppId = pr.appId ?? apps.find((a) => sameText(a.name, pr.name))?.id;
          // Task đã là nhánh trong plan (theo form đang sửa) → tag "Đã có" + cảnh báo trùng.
          const inPlan = new Map<string, TaskInPlan[]>();
          for (const p of form.projects)
            for (const w of p.workstreams)
              for (const tid of w.sourceTaskIds ?? []) {
                const list = inPlan.get(tid) ?? [];
                list.push({ ws: w.title.trim() || '(chưa đặt tên)', project: p.name.trim() || '(chưa đặt tên)' });
                inPlan.set(tid, list);
              }
          return (
            <TaskPickerDialog
              apps={apps}
              tasks={tasks}
              initialAppId={initialAppId}
              projectName={pr.name.trim() || '(chưa đặt tên)'}
              inPlan={inPlan}
              narrow={narrow}
              week={{ start: form.weekStart, end: form.weekEnd }}
              onConfirm={(ws) => {
                addWsFromTasks(taskFor, ws);
                // Task release có lịch trong tuần → tự cập nhật timeline release.
                addTimelineFromTasks(ws, pr.name);
                setTaskFor(null);
              }}
              onClose={() => setTaskFor(null)}
            />
          );
        })()}

      {expDup && (
        <KpiDialog
          title="Đã có tài liệu cùng tên"
          subtitle={expDup.job.base}
          icon={<IcDoc size={20} />}
          tone="warn"
          actions={
            <>
              <button type="button" className="kml-btn kml-btn-text" onClick={() => setExpDup(null)}>
                Huỷ
              </button>
              <button
                type="button"
                className="kml-btn kml-btn-outlined"
                onClick={() => {
                  setExpDup(null);
                  notify({ text: 'Bỏ qua — giữ nguyên tài liệu cũ, không ghi đè.' });
                }}
              >
                Bỏ qua
              </button>
              <button
                type="button"
                className="kml-btn kml-btn-filled"
                onClick={() => {
                  const { job, existingId } = expDup;
                  setExpDup(null);
                  writeExport(job, existingId);
                }}
              >
                Ghi đè
              </button>
            </>
          }
          onClose={() => setExpDup(null)}
        >
          <p>
            Tài liệu này đã có trong <b>{expDup.job.dest}</b>. Ghi đè sẽ giữ nguyên link chia sẻ cũ.
          </p>
        </KpiDialog>
      )}

      {expDone &&
        (() => {
          // Copy link chỉ khi tài liệu đang chia sẻ: tự share → /share/d, nằm trong folder đang share → /share/f.
          const doc = documents.find((d) => d.id === expDone.docId);
          const fid = doc?.folderId ?? expDone.folderId;
          const folder = folders.find((f) => f.id === fid);
          const shareUrl = doc?.isShared
            ? `${window.location.origin}/share/d/${expDone.docId}`
            : folder?.isShared
              ? `${window.location.origin}/share/f/${folder.id}/${expDone.docId}`
              : '';
          const what = expDone.kind === 'detailed' ? 'bản chi tiết' : 'bản release/test';
          return (
            <KpiDialog
              title={`${expDone.replaced ? 'Đã cập nhật' : 'Đã upload'} ${what}`}
              subtitle={expDone.savedFirst ? 'Plan đã được lưu trước khi export' : undefined}
              icon={<IcCheck size={20} />}
              tone="pos"
              actions={
                <>
                  {shareUrl && (
                    <button
                      type="button"
                      className="kml-btn kml-btn-text"
                      onClick={() => {
                        navigator.clipboard
                          .writeText(shareUrl)
                          .then(() => notify({ text: 'Đã copy link chia sẻ' }))
                          .catch(() => notify({ text: `Không copy được — link: ${shareUrl}`, kind: 'error' }, 12000));
                      }}
                    >
                      <IcCopy size={18} />
                      Copy link
                    </button>
                  )}
                  <button
                    type="button"
                    className="kml-btn kml-btn-filled"
                    onClick={() => {
                      window.open(`/docs/view/document/${expDone.docId}`, '_blank', 'noopener');
                      setExpDone(null);
                    }}
                  >
                    <IcExternal size={18} />
                    Mở tài liệu
                  </button>
                </>
              }
              onClose={() => setExpDone(null)}
            >
              <div className="pl-exp-file">
                <IcDoc size={24} />
                <span>
                  <b>{expDone.base}</b>
                  <small>
                    <IcFolder size={14} />
                    {expDone.dest} · {expDone.replaced ? 'ghi đè' : 'tạo mới'}
                  </small>
                </span>
              </div>
            </KpiDialog>
          );
        })()}

      {dupAsk && (
        <KpiDialog
          title={`Đã có dự án «${dupAsk.name}» chưa gắn app`}
          subtitle={`Thêm từ app ${dupAsk.app.name} · ${dupAsk.app.platform}`}
          icon={<IcWarn size={20} />}
          onClose={() => setDupAsk(null)}
          actions={
            <div className={`rpt-leave-acts${narrow ? ' is-stack' : ''}`}>
              <button type="button" className="kml-btn kml-btn-text" onClick={() => setDupAsk(null)}>
                Huỷ
              </button>
              <button
                type="button"
                className="kml-btn kml-btn-outlined"
                onClick={() => {
                  addFromApp(dupAsk.app.id, 'new');
                  setDupAsk(null);
                }}
              >
                Vẫn thêm mới
              </button>
              <button
                type="button"
                className="kml-btn kml-btn-filled"
                onClick={() => {
                  addFromApp(dupAsk.app.id, 'attach');
                  setDupAsk(null);
                }}
              >
                Gắn vào dự án đang có
              </button>
            </div>
          }
        >
          <p>
            «Gắn vào dự án đang có» giữ nguyên các nhánh của «{dupAsk.name}» và gắn app cho nó. «Vẫn
            thêm mới» tạo thêm 1 dự án cùng tên.
          </p>
        </KpiDialog>
      )}

      {catAsk && (
        <KsumConfirmDialog
          tone="info"
          icon={<IcPlus size={20} />}
          title="Thêm loại nhánh"
          subtitle="Lưu vào danh mục, dùng được cho mọi plan"
          confirmLabel="Thêm"
          confirmDisabled={!catName.trim() || catDup}
          plain
          onCancel={() => setCatAsk(null)}
          onConfirm={confirmCat}
        >
          <div className={`kml-field${catDup ? ' is-err' : ''}`}>
            <span className="kml-field-label">Tên loại</span>
            <input
              className="kml-input"
              autoFocus
              value={catName}
              placeholder="VD: Research, QA…"
              onChange={(e) => setCatName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmCat();
              }}
            />
            {catDup && (
              <span className="kml-field-sup is-err">
                <IcWarn size={14} />
                Loại này đã có trong danh mục
              </span>
            )}
          </div>
        </KsumConfirmDialog>
      )}

      {msAsk && (
        <KsumConfirmDialog
          tone="info"
          icon={<IcFlag size={20} />}
          title="Thêm loại milestone"
          subtitle="Lưu vào danh mục, dùng được cho mọi plan"
          confirmLabel="Thêm"
          confirmDisabled={!msLabel.trim() || msDup}
          plain
          onCancel={() => setMsAsk(null)}
          onConfirm={confirmMsType}
        >
          <div className={`kml-field${msDup ? ' is-err' : ''}`}>
            <span className="kml-field-label">Tên loại</span>
            <input
              className="kml-input"
              autoFocus
              value={msLabel}
              placeholder="VD: Beta, Submit store…"
              onChange={(e) => setMsLabel(e.target.value)}
            />
            {msDup && (
              <span className="kml-field-sup is-err">
                <IcWarn size={14} />
                Loại này đã có trong danh mục
              </span>
            )}
          </div>
          <div className="k-radio-cards" role="radiogroup" aria-label="Cách tính">
            <label className={`k-radio-card${msRel ? ' is-on' : ''}`}>
              <input type="radio" name="pl-ms-rel" checked={msRel} onChange={() => setMsRel(true)} />
              <span>
                <b>Tính là release</b>
                <span>Vào nhóm release, tự thêm dòng timeline</span>
              </span>
            </label>
            <label className={`k-radio-card${!msRel ? ' is-on' : ''}`}>
              <input type="radio" name="pl-ms-rel" checked={!msRel} onChange={() => setMsRel(false)} />
              <span>
                <b>Chỉ là mốc tuần</b>
                <span>Hiện ở mục milestone, không vào timeline</span>
              </span>
            </label>
          </div>
        </KsumConfirmDialog>
      )}

      {syncAsk && (
        <KsumConfirmDialog
          tone="warn"
          icon={<IcRefresh size={20} />}
          title={`Dựng lại nội dung ${syncAsk.list.length} nhánh từ task nguồn?`}
          subtitle="Phần đã sửa tay trong các nhánh này sẽ bị ghi đè. Chỉ đổi trên form — bấm Lưu mới ghi."
          confirmLabel="Đồng bộ"
          onCancel={() => setSyncAsk(null)}
          onConfirm={() => {
            const projects = syncAsk.projects;
            setForm((f) => (f ? { ...f, projects } : f));
            notify({ text: `Đã đồng bộ ${syncAsk.list.length} nhánh từ task nguồn` });
            setSyncAsk(null);
          }}
        >
          <ul className="k-list">
            {syncAsk.list.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </KsumConfirmDialog>
      )}

      {delAsk && (
        <KsumConfirmDialog
          tone="danger"
          icon={<IcTrash size={20} />}
          title={`Xoá plan ${rangeLabel}?`}
          subtitle="Không thể hoàn tác. File đã export trong quản lý tài liệu vẫn giữ."
          confirmLabel="Xoá plan"
          confirmKind="danger-solid"
          onCancel={() => setDelAsk(false)}
          onConfirm={() => void confirmDelete()}
        >
          <p>
            {form.projects.length} dự án · {wsCount} nhánh · {form.timeline.length} mốc timeline.
          </p>
        </KsumConfirmDialog>
      )}

      {leaveTo !== null && (
        <KpiDialog
          title="Lưu thay đổi trước khi rời?"
          subtitle={
            narrow && changedCount > 0 ? `Plan ${rangeLabel} · ${changedCount} dự án đã sửa` : `Plan ${rangeLabel}`
          }
          icon={<IcSave size={20} />}
          dismissible={!saving}
          onClose={() => setLeaveTo(null)}
          actions={
            <div className={`rpt-leave-acts${narrow ? ' is-stack' : ''}`}>
              {narrow ? (
                <>
                  <button
                    type="button"
                    className="kml-btn kml-btn-filled"
                    disabled={saving || dateErr}
                    onClick={() => void saveAndLeave()}
                  >
                    {saving ? 'Đang lưu…' : 'Lưu và rời'}
                  </button>
                  <button
                    type="button"
                    className="kml-btn kml-btn-outlined"
                    disabled={saving}
                    onClick={() => navigate(leaveTo)}
                  >
                    Rời không lưu
                  </button>
                  <button
                    type="button"
                    className="kml-btn kml-btn-text"
                    disabled={saving}
                    onClick={() => setLeaveTo(null)}
                  >
                    Ở lại
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="kml-btn kml-btn-text"
                    disabled={saving}
                    onClick={() => setLeaveTo(null)}
                  >
                    Ở lại
                  </button>
                  <button
                    type="button"
                    className="kml-btn kml-btn-outlined"
                    disabled={saving}
                    onClick={() => navigate(leaveTo)}
                  >
                    Rời không lưu
                  </button>
                  <button
                    type="button"
                    className="kml-btn kml-btn-filled"
                    disabled={saving || dateErr}
                    onClick={() => void saveAndLeave()}
                  >
                    {saving ? 'Đang lưu…' : 'Lưu và rời'}
                  </button>
                </>
              )}
            </div>
          }
        >
          {dateErr && (
            <p className="pl-leave-err">
              <IcWarn size={14} /> Ngày kết thúc đang trước ngày bắt đầu nên chưa lưu được.
            </p>
          )}
          {!narrow &&
            (changedCount > 0 ? (
              <>
                <p>Có thay đổi chưa lưu ở {changedCount} dự án:</p>
                <div className="k-dialog-list">
                  {form.projects.map((p, i) =>
                    changedKeys.has(p._k) ? (
                      <span key={p._k} className="kml-tag is-warn">
                        {roman(i + 1)} · {p.name.trim() || '(chưa đặt tên)'}
                      </span>
                    ) : null,
                  )}
                </div>
              </>
            ) : (
              <p>Có thay đổi chưa lưu ở thông tin chung, thứ tự dự án hoặc timeline.</p>
            ))}
        </KpiDialog>
      )}

      <EstSnackbar notice={notice} onClose={() => notify(null)} />
    </div>
  );
}
