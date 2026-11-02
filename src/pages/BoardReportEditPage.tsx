// Editor Báo cáo ngày (bản redesign Material 3):
// - Desktop ≥ 1200px: cột sửa + khung xem trước dính bên phải, tự cuộn tới dự án đang sửa.
// - < 1200px: tab Sửa / Xem trước dính cùng header.
// - Form chỉ ghi khi bấm Lưu; trạng thái lưu hiện ngay dưới tiêu đề (đã lưu / chưa lưu /
//   đang lưu / lỗi). Copy và Tải .txt lấy bản đang sửa, KHÔNG tự lưu.
// - Mỗi dự án mang key nội bộ `_k` (không ghi DB) để biết dự án nào đã sửa khi đổi thứ tự.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { usePm } from '../context/PmContext';
import { useSeededForm } from '../hooks/useSeededForm';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';
import { useMediaQuery } from '../hooks/useMediaQuery';
import BoardNav from '../components/board/BoardNav';
import ReportPreview from '../components/board/ReportPreview';
import ReportBodyEditor from '../components/board/ReportBodyEditor';
import ReportAppPicker from '../components/board/ReportAppPicker';
import ReportSortDialog from '../components/board/ReportSortDialog';
import ReportPopMenu from '../components/board/ReportPopMenu';
import ReportSyncChip, {
  sectionChipView,
  wholeChipView,
  type SyncChipView,
} from '../components/board/ReportSyncChip';
import KpiDialog from '../components/board/KpiDialog';
import KsumConfirmDialog from '../components/board/KsumConfirmDialog';
import { EstSnackbar, useEstNotice } from '../components/board/EstSheetTable';
import {
  IcArrowLeft,
  IcCalendar,
  IcCheck,
  IcChevronDown,
  IcChevronUp,
  IcCopy,
  IcDownload,
  IcEdit,
  IcEye,
  IcGrip,
  IcInfo,
  IcLink,
  IcLinkOff,
  IcMoreV,
  IcPlus,
  IcSave,
  IcSort,
  IcTrash,
  IcWarn,
} from '../components/board/ksumIcons';
import { buildReportText, formatDateVi, formatDayMonth, roman } from '../lib/reportFormat';
import { reportSyncPreview } from '../lib/planProgress';
import { downloadTextFile } from '../lib/downloadHelpers';
import { suggestAppId } from '../lib/pmText';
import { isoLocal, weekdayVN } from '../lib/pmDates';
import type { AppItem, DailyReport, ReportProject } from '../pmTypes';

type FormProject = ReportProject & { _k: string };
interface ReportForm {
  title: string;
  date: string;
  projects: FormProject[];
}
type ReportData = Omit<DailyReport, 'id' | 'order' | 'createdAt' | 'updatedAt'>;

function toForm(r: DailyReport): ReportForm {
  return {
    title: r.title,
    date: r.date,
    projects: (r.projects ?? []).map((p, i) => ({ ...p, _k: `s${i}` })),
  };
}

// Bỏ key nội bộ trước khi ghi DB / dựng text copy.
function toData(f: ReportForm): ReportData {
  return {
    title: f.title,
    date: f.date,
    projects: f.projects.map((p) => ({
      name: p.name,
      ...(p.appId ? { appId: p.appId } : {}),
      body: p.body,
    })),
  };
}

const sameProject = (a: ReportProject, b: ReportProject) =>
  a.name === b.name && a.body === b.body && (a.appId ?? '') === (b.appId ?? '');

const BODY_PLACEHOLDER = '# Android:\n- Nội dung công việc\n-> Kết quả / mốc\n+ Mục con';

// Remount theo id: đổi báo cáo thì reset sạch form, ảnh chụp "đã lưu" và mọi state cục bộ.
export default function BoardReportEditPage() {
  const { id = '' } = useParams();
  return <ReportEditor key={id} id={id} />;
}

