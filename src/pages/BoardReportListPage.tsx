// Danh sách Báo cáo ngày (redesign Material 3, 01/11/2026).
// - ≥ 1200px: 2 cột — trái là danh sách nhóm theo tuần, phải xem trước báo cáo đang chọn.
// - < 1200px: 1 cột, bấm hàng mở editor ở tab Xem trước.
// - < 840px: card hôm nay nổi bật + FAB "Tạo báo cáo" mở bottom sheet.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePm } from '../context/PmContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import BoardNav from '../components/board/BoardNav';
import ReportPreview from '../components/board/ReportPreview';
import ReportPopMenu from '../components/board/ReportPopMenu';
import ReportCreateMenu from '../components/board/ReportCreateMenu';
import KpiDialog from '../components/board/KpiDialog';
import KsumConfirmDialog from '../components/board/KsumConfirmDialog';
import { EstSnackbar, useEstNotice } from '../components/board/EstSheetTable';
import {
  IcCalendar,
  IcChevronDown,
  IcChevronUp,
  IcClose,
  IcCopy,
  IcDownload,
  IcEdit,
  IcEye,
  IcInfo,
  IcMoreV,
  IcNote,
  IcPlus,
  IcSearch,
  IcTrash,
} from '../components/board/ksumIcons';
import { newReportTemplate } from '../pmTypes';
import {
  buildReportText,
  countReportProjects,
  formatDateVi,
  formatDayMonth,
  groupReportsByWeek,
  matchReport,
  parseReportQuery,
  reportProjectsFromPlan,
  weekdayLong,
  weekdayShort,
  type ReportWeek,
} from '../lib/reportFormat';
import { downloadTextFile } from '../lib/downloadHelpers';
import { addDays, isoLocal, mondayOf } from '../lib/pmDates';
import type { DailyReport } from '../pmTypes';

// Số chip "Nhảy tới tháng" (các tháng gần nhất có báo cáo); tháng cũ hơn dùng nút lịch.
const MONTH_CHIPS = 6;

