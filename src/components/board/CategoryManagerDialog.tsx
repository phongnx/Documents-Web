import { useState } from 'react';
import { usePm } from '../../context/PmContext';
import { catMeta, DEFAULT_PLAN_CATEGORIES } from '../../pmTypes';

// Modal quản lý danh mục: loại task, loại nhánh (plan), loại milestone.
export default function CategoryManagerDialog({ onClose }: { onClose: () => void }) {
  const {
    meta,
    addTaskType,
    updateTaskType,
    deleteTaskType,
    addMilestoneType,
    updateMilestoneType,
    deleteMilestoneType,
    addPlanCategory,
    updatePlanCategory,
    deletePlanCategory,
  } = usePm();

  const [newType, setNewType] = useState('');
  const [newCat, setNewCat] = useState('');
  const [newMsLabel, setNewMsLabel] = useState('');
  const [newMsRelease, setNewMsRelease] = useState(false);

  const onAddType = () => {
    const n = newType.trim();
    if (!n) return;
    addTaskType(n);
    setNewType('');
  };
  const onRenameType = (name: string) => {
    const next = window.prompt('Đổi tên loại task:', name)?.trim();
    if (next && next !== name) updateTaskType(name, next);
  };
  const onDeleteType = (name: string) => {
    const used = deleteTaskType(name);
    if (used > 0)
      window.alert(`Không thể xóa: còn ${used} task đang dùng loại "${name}".`);
  };

  const onAddMs = () => {
    const l = newMsLabel.trim();
    if (!l) return;
    addMilestoneType(l, newMsRelease);
    setNewMsLabel('');
    setNewMsRelease(false);
  };

  const onAddCat = () => {
    const n = newCat.trim();
    if (!n) return;
    addPlanCategory(n);
    setNewCat('');
  };
  const onRenameCat = (name: string) => {
    const next = window.prompt('Đổi tên loại nhánh:', name)?.trim();
    if (next && next !== name) updatePlanCategory(name, next);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-dialog cat-manager" role="dialog" aria-modal="true">
        <div className="modal-header">
          <strong>⚙️ Quản lý danh mục</strong>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="cat-body">
        {/* Loại task */}
        <section className="cat-section">
          <h3 className="cat-title">Loại task ({meta.taskTypes.length})</h3>
          <ul className="cat-list">
            {meta.taskTypes.map((t) => (
              <li key={t} className="cat-row">
                <span className="cat-name">{t}</span>
                <button
                  type="button"
                  className="doc-action"
                  title="Đổi tên"
                  onClick={() => onRenameType(t)}
                >
                  ✏️
                </button>
                <button
                  type="button"
                  className="doc-action danger"
                  title="Xóa"
                  onClick={() => onDeleteType(t)}
                >
                  🗑️
                </button>
              </li>
            ))}
          </ul>
          <div className="cat-add">
            <input
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              placeholder="Tên loại task mới"
              onKeyDown={(e) => e.key === 'Enter' && onAddType()}
            />
            <button type="button" className="plan-add-btn" onClick={onAddType}>
              ＋ Thêm
            </button>
          </div>
        </section>

        {/* Loại nhánh (plan) */}
        <section className="cat-section">
          <h3 className="cat-title">Loại nhánh — plan ({meta.planCategories.length})</h3>
          <ul className="cat-list">
            {meta.planCategories.map((c) => {
              const locked = DEFAULT_PLAN_CATEGORIES.includes(c);
              return (
                <li key={c} className="cat-row">
                  <span className="cat-name">
                    {catMeta(c).label}
                    {locked && <span className="muted"> · mặc định</span>}
                  </span>
                  <button
                    type="button"
                    className="doc-action"
                    title={locked ? 'Loại mặc định, không sửa' : 'Đổi tên'}
                    disabled={locked}
                    onClick={() => onRenameCat(c)}
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    className="doc-action danger"
                    title={locked ? 'Loại mặc định, không xóa' : 'Xóa'}
                    disabled={locked}
                    onClick={() => deletePlanCategory(c)}
                  >
                    🗑️
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="cat-add">
            <input
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              placeholder="Tên loại nhánh mới (VD: Research)"
              onKeyDown={(e) => e.key === 'Enter' && onAddCat()}
            />
            <button type="button" className="plan-add-btn" onClick={onAddCat}>
              ＋ Thêm
            </button>
          </div>
        </section>

        {/* Loại milestone */}
        <section className="cat-section">
          <h3 className="cat-title">Loại milestone ({meta.milestoneTypes.length})</h3>
          <ul className="cat-list">
            {meta.milestoneTypes.map((mt) => {
              const locked = mt.key === 'release' || mt.key === 'test';
              return (
                <li key={mt.key} className="cat-row">
                  <input
                    className="cat-ms-label"
                    value={mt.label}
                    onChange={(e) => updateMilestoneType(mt.key, { label: e.target.value })}
                  />
                  <label className="cat-ms-release" title="Tính là release (ảnh hưởng card/lịch)">
                    <input
                      type="checkbox"
                      checked={mt.isRelease}
                      onChange={(e) =>
                        updateMilestoneType(mt.key, { isRelease: e.target.checked })
                      }
                    />
                    release
                  </label>
                  <button
                    type="button"
                    className="doc-action danger"
                    title={locked ? 'Loại gốc, không thể xóa' : 'Xóa'}
                    disabled={locked}
                    onClick={() => deleteMilestoneType(mt.key)}
                  >
                    🗑️
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="cat-add">
            <input
              value={newMsLabel}
              onChange={(e) => setNewMsLabel(e.target.value)}
              placeholder="Tên loại milestone mới"
              onKeyDown={(e) => e.key === 'Enter' && onAddMs()}
            />
            <label className="cat-ms-release">
              <input
                type="checkbox"
                checked={newMsRelease}
                onChange={(e) => setNewMsRelease(e.target.checked)}
              />
              release
            </label>
            <button type="button" className="plan-add-btn" onClick={onAddMs}>
              ＋ Thêm
            </button>
          </div>
        </section>
        </div>

        <div className="modal-actions">
          <button type="button" className="primary" onClick={onClose}>
            Xong
          </button>
        </div>
      </div>
    </div>
  );
}
