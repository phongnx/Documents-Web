// Trang tổng kết KPI tháng (leader, /board/kpi/summary/:monthKey): lần đầu mở tự
// tổng hợp từ log tất cả member thành bảng như file Excel mẫu; các lần sau load bản
// đã lưu (bản CHỐT — log đổi không tự cập nhật, muốn mới bấm "Tổng hợp lại từ log").
// Sửa tại chỗ + Lưu; Share copy link chỉ xem /share/kpisum/{id} (chỉ gửi leader/quản lý).
// Mọi xác nhận dùng dialog trong app (KsumConfirmDialog), không dùng window.confirm.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, ref } from 'firebase/database';
import { v4 as uuidv4 } from 'uuid';
import { usePm } from '../context/PmContext';
import BoardNav from '../components/board/BoardNav';
import KpiSummaryTable, {
  useKsumOpen,
  usePagebarHeight,
} from '../components/board/KpiSummaryTable';
import KpiSummaryAddMemberDialog from '../components/board/KpiSummaryAddMemberDialog';
import KsumConfirmDialog from '../components/board/KsumConfirmDialog';
import KsumMergeDialog from '../components/board/KsumMergeDialog';
import KsumOverview from '../components/board/KsumOverview';
import {
  IcArrowLeft,
  IcArrowRight,
  IcCheck,
  IcInfo,
  IcLink,
  IcMerge,
  IcRefresh,
  IcSave,
  IcTrash,
  IcUserPlus,
  IcWarn,
} from '../components/board/ksumIcons';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';
import { db } from '../lib/firebase';
import {
  fmtDateTime,
  normalizeSummaryRead,
  optimizePreviewByMember,
  optimizeSummaryRows,
} from '../lib/kpiSummary';
import {
  kpiScoreClass,
  KPI_MONTH_BASE,
  type KpiMember,
  type KpiSummary,
  type KpiSummaryMember,
  type KpiSummaryMeta,
  type KpiSummaryRow,
} from '../kpiTypes';

type Confirm =
  | { kind: 'rebuildAll'; manual: KpiSummaryMember[] }
  | {
      kind: 'rebuildOne';
      memberId: string;
      name: string;
      curRows: number;
      curScore: number;
      next: KpiSummaryMember;
      empty: boolean;
    }
  | {
      kind: 'optimizeAll';
      preview: ReturnType<typeof optimizePreviewByMember>;
    }
  | { kind: 'optimizeOne'; memberId: string; name: string; before: number; after: number }
  | { kind: 'deleteMember'; memberId: string; name: string };