export default function BoardReportListPage() {
  const { reports, plans, loading, addReport, deleteReport } = usePm();
  const navigate = useNavigate();
  const narrow = useMediaQuery('(max-width: 839px)');
  const wide = useMediaQuery('(min-width: 1200px)');
  const { notice, notify } = useEstNotice();

  const today = isoLocal(new Date());
  const thisMon = mondayOf(today);
  const lastMon = addDays(thisMon, -7);

  const [q, setQ] = useState('');
  // Báo cáo đang xem ở cột phải (≥ 1200px); null = mặc định hôm nay / mới nhất.
  const [selId, setSelId] = useState<string | null>(null);
  // Hàng vừa nhảy tới (< 1200px) — tô nền để dễ thấy.
  const [focusId, setFocusId] = useState<string | null>(null);
  // Tuần cũ người dùng tự mở / thu gọn (khoá = Thứ Hai).
  const [weekOpen, setWeekOpen] = useState<Record<string, boolean>>({});
  // Menu đang mở: 'create' | 'pv' | 'row:{id}'.
  const [menu, setMenu] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [delTarget, setDelTarget] = useState<DailyReport | null>(null);
  const [planDone, setPlanDone] = useState(false);
  const [jump, setJump] = useState<{ id: string; n: number } | null>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  const query = useMemo(() => parseReportQuery(q), [q]);
  const searching = query.kind !== 'none';
  const shown = useMemo(
    () => (searching ? reports.filter((r) => matchReport(r, query)) : reports),
    [reports, query, searching],
  );
  const weeks = useMemo(() => groupReportsByWeek(shown), [shown]);

  // `reports` đã sort mới nhất trước.
  const latest = reports[0];
  const oldest = reports[reports.length - 1];
  const todayReport = reports.find((r) => r.date === today);
  const currentPlan = plans.find((p) => p.weekStart <= today && today <= p.weekEnd);

  const selected =
    shown.find((r) => r.id === selId) ?? (searching ? shown[0] : (todayReport ?? latest));
  const focus = wide ? selected?.id : focusId;
  const focusMonth = reports.find((r) => r.id === focus)?.date.slice(0, 7);

  // Các tháng gần nhất có báo cáo, 'yyyy-mm'.
  const months = useMemo(() => {
    const out: string[] = [];
    for (const r of reports) {
      const k = r.date.slice(0, 7);
      if (!out.includes(k)) out.push(k);
      if (out.length >= MONTH_CHIPS) break;
    }
    return out;
  }, [reports]);
  const monthLabel = (k: string) => {
    const [y, m] = k.split('-');
    return y === today.slice(0, 4) ? `Tháng ${Number(m)}` : `Tháng ${Number(m)}/${y}`;
  };

  // Cuộn tới hàng vừa nhảy tới (sau khi tuần của nó đã mở ra).
  useEffect(() => {
    if (!jump) return;
    document
      .querySelector(`[data-rid="${jump.id}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [jump]);

  const reveal = (r: DailyReport) => {
    setWeekOpen((o) => ({ ...o, [mondayOf(r.date)]: true }));
    if (wide) setSelId(r.id);
    else setFocusId(r.id);
    setJump((j) => ({ id: r.id, n: (j?.n ?? 0) + 1 }));
  };
  const jumpMonth = (k: string) => {
    setQ('');
    const r = reports.find((x) => x.date.startsWith(k));
    if (r) reveal(r);
  };
  const openDatePicker = () => {
    const el = dateRef.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
    }
  };

  // ----- Tạo báo cáo (logic như bản cũ) -----
  const closeCreate = () => {
    setMenu(null);
    setSheet(false);
  };
  const openReport = (r: DailyReport | null) => {
    if (r) navigate(`/board/report/${r.id}`);
  };
  const onBlank = () => {
    closeCreate();
    openReport(addReport(newReportTemplate(today)));
  };
  // Chép khung dự án + nội dung của báo cáo gần nhất sang hôm nay để sửa nhanh.
  const onFromLatest = () => {
    closeCreate();
    if (!latest) return;
    openReport(
      addReport({
        title: latest.title,
        date: today,
        projects: latest.projects.map((p) => ({
          name: p.name,
          ...(p.appId ? { appId: p.appId } : {}),
          body: p.body,
        })),
      }),
    );
  };
  // Mỗi dự án của plan tuần 1 mục, body theo nhánh chưa xong (đúng marker bộ sync đọc).
  const onFromPlan = () => {
    closeCreate();
    if (!currentPlan) return;
    const projects = reportProjectsFromPlan(currentPlan);
    if (projects.length === 0) {
      setPlanDone(true);
      return;
    }
    openReport(addReport({ title: 'Report Mobile Team', date: today, projects }));
  };
  const onOpenToday = () => {
    closeCreate();
    if (todayReport) navigate(`/board/report/${todayReport.id}`);
  };
  const createMenu = (
    <ReportCreateMenu
      today={today}
      latest={latest}
      todayReport={todayReport}
      plan={currentPlan}
      onFromLatest={onFromLatest}
      onFromPlan={onFromPlan}
      onBlank={onBlank}
      onOpenToday={onOpenToday}
    />
  );

  // ----- Copy / Tải .txt / Xoá (bản đã lưu) -----
  const onCopy = async (r: DailyReport) => {
    setMenu(null);
    const text = buildReportText(r);
    try {
      await navigator.clipboard.writeText(text);
      notify({ text: `Đã copy báo cáo ${formatDateVi(r.date)} · ${countReportProjects(r)} dự án` });
    } catch {
      const fileName = `report_${r.date}.txt`;
      downloadTextFile(fileName, text, 'text/plain');
      notify({ text: `Trình duyệt chặn copy, đã tải file ${fileName}` });
    }
  };
  const onExport = (r: DailyReport) => {
    setMenu(null);
    const fileName = `report_${r.date}.txt`;
    downloadTextFile(fileName, buildReportText(r), 'text/plain');
    notify({ text: `Đã tải ${fileName}` });
  };
  const doDelete = async (r: DailyReport) => {
    setDelTarget(null);
    // Xoá báo cáo đang xem → chuyển sang báo cáo kế bên (cũ hơn, hết thì mới hơn).
    const wasSel = wide && selected?.id === r.id;
    if (wasSel) {
      const i = shown.findIndex((x) => x.id === r.id);
      setSelId((shown[i + 1] ?? shown[i - 1])?.id ?? null);
    }
    try {
      await deleteReport(r.id);
      notify({ text: `Đã xoá báo cáo ${formatDateVi(r.date)}` });
    } catch {
      if (wasSel) setSelId(r.id);
      notify({
        kind: 'error',
        persistent: true,
        text: `Không xoá được báo cáo ${formatDateVi(r.date)}. Kiểm tra mạng rồi thử lại.`,
        action: { label: 'Thử lại', onClick: () => void doDelete(r) },
      });
    }
  };
  const askDelete = (r: DailyReport) => {
    setMenu(null);
    setDelTarget(r);
  };

  // ----- Hàng / card -----
  const dateText = (iso: string) => (narrow ? formatDayMonth(iso) : formatDateVi(iso));
  const tile = (iso: string) => (
    <span className="rpt-dtile" aria-hidden="true">
      <b>{Number(iso.slice(8, 10))}</b>
      <span>{weekdayShort(iso)}</span>
    </span>
  );
  const subText = (r: DailyReport) =>
    `${countReportProjects(r)} dự án · ${r.title || 'Report Mobile Team'}`;

  const renderRow = (r: DailyReport) => {
    const key = `row:${r.id}`;
    const isToday = r.date === today;
    const sel = r.id === focus;
    return (
      <div
        key={r.id}
        role="listitem"
        data-rid={r.id}
        className={`rpt-rrow${isToday ? ' is-today' : ''}${sel ? ' is-sel' : ''}${
          menu === key ? ' is-menu' : ''
        }`}
      >
        <button
          type="button"
          className="rpt-rrow-main"
          aria-current={wide && sel ? 'true' : undefined}
          onClick={() =>
            wide ? setSelId(r.id) : navigate(`/board/report/${r.id}?tab=preview`)
          }
        >
          {tile(r.date)}
          <span className="rpt-rrow-txt">
            <span className="rpt-rrow-t">
              {weekdayLong(r.date)}, {dateText(r.date)}
            </span>
            <span className="rpt-rrow-s">
              {isToday && <b>Hôm nay · </b>}
              {subText(r)}
            </span>
          </span>
        </button>
        <div className="rpt-rrow-act">
          <button
            type="button"
            className="kml-iconbtn"
            aria-label={`Copy báo cáo ${formatDateVi(r.date)}`}
            onClick={() => void onCopy(r)}
          >
            <IcCopy size={18} />
          </button>
          <div className="kml-menu-anchor">
            <button
              type="button"
              className="kml-iconbtn"
              aria-label={`Thao tác khác với báo cáo ${formatDateVi(r.date)}`}
              aria-haspopup="menu"
              aria-expanded={menu === key}
              onClick={() => setMenu((m) => (m === key ? null : key))}
            >
              <IcMoreV size={18} />
            </button>
            {menu === key && (
              <ReportPopMenu
                label={`Thao tác với báo cáo ${formatDateVi(r.date)}`}
                onClose={() => setMenu(null)}
              >
                <button
                  type="button"
                  className="kml-menu-item"
                  role="menuitem"
                  onClick={() => navigate(`/board/report/${r.id}`)}
                >
                  <IcEdit size={18} />
                  <span>Sửa</span>
                </button>
                <button
                  type="button"
                  className="kml-menu-item"
                  role="menuitem"
                  onClick={() => onExport(r)}
                >
                  <IcDownload size={18} />
                  <span>Tải .txt</span>
                </button>
                <div className="kml-menu-sep" />
                <button
                  type="button"
                  className="kml-menu-item is-danger"
                  role="menuitem"
                  onClick={() => askDelete(r)}
                >
                  <IcTrash size={18} />
                  <span>Xoá báo cáo</span>
                </button>
              </ReportPopMenu>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Card hôm nay (màn hẹp): bấm cả card mở editor ở tab Xem trước.
  const renderHighlight = (r: DailyReport) => (
    <div className="rpt-hl" data-rid={r.id}>
      <Link
        className="rpt-hl-link"
        to={`/board/report/${r.id}?tab=preview`}
        aria-label={`Mở báo cáo hôm nay ${formatDateVi(r.date)} ở tab Xem trước`}
      >
        {tile(r.date)}
        <span className="rpt-rrow-txt">
          <span className="rpt-rrow-t">
            {weekdayLong(r.date)}, {formatDayMonth(r.date)}
            <span className="kml-tag is-today">Hôm nay</span>
          </span>
          <span className="rpt-rrow-s">{subText(r)}</span>
        </span>
      </Link>
      <div className="rpt-hl-pv" aria-hidden="true">
        <ReportPreview report={r} />
      </div>
      <div className="rpt-hl-act">
        <button type="button" className="kml-btn kml-btn-filled" onClick={() => void onCopy(r)}>
          <IcCopy size={18} />
          Copy
        </button>
        <Link className="kml-btn kml-btn-outlined" to={`/board/report/${r.id}?tab=preview`}>
          <IcEye size={18} />
          Mở
        </Link>
      </div>
    </div>
  );

  // Hàng giữ chỗ khi hôm nay (T2–T6) chưa có báo cáo.
  const showPlaceholder =
    !searching && !todayReport && [1, 2, 3, 4, 5].includes(new Date(today + 'T00:00:00').getDay());
  const renderPlaceholder = () => (
    <div className="rpt-rrow is-ph" role="listitem">
      <div className="rpt-rrow-main">
        {tile(today)}
        <span className="rpt-rrow-txt">
          <span className="rpt-rrow-t">
            {weekdayLong(today)}, {dateText(today)}
          </span>
          <span className="rpt-rrow-s">Chưa có báo cáo</span>
        </span>
      </div>
      <div className="rpt-rrow-act">
        <button
          type="button"
          className="kml-btn kml-btn-tonal"
          onClick={latest ? onFromLatest : onBlank}
        >
          {latest ? `Chép từ ${formatDayMonth(latest.date)}` : 'Tạo báo cáo'}
        </button>
      </div>
    </div>
  );

  const weekList: ReportWeek[] =
    showPlaceholder && weeks[0]?.start !== thisMon
      ? [{ start: thisMon, range: '', reports: [] }, ...weeks]
      : weeks;

  const renderWeek = (w: ReportWeek, idx: number) => {
    const label = w.start === thisMon ? 'Tuần này' : w.start === lastMon ? 'Tuần trước' : null;
    // Tuần này / tuần trước luôn mở; tuần cũ thu gọn, trừ khi là tuần mới nhất có báo cáo.
    const open = searching || label !== null || (weekOpen[w.start] ?? idx === 0);
    const hl = narrow && !searching && w.start === thisMon ? todayReport : undefined;
    const rows = w.reports.filter((r) => r !== hl);
    const ph = showPlaceholder && w.start === thisMon;
    return (
      <section key={w.start} className="rpt-wk">
        {label || searching ? (
          <div className="rpt-wk-h" role="heading" aria-level={2}>
            <b>{label ?? w.range}</b>
            {label ? (
              w.range && <span>· {w.range}</span>
            ) : (
              <span>· {w.reports.length} báo cáo</span>
            )}
          </div>
        ) : (
          <button
            type="button"
            className="rpt-wk-c"
            aria-expanded={open}
            onClick={() => setWeekOpen((o) => ({ ...o, [w.start]: !open }))}
          >
            <span className="rpt-wk-c-t">{w.range}</span>
            <span className="rpt-wk-c-n">{w.reports.length} báo cáo</span>
            {open ? <IcChevronUp size={18} /> : <IcChevronDown size={18} />}
          </button>
        )}
        {open && (
          <>
            {hl && renderHighlight(hl)}
            {(rows.length > 0 || ph) && (
              <div className="rpt-wk-rows" role="list">
                {ph && renderPlaceholder()}
                {rows.map(renderRow)}
              </div>
            )}
          </>
        )}
      </section>
    );
  };

  // ----- Khung xem trước (≥ 1200px) -----
  const previewCard = (
    <aside className="rpt-pvc" aria-label="Xem trước báo cáo">
      {selected ? (
        <>
          <div className="rpt-pvc-head">
            <div className="rpt-pvc-title">
              <h2>
                {weekdayLong(selected.date)}, {formatDateVi(selected.date)}
                {selected.date === today && <span className="kml-tag is-today">Hôm nay</span>}
              </h2>
              <p>
                {selected.title || 'Report Mobile Team'} · {countReportProjects(selected)} dự án
              </p>
            </div>
            <button
              type="button"
              className="kml-btn kml-btn-filled"
              onClick={() => void onCopy(selected)}
            >
              <IcCopy size={18} />
              Copy
            </button>
            <Link className="kml-btn kml-btn-outlined" to={`/board/report/${selected.id}`}>
              <IcEdit size={18} />
              Sửa
            </Link>
            <div className="kml-menu-anchor">
              <button
                type="button"
                className="kml-iconbtn"
                aria-label="Thao tác khác"
                aria-haspopup="menu"
                aria-expanded={menu === 'pv'}
                onClick={() => setMenu((m) => (m === 'pv' ? null : 'pv'))}
              >
                <IcMoreV size={18} />
              </button>
              {menu === 'pv' && (
                <ReportPopMenu label="Thao tác khác" onClose={() => setMenu(null)}>
                  <button
                    type="button"
                    className="kml-menu-item"
                    role="menuitem"
                    onClick={() => onExport(selected)}
                  >
                    <IcDownload size={18} />
                    <span>Tải .txt</span>
                  </button>
                  <div className="kml-menu-sep" />
                  <button
                    type="button"
                    className="kml-menu-item is-danger"
                    role="menuitem"
                    onClick={() => askDelete(selected)}
                  >
                    <IcTrash size={18} />
                    <span>Xoá báo cáo</span>
                  </button>
                </ReportPopMenu>
              )}
            </div>
          </div>
          <div className="rpt-pvc-body">
            <ReportPreview report={selected} />
          </div>
        </>
      ) : (
        <div className="kml-empty">
          <p>Không có báo cáo để xem trước.</p>
        </div>
      )}
    </aside>
  );

  // ----- Trang -----
  let body;
  if (loading && reports.length === 0) {
    body = (
      <div className="kml-empty">
        <p>Đang tải báo cáo…</p>
      </div>
    );
  } else if (reports.length === 0) {
    body = (
      <div className="kml-empty">
        <span className="kml-empty-ic">
          <IcNote size={28} />
        </span>
        <h2>Chưa có báo cáo nào</h2>
        <p>Báo cáo ngày dùng để copy gửi team và để sync tiến độ cho Plan tuần.</p>
        <div className="rpt-empty-acts">
          <button type="button" className="kml-btn kml-btn-filled" onClick={onBlank}>
            <IcPlus size={18} />
            Báo cáo hôm nay
          </button>
          {currentPlan && (
            <button type="button" className="kml-btn kml-btn-tonal" onClick={onFromPlan}>
              <IcCalendar size={18} />
              Từ plan tuần
            </button>
          )}
        </div>
      </div>
    );
  } else {
    const list = (
      <div className="rpt-ls-col">
        <div className="rpt-ls-tools">
          <div className="kml-field rpt-field-lead rpt-ls-search">
            <span className="rpt-field-lead-ic">
              <IcSearch size={18} />
            </span>
            <input
              className="kml-input"
              value={q}
              placeholder="Tìm ngày (28/10) hoặc nội dung"
              aria-label="Tìm báo cáo"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setQ('');
              }}
            />
            <span className="rpt-field-trail">
              {q && (
                <button
                  type="button"
                  className="kml-iconbtn"
                  aria-label="Xoá tìm kiếm"
                  onClick={() => setQ('')}
                >
                  <IcClose size={18} />
                </button>
              )}
              <button
                type="button"
                className="kml-iconbtn"
                aria-label="Chọn ngày để nhảy tới"
                onClick={openDatePicker}
              >
                <IcCalendar size={18} />
              </button>
            </span>
            {/* Ô date gốc ẩn: chọn ngày → điền "dd/mm/yyyy" vào ô tìm */}
            <input
              ref={dateRef}
              type="date"
              className="rpt-date-native"
              tabIndex={-1}
              aria-hidden="true"
              min={oldest?.date}
              max={latest && latest.date > today ? latest.date : today}
              onChange={(e) => {
                if (e.target.value) setQ(formatDateVi(e.target.value));
              }}
            />
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
          {searching && shown.length > 0 && (
            <p className="rpt-ls-count">{shown.length} báo cáo khớp</p>
          )}
        </div>

        {searching && shown.length === 0 ? (
          <div className="kml-empty rpt-ls-empty">
            <span className="kml-empty-ic">
              <IcSearch size={28} />
            </span>
            <h2>
              {query.kind === 'date'
                ? `Không có báo cáo ngày ${q.trim()}`
                : `Không có báo cáo khớp “${q.trim()}”`}
            </h2>
            <p>
              Báo cáo có từ {formatDateVi(oldest.date)} đến {formatDateVi(latest.date)}.
            </p>
            <button type="button" className="kml-btn kml-btn-tonal" onClick={() => setQ('')}>
              Xoá tìm kiếm
            </button>
          </div>
        ) : (
          weekList.map(renderWeek)
        )}

        {!searching && <p className="rpt-ls-more">Cũ nhất: {formatDateVi(oldest.date)}</p>}
      </div>
    );
    body = wide ? (
      <div className="rpt-ls">
        {list}
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
          <h1>Báo cáo ngày</h1>
          {latest && (
            <p>
              {reports.length} báo cáo · {formatDateVi(oldest.date)} – {formatDateVi(latest.date)}
            </p>
          )}
        </div>
        {!narrow && reports.length > 0 && (
          <div className="kml-topbar-actions">
            <div className="kml-menu-anchor">
              <button
                type="button"
                className="kml-btn kml-btn-tonal"
                aria-haspopup="menu"
                aria-expanded={menu === 'create'}
                onClick={() => setMenu((m) => (m === 'create' ? null : 'create'))}
              >
                <IcPlus size={18} />
                Tạo báo cáo
                {menu === 'create' ? <IcChevronUp size={18} /> : <IcChevronDown size={18} />}
              </button>
              {menu === 'create' && (
                <ReportPopMenu
                  label="Tạo báo cáo"
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

      {narrow && reports.length > 0 && (
        <button type="button" className="kml-fab" onClick={() => setSheet(true)}>
          <IcPlus size={22} />
          Tạo báo cáo
        </button>
      )}

      {sheet && (
        <KpiDialog title="Tạo báo cáo" icon={<IcPlus size={20} />} sheet onClose={() => setSheet(false)}>
          <div className="rpt-cm-sheet" role="menu" aria-label="Tạo báo cáo">
            {createMenu}
          </div>
        </KpiDialog>
      )}

      {delTarget && (
        <KsumConfirmDialog
          tone="danger"
          icon={<IcTrash size={20} />}
          title={`Xoá báo cáo ${formatDateVi(delTarget.date)}?`}
          subtitle={`${delTarget.title || 'Report Mobile Team'} · ${countReportProjects(delTarget)} dự án`}
          confirmLabel="Xoá báo cáo"
          confirmKind="danger"
          onConfirm={() => void doDelete(delTarget)}
          onCancel={() => setDelTarget(null)}
        >
          <p>
            Báo cáo sẽ bị xoá hẳn và không hoàn tác được. Sync Plan tuần sẽ không còn đọc báo cáo
            này.
          </p>
        </KsumConfirmDialog>
      )}

      {planDone && currentPlan && (
        <KpiDialog
          title="Plan tuần đã xong hết"
          subtitle={`Tuần ${formatDayMonth(currentPlan.weekStart)} – ${formatDayMonth(currentPlan.weekEnd)}`}
          icon={<IcInfo size={20} />}
          onClose={() => setPlanDone(false)}
          actions={
            <button
              type="button"
              className="kml-btn kml-btn-filled"
              onClick={() => setPlanDone(false)}
            >
              Đã hiểu
            </button>
          }
        >
          <p>Mọi nhánh trong plan tuần này đã xong, không còn gì để tạo báo cáo.</p>
        </KpiDialog>
      )}

      <EstSnackbar notice={notice} onClose={() => notify(null)} />
    </div>
  );
}