function ReportEditor({ id }: { id: string }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { reports, plans, apps, loading, updateReport } = usePm();
  const report = reports.find((r) => r.id === id);

  const { form, setForm } = useSeededForm<ReportForm, DailyReport>(report, toForm);
  // Ảnh chụp bản đã lưu — so với form để biết dự án nào đã sửa (không dùng cờ dirty của hook
  // vì sửa rồi gõ lại như cũ vẫn phải coi là chưa đổi).
  const [saved, setSaved] = useState<ReportForm | null>(null);
  useEffect(() => {
    if (form && !saved) setSaved(form);
  }, [form, saved]);

  const narrow = useMediaQuery('(max-width: 839px)');
  const wide = useMediaQuery('(min-width: 1200px)');
  const { notice, notify } = useEstNotice();

  const [tab, setTab] = useState<'edit' | 'preview'>(
    params.get('tab') === 'preview' ? 'preview' : 'edit',
  );
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState(false);
  const [curK, setCurK] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ k: string; focus: 'name' | 'body' } | null>(null);
  const [pickFor, setPickFor] = useState<string | null>(null); // _k hoặc '__add'
  const [menuFor, setMenuFor] = useState<string | null>(null); // _k hoặc '__head'
  const [sortOpen, setSortOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [dupAsk, setDupAsk] = useState<{ app: AppItem; name: string } | null>(null);
  const [dragK, setDragK] = useState<string | null>(null);

  const keySeq = useRef(0);
  const nameRefs = useRef(new Map<string, HTMLInputElement>());
  const bodyRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const dateRef = useRef<HTMLInputElement>(null);
  const pvRef = useRef<HTMLDivElement>(null);

  // ----- Trạng thái thay đổi so với bản đã lưu -----
  const savedMap = new Map((saved?.projects ?? []).map((p) => [p._k, p]));
  const changedKeys = new Set(
    (form?.projects ?? [])
      .filter((p) => {
        const s = savedMap.get(p._k);
        return !s || !sameProject(s, p);
      })
      .map((p) => p._k),
  );
  const dirty =
    !!form &&
    !!saved &&
    (changedKeys.size > 0 ||
      form.title !== saved.title ||
      form.date !== saved.date ||
      form.projects.map((p) => p._k).join('|') !== saved.projects.map((p) => p._k).join('|'));
  useUnsavedGuard(dirty);

  // Dự án vừa thêm: cuộn tới + focus ô tên (nhập tay) hoặc ô nội dung (thêm từ app).
  useEffect(() => {
    if (!fresh) return;
    const el = fresh.focus === 'name' ? nameRefs.current.get(fresh.k) : bodyRefs.current.get(fresh.k);
    cardRefs.current.get(fresh.k)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el?.focus({ preventScroll: true });
    if (el instanceof HTMLInputElement) el.select();
  }, [fresh]);

  // Khung xem trước (desktop) tự cuộn tới dự án đang sửa — chỉ cuộn trong khung, không
  // kéo cả trang (không dùng scrollIntoView).
  const hi = form && curK ? form.projects.findIndex((p) => p._k === curK) : -1;
  useEffect(() => {
    const box = pvRef.current;
    if (!box || hi < 0) return;
    const el = box.querySelector<HTMLElement>(`[data-pidx="${hi}"]`);
    if (!el) return;
    const top = el.offsetTop;
    if (top < box.scrollTop || top + el.offsetHeight > box.scrollTop + box.clientHeight)
      box.scrollTo({ top: Math.max(0, top - 12), behavior: 'smooth' });
  }, [hi, wide, tab]);

  // ----- Lưu (ref để nút "Thử lại" trong snackbar luôn lưu form mới nhất) -----
  const save = async (): Promise<boolean> => {
    if (!form || saving) return false;
    const snap = form;
    setSaving(true);
    setSaveErr(false);
    try {
      await updateReport(id, toData(snap));
      setSaved(snap);
      setSaving(false);
      notify({ text: `Đã lưu báo cáo ${formatDateVi(snap.date)}` });
      return true;
    } catch {
      setSaving(false);
      setSaveErr(true);
      notify({
        text: 'Lưu thất bại. Thay đổi vẫn còn trên trang.',
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
      <div className="container kml-page rpt-page">
        <BoardNav />
        <div className="kml-empty">
          <p>Đang tải báo cáo…</p>
        </div>
      </div>
    );
  }
  if (!report || !form) {
    return (
      <div className="container kml-page rpt-page">
        <BoardNav />
        <div className="kml-empty">
          <span className="kml-empty-ic">
            <IcInfo size={28} />
          </span>
          <h2>Không tìm thấy báo cáo này</h2>
          <p>Báo cáo có thể đã bị xoá, hoặc link không đúng.</p>
          <Link to="/board/report" className="kml-btn kml-btn-tonal">
            <IcArrowLeft size={16} />
            Về danh sách báo cáo
          </Link>
        </div>
      </div>
    );
  }

  // ----- Cập nhật form (dạng hàm để các thao tác liên tiếp không đè nhau) -----
  const updateProjects = (fn: (ps: FormProject[]) => FormProject[]) =>
    setForm((f) => (f ? { ...f, projects: fn(f.projects) } : f));
  const setProject = (k: string, u: Partial<ReportProject>) =>
    updateProjects((ps) => ps.map((p) => (p._k === k ? { ...p, ...u } : p)));
  const newKey = () => `n${keySeq.current++}`;

  const usedAppIds = new Set(form.projects.map((p) => p.appId).filter(Boolean) as string[]);
  const usedByOthers = (k: string | null) => {
    const m = new Map<string, number>();
    form.projects.forEach((p, i) => {
      if (p.appId && p._k !== k) m.set(p.appId, i);
    });
    return m;
  };

  const addManual = () => {
    const k = newKey();
    updateProjects((ps) => [...ps, { name: 'Dự án mới', body: '', _k: k }]);
    setFresh({ k, focus: 'name' });
    setTab('edit');
  };
  const addFromApp = (appId: string, force = false) => {
    const app = apps.find((a) => a.id === appId);
    if (!app || usedAppIds.has(app.id)) return;
    // Dự án nhập tay chưa gắn app nhưng trùng tên → có thể là cùng dự án, hỏi lại.
    const same = form.projects.find(
      (p) => !p.appId && p.name.trim().toLowerCase() === app.name.trim().toLowerCase(),
    );
    if (same && !force) {
      setDupAsk({ app, name: same.name });
      return;
    }
    const k = newKey();
    updateProjects((ps) => [...ps, { name: app.name, appId: app.id, body: '', _k: k }]);
    setFresh({ k, focus: 'body' });
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

  // ----- Copy / Tải .txt: lấy bản đang sửa, không lưu -----
  const data = toData(form);
  const full: DailyReport = { ...report, ...data };
  const nProj = data.projects.filter((p) => p.name.trim() || p.body.trim()).length;
  const fileName = `report_${form.date}.txt`;
  const onCopy = async () => {
    const text = buildReportText(full);
    try {
      await navigator.clipboard.writeText(text);
      notify({
        text: dirty
          ? `Đã copy bản đang sửa (chưa lưu) · ${nProj} dự án`
          : `Đã copy báo cáo ${formatDateVi(form.date)} · ${nProj} dự án`,
      });
    } catch {
      downloadTextFile(fileName, text, 'text/plain');
      notify({ text: `Trình duyệt chặn copy, đã tải file ${fileName}` });
    }
  };
  const onExport = () => {
    downloadTextFile(fileName, buildReportText(full), 'text/plain');
    notify({ text: `Đã tải ${fileName}${dirty ? ' (bản chưa lưu)' : ''}` });
  };

  const onBack = () => (dirty ? setLeaveOpen(true) : navigate('/board/report'));
  const saveAndLeave = async () => {
    if (await save()) navigate('/board/report');
    else setLeaveOpen(false);
  };

  // ----- Header -----
  const changedCount = form.projects.filter((p) => changedKeys.has(p._k)).length;
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
      disabled={!dirty || saving}
      onClick={() => void save()}
    >
      {dirty ? <IcSave size={16} /> : <IcCheck size={16} />}
      {saving ? 'Đang lưu…' : saveErr && dirty ? 'Lưu lại' : dirty ? 'Lưu' : 'Đã lưu'}
    </button>
  );

  const todayIso = isoLocal(new Date());
  const linkedCount = form.projects.filter((p) => p.appId).length;

  // ----- Sync Plan tuần: plan của tuần chứa ngày báo cáo (theo ngày đang sửa) -----
  const syncPlan = plans.find((pl) => pl.weekStart <= form.date && form.date <= pl.weekEnd);
  const syncRange = syncPlan
    ? `${formatDayMonth(syncPlan.weekStart)} – ${formatDayMonth(syncPlan.weekEnd)}`
    : '';
  const syncs = syncPlan ? reportSyncPreview(syncPlan, form.projects) : [];
  const openDatePicker = () => {
    const el = dateRef.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
    }
  };

  // ----- Khung xem trước -----
  const preview = (
    <section className={`rpt-pv${wide ? ' is-side' : ''}`}>
      <div className="rpt-pv-head">
        <IcEye size={18} />
        <h2>Xem trước</h2>
        <span className="kml-spacer" />
        <span className="rpt-pv-note">đúng như bản copy</span>
        <button type="button" className="kml-iconbtn" aria-label="Copy text" onClick={onCopy}>
          <IcCopy size={18} />
        </button>
      </div>
      <div ref={pvRef} className="rpt-pv-body">
        <ReportPreview report={full} highlight={wide && hi >= 0 ? hi : undefined} />
      </div>
    </section>
  );

  // ----- Danh sách dự án -----
  const projectCards = form.projects.map((p, i) => {
    const k = p._k;
    const app = p.appId ? apps.find((a) => a.id === p.appId) : undefined;
    const sugId = p.appId ? '' : suggestAppId(p.name, apps.filter((a) => !usedAppIds.has(a.id)));
    const sugApp = sugId ? apps.find((a) => a.id === sugId) : undefined;
    const chipState = p.appId ? (app ? 'linked' : 'missing') : sugApp ? 'warn' : 'none';

    // Chip sync: plan 1 nhánh → ở hàng tên dự án; nhiều nhánh → trên từng dòng '#'.
    const sync = syncs[i];
    const syncCtx = sync && { project: sync.planProject, range: syncRange };
    const wholeChip = sync?.whole && syncCtx ? wholeChipView(sync.whole, syncCtx) : undefined;
    let lineChips: Map<number, SyncChipView> | undefined;
    const syncParts: string[] = [];
    if (sync && syncCtx && sync.sections.size > 0) {
      const raw = p.body.split('\n');
      lineChips = new Map();
      for (const [idx, c] of sync.sections) {
        const sec = (raw[idx] ?? '').trim().replace(/^#+\s*/, '').replace(/:\s*$/, '');
        const v = sectionChipView(c, sec, syncCtx, narrow);
        lineChips.set(idx, v);
        syncParts.push(`${sec}: ${v.label}`);
      }
    }
    const syncDesc = syncParts.length
      ? `Sync Plan tuần ${syncRange}: ${syncParts.join('; ')}`
      : undefined;
    const syncChip = wholeChip && <ReportSyncChip view={wholeChip} />;
    const chipText =
      chipState === 'linked'
        ? `${app!.name} · ${app!.platform}`
        : chipState === 'missing'
          ? 'App không tồn tại'
          : chipState === 'warn'
            ? 'Chưa gắn app'
            : 'Không gắn app';

    const chip = (
      <div className="kml-menu-anchor rpt-chip-anchor">
        <button
          type="button"
          className={`rpt-appchip is-${chipState}${pickFor === k ? ' is-open' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={pickFor === k}
          aria-label={
            chipState === 'linked' ? `App đã gắn: ${chipText}. Đổi app` : `${chipText}. Chọn app`
          }
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
            title={`Chọn app cho dự án ${p.name.trim() || roman(i + 1)}`}
            sheet={narrow}
            onPick={(appId) => setProject(k, { appId })}
            onUnlink={p.appId ? () => setProject(k, { appId: undefined }) : undefined}
            onClose={() => setPickFor(null)}
          />
        )}
      </div>
    );

    const menu = (
      <div className="kml-menu-anchor">
        <button
          type="button"
          className="kml-iconbtn"
          aria-label={`Thao tác với dự án ${p.name.trim() || roman(i + 1)}`}
          aria-haspopup="menu"
          aria-expanded={menuFor === k}
          onClick={() => setMenuFor(menuFor === k ? null : k)}
        >
          <IcMoreV size={18} />
        </button>
        {menuFor === k && (
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

    const nameInput = (
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
        className={`rpt-pc${curK === k ? ' is-focus' : ''}${fresh?.k === k && curK === k ? ' is-new' : ''}${dragK === k ? ' is-drag' : ''}`}
        aria-label={`Dự án ${roman(i + 1)}`}
        onFocus={() => setCurK(k)}
        onDragOver={(e) => {
          if (!dragK) return;
          e.preventDefault();
          if (dragK !== k) moveTo(dragK, i);
        }}
        // Chặn thả chữ (key kéo) vào textarea/ô tên.
        onDrop={(e) => {
          if (dragK) e.preventDefault();
        }}
      >
        <div className="rpt-pc-h">
          {!narrow && (
            <button
              type="button"
              className="kml-iconbtn rpt-grip"
              aria-label={`Kéo để đổi thứ tự ${p.name}`}
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
          {nameInput}
          {dirtyMark}
          {!narrow && syncChip}
          {!narrow && chip}
          {menu}
          {narrow && (
            <div className="rpt-pc-row2">
              {syncChip}
              {chip}
            </div>
          )}
        </div>

        {chipState === 'warn' && sugApp && (
          <div className="rpt-pc-hint is-warn">
            <span>Chưa gắn app · sync Plan tuần sẽ nối theo tên.</span>
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
        {chipState === 'none' && (
          <div className="rpt-pc-hint">
            <IcInfo size={14} />
            <span>Không ứng với app nào · sync Plan tuần nối theo tên dự án</span>
          </div>
        )}
        {chipState === 'missing' && (
          <div className="rpt-pc-hint is-warn">
            <span>App đã gắn không còn trong danh sách app. Chọn app khác hoặc bỏ gắn.</span>
          </div>
        )}
        {syncPlan && !sync && (p.name.trim() || p.body.trim()) && (
          <div className="rpt-pc-hint">
            <IcInfo size={14} />
            <span>Plan tuần {syncRange} không có dự án này.</span>
          </div>
        )}

        <div className="rpt-pc-body">
          <ReportBodyEditor
            ref={(el) => {
              if (el) bodyRefs.current.set(k, el);
              else bodyRefs.current.delete(k);
            }}
            value={p.body}
            placeholder={BODY_PLACEHOLDER}
            ariaLabel={`Nội dung dự án ${p.name}`}
            onChange={(v) => setProject(k, { body: v })}
            lineChips={lineChips}
            goalLines={sync?.goalLines}
            syncDesc={syncDesc}
          />
        </div>
      </section>
    );
  });

  const editPane = (
    <div className="rpt-eg-main">
      <section className="rpt-info">
        <label className="kml-field">
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
        <div className="kml-field rpt-date">
          <span className="kml-field-label">Ngày</span>
          <input
            className="kml-input"
            readOnly
            value={formatDateVi(form.date)}
            aria-label="Ngày báo cáo"
            aria-describedby="rpt-date-sup"
            onClick={openDatePicker}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openDatePicker();
              }
            }}
          />
          <span className="rpt-field-trail">
            <button
              type="button"
              className="kml-iconbtn"
              aria-label="Mở lịch"
              onClick={openDatePicker}
            >
              <IcCalendar size={18} />
            </button>
          </span>
          {/* Ô date gốc ẩn: chỉ để mở lịch của trình duyệt, hiển thị dd/mm/yyyy ở ô trên */}
          <input
            ref={dateRef}
            type="date"
            className="rpt-date-native"
            tabIndex={-1}
            aria-hidden="true"
            value={form.date}
            onChange={(e) => {
              const date = e.target.value;
              if (date) setForm((f) => (f ? { ...f, date } : f));
            }}
          />
          <span className="kml-field-sup" id="rpt-date-sup">
            {weekdayVN(form.date)}
            {form.date === todayIso ? ' · hôm nay' : ''}
          </span>
        </div>
        <div className="rpt-legend">
          <span>
            <code className="lg-sec">#</code>nhánh
          </span>
          <span>
            <code className="lg-mk">-</code>đầu việc
          </span>
          <span>
            <code className="lg-arr">-&gt;</code>kết quả/mốc
          </span>
          <span>
            <code className="lg-mk">+</code>mục con
          </span>
          <span className="rpt-legend-sync">
            {syncPlan ? (
              <>
                Chip = sync Plan tuần {syncRange} · <u>gạch chân</u> = dòng mốc
              </>
            ) : (
              'Ngày này chưa có Plan tuần nên không có chip sync'
            )}
          </span>
          <span className="rpt-legend-apps">
            <IcLink size={14} />
            gắn app: {linkedCount}/{form.projects.length} dự án
          </span>
        </div>
      </section>

      <div className="rpt-sec-h">
        <h2>Dự án</h2>
        <span className="rpt-sec-sub">{form.projects.length}</span>
        <span className="kml-spacer" />
        {form.projects.length > 1 && (
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
          Nhập tay
        </button>
      </div>
    </div>
  );

  return (
    <div className="container kml-page rpt-page">
      <BoardNav />

      <div className={`rpt-ebar${narrow ? ' is-narrow' : ''}`}>
        <div className="rpt-ebar-row">
          <button
            type="button"
            className="kml-iconbtn"
            aria-label="Về danh sách báo cáo"
            onClick={onBack}
          >
            <IcArrowLeft size={20} />
          </button>
          <div className="kml-topbar-title">
            <h1>{narrow ? formatDateVi(form.date) : `Báo cáo ${formatDateVi(form.date)}`}</h1>
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
                <button type="button" className="kml-iconbtn" aria-label="Copy text" onClick={onCopy}>
                  <IcCopy size={18} />
                </button>
                {saveBtn}
                <div className="kml-menu-anchor">
                  <button
                    type="button"
                    className="kml-iconbtn"
                    aria-label="Thêm: tải .txt, sắp xếp dự án"
                    aria-haspopup="menu"
                    aria-expanded={menuFor === '__head'}
                    onClick={() => setMenuFor(menuFor === '__head' ? null : '__head')}
                  >
                    <IcMoreV size={18} />
                  </button>
                  {menuFor === '__head' && (
                    <ReportPopMenu label="Thêm" onClose={() => setMenuFor(null)}>
                      <button
                        type="button"
                        className="kml-menu-item"
                        onClick={() => {
                          setMenuFor(null);
                          onExport();
                        }}
                      >
                        <IcDownload size={18} />
                        <span>
                          <span>Tải .txt</span>
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
                    </ReportPopMenu>
                  )}
                </div>
              </>
            ) : (
              <>
                <button type="button" className="kml-btn kml-btn-text" onClick={onExport}>
                  <IcDownload size={16} />
                  Tải .txt
                </button>
                <button type="button" className="kml-btn kml-btn-outlined" onClick={onCopy}>
                  <IcCopy size={16} />
                  Copy
                </button>
                {saveBtn}
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

      {wide ? (
        <div className="rpt-eg">
          {editPane}
          <aside className="rpt-eg-side">{preview}</aside>
        </div>
      ) : tab === 'edit' ? (
        editPane
      ) : (
        <>
          {preview}
          <p className="rpt-pv-foot">Phần này giống hệt text khi bấm Copy.</p>
        </>
      )}

      {sortOpen && (
        <ReportSortDialog
          narrow={narrow}
          items={form.projects.map((p) => {
            const a = p.appId ? apps.find((x) => x.id === p.appId) : undefined;
            return {
              key: p._k,
              name: p.name,
              sub: a ? a.platform : p.appId ? 'app không tồn tại' : 'không gắn app',
            };
          })}
          onApply={applyOrder}
          onClose={() => setSortOpen(false)}
        />
      )}

      {dupAsk && (
        <KsumConfirmDialog
          tone="warn"
          icon={<IcWarn size={20} />}
          title={`Đã có dự án «${dupAsk.name}» chưa gắn app`}
          subtitle={`Thêm từ app ${dupAsk.app.name} · ${dupAsk.app.platform}`}
          confirmLabel="Vẫn thêm dự án mới"
          onCancel={() => setDupAsk(null)}
          onConfirm={() => {
            addFromApp(dupAsk.app.id, true);
            setDupAsk(null);
          }}
        >
          <p>
            Báo cáo sẽ có 2 dự án cùng tên. Sync Plan tuần sẽ nối theo app với dự án mới, và theo
            tên với dự án cũ.
          </p>
        </KsumConfirmDialog>
      )}

      {leaveOpen && (
        <KpiDialog
          title="Lưu thay đổi trước khi rời?"
          subtitle={
            narrow && changedCount > 0
              ? `Báo cáo ${formatDateVi(form.date)} · ${changedCount} dự án đã sửa`
              : `Báo cáo ${formatDateVi(form.date)}`
          }
          icon={<IcSave size={20} />}
          dismissible={!saving}
          onClose={() => setLeaveOpen(false)}
          actions={
            <div className={`rpt-leave-acts${narrow ? ' is-stack' : ''}`}>
              {narrow ? (
                <>
                  <button
                    type="button"
                    className="kml-btn kml-btn-filled"
                    disabled={saving}
                    onClick={() => void saveAndLeave()}
                  >
                    {saving ? 'Đang lưu…' : 'Lưu và rời'}
                  </button>
                  <button
                    type="button"
                    className="kml-btn kml-btn-outlined"
                    disabled={saving}
                    onClick={() => navigate('/board/report')}
                  >
                    Rời không lưu
                  </button>
                  <button
                    type="button"
                    className="kml-btn kml-btn-text"
                    disabled={saving}
                    onClick={() => setLeaveOpen(false)}
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
                    onClick={() => setLeaveOpen(false)}
                  >
                    Ở lại
                  </button>
                  <button
                    type="button"
                    className="kml-btn kml-btn-outlined"
                    disabled={saving}
                    onClick={() => navigate('/board/report')}
                  >
                    Rời không lưu
                  </button>
                  <button
                    type="button"
                    className="kml-btn kml-btn-filled"
                    disabled={saving}
                    onClick={() => void saveAndLeave()}
                  >
                    {saving ? 'Đang lưu…' : 'Lưu và rời'}
                  </button>
                </>
              )}
            </div>
          }
        >
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
              <p>Có thay đổi chưa lưu ở tiêu đề, ngày, thứ tự hoặc danh sách dự án.</p>
            ))}
        </KpiDialog>
      )}

      <EstSnackbar notice={notice} onClose={() => notify(null)} />
    </div>
  );
}
