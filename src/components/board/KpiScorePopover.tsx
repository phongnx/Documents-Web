// Dialog chấm điểm 1 dòng log (mode leader): nút chấm nhanh theo quy chế
// (nhóm mặc định chọn theo category của dòng) + ô delta/lý do tự do.
import { useState } from 'react';
import {
  fmtDelta,
  type KpiEntry,
  type KpiRuleGroup,
  type KpiScore,
} from '../../kpiTypes';

interface Props {
  entry: KpiEntry;
  /** Điểm hiện tại (nếu đã chấm) — để seed form và cho phép xóa. */
  current?: KpiScore;
  rules: KpiRuleGroup[];
  onSave: (score: Omit<KpiScore, 'scoredAt'>) => void;
  onClear: () => void;
  onClose: () => void;
}

export default function KpiScorePopover({
  entry,
  current,
  rules,
  onSave,
  onClear,
  onClose,
}: Props) {
  // Nhóm quy chế đang chọn: ưu tiên nhóm đã dùng lần trước, rồi nhóm khớp category của dòng.
  const initialKey =
    current?.ruleKey ??
    rules.find((g) => g.label === entry.category)?.key ??
    rules[0]?.key ??
    '';
  const [groupKey, setGroupKey] = useState(initialKey);
  // Seed điểm: đã chấm → điểm leader; chưa → điểm TỰ CHẤM của member (tick Lưu = xác nhận).
  const [delta, setDelta] = useState(
    current
      ? String(current.delta)
      : typeof entry.selfDelta === 'number'
        ? String(entry.selfDelta)
        : '0',
  );
  const [reason, setReason] = useState(current?.reason ?? '');

  const group = rules.find((g) => g.key === groupKey);
  const deltaNum = Number(delta);
  const canSave = delta.trim() !== '' && Number.isFinite(deltaNum);

  const pickLevel = (label: string, d: number) => {
    setDelta(String(d));
    setReason(label);
  };

  const save = () => {
    if (!canSave) return;
    onSave({
      delta: deltaNum,
      reason: reason.trim() || undefined,
      ruleKey: groupKey || undefined,
    });
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-dialog kpi-score-dialog" role="dialog" aria-modal="true">
        <div className="modal-header">
          <strong>Chấm điểm</strong>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>

        <p className="muted kpi-score-task">
          {entry.date} · {entry.task || entry.feature || entry.project || '(không mô tả)'}
          {typeof entry.selfDelta === 'number' && !current && (
            <> · member tự chấm: <strong>{entry.selfDelta}</strong></>
          )}
        </p>

        {/* Chọn nhóm quy chế + nút mức điểm chấm nhanh */}
        <div className="kpi-rule-tabs">
          {rules.map((g) => (
            <button
              key={g.key}
              type="button"
              className={`kpi-rule-tab${g.key === groupKey ? ' active' : ''}`}
              onClick={() => setGroupKey(g.key)}
            >
              {g.label}
            </button>
          ))}
        </div>
        {group && (
          <div className="kpi-rule-levels">
            {group.levels.map((lv, i) => (
              <button
                key={i}
                type="button"
                className={`kpi-level-btn${
                  reason === lv.label && Number(delta) === lv.delta ? ' active' : ''
                }`}
                onClick={() => pickLevel(lv.label, lv.delta)}
              >
                <span
                  className={`kpi-score ${lv.delta > 0 ? 'pos' : lv.delta < 0 ? 'neg' : 'zero'}`}
                >
                  {fmtDelta(lv.delta)}
                </span>
                {lv.label}
              </button>
            ))}
          </div>
        )}

        {/* Delta + lý do tự do */}
        <div className="task-form kpi-score-form">
          <label className="task-field">
            <span>Điểm (+/−)</span>
            <input
              type="number"
              step="0.1"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
            />
          </label>
          <label className="task-field task-field-wide">
            <span>Lý do</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="VD: Vượt tiến độ theo estimate"
            />
          </label>
        </div>

        <div className="modal-actions">
          {current && (
            <button
              type="button"
              className="doc-action danger"
              onClick={() => {
                if (window.confirm('Xóa điểm của dòng này? (member sẽ sửa được dòng trở lại)')) {
                  onClear();
                  onClose();
                }
              }}
            >
              🗑️ Xóa điểm
            </button>
          )}
          <button type="button" onClick={onClose}>
            Hủy
          </button>
          <button type="button" className="primary" disabled={!canSave} onClick={save}>
            Lưu điểm
          </button>
        </div>
      </div>
    </div>
  );
}
