// Danh sách Plan tuần (redesign Material 3, 02/11/2026).
// - ≥ 1200px: 2 cột — trái là danh sách nhóm theo tuần/tháng (thu gọn được thành rail 72px,
//   mặc định thu gọn), phải xem trước plan đang chọn.
// - 840–1199px: 1 cột, bấm hàng mở editor ở tab Xem trước.
// - < 840px: card plan tuần này (timeline + trạng thái) + FAB "Tạo plan" mở bottom sheet.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePm, useReleaseKeys } from '../context/PmContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import BoardNav from '../components/board/BoardNav';
import PlanPreviewPane, { PlanSummary } from '../components/board/PlanPreviewPane';
import ReportPopMenu from '../components/board/ReportPopMenu';
import KpiDialog from '../components/board/KpiDialog';
import KsumConfirmDialog from '../components/board/KsumConfirmDialog';
import { EstSnackbar, useEstNotice } from '../components/board/EstSheetTable';
import {
  IcCalendar,
  IcCalendarNext,
  IcChevronDown,
  IcChevronUp,
  IcClose,
  IcCopy,
  IcEdit,
  IcEye,
  IcMoreV,
  IcPanelClose,
  IcPanelOpen,
  IcPlus,
  IcSearch,
  IcTrash,
  IcWarn,
} from '../components/board/ksumIcons';
import { isReleaseWs, newPlanTemplate, type WeeklyPlan } from '../pmTypes';
import { fold, formatDateVi, formatDayMonth, parseReportQuery, type ReportQuery } from '../lib/reportFormat';
import { addDays, currentWeek, isoLocal, isoWeek, mondayOf, weekdayVN } from '../lib/pmDates';
import { buildAutoPlan } from '../lib/planAutofill';
import { buildReleaseDoneText, releasedInWeek } from '../lib/planProgress';
import { downloadTextFile } from '../lib/downloadHelpers';

// Số chip "Nhảy tới tháng" và số tuần gần nhất hiện trên rail.
const MONTH_CHIPS = 6;
const RAIL_WEEKS = 6;

const validIso = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s + 'T00:00:00').getTime());

// Ô tìm: ngày → plan có tuần chứa ngày đó; chữ → tiêu đề, mô tả, dự án, nhánh, item, timeline.
function matchPlan(p: WeeklyPlan, q: ReportQuery): boolean {
  if (q.kind === 'none') return true;
  if (q.kind === 'date') {
    if (!validIso(p.weekStart) || !validIso(p.weekEnd) || p.weekEnd < p.weekStart) return false;
    for (let d = p.weekStart, n = 0; d <= p.weekEnd && n < 7; d = addDays(d, 1), n++) {
      const [y, m, day] = d.split('-').map(Number);
      if (day === q.d && (q.m === undefined || m === q.m) && (q.y === undefined || y === q.y))
        return true;
    }
    return false;
  }
  const hit = (s?: string) => !!s && fold(s).includes(q.text);
  if (hit(p.title) || hit(p.description)) return true;
  if ((p.timeline ?? []).some((t) => hit(t.release))) return true;
  return (p.projects ?? []).some(
    (pr) =>
      hit(pr.name) ||
      (pr.workstreams ?? []).some(
        (w) => hit(w.title) || hit(w.milestone?.text) || (w.items ?? []).some((it) => hit(it)),
      ),
  );
}

// Số liệu 1 plan cho dòng phụ.
function planStats(p: WeeklyPlan, releaseKeys: Set<string>) {
  const ws = (p.projects ?? []).flatMap((pr) => pr.workstreams ?? []);
  return {
    projects: (p.projects ?? []).length,
    ws: ws.length,
    rel: ws.filter((w) => isReleaseWs(w, releaseKeys)).length,
  };
}

interface PlanGroup {
  /** 'next' | 'this' | 'last' | 'yyyy-mm' | 'bad'. */
  key: string;
  label: string;
  /** Nhóm tháng (tuần cũ) — thu gọn được. */
  month: boolean;
  plans: WeeklyPlan[];
}

