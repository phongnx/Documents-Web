// Dialog "Thêm member" trên trang tổng kết KPI tháng — 2 đường:
// - Chọn KPI member có sẵn (chưa nằm trong bảng) → trang tự tổng hợp khối từ log tháng đó.
// - Nhập tay tên (người không có trang KPI, VD dữ liệu chuyển từ Excel) → khối trống
//   KPI 100 + 1 dòng để điền; khối này không có log nên không tổng hợp lại được.
// Trùng tên khi nhập tay: cảnh báo ngay trong dialog, nút đổi thành "Vẫn thêm".
import { useState } from 'react';
import type { KpiMember } from '../../kpiTypes';
import KsumConfirmDialog from './KsumConfirmDialog';
import { IcInfo, IcUserPlus, IcWarn } from './ksumIcons';

interface Props {
  /** Nhãn tháng 'mm/yyyy' cho tiêu đề. */
  monthLabel: string;
  /** KPI member CHƯA có khối trong bảng. */
  available: KpiMember[];
  /** Tên các khối đang có — để cảnh báo trùng khi nhập tay. */
  existingNames: string[];
  onPickExisting: (member: KpiMember) => void;
  onAddManual: (name: string) => void;
  onClose: () => void;
}

export default function KpiSummaryAddMemberDialog({
  monthLabel,
  available,
  existingNames,
  onPickExisting,
  onAddManual,
  onClose,
}: Props) {
  const [mode, setMode] = useState<'existing' | 'manual'>(
    available.length > 0 ? 'existing' : 'manual',
  );
  const [pickedId, setPickedId] = useState(available[0]?.id ?? '');
  const [name, setName] = useState('');

  const trimmed = name.trim();
  const dup =
    mode === 'manual' &&
    !!trimmed &&
    existingNames.some((x) => x.trim().toLowerCase() === trimmed.toLowerCase());
  const picked = available.find((x) => x.id === pickedId);
  const canSave = mode === 'existing' ? !!picked : !!trimmed;

  const save = () => {
    if (!canSave) return;
    if (mode === 'existing') {
      if (picked) onPickExisting(picked);
    } else {
      onAddManual(trimmed);
    }
    onClose();
  };

  return (
    <KsumConfirmDialog
      plain
      tone="info"
      icon={<IcUserPlus size={18} />}
      title={`Thêm member vào bảng tháng ${monthLabel}`}
      subtitle="Khối mới nối cuối bảng. Bấm Lưu để chốt."
      confirmLabel={dup ? 'Vẫn thêm' : 'Thêm'}
      confirmDisabled={!canSave}
      onConfirm={save}
      onCancel={onClose}
    >
      <fieldset className="k-fieldset">
        <legend className="k-sr">Cách thêm</legend>
        <div className="k-radio-cards">
          <label
            className={`k-radio-card${mode === 'existing' ? ' is-on' : ''}${
              available.length === 0 ? ' is-disabled' : ''
            }`}
          >
            <input
              type="radio"
              name="ksum-add-mode"
              checked={mode === 'existing'}
              disabled={available.length === 0}
              onChange={() => setMode('existing')}
            />
            <span>
              <b>Chọn member KPI có sẵn</b>
              <span>Tự đọc log tháng để tạo khối</span>
            </span>
          </label>
          <label className={`k-radio-card${mode === 'manual' ? ' is-on' : ''}`}>
            <input
              type="radio"
              name="ksum-add-mode"
              checked={mode === 'manual'}
              onChange={() => setMode('manual')}
            />
            <span>
              <b>Nhập tay</b>
              <span>Người không có trang KPI</span>
            </span>
          </label>
        </div>
      </fieldset>

      {mode === 'existing' ? (
        <>
          <label className="k-field">
            <span>Member</span>
            <select
              className="k-select"
              value={pickedId}
              onChange={(e) => setPickedId(e.target.value)}
            >
              {available.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.active ? '' : ' (đã khóa)'}
                </option>
              ))}
            </select>
            <small>Chỉ liệt kê member chưa có trong bảng ({available.length} người).</small>
          </label>
          {picked && (
            <div className="k-callout is-ok">
              <IcInfo />
              <span>
                App sẽ đọc log tháng {monthLabel} của {picked.name} và tạo khối. Không có log
                thì tạo khối trống, KPI tháng 100.
              </span>
            </div>
          )}
        </>
      ) : (
        <>
          <label className="k-field">
            <span>Tên</span>
            <input
              className={`k-in k-in-lg${dup ? ' is-warn' : ''}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tên member"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') save();
              }}
            />
            <small>Tạo khối trống KPI tháng 100 kèm một dòng. Enter để thêm.</small>
          </label>
          {dup && (
            <div className="k-callout is-warn">
              <IcWarn />
              <span>Bảng đã có khối tên “{trimmed}”. Thêm nữa sẽ có 2 khối trùng tên.</span>
            </div>
          )}
          {available.length === 0 && (
            <p className="k-muted k-small">
              Mọi member KPI đều đã có trong bảng — chỉ nhập tay được.
            </p>
          )}
        </>
      )}
    </KsumConfirmDialog>
  );
}