export default function BoardKpiSummaryPage() {
  const { monthKey = '' } = useParams();
  const { meta, members, ensureKpiSummary, saveKpiSummary, rebuildKpiSummaryMembers } =
    usePm();
  const [adding, setAdding] = useState(false);
  // memberId khối đang tổng hợp riêng (chặn bấm 2 lần trong lúc chờ đọc log).
  const [busyMember, setBusyMember] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  // Gộp tay: các mục đang chọn (chỉ trong 1 member) + dialog gộp đang mở.
  const [rawSel, setRawSel] = useState<{ memberId: string; rowIds: string[] } | null>(null);
  const [merging, setMerging] = useState(false);
  const [ackOverwrite, setAckOverwrite] = useState(false);

  // Khối có thuộc 1 KPI member còn tồn tại không — khối nhập tay (VD dữ liệu chuyển từ
  // Excel) hoặc member đã bị xóa thì không có log để tổng hợp.
  const isKpiMember = (m: KpiSummaryMember) => members.some((x) => x.id === m.memberId);

  const [id, setId] = useState<string | null>(null);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  useUnsavedGuard(dirty);
  const { rootRef, barRef } = usePagebarHeight<HTMLDivElement>();

  const say = (text: string, error = false) => setNotice({ text, error });
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const validMonth = /^\d{4}-\d{2}$/.test(monthKey);

  useEffect(() => {
    if (!validMonth) {
      setState('error');
      return;
    }
    let active = true;
    setState('loading');
    setSummary(null);
    setId(null);
    setDirty(false);
    (async () => {
      try {
        const sid = await ensureKpiSummary(monthKey);
        if (!sid || !db) {
          if (active) setState('error');
          return;
        }
        const snap = await get(ref(db, `shared/kpisum/${sid}`));
        const val = snap.val() as {
          meta: KpiSummaryMeta;
          members?: KpiSummaryMember[];
        } | null;
        if (!active) return;
        if (!val?.meta) {
          setState('error');
          return;
        }
        setId(sid);
        setSummary(normalizeSummaryRead(val));
        setState('ready');
      } catch {
        if (active) setState('error');
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey, validMonth]);

  // Lựa chọn hiệu lực: bỏ id không còn trong bảng (sau tổng hợp lại / tối ưu / xóa dòng /
  // bỏ member) — rỗng thì coi như không chọn.
  const selection = (() => {
    if (!rawSel || !summary) return null;
    const m = summary.members.find((x) => x.memberId === rawSel.memberId);
    const ids = rawSel.rowIds.filter((id) => m?.rows.some((r) => r.id === id));
    return ids.length > 0 ? { memberId: rawSel.memberId, rowIds: ids } : null;
  })();

  const onToggleSelect = (memberId: string, rowId: string) => {
    if (selection && selection.memberId !== memberId) return; // chỉ gộp trong 1 member
    const base = selection?.rowIds ?? [];
    const ids = base.includes(rowId) ? base.filter((x) => x !== rowId) : [...base, rowId];
    setRawSel(ids.length > 0 ? { memberId, rowIds: ids } : null);
  };

  // Lưu trong dialog gộp: mục kết quả thay các mục đã chọn, đứng ở vị trí mục đầu tiên
  // được chọn (theo thứ tự bảng). Chỉ đổi trên form — bấm Lưu ở thanh trang mới ghi.
  const onSaveMerged = (merged: KpiSummaryRow) => {
    if (!selection) return;
    const ids = new Set(selection.rowIds);
    setSummary((s) =>
      s
        ? {
            ...s,
            members: s.members.map((m) => {
              if (m.memberId !== selection.memberId) return m;
              const at = m.rows.findIndex((r) => ids.has(r.id));
              const rows: KpiSummaryRow[] = [];
              m.rows.forEach((r, i) => {
                if (i === at) rows.push(merged);
                else if (!ids.has(r.id)) rows.push(r);
              });
              return { ...m, rows: rows.map((r, i) => ({ ...r, order: i })) };
            }),
          }
        : s,
    );
    setDirty(true);
    setMerging(false);
    setRawSel(null);
    say(`Đã gộp ${ids.size} mục thành 1 — bấm Lưu để chốt.`);
  };

  // Leader mặc định MỞ hết các khối (cần sửa nên thấy hết).
  const open = useKsumOpen(summary?.members.map((m) => m.memberId) ?? [], true);

  const onEdit = (next: KpiSummary) => {
    setSummary(next);
    setDirty(true);
  };

  const onSave = async () => {
    if (!id || !summary) return;
    setSaving(true);
    const ok = await saveKpiSummary(id, summary);
    setSaving(false);
    if (ok) {
      setDirty(false);
      // Cập nhật mốc lưu tại chỗ để "Đã lưu lúc …" đúng ngay (DB đã ghi updatedAt = now).
      setSummary((s) => (s ? { ...s, meta: { ...s.meta, updatedAt: new Date().toISOString() } } : s));
      say('✓ Đã lưu bảng tổng kết.');
    } else {
      say('Không lưu được — thử lại (kiểm tra mạng/quyền).', true);
    }
  };

  // ----- Tổng hợp lại toàn bảng: hỏi trước, đọc log sau khi đồng ý -----
  const askRebuildAll = () => {
    if (!summary || rebuilding || busyMember) return;
    setAckOverwrite(false);
    setConfirm({ kind: 'rebuildAll', manual: summary.members.filter((m) => !isKpiMember(m)) });
  };

  // Thay khối của mọi KPI member (giữ Nghỉ lễ chung) — khối THÊM TAY (không thuộc KPI
  // member nào) giữ nguyên, nối cuối bảng, vì chúng không có log để dựng lại.
  const doRebuildAll = async (manual: KpiSummaryMember[]) => {
    if (!summary) return;
    setConfirm(null);
    setRebuilding(true);
    const rebuilt = await rebuildKpiSummaryMembers(monthKey);
    setRebuilding(false);
    setSummary((s) => (s ? { ...s, members: [...rebuilt, ...manual] } : s));
    setDirty(true);
    say('Đã tổng hợp lại từ log — kiểm tra rồi bấm Lưu để chốt.');
  };

  // Khối trống KPI 100 — cho member không có log trong tháng / khối nhập tay.
  const emptyBlock = (memberId: string, name: string, withRow: boolean): KpiSummaryMember => ({
    memberId,
    name,
    kpiScore: KPI_MONTH_BASE,
    order: 0,
    rows: withRow ? [{ id: uuidv4(), order: 0 }] : [],
  });

  // Đọc log tháng của 1 KPI member → khối tổng hợp (null = tháng này không có log/nghỉ).
  const buildOne = async (m: KpiMember): Promise<KpiSummaryMember | null> => {
    const res = await rebuildKpiSummaryMembers(monthKey, [m.id]);
    return res[0] ?? null;
  };

  // 🔄 Riêng 1 khối: đọc log TRƯỚC rồi mới hỏi, để dialog nói đúng kết quả sẽ thay.
  const onRebuildMember = async (mi: number) => {
    if (!summary || busyMember || rebuilding) return;
    const cur = summary.members[mi];
    const kpiMember = members.find((x) => x.id === cur.memberId);
    if (!kpiMember) return;
    setBusyMember(cur.memberId);
    let block: KpiSummaryMember | null;
    try {
      block = await buildOne(kpiMember);
    } finally {
      setBusyMember(null);
    }
    setConfirm({
      kind: 'rebuildOne',
      memberId: cur.memberId,
      name: cur.name,
      curRows: (cur.rows ?? []).length,
      curScore: cur.kpiScore,
      next: block ?? emptyBlock(cur.memberId, kpiMember.name, false),
      empty: !block,
    });
  };

  // Thay theo memberId (không theo vị trí): trong lúc chờ, bảng có thể đã đổi thứ tự.
  const doRebuildOne = (c: Extract<Confirm, { kind: 'rebuildOne' }>) => {
    setConfirm(null);
    setSummary((s) =>
      s
        ? {
            ...s,
            members: s.members.map((m) =>
              m.memberId === c.memberId ? { ...c.next, order: m.order } : m,
            ),
          }
        : s,
    );
    setDirty(true);
    say(`Đã tổng hợp lại khối "${c.name}" — kiểm tra rồi bấm Lưu để chốt.`);
  };

  // 🧹 Riêng 1 khối — cùng luật với nút tối ưu toàn bảng.
  const onOptimizeMember = (mi: number) => {
    if (!summary) return;
    const cur = summary.members[mi];
    const before = (cur.rows ?? []).length;
    const after = optimizeSummaryRows(cur.rows ?? []).length;
    if (after === before) {
      say(`Khối "${cur.name}" không có dòng nào gộp được (khác App / Giai đoạn / Mốc).`);
      return;
    }
    setConfirm({ kind: 'optimizeOne', memberId: cur.memberId, name: cur.name, before, after });
  };

  const doOptimizeOne = (c: Extract<Confirm, { kind: 'optimizeOne' }>) => {
    setConfirm(null);
    setSummary((s) =>
      s
        ? {
            ...s,
            members: s.members.map((m) =>
              m.memberId === c.memberId ? { ...m, rows: optimizeSummaryRows(m.rows ?? []) } : m,
            ),
          }
        : s,
    );
    setDirty(true);
    say(`Đã gộp "${c.name}": ${c.before} → ${c.after} dòng — bấm Lưu để chốt.`);
  };

  // Tối ưu bảng HIỆN TẠI (không đọc lại log): gộp các dòng cùng App+Giai đoạn+Mốc —
  // dùng sau khi leader điền bổ sung mốc release cho các dòng tổng hợp còn thiếu.
  const onOptimize = () => {
    if (!summary) return;
    const preview = optimizePreviewByMember(summary.members);
    if (preview.after === preview.before) {
      say('Không có dòng nào gộp được (khác App / Giai đoạn / Mốc).');
      return;
    }
    setConfirm({ kind: 'optimizeAll', preview });
  };

  const doOptimizeAll = (c: Extract<Confirm, { kind: 'optimizeAll' }>) => {
    setConfirm(null);
    setSummary((s) => (s ? { ...s, members: c.preview.members } : s));
    setDirty(true);
    say(`Đã gộp ${c.preview.before} → ${c.preview.after} dòng — kiểm tra rồi bấm Lưu để chốt.`);
  };

  const onDeleteMember = (mi: number) => {
    if (!summary) return;
    const m = summary.members[mi];
    setConfirm({ kind: 'deleteMember', memberId: m.memberId, name: m.name });
  };

  const doDeleteMember = (c: Extract<Confirm, { kind: 'deleteMember' }>) => {
    setConfirm(null);
    setSummary((s) =>
      s ? { ...s, members: s.members.filter((m) => m.memberId !== c.memberId) } : s,
    );
    setDirty(true);
  };

  // ＋ Thêm member có sẵn: tổng hợp luôn từ log, nối cuối bảng.
  const onPickExisting = async (m: KpiMember) => {
    if (!summary) return;
    setBusyMember(m.id);
    let block: KpiSummaryMember | null;
    try {
      block = await buildOne(m);
    } finally {
      setBusyMember(null);
    }
    const next = block ?? emptyBlock(m.id, m.name, false);
    // Mở dialog thêm lần nữa trong lúc đang đọc log → có thể chọn trùng; chặn ở đây.
    setSummary((s) =>
      s && !s.members.some((x) => x.memberId === m.id)
        ? { ...s, members: [...s.members, next] }
        : s,
    );
    setDirty(true);
    say(
      block
        ? `Đã thêm "${m.name}" (${block.rows.length} đầu mục từ log) — bấm Lưu để chốt.`
        : `Đã thêm "${m.name}" — tháng này không có log nên khối trống, KPI ${KPI_MONTH_BASE}.`,
    );
  };

  // ＋ Nhập tay: memberId riêng (không trùng KPI member nào) → khối được giữ khi tổng hợp lại.
  const onAddManual = (name: string) => {
    if (!summary) return;
    setSummary({
      ...summary,
      members: [...summary.members, emptyBlock(`manual-${uuidv4()}`, name, true)],
    });
    setDirty(true);
    say(`Đã thêm khối "${name}" — điền các dòng rồi bấm Lưu để chốt.`);
  };

  const shareUrl = id ? `${window.location.origin}/share/kpisum/${id}` : '';
  const onShare = async () => {
    if (!id) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
      say(dirty ? 'Link đã copy — nhớ Lưu để người xem thấy bản mới nhất.' : 'Đã copy link share.');
    } catch {
      window.prompt('Copy link thủ công:', shareUrl);
    }
  };

  const monthLabel = validMonth ? `${monthKey.slice(5, 7)}/${monthKey.slice(0, 4)}` : monthKey;
  const blocked = rebuilding || !!busyMember;

  return (
    <div className="container ksum-page">
      <BoardNav />

      <div className="kp k-mode-leader" ref={rootRef}>
        <div className="k-pagebar" ref={barRef}>
          <Link to="/board/kpi" className="k-btn k-btn-sm">
            <IcArrowLeft />
            KPI member
          </Link>
          <div className="k-titlebox">
            <h1 className="k-title">Tổng kết KPI tháng {monthLabel}</h1>
            {summary && (
              <p className="k-title-sub">
                Bản chốt · tạo {fmtDateTime(summary.meta.createdAt)} · log thay đổi sau thời điểm
                này không tự cập nhật vào bảng
              </p>
            )}
          </div>
          {state === 'ready' && summary && (
            <div className="k-toolbar">
              <button
                type="button"
                className="k-btn k-btn-danger k-tb-wide"
                onClick={askRebuildAll}
                disabled={blocked}
                title="Dựng lại mọi khối từ log — ĐÈ phần đã sửa tay"
              >
                <IcRefresh />
                {rebuilding ? 'Đang tổng hợp…' : 'Tổng hợp lại từ log'}
              </button>
              <span className="k-tb-sep k-tb-wide" aria-hidden="true" />
              <button
                type="button"
                className="k-btn k-tb-wide"
                onClick={() => setAdding(true)}
                disabled={blocked}
                title="Thêm khối member: chọn KPI member có sẵn hoặc nhập tay"
              >
                <IcUserPlus />
                {busyMember && !summary.members.some((m) => m.memberId === busyMember)
                  ? 'Đang đọc log…'
                  : 'Thêm member'}
              </button>
              <button
                type="button"
                className="k-btn k-tb-wide"
                onClick={onOptimize}
                disabled={blocked}
                title="Gộp các dòng cùng App + Giai đoạn + Mốc release (dùng sau khi điền bổ sung mốc)"
              >
                <IcMerge />
                Tối ưu bảng
              </button>
              <button type="button" className="k-btn" onClick={onShare} title={shareUrl}>
                <IcLink />
                {copied ? 'Đã copy' : 'Share (chỉ xem)'}
              </button>
              <div className="k-save">
                {dirty ? (
                  <>
                    <span className="k-save-status is-dirty" role="status">
                      <span className="k-dot" />
                      Có thay đổi chưa lưu
                    </span>
                    <button
                      type="button"
                      className="k-btn k-btn-primary"
                      onClick={onSave}
                      disabled={saving}
                    >
                      <IcSave />
                      {saving ? 'Đang lưu…' : 'Lưu'}
                    </button>
                  </>
                ) : (
                  <>
                    <span className="k-save-status is-saved" role="status">
                      Đã lưu lúc {fmtDateTime(summary.meta.updatedAt)}
                    </span>
                    <button type="button" className="k-btn k-btn-primary" disabled>
                      <IcCheck />
                      Đã lưu
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <main className="k-main">
          {state === 'loading' && (
            <div className="k-card k-state">
              <p className="k-muted">Đang tổng hợp dữ liệu tháng…</p>
            </div>
          )}
          {state === 'error' && (
            <div className="k-card k-state is-error">
              <p className="k-state-title">Không mở được bảng tổng kết.</p>
              <p className="k-muted k-small">Tháng sai định dạng hoặc lỗi đọc dữ liệu.</p>
              <Link to="/board/kpi" className="k-btn k-btn-sm">
                Về KPI member
              </Link>
            </div>
          )}

          {state === 'ready' && summary && (
            <>
              <div className="k-monthinfo">
                <label className="k-field-inline">
                  <span>Nghỉ lễ chung của tháng (áp cho mọi member)</span>
                  <input
                    className="k-in k-holiday-in"
                    value={summary.meta.commonHolidays ?? ''}
                    onChange={(e) =>
                      onEdit({
                        ...summary,
                        meta: { ...summary.meta, commonHolidays: e.target.value },
                      })
                    }
                    placeholder="VD: 02/09 Quốc khánh (1d)"
                  />
                </label>
              </div>
              <p className="k-mobile-hint">
                <IcInfo />
                <span>
                  Trên điện thoại chỉ sửa được KPI tháng và Ngày nghỉ. Sửa đầu mục, tổng hợp, tối
                  ưu, thêm member: dùng máy tính.
                </span>
              </p>

              {summary.members.length > 0 ? (
                <>
                  <KsumOverview
                    members={summary.members}
                    mode="leader"
                    anyOpen={open.anyOpen}
                    onToggleAll={open.toggleAll}
                    onGoTo={open.goTo}
                  />
                  <KpiSummaryTable
                    summary={summary}
                    categories={meta.kpiRules.map((g) => g.label)}
                    onChange={onEdit}
                    isOpen={open.isOpen}
                    onToggle={open.toggle}
                    onRebuildMember={onRebuildMember}
                    canRebuildMember={isKpiMember}
                    onOptimizeMember={onOptimizeMember}
                    onDeleteMember={onDeleteMember}
                    busyMemberId={busyMember}
                    selection={selection}
                    onToggleSelect={onToggleSelect}
                    onMergeSelected={() => setMerging(true)}
                    onClearSelection={() => setRawSel(null)}
                  />
                </>
              ) : (
                <div className="k-card k-state">
                  <p>Không có member nào có log trong tháng này.</p>
                  <button
                    type="button"
                    className="k-btn k-btn-sm"
                    onClick={() => setAdding(true)}
                    disabled={blocked}
                  >
                    Thêm member
                  </button>
                </div>
              )}

              <div className="k-foot">
                <p>
                  Bảng là bản CHỐT: lần đầu mở tháng app tự tổng hợp từ log; sau đó log thay đổi
                  không tự cập nhật. Dùng “Tổng hợp lại từ log” hoặc nút tổng hợp lại của từng
                  khối khi cần.
                </p>
                <p>
                  Link share chỉ xem, không cần đăng nhập; người xem thấy bản mới nhất ngay khi
                  bấm Lưu.
                </p>
              </div>
            </>
          )}
        </main>

        {notice && (
          <div
            className={`k-toast${notice.error ? ' is-error' : ''}`}
            role={notice.error ? 'alert' : 'status'}
            aria-live="polite"
          >
            {notice.text}
          </div>
        )}

        {adding && summary && (
          <KpiSummaryAddMemberDialog
            monthLabel={monthLabel}
            available={members.filter((m) => !summary.members.some((x) => x.memberId === m.id))}
            existingNames={summary.members.map((m) => m.name)}
            onPickExisting={onPickExisting}
            onAddManual={onAddManual}
            onClose={() => setAdding(false)}
          />
        )}

        {confirm?.kind === 'rebuildAll' && summary && (
          <KsumConfirmDialog
            tone="danger"
            icon={<IcWarn size={18} />}
            title="Tổng hợp lại toàn bảng từ log?"
            subtitle="Thao tác này đè lên phần đã sửa tay."
            confirmLabel="Tổng hợp lại và đè"
            confirmKind="danger-solid"
            confirmDisabled={!ackOverwrite}
            onConfirm={() => doRebuildAll(confirm.manual)}
            onCancel={() => setConfirm(null)}
          >
            <div className="k-callout is-danger">
              <IcRefresh />
              <span>
                <b>Bị thay thế:</b> mọi dòng, KPI tháng và Ngày nghỉ của{' '}
                <b>{summary.members.length - confirm.manual.length} khối KPI member</b>, dựng lại từ
                log hiện tại.
              </span>
            </div>
            <div className="k-keep">
              <b>Được giữ nguyên</b>
              <ul className="k-list">
                <li>Ô Nghỉ lễ chung</li>
                {confirm.manual.length > 0 && (
                  <li>
                    {confirm.manual.length} khối thêm tay:{' '}
                    {confirm.manual.map((m) => m.name).join(', ')}
                  </li>
                )}
              </ul>
            </div>
            {dirty && (
              <div className="k-callout is-warn">
                <IcInfo />
                <span>
                  Bạn đang có thay đổi chưa lưu; chúng cũng bị thay thế. Chưa ghi gì cho tới khi
                  bấm Lưu.
                </span>
              </div>
            )}
            <label className="k-check">
              <input
                type="checkbox"
                checked={ackOverwrite}
                onChange={(e) => setAckOverwrite(e.target.checked)}
              />
              <span>
                Tôi hiểu phần sửa tay của {summary.members.length - confirm.manual.length} khối sẽ
                bị đè.
              </span>
            </label>
          </KsumConfirmDialog>
        )}

        {confirm?.kind === 'rebuildOne' && (
          <KsumConfirmDialog
            tone="warn"
            icon={<IcRefresh size={18} />}
            title={`Tổng hợp lại khối “${confirm.name}” từ log?`}
            subtitle={`Đã đọc log tháng ${monthLabel}. Các khối khác không đổi.`}
            confirmLabel="Thay khối"
            confirmKind="danger"
            onConfirm={() => doRebuildOne(confirm)}
            onCancel={() => setConfirm(null)}
          >
            <div className="k-cmp">
              <div className="k-cmp-box">
                <small>HIỆN TẠI</small>
                <b>{confirm.curRows} đầu mục</b>
                <span className="k-small">
                  KPI tháng{' '}
                  <span className={`k-score ${kpiScoreClass(confirm.curScore)}`}>
                    {confirm.curScore}
                  </span>
                </span>
              </div>
              <span className="k-cmp-arrow">
                <IcArrowRight />
              </span>
              <div className="k-cmp-box is-next">
                <small>TỪ LOG</small>
                <b>{confirm.next.rows.length} đầu mục</b>
                <span className="k-small">
                  KPI tháng{' '}
                  <span className={`k-score ${kpiScoreClass(confirm.next.kpiScore)}`}>
                    {confirm.next.kpiScore}
                  </span>
                </span>
              </div>
            </div>
            <div className="k-callout is-warn">
              <IcWarn />
              <span>
                {confirm.empty
                  ? `“${confirm.name}” không có log hay nghỉ phép nào trong tháng — khối sẽ về rỗng, KPI ${KPI_MONTH_BASE}.`
                  : 'Thay các dòng, KPI tháng và Ngày nghỉ đã sửa tay của khối này.'}
              </span>
            </div>
          </KsumConfirmDialog>
        )}

        {confirm?.kind === 'optimizeAll' && (
          <KsumConfirmDialog
            tone="info"
            icon={<IcMerge size={18} />}
            title="Tối ưu bảng?"
            subtitle="Gộp các dòng cùng App + Giai đoạn + Mốc trong từng khối; nối Tasks, Tiến độ/Kết quả và Lý do ±."
            confirmLabel={`Gộp còn ${confirm.preview.after} dòng`}
            onConfirm={() => doOptimizeAll(confirm)}
            onCancel={() => setConfirm(null)}
          >
            <div className="k-bigrow">
              <span className="k-big">{confirm.preview.before} dòng</span>
              <IcArrowRight />
              <span className="k-big k-c-primary">{confirm.preview.after} dòng</span>
            </div>
            <table className="k-mtable">
              <thead>
                <tr>
                  <th>Khối được gộp</th>
                  <th>Dòng</th>
                </tr>
              </thead>
              <tbody>
                {confirm.preview.changed.map((x) => (
                  <tr key={x.memberId}>
                    <td>{x.name}</td>
                    <td>
                      {x.before} → {x.after}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="k-muted k-small">
              {summary && summary.members.length - confirm.preview.changed.length > 0
                ? `${summary.members.length - confirm.preview.changed.length} khối còn lại không có dòng nào gộp được. `
                : ''}
              Chưa ghi gì cho tới khi bấm Lưu.
            </p>
          </KsumConfirmDialog>
        )}

        {confirm?.kind === 'optimizeOne' && (
          <KsumConfirmDialog
            tone="info"
            icon={<IcMerge size={18} />}
            title={`Tối ưu khối “${confirm.name}”?`}
            subtitle="Gộp các dòng cùng App + Giai đoạn + Mốc; nối Tasks, Tiến độ/Kết quả và Lý do ±."
            confirmLabel={`Gộp còn ${confirm.after} dòng`}
            onConfirm={() => doOptimizeOne(confirm)}
            onCancel={() => setConfirm(null)}
          >
            <div className="k-bigrow">
              <span className="k-big">{confirm.before} dòng</span>
              <IcArrowRight />
              <span className="k-big k-c-primary">{confirm.after} dòng</span>
            </div>
            <p className="k-muted k-small">Chưa ghi gì cho tới khi bấm Lưu.</p>
          </KsumConfirmDialog>
        )}

        {merging && selection && summary && (() => {
          const m = summary.members.find((x) => x.memberId === selection.memberId);
          if (!m) return null;
          return (
            <KsumMergeDialog
              memberName={m.name}
              rows={m.rows.filter((r) => selection.rowIds.includes(r.id))}
              categories={meta.kpiRules.map((g) => g.label)}
              onSave={onSaveMerged}
              onCancel={() => setMerging(false)}
            />
          );
        })()}

        {confirm?.kind === 'deleteMember' && (
          <KsumConfirmDialog
            tone="danger"
            icon={<IcTrash size={18} />}
            title={`Bỏ “${confirm.name}” khỏi bảng tổng kết?`}
            subtitle={`Khối, các dòng và KPI tháng của ${confirm.name} bị xóa khỏi bảng này.`}
            confirmLabel="Bỏ khỏi bảng"
            confirmKind="danger-solid"
            onConfirm={() => doDeleteMember(confirm)}
            onCancel={() => setConfirm(null)}
          >
            <p className="k-small">
              Log KPI của member không bị ảnh hưởng; có thể thêm lại bằng Thêm member. Chưa ghi gì
              cho tới khi bấm Lưu.
            </p>
          </KsumConfirmDialog>
        )}
      </div>
    </div>
  );
}
