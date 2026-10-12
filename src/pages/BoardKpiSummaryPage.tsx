// Trang tổng kết KPI tháng (leader, /board/kpi/summary/:monthKey): lần đầu mở tự
// tổng hợp từ log tất cả member thành bảng như file Excel mẫu; các lần sau load bản
// đã lưu (bản CHỐT — log đổi không tự cập nhật, muốn mới bấm 🔄). Sửa local + 💾 Lưu;
// 📋 Share copy link view-only /share/kpisum/{id}.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, ref } from 'firebase/database';
import { v4 as uuidv4 } from 'uuid';
import { usePm } from '../context/PmContext';
import BoardNav from '../components/board/BoardNav';
import KpiSummaryTable from '../components/board/KpiSummaryTable';
import KpiSummaryAddMemberDialog from '../components/board/KpiSummaryAddMemberDialog';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';
import { db } from '../lib/firebase';
import {
  normalizeSummaryRead,
  optimizeSummaryMembers,
  optimizeSummaryRows,
} from '../lib/kpiSummary';
import {
  KPI_MONTH_BASE,
  type KpiMember,
  type KpiSummary,
  type KpiSummaryMember,
  type KpiSummaryMeta,
} from '../kpiTypes';

export default function BoardKpiSummaryPage() {
  const { monthKey = '' } = useParams();
  const { meta, members, ensureKpiSummary, saveKpiSummary, rebuildKpiSummaryMembers } =
    usePm();
  const [adding, setAdding] = useState(false);
  // memberId khối đang tổng hợp riêng (chặn bấm 2 lần trong lúc chờ đọc log).
  const [busyMember, setBusyMember] = useState<string | null>(null);

  // Khối có thuộc 1 KPI member còn tồn tại không — khối nhập tay (VD dữ liệu chuyển từ
  // Excel) hoặc member đã bị xóa thì không có log để tổng hợp.
  const isKpiMember = (m: KpiSummaryMember) => members.some((x) => x.id === m.memberId);

  const [id, setId] = useState<string | null>(null);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  useUnsavedGuard(dirty);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(''), 4000);
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
      setNotice('✓ Đã lưu bảng tổng kết.');
    } else {
      setNotice('⚠ Không lưu được — thử lại (kiểm tra mạng/quyền).');
    }
  };

  // Tổng hợp lại từ log hiện tại: thay khối của mọi KPI member (giữ Nghỉ lễ chung) —
  // khối THÊM TAY (không thuộc KPI member nào) giữ nguyên, nối cuối bảng, vì chúng không
  // có log để dựng lại. Chỉ đổi trên form — bấm 💾 Lưu mới ghi đè bản cũ.
  const onRebuild = async () => {
    if (!summary) return;
    const manual = summary.members.filter((m) => !isKpiMember(m));
    if (
      !window.confirm(
        'Tổng hợp lại từ log sẽ THAY THẾ nội dung đã sửa tay của mọi KPI member (trừ ô Nghỉ lễ chung).' +
          (manual.length
            ? `\n${manual.length} khối thêm tay (${manual.map((m) => m.name).join(', ')}) được giữ nguyên.`
            : '') +
          '\nTiếp tục?',
      )
    )
      return;
    setRebuilding(true);
    const rebuilt = await rebuildKpiSummaryMembers(monthKey);
    setRebuilding(false);
    setSummary({ ...summary, members: [...rebuilt, ...manual] });
    setDirty(true);
    setNotice('Đã tổng hợp lại từ log — kiểm tra rồi bấm 💾 Lưu để chốt.');
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

  // 🔄 Riêng 1 khối: đọc log TRƯỚC rồi mới hỏi, để câu hỏi nói đúng kết quả sẽ thay.
  const onRebuildMember = async (mi: number) => {
    if (!summary || busyMember) return;
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
    const msg = block
      ? `Tổng hợp lại khối "${cur.name}" từ log: ${block.rows.length} đầu mục, KPI tháng ${block.kpiScore}.\nThay các dòng, KPI tháng và ngày nghỉ đã sửa tay của khối này?`
      : `"${cur.name}" không có log/nghỉ phép nào trong tháng — khối sẽ về rỗng, KPI ${KPI_MONTH_BASE}. Tiếp tục?`;
    if (!window.confirm(msg)) return;
    const next = block ?? emptyBlock(cur.memberId, kpiMember.name, false);
    // Thay theo memberId (không theo vị trí mi): trong lúc chờ đọc log, bảng có thể đã
    // bị thêm/xóa khối khiến chỉ số lệch.
    setSummary((s) =>
      s
        ? {
            ...s,
            members: s.members.map((m) =>
              m.memberId === cur.memberId ? { ...next, order: m.order } : m,
            ),
          }
        : s,
    );
    setDirty(true);
    setNotice(`Đã tổng hợp lại khối "${cur.name}" — kiểm tra rồi bấm 💾 Lưu để chốt.`);
  };

  // 🧹 Riêng 1 khối — cùng luật với nút tối ưu toàn bảng.
  const onOptimizeMember = (mi: number) => {
    if (!summary) return;
    const cur = summary.members[mi];
    const before = (cur.rows ?? []).length;
    const rows = optimizeSummaryRows(cur.rows ?? []);
    if (rows.length === before) {
      setNotice(`Khối "${cur.name}" không có dòng nào gộp được (khác App / Giai đoạn / Mốc).`);
      return;
    }
    if (!window.confirm(`Gộp ${before} dòng của "${cur.name}" còn ${rows.length} dòng?`)) return;
    setSummary({
      ...summary,
      members: summary.members.map((m, i) => (i === mi ? { ...m, rows } : m)),
    });
    setDirty(true);
    setNotice(`Đã gộp "${cur.name}": ${before} → ${rows.length} dòng — bấm 💾 Lưu để chốt.`);
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
    setNotice(
      block
        ? `Đã thêm "${m.name}" (${block.rows.length} đầu mục từ log) — bấm 💾 Lưu để chốt.`
        : `Đã thêm "${m.name}" — tháng này không có log nên khối trống, KPI ${KPI_MONTH_BASE}.`,
    );
  };

  // ＋ Nhập tay: memberId riêng (không trùng KPI member nào) → khối được giữ khi 🔄 toàn bảng.
  const onAddManual = (name: string) => {
    if (!summary) return;
    setSummary({
      ...summary,
      members: [...summary.members, emptyBlock(`manual-${uuidv4()}`, name, true)],
    });
    setDirty(true);
    setNotice(`Đã thêm khối "${name}" — điền các dòng rồi bấm 💾 Lưu để chốt.`);
  };

  // Tối ưu bảng HIỆN TẠI (không đọc lại log): gộp các dòng cùng App+Giai đoạn+Mốc —
  // dùng sau khi leader điền bổ sung mốc release cho các dòng tổng hợp còn thiếu.
  const onOptimize = () => {
    if (!summary) return;
    const preview = optimizeSummaryMembers(summary.members);
    if (preview.after === preview.before) {
      setNotice('Không có dòng nào gộp được (khác App / Giai đoạn / Mốc).');
      return;
    }
    if (
      !window.confirm(
        `Gộp ${preview.before} dòng còn ${preview.after} dòng (cùng App + Giai đoạn + Mốc)? Nội dung Tasks/Tiến độ/Lý do ± của các dòng sẽ được nối lại.`,
      )
    )
      return;
    setSummary({ ...summary, members: preview.members });
    setDirty(true);
    setNotice(
      `Đã gộp ${preview.before} → ${preview.after} dòng — kiểm tra rồi bấm 💾 Lưu để chốt.`,
    );
  };

  const shareUrl = id ? `${window.location.origin}/share/kpisum/${id}` : '';
  const onShare = async () => {
    if (!id) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy link thủ công:', shareUrl);
    }
    if (dirty) setNotice('Link đã copy — nhớ 💾 Lưu để người xem thấy bản mới nhất.');
  };

  const monthLabel = validMonth ? `${monthKey.slice(5, 7)}/${monthKey.slice(0, 4)}` : monthKey;

  return (
    <div className="container ksum-page">
      <BoardNav />

      <div className="cal-header">
        <Link to="/board/kpi" className="board-docs-link">
          ← KPI member
        </Link>
        <strong className="cal-title">📊 Tổng kết KPI tháng {monthLabel}</strong>
        {state === 'ready' && (
          <div className="plan-toolbar">
            <button
              type="button"
              onClick={() => setAdding(true)}
              disabled={!!busyMember}
              title="Thêm khối member: chọn KPI member có sẵn hoặc nhập tay"
            >
              {busyMember ? '⏳ Đang đọc log…' : '＋ Thêm member'}
            </button>
            <button
              type="button"
              onClick={onRebuild}
              disabled={rebuilding}
              title="Tổng hợp lại từ log KPI hiện tại (đè nội dung đã sửa tay)"
            >
              {rebuilding ? '⏳ Đang tổng hợp…' : '🔄 Tổng hợp lại'}
            </button>
            <button
              type="button"
              onClick={onOptimize}
              title="Gộp các dòng cùng App + Giai đoạn + Mốc release (dùng sau khi điền bổ sung mốc)"
            >
              🧹 Tối ưu bảng
            </button>
            <button type="button" onClick={onShare} title={shareUrl}>
              {copied ? '✓ Đã copy' : '📋 Share (chỉ xem)'}
            </button>
            <button
              type="button"
              className="primary"
              onClick={onSave}
              disabled={!dirty || saving}
            >
              {saving ? 'Đang lưu…' : dirty ? '💾 Lưu' : '✓ Đã lưu'}
            </button>
          </div>
        )}
      </div>

      {notice && <p className="muted kpi-locked-banner">{notice}</p>}

      {state === 'loading' && <p className="muted">Đang tổng hợp dữ liệu tháng…</p>}
      {state === 'error' && (
        <p className="warn">
          Không mở được bảng tổng kết (tháng không hợp lệ hoặc lỗi đọc dữ liệu).
        </p>
      )}

      {state === 'ready' && summary && (
        <>
          <label className="ksum-holidays">
            🎌 Nghỉ lễ chung của tháng (áp cho mọi member):
            <input
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
          <KpiSummaryTable
            summary={summary}
            categories={meta.kpiRules.map((g) => g.label)}
            onChange={onEdit}
            onRebuildMember={onRebuildMember}
            canRebuildMember={isKpiMember}
            onOptimizeMember={onOptimizeMember}
          />
          <p className="muted kpi-share-hint">
            Bảng là bản CHỐT tại thời điểm tổng hợp — log đổi sau đó không tự cập nhật
            (bấm "🔄 Tổng hợp lại" nếu muốn lấy số liệu mới). Link share chỉ xem, không
            sửa được.
          </p>
        </>
      )}

      {adding && summary && (
        <KpiSummaryAddMemberDialog
          available={members.filter(
            (m) => !summary.members.some((x) => x.memberId === m.id),
          )}
          existingNames={summary.members.map((m) => m.name)}
          onPickExisting={onPickExisting}
          onAddManual={onAddManual}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}
