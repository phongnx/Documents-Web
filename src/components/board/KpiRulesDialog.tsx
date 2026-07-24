// Dialog quản lý quy chế chấm điểm KPI (users/{uid}/pm/meta/kpiRules):
// nhóm giai đoạn → các mức điểm (label + delta) sửa inline, thêm/xóa mức, thêm/xóa nhóm.
// Lưu bằng nút "Lưu quy chế" (set cả mảng 1 lần).
import { useState } from 'react';
import { usePm } from '../../context/PmContext';
import { fmtDelta, type KpiRuleGroup } from '../../kpiTypes';

interface Props {
  onClose: () => void;
}

// Key nhóm mới từ label (slug đơn giản, tránh trùng bằng hậu tố số).
function keyFromLabel(label: string, existing: KpiRuleGroup[]): string {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || `g${existing.length}`;
  let key = base;
  let i = 1;
  while (existing.some((g) => g.key === key)) key = `${base}-${i++}`;
  return key;
}

export default function KpiRulesDialog({ onClose }: Props) {
  const { meta, updateKpiRules } = usePm();
  // Bản nháp cục bộ — chỉ ghi khi bấm Lưu.
  const [rules, setRules] = useState<KpiRuleGroup[]>(() =>
    meta.kpiRules.map((g) => ({ ...g, levels: g.levels.map((l) => ({ ...l })) })),
  );
  const [dirty, setDirty] = useState(false);

  const patch = (next: KpiRuleGroup[]) => {
    setRules(next);
    setDirty(true);
  };

  const setGroup = (gi: number, u: Partial<KpiRuleGroup>) =>
    patch(rules.map((g, i) => (i === gi ? { ...g, ...u } : g)));
  const setLevel = (gi: number, li: number, u: Partial<KpiRuleGroup['levels'][number]>) =>
    setGroup(gi, {
      levels: rules[gi].levels.map((l, i) => (i === li ? { ...l, ...u } : l)),
    });

  const addGroup = () => {
    const label = window.prompt('Tên giai đoạn mới (VD: QA, Design…):')?.trim();
    if (!label) return;
    patch([
      ...rules,
      { key: keyFromLabel(label, rules), label, levels: [{ label: 'Đạt yêu cầu', delta: 0 }] },
    ]);
  };
  const removeGroup = (gi: number) => {
    if (window.confirm(`Xóa giai đoạn "${rules[gi].label}" khỏi quy chế?`))
      patch(rules.filter((_, i) => i !== gi));
  };
  const addLevel = (gi: number) =>
    setGroup(gi, { levels: [...rules[gi].levels, { label: '', delta: 0 }] });
  const removeLevel = (gi: number, li: number) =>
    setGroup(gi, { levels: rules[gi].levels.filter((_, i) => i !== li) });

  const save = () => {
    // Bỏ mức trống label; nhóm không còn mức vẫn giữ (leader tự xóa nếu muốn).
    const cleaned = rules.map((g) => ({
      ...g,
      label: g.label.trim() || g.key,
      levels: g.levels
        .filter((l) => l.label.trim())
        .map((l) => ({ label: l.label.trim(), delta: Number(l.delta) || 0 })),
    }));
    updateKpiRules(cleaned);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-dialog kpi-rules-dialog" role="dialog" aria-modal="true">
        <div className="modal-header">
          <strong>⚖️ Quy chế chấm điểm KPI</strong>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>
        <p className="muted modal-subtitle">
          Mỗi member 100 điểm/tháng; điểm tháng = 100 + tổng điểm cộng/trừ hàng ngày. Các
          mức dưới đây thành nút chấm nhanh khi chấm điểm từng dòng log.
        </p>

        <div className="kpi-rules-body">
          {rules.map((g, gi) => (
            <section key={g.key} className="kpi-rules-group">
              <div className="plan-row">
                <input
                  className="plan-project-name"
                  value={g.label}
                  onChange={(e) => setGroup(gi, { label: e.target.value })}
                  placeholder="Tên giai đoạn"
                />
                <button
                  type="button"
                  className="doc-action danger"
                  title="Xóa giai đoạn"
                  onClick={() => removeGroup(gi)}
                >
                  🗑️
                </button>
              </div>
              {g.levels.map((lv, li) => (
                <div key={li} className="plan-row kpi-rule-level-row">
                  <input
                    type="number"
                    step="0.1"
                    className="kpi-delta-input"
                    value={lv.delta}
                    onChange={(e) => setLevel(gi, li, { delta: Number(e.target.value) })}
                    title={fmtDelta(Number(lv.delta) || 0)}
                  />
                  <input
                    className="kpi-level-label"
                    value={lv.label}
                    onChange={(e) => setLevel(gi, li, { label: e.target.value })}
                    placeholder="Mô tả mức điểm (VD: Vượt tiến độ)"
                  />
                  <button
                    type="button"
                    className="doc-action danger"
                    title="Xóa mức"
                    onClick={() => removeLevel(gi, li)}
                  >
                    ✖
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="plan-add-btn"
                onClick={() => addLevel(gi)}
              >
                ＋ Thêm mức điểm
              </button>
            </section>
          ))}
          <button type="button" className="plan-add-btn" onClick={addGroup}>
            ＋ Thêm giai đoạn
          </button>
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Hủy
          </button>
          <button type="button" className="primary" disabled={!dirty} onClick={save}>
            Lưu quy chế
          </button>
        </div>
      </div>
    </div>
  );
}