export default function BoardPlanListPage() {
  const { plans, loading, addPlan, deletePlan, apps, tasks, reports, meta } = usePm();
  const releaseKeys = useReleaseKeys();
  const navigate = useNavigate();
  const narrow = useMediaQuery('(max-width: 839px)');
  const wide = useMediaQuery('(min-width: 1200px)');
  const { notice, notify } = useEstNotice();

  const today = isoLocal(new Date());
  const thisMon = mondayOf(today);
  const nextMon = addDays(thisMon, 7);
  const lastMon = addDays(thisMon, -7);
  const weekOf = (p: WeeklyPlan) => (validIso(p.weekStart) ? mondayOf(p.weekStart) : '');

  const [q, setQ] = useState('');
  // Plan đang xem ở cột phải (≥ 1200px); null = mặc định tuần này / mới nhất.
  const [selId, setSelId] = useState<string | null>(null);
  // Hàng vừa nhảy tới (< 1200px) — tô nền để dễ thấy.
  const [focusId, setFocusId] = useState<string | null>(null);
  // Danh sách mở đầy đủ (≥ 1200px); mặc định thu gọn thành rail, không lưu lại.
  const [listOpen, setListOpen] = useState(false);
  // Nhóm tháng người dùng tự mở / thu gọn (khoá 'yyyy-mm').
  const [grpOpen, setGrpOpen] = useState<Record<string, boolean>>({});
  // Menu đang mở: 'create' | 'pv' | 'hl' | 'row:{id}'.
  const [menu, setMenu] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [delTarget, setDelTarget] = useState<WeeklyPlan | null>(null);
  const [jump, setJump] = useState<{ id: string; n: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [focusSearch, setFocusSearch] = useState(0);

  const query = useMemo(() => parseReportQuery(q), [q]);
  const searching = query.kind !== 'none';
  const shown = useMemo(
    () => (searching ? plans.filter((p) => matchPlan(p, query)) : plans),
    [plans, query, searching],
  );

  // `plans` đã sort mới nhất trước.
  const valid = useMemo(
    () => plans.filter((p) => validIso(p.weekStart) && validIso(p.weekEnd)),
    [plans],
  );
  const newest = valid[0];
  const oldest = valid[valid.length - 1];
  const thisPlan = plans.find((p) => weekOf(p) === thisMon);
  const nextPlan = plans.find((p) => weekOf(p) === nextMon);
  const rail = wide && !listOpen;

  const pool = rail ? plans : shown;
  const selected = pool.find((p) => p.id === selId) ?? (searching && !rail ? shown[0] : (thisPlan ?? plans[0]));
  const focus = wide ? selected?.id : focusId;
  const focusMonth = plans.find((p) => p.id === focus)?.weekStart.slice(0, 7);

  // Tuần có > 1 plan → dòng phụ kèm tiêu đề để phân biệt.
  const dupWeeks = useMemo(() => {
    const seen = new Set<string>();
    const dup = new Set<string>();
    for (const p of plans) {
      const k = validIso(p.weekStart) ? mondayOf(p.weekStart) : '';
      if (!k) continue;
      if (seen.has(k)) dup.add(k);
      seen.add(k);
    }
    return dup;
  }, [plans]);

  const groups = useMemo(() => {
    const out: PlanGroup[] = [];
    const bad: WeeklyPlan[] = [];
    const push = (key: string, label: string, month: boolean, p: WeeklyPlan) => {
      const g = out.find((x) => x.key === key);
      if (g) g.plans.push(p);
      else out.push({ key, label, month, plans: [p] });
    };
    for (const p of shown) {
      const wk = validIso(p.weekStart) ? mondayOf(p.weekStart) : '';
      if (!wk) bad.push(p);
      else if (wk > thisMon) push('next', 'Tuần sau', false, p);
      else if (wk === thisMon) push('this', 'Tuần này', false, p);
      else if (wk === lastMon) push('last', 'Tuần trước', false, p);
      else {
        const k = p.weekStart.slice(0, 7);
        const [y, m] = k.split('-');
        push(k, y === today.slice(0, 4) ? `Tháng ${Number(m)}` : `Tháng ${Number(m)}/${y}`, true, p);
      }
    }
    // Plan tuần sau nhưng xa hơn 1 tuần → gọi chung "Sắp tới".
    const nx = out.find((g) => g.key === 'next');
    if (nx && nx.plans.some((p) => mondayOf(p.weekStart) !== nextMon)) nx.label = 'Sắp tới';
    if (bad.length) out.push({ key: 'bad', label: 'Ngày tuần không hợp lệ', month: false, plans: bad });
    return out;
  }, [shown, thisMon, lastMon, nextMon, today]);

  // Các tháng gần nhất có plan, 'yyyy-mm'.
  const months = useMemo(() => {
    const out: string[] = [];
    for (const p of valid) {
      const k = p.weekStart.slice(0, 7);
      if (!out.includes(k)) out.push(k);
      if (out.length >= MONTH_CHIPS) break;
    }
    return out;
  }, [valid]);
  const monthLabel = (k: string) => {
    const [y, m] = k.split('-');
    return y === today.slice(0, 4) ? `Tháng ${Number(m)}` : `Tháng ${Number(m)}/${y}`;
  };

  // Cuộn tới hàng vừa nhảy tới (sau khi nhóm của nó đã mở ra).
  useEffect(() => {
    if (!jump) return;
    document
      .querySelector(`[data-pid="${jump.id}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [jump]);
  // Bấm tìm trên rail → mở danh sách rồi focus ô tìm.
  useEffect(() => {
    if (focusSearch) searchRef.current?.focus();
  }, [focusSearch]);

  const reveal = (p: WeeklyPlan) => {
    setGrpOpen((o) => ({ ...o, [p.weekStart.slice(0, 7)]: true }));
    if (wide) setSelId(p.id);
    else setFocusId(p.id);
    setJump((j) => ({ id: p.id, n: (j?.n ?? 0) + 1 }));
  };
  const jumpMonth = (k: string) => {
    setQ('');
    const p = valid.find((x) => x.weekStart.startsWith(k));
    if (p) reveal(p);
  };

  // ----- Nhãn -----
  const rangeText = (p: WeeklyPlan) =>
    validIso(p.weekStart) && validIso(p.weekEnd)
      ? `${formatDayMonth(p.weekStart)} – ${formatDateVi(p.weekEnd)}`
      : p.title.trim() || '(chưa đặt tên)';
  const weekTag = (p: WeeklyPlan) => {
    const wk = weekOf(p);
    return wk === thisMon ? 'Tuần này' : wk === nextMon ? 'Tuần sau' : null;
  };
  const subText = (p: WeeklyPlan) => {
    const s = planStats(p, releaseKeys);
    const parts = [`${s.projects} dự án`, `${s.ws} nhánh`];
    if (s.rel) parts.push(`${s.rel} release`);
    if (dupWeeks.has(weekOf(p))) parts.unshift(p.title.trim() || '(chưa đặt tên)');
    return parts.join(' · ');
  };
  const tile = (p: WeeklyPlan) => (
    <span className="rpt-dtile pl-wtile" aria-hidden="true">
      <b>{validIso(p.weekStart) ? isoWeek(p.weekStart) : '?'}</b>
      <span>tuần</span>
    </span>
  );

  // ----- Tạo plan -----
  const closeCreate = () => {
    setMenu(null);
    setSheet(false);
  };
  // Tự sinh từ dữ liệu thật (plan tuần trước + task đang chạy + lịch release);
  // không có gì để fill → template mẫu.
  const createFor = (start: string, end: string) => {
    closeCreate();
    const auto = buildAutoPlan({ weekStart: start, weekEnd: end, plans, apps, tasks, releaseKeys });
    const created = addPlan(auto ?? newPlanTemplate(start, end));
    if (created) navigate(`/board/plan/${created.id}`);
  };
  const cw = currentWeek();
  const nw = { start: addDays(cw.start, 7), end: addDays(cw.end, 7) };
  const openPlan = (p: WeeklyPlan) => {
    closeCreate();
    navigate(`/board/plan/${p.id}`);
  };
  const editedText = (p: WeeklyPlan) =>
    p.updatedAt ? ` · sửa lần cuối ${formatDayMonth(isoLocal(new Date(p.updatedAt)))}` : '';
  const createMenu = (
    <>
      {thisPlan ? (
        <>
          <div className="rpt-cm-warn">
            <div className="kml-banner is-warn">
              <IcWarn size={18} />
              <span>
                Tuần {formatDayMonth(cw.start)} – {formatDayMonth(cw.end)} đã có plan. Tạo thêm sẽ ra
                2 plan cùng tuần; Báo cáo ngày, Tổng quan và Lịch release chỉ đọc 1 trong 2.
              </span>
            </div>
          </div>
          <button type="button" className="kml-menu-item" role="menuitem" onClick={() => openPlan(thisPlan)}>
            <IcEye size={18} />
            <span>
              <span>Mở plan tuần này</span>
              <small>
                {planStats(thisPlan, releaseKeys).projects} dự án · {planStats(thisPlan, releaseKeys).ws}{' '}
                nhánh{editedText(thisPlan)}
              </small>
            </span>
          </button>
          <div className="kml-menu-sep" />
          <p className="kml-menu-sub">Vẫn tạo plan mới</p>
          <button
            type="button"
            className="kml-menu-item"
            role="menuitem"
            onClick={() => createFor(cw.start, cw.end)}
          >
            <IcPlus size={18} />
            <span>
              <span>
                Tạo tự động cho tuần {formatDayMonth(cw.start)} – {formatDayMonth(cw.end)}
              </span>
              <small>Nhánh chưa xong tuần trước, task release và task đang chạy</small>
            </span>
          </button>
        </>
      ) : (
        <button
          type="button"
          className="kml-menu-item"
          role="menuitem"
          onClick={() => createFor(cw.start, cw.end)}
        >
          <IcPlus size={18} />
          <span>
            <span>Tạo tự động cho tuần này</span>
            <small>
              {formatDayMonth(cw.start)} – {formatDayMonth(cw.end)} · nhánh chưa xong tuần trước, task
              release và task đang chạy
            </small>
          </span>
        </button>
      )}
      {nextPlan ? (
        <button type="button" className="kml-menu-item" role="menuitem" onClick={() => openPlan(nextPlan)}>
          <IcCalendarNext size={18} />
          <span>
            <span>Mở plan tuần sau</span>
            <small>
              {formatDayMonth(nextPlan.weekStart)} – {formatDayMonth(nextPlan.weekEnd)} ·{' '}
              {planStats(nextPlan, releaseKeys).projects} dự án
            </small>
          </span>
        </button>
      ) : (
        <button
          type="button"
          className="kml-menu-item"
          role="menuitem"
          onClick={() => createFor(nw.start, nw.end)}
        >
          <IcCalendarNext size={18} />
          <span>
            <span>
              Tạo plan tuần sau ({formatDayMonth(nw.start)} – {formatDayMonth(nw.end)})
            </span>
            <small>
              {thisPlan ? 'Tự động, nối tiếp plan tuần này' : 'Tự động từ task release và task đang chạy'}
            </small>
          </span>
        </button>
      )}
    </>
  );

  // ----- Copy release / Xoá -----
  const releaseCount = (p: WeeklyPlan) => releasedInWeek(p, reports, releaseKeys).length;
  const weekRange = (p: WeeklyPlan) => `${formatDayMonth(p.weekStart)} – ${formatDayMonth(p.weekEnd)}`;
  const onCopyRelease = async (p: WeeklyPlan) => {
    setMenu(null);
    const text = buildReleaseDoneText(p, reports, releaseKeys);
    if (!text) {
      notify({ text: `Tuần ${weekRange(p)} chưa có nhánh release nào xong` });
      return;
    }
    const n = releaseCount(p);
    try {
      await navigator.clipboard.writeText(text);
      notify({ text: `Đã copy ${n} release tuần ${weekRange(p)}` });
    } catch {
      const fileName = `release_${p.weekStart || 'plan'}.txt`;
      downloadTextFile(fileName, text, 'text/plain');
      notify({ text: `Trình duyệt chặn copy, đã tải file ${fileName}` });
    }
  };
  const doDelete = async (p: WeeklyPlan) => {
    setDelTarget(null);
    // Xoá plan đang xem → chuyển sang plan kế bên (cũ hơn, hết thì mới hơn).
    const wasSel = wide && selected?.id === p.id;
    if (wasSel) {
      const i = pool.findIndex((x) => x.id === p.id);
      setSelId((pool[i + 1] ?? pool[i - 1])?.id ?? null);
    }
    try {
      await deletePlan(p.id);
      notify({ text: `Đã xoá plan tuần ${weekRange(p)}` });
    } catch {
      if (wasSel) setSelId(p.id);
      notify({
        kind: 'error',
        persistent: true,
        text: `Không xoá được plan tuần ${weekRange(p)}. Kiểm tra mạng rồi thử lại.`,
        action: { label: 'Thử lại', onClick: () => void doDelete(p) },
      });
    }
  };
  const askDelete = (p: WeeklyPlan) => {
    setMenu(null);
    setDelTarget(p);
  };

  // Menu ⋮ của 1 plan (hàng / card / khung xem trước).
  const planMenu = (p: WeeklyPlan, key: string, withEdit: boolean) => (
    <div className="kml-menu-anchor">
      <button
        type="button"
        className="kml-iconbtn"
        aria-label={`Thao tác với plan tuần ${weekRange(p)}`}
        aria-haspopup="menu"
        aria-expanded={menu === key}
        onClick={() => setMenu((m) => (m === key ? null : key))}
      >
        <IcMoreV size={18} />
      </button>
      {menu === key && (
        <ReportPopMenu label={`Thao tác với plan tuần ${weekRange(p)}`} onClose={() => setMenu(null)}>
          {withEdit && (
            <button
              type="button"
              className="kml-menu-item"
              role="menuitem"
              onClick={() => navigate(`/board/plan/${p.id}`)}
            >
              <IcEdit size={18} />
              <span>Sửa</span>
            </button>
          )}
          {withEdit && (
            <button
              type="button"
              className="kml-menu-item"
              role="menuitem"
              onClick={() => void onCopyRelease(p)}
            >
              <IcCopy size={18} />
              <span>
                <span>Copy release</span>
                <small>{releaseCount(p)} nhánh release đã xong</small>
              </span>
            </button>
          )}
          {withEdit && <div className="kml-menu-sep" />}
          <button
            type="button"
            className="kml-menu-item is-danger"
            role="menuitem"
            onClick={() => askDelete(p)}
          >
            <IcTrash size={18} />
            <span>Xoá plan</span>
          </button>
        </ReportPopMenu>
      )}
    </div>
  );

  // ----- Hàng / card -----
  const renderRow = (p: WeeklyPlan) => {
    const key = `row:${p.id}`;
    const tag = weekTag(p);
    const sel = p.id === focus;
    return (
      <div
        key={p.id}
        role="listitem"
        data-pid={p.id}
        className={`rpt-rrow${tag === 'Tuần này' ? ' is-today' : ''}${sel ? ' is-sel' : ''}${
          menu === key ? ' is-menu' : ''
        }`}
      >
        <button
          type="button"
          className="rpt-rrow-main"
          aria-current={wide && sel ? 'true' : undefined}
          title={p.title}
          onClick={() => (wide ? setSelId(p.id) : navigate(`/board/plan/${p.id}?tab=preview`))}
        >
          {tile(p)}
          <span className="rpt-rrow-txt">
            <span className="rpt-rrow-t">
              {rangeText(p)}
              {tag && <span className="kml-tag is-today">{tag}</span>}
            </span>
            <span className="rpt-rrow-s">{subText(p)}</span>
          </span>
        </button>
        <div className="rpt-rrow-act">{planMenu(p, key, true)}</div>
      </div>
    );
  };

  // Card plan tuần này (màn hẹp): bấm cả card mở editor ở tab Xem trước.
  const renderHighlight = (p: WeeklyPlan) => (
    <div className="rpt-hl pl-hl" data-pid={p.id}>
      <Link
        className="rpt-hl-link"
        to={`/board/plan/${p.id}?tab=preview`}
        aria-label={`Mở plan tuần này ${weekRange(p)} ở tab Xem trước`}
      >
        {tile(p)}
        <span className="rpt-rrow-txt">
          <span className="rpt-rrow-t">{rangeText(p)}</span>
          <span className="rpt-rrow-s">
            <b>Tuần này</b> · {subText(p)}
          </span>
        </span>
      </Link>
      <div className="pl-hl-pv" aria-hidden="true">
        <PlanSummary plan={p} releaseKeys={releaseKeys} milestoneTypes={meta.milestoneTypes} flat />
      </div>
      <div className="rpt-hl-act">
        <Link className="kml-btn kml-btn-filled pl-hl-main" to={`/board/plan/${p.id}?tab=preview`}>
          <IcEye size={18} />
          Xem plan
        </Link>
        <Link className="kml-btn kml-btn-outlined" to={`/board/plan/${p.id}`}>
          <IcEdit size={18} />
          Sửa
        </Link>
        {planMenu(p, 'hl', false)}
      </div>
    </div>
  );

  const renderGroup = (g: PlanGroup) => {
    const open = searching || !g.month || (grpOpen[g.key] ?? false);
    const hl = narrow && !searching && g.key === 'this' ? g.plans[0] : undefined;
    const rows = g.plans.filter((p) => p !== hl);
    const starts = g.plans.map((p) => p.weekStart).sort();
    const ends = g.plans.map((p) => p.weekEnd).sort();
    const span = `${formatDayMonth(starts[0])} – ${formatDayMonth(ends[ends.length - 1])}`;
    return (
      <section key={g.key} className="rpt-wk">
        {g.month && !searching ? (
          <button
            type="button"
            className="rpt-wk-c"
            aria-expanded={open}
            onClick={() => setGrpOpen((o) => ({ ...o, [g.key]: !open }))}
          >
            <span className="rpt-wk-c-t">{g.label}</span>
            <span className="rpt-wk-c-n">
              {g.plans.length} plan · {span}
            </span>
            {open ? <IcChevronUp size={18} /> : <IcChevronDown size={18} />}
          </button>
        ) : (
          <div className="rpt-wk-h" role="heading" aria-level={2}>
            <b>{g.label}</b>
            {g.month && <span>· {g.plans.length} plan</span>}
          </div>
        )}
        {open && (
          <>
            {hl && renderHighlight(hl)}
            {rows.length > 0 && (
              <div className="rpt-wk-rows" role="list">
                {rows.map(renderRow)}
              </div>
            )}
          </>
        )}
      </section>
    );
  };

  // ----- Rail (≥ 1200px, danh sách thu gọn) -----
  const railPlans = plans.slice(0, RAIL_WEEKS);
  const railCard = (
    <nav className="pl-rail" aria-label="Danh sách plan (thu gọn)">
      <button
        type="button"
        className="kml-iconbtn"
        aria-label="Mở danh sách plan"
        aria-expanded={false}
        title="Mở danh sách"
        onClick={() => setListOpen(true)}
      >
        <IcPanelOpen size={20} />
      </button>
      <button
        type="button"
        className="kml-iconbtn"
        aria-label="Tìm plan"
        title="Tìm plan"
        onClick={() => {
          setListOpen(true);
          setFocusSearch((n) => n + 1);
        }}
      >
        <IcSearch size={20} />
      </button>
      <div className="pl-rail-sep" />
      {railPlans.map((p) => {
        const tag = weekTag(p);
        const s = planStats(p, releaseKeys);
        const label = validIso(p.weekStart)
          ? `Tuần ${isoWeek(p.weekStart)} · ${formatDayMonth(p.weekStart)} – ${formatDateVi(p.weekEnd)} · ${s.projects} dự án`
          : `${p.title || '(chưa đặt tên)'} · ${s.projects} dự án`;
        return (
          <button
            key={p.id}
            type="button"
            className={`pl-rail-w${tag === 'Tuần này' ? ' is-now' : ''}${p.id === selected?.id ? ' is-sel' : ''}`}
            aria-label={label}
            aria-current={p.id === selected?.id ? 'true' : undefined}
            title={label}
            onClick={() => setSelId(p.id)}
          >
            {tile(p)}
            <small>{validIso(p.weekStart) ? formatDayMonth(p.weekStart) : '—'}</small>
          </button>
        );
      })}
      {plans.length > RAIL_WEEKS && (
        <button
          type="button"
          className="pl-rail-w"
          aria-label={`Xem tất cả ${plans.length} plan`}
          title={`Xem tất cả ${plans.length} plan`}
          onClick={() => setListOpen(true)}
        >
          <span className="rpt-dtile pl-rail-more" aria-hidden="true">
            +{plans.length - RAIL_WEEKS}
          </span>
          <small>tất cả</small>
        </button>
      )}
    </nav>
  );

  // ----- Khung xem trước (≥ 1200px) -----
  const selRel = selected ? releaseCount(selected) : 0;
  const previewCard = (
    <aside className="rpt-pvc pl-pvc" aria-label="Xem trước plan">
      {selected ? (
        <>
          <div className="rpt-pvc-head">
            <div className="rpt-pvc-title">
              <h2>
                <span className="pl-pvc-name">{selected.title.trim() || 'Plan tuần'}</span>
                {weekTag(selected) && <span className="kml-tag is-today">{weekTag(selected)}</span>}
              </h2>
              <p>
                {validIso(selected.weekStart) && validIso(selected.weekEnd)
                  ? `Tuần ${isoWeek(selected.weekStart)} · ${weekdayVN(selected.weekStart).toLowerCase()}, ${formatDayMonth(selected.weekStart)} – ${weekdayVN(selected.weekEnd).toLowerCase()}, ${formatDateVi(selected.weekEnd)}`
                  : 'Ngày tuần không hợp lệ'}{' '}
                · {planStats(selected, releaseKeys).projects} dự án · {planStats(selected, releaseKeys).ws}{' '}
                nhánh
              </p>
            </div>
            <span title={selRel ? undefined : 'Chưa có nhánh release nào xong trong tuần'}>
              <button
                type="button"
                className="kml-btn kml-btn-outlined"
                disabled={selRel === 0}
                onClick={() => void onCopyRelease(selected)}
              >
                <IcCopy size={18} />
                Copy release · {selRel}
              </button>
            </span>
            <Link className="kml-btn kml-btn-filled" to={`/board/plan/${selected.id}`}>
              <IcEdit size={18} />
              Sửa
            </Link>
            {planMenu(selected, 'pv', false)}
          </div>
          <div className="rpt-pvc-body">
            <PlanPreviewPane
              key={selected.id}
              plan={selected}
              apps={apps}
              tasks={tasks}
              milestoneTypes={meta.milestoneTypes}
              releaseKeys={releaseKeys}
              hideTitle
              wide={rail}
              clamp
              onOpenOverview={() => navigate('/board')}
            />
          </div>
        </>
      ) : (
        <div className="kml-empty">
          <p>Không có plan để xem trước.</p>
        </div>
      )}
    </aside>
  );

  // ----- Trang -----
  let body;
  if (loading && plans.length === 0) {
    body = (
      <div className="kml-empty">
        <p>Đang tải plan…</p>
      </div>
    );
  } else if (plans.length === 0) {
    body = (
      <div className="kml-empty pl-empty">
        <span className="kml-empty-ic">
          <IcCalendar size={28} />
        </span>
        <h2>Chưa có plan tuần nào</h2>
        <p>
          Plan tuần gom nhánh việc theo dự án, timeline release và trạng thái. Bản tự động lấy task
          release và task đang chạy của tuần này.
        </p>
        <div className="rpt-empty-acts">
          <button
            type="button"
            className="kml-btn kml-btn-filled"
            onClick={() => createFor(cw.start, cw.end)}
          >
            <IcPlus size={18} />
            Tạo plan tuần (tự động)
          </button>
        </div>
      </div>
    );
  } else {
    const list = (
      <div className="rpt-ls-col">
        <div className="rpt-ls-tools">
          <div className="pl-ls-searchrow">
            <div className="kml-field rpt-field-lead rpt-ls-search pl-ls-search">
              <span className="rpt-field-lead-ic">
                <IcSearch size={18} />
              </span>
              <input
                ref={searchRef}
                className="kml-input"
                value={q}
                placeholder="Tìm ngày (02/11) hoặc nội dung"
                aria-label="Tìm plan"
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setQ('');
                }}
              />
              {q && (
                <span className="rpt-field-trail">
                  <button
                    type="button"
                    className="kml-iconbtn"
                    aria-label="Xoá tìm kiếm"
                    onClick={() => setQ('')}
                  >
                    <IcClose size={18} />
                  </button>
                </span>
              )}
            </div>
            {wide && (
              <button
                type="button"
                className="kml-iconbtn"
                aria-label="Thu gọn danh sách plan"
                aria-expanded={true}
                title="Thu gọn danh sách"
                onClick={() => setListOpen(false)}
              >
                <IcPanelClose size={20} />
              </button>
            )}
          </div>
          {months.length > 1 && (
            <div className="rpt-ls-jump" role="group" aria-label="Nhảy tới tháng">
              {months.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`kml-chip${!searching && focusMonth === k ? ' is-sel' : ''}`}
                  aria-pressed={!searching && focusMonth === k}
                  onClick={() => jumpMonth(k)}
                >
                  {monthLabel(k)}
                </button>
              ))}
            </div>
          )}
          {searching && shown.length > 0 && <p className="rpt-ls-count">{shown.length} plan khớp</p>}
        </div>

        {searching && shown.length === 0 ? (
          <div className="kml-empty rpt-ls-empty">
            <span className="kml-empty-ic">
              <IcSearch size={28} />
            </span>
            <h2>
              {query.kind === 'date'
                ? `Không có plan chứa ngày ${q.trim()}`
                : `Không có plan khớp “${q.trim()}”`}
            </h2>
            {newest && oldest && (
              <p>
                Plan có từ tuần {formatDateVi(oldest.weekStart)} đến {formatDateVi(newest.weekEnd)}.
              </p>
            )}
            <button type="button" className="kml-btn kml-btn-tonal" onClick={() => setQ('')}>
              Xoá tìm kiếm
            </button>
          </div>
        ) : (
          groups.map(renderGroup)
        )}

        {!searching && newest && oldest && (
          <p className="rpt-ls-more">
            {plans.length} plan · {formatDayMonth(oldest.weekStart)} – {formatDateVi(newest.weekEnd)}
          </p>
        )}
      </div>
    );
    body = wide ? (
      <div className={`rpt-ls pl-ls${rail ? ' is-rail' : ''}`}>
        {rail ? railCard : list}
        {previewCard}
      </div>
    ) : (
      list
    );
  }

  return (
    <div className="container kml-page rpt-page rpt-lpage">
      <BoardNav />

      <div className="kml-topbar">
        <div className="kml-topbar-title">
          <h1>Plan tuần</h1>
          {newest && oldest && (
            <p>
              {plans.length} plan · {formatDateVi(oldest.weekStart)} – {formatDateVi(newest.weekEnd)}
            </p>
          )}
        </div>
        {!narrow && plans.length > 0 && (
          <div className="kml-topbar-actions">
            <div className="kml-menu-anchor">
              <button
                type="button"
                className="kml-btn kml-btn-filled"
                aria-haspopup="menu"
                aria-expanded={menu === 'create'}
                onClick={() => setMenu((m) => (m === 'create' ? null : 'create'))}
              >
                <IcPlus size={18} />
                Tạo plan tuần
                {menu === 'create' ? <IcChevronUp size={18} /> : <IcChevronDown size={18} />}
              </button>
              {menu === 'create' && (
                <ReportPopMenu
                  label="Tạo plan tuần"
                  className="rpt-create-menu"
                  onClose={() => setMenu(null)}
                >
                  {createMenu}
                </ReportPopMenu>
              )}
            </div>
          </div>
        )}
      </div>

      {body}

      {narrow && plans.length > 0 && (
        <button type="button" className="kml-fab" onClick={() => setSheet(true)}>
          <IcPlus size={22} />
          Tạo plan
        </button>
      )}

      {sheet && (
        <KpiDialog title="Tạo plan tuần" icon={<IcPlus size={20} />} sheet onClose={() => setSheet(false)}>
          <div className="rpt-cm-sheet" role="menu" aria-label="Tạo plan tuần">
            {createMenu}
          </div>
        </KpiDialog>
      )}

      {delTarget && (
        <KsumConfirmDialog
          tone="danger"
          icon={<IcTrash size={20} />}
          title={`Xoá plan tuần ${weekRange(delTarget)}?`}
          subtitle={`${delTarget.title || 'Plan tuần'} · ${planStats(delTarget, releaseKeys).projects} dự án · ${planStats(delTarget, releaseKeys).ws} nhánh`}
          confirmLabel="Xoá plan"
          confirmKind="danger"
          onConfirm={() => void doDelete(delTarget)}
          onCancel={() => setDelTarget(null)}
        >
          <p>
            Plan sẽ bị xoá hẳn và không hoàn tác được. Báo cáo ngày, Tổng quan và Lịch release sẽ
            không còn đọc plan này.
          </p>
        </KsumConfirmDialog>
      )}

      <EstSnackbar notice={notice} onClose={() => notify(null)} />
    </div>
  );
}
