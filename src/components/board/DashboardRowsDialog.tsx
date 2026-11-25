// Dialog sửa khung dashboard Manager (users/{uid}/pm/meta/dashboardRows): thứ tự dòng, nhãn,
// app gán vào từng dòng. Chưa cấu hình → hiện khung mặc định (gán app theo tên). App không nằm
// trong dòng nào sẽ vào mục "Other tasks" khi export.
import { useMemo, useState } from 'react';
import { usePm } from '../../context/PmContext';
import KpiDialog from './KpiDialog';
import { IcChevronDown, IcChevronUp, IcClose, IcPlus, IcRules, IcTrash, IcUndo } from './ksumIcons';
import { defaultDashboardRows, resolveDashboardRows } from '../../lib/dashboardExport';
import type { DashboardRow } from '../../pmTypes';

export default function DashboardRowsDialog({ onClose }: { onClose: () => void }) {
  const { apps, meta, updateDashboardRows } = usePm();
  const [rows, setRows] = useState<DashboardRow[]>(() =>
    resolveDashboardRows(meta.dashboardRows, apps).map((r) => ({ ...r, appIds: [...r.appIds] })),
  );
  const [dirty, setDirty] = useState(false);

  const live = useMemo(
    () => apps.filter((a) => !a.archived).sort((a, b) => a.name.localeCompare(b.name)),
    [apps],
  );
  const nameOf = (id: string) => apps.find((a) => a.id === id)?.name ?? '(app đã xoá)';
  const used = new Set(rows.flatMap((r) => r.appIds));
  const outside = live.filter((a) => !used.has(a.id));

  const edit = (fn: (list: DashboardRow[]) => DashboardRow[]) => {
    setRows((list) => fn(list.map((r) => ({ ...r, appIds: [...r.appIds] }))));
    setDirty(true);
  };
  const move = (i: number, d: -1 | 1) =>
    edit((list) => {
      const j = i + d;
      if (j < 0 || j >= list.length) return list;
      [list[i], list[j]] = [list[j], list[i]];
      return list;
    });

  const save = () => {
    const cleaned = rows
      .map((r) => ({ label: r.label.trim(), appIds: r.appIds }))
      .filter((r) => r.label);
    updateDashboardRows(cleaned.length ? cleaned : null);
    onClose();
  };

  return (
    <KpiDialog
      title="Khung app dashboard"
      subtitle="Thứ tự dòng và app gán vào từng dòng. App không nằm trong dòng nào sẽ vào mục Other tasks."
      icon={<IcRules size={20} />}
      wide
      scrollBody
      dismissible={!dirty}
      onClose={onClose}
      actions={
        <>
          <button
            type="button"
            className="kml-btn kml-btn-text dash-exp-rows"
            onClick={() => edit(() => defaultDashboardRows(apps))}
          >
            <IcUndo size={18} />
            Khung mặc định
          </button>
          <button type="button" className="kml-btn kml-btn-text" onClick={onClose}>
            Huỷ
          </button>
          <button type="button" className="kml-btn kml-btn-filled" disabled={!dirty} onClick={save}>
            Lưu
          </button>
        </>
      }
    >
      <ol className="dash-rows">
        {rows.map((r, i) => {
          const options = live.filter((a) => !r.appIds.includes(a.id));
          return (
            <li key={i} className="dash-row">
              <span className="dash-row-no">{i + 1}</span>
              <input
                className="kml-input dash-row-label"
                value={r.label}
                placeholder="Tên dòng"
                aria-label={`Tên dòng ${i + 1}`}
                onChange={(e) =>
                  edit((list) => {
                    list[i].label = e.target.value;
                    return list;
                  })
                }
              />
              <div className="dash-row-apps">
                {r.appIds.length === 0 && <span className="dash-row-empty">Chưa gán app → N/A</span>}
                {r.appIds.map((id) => (
                  <span key={id} className="kml-chip dash-row-chip">
                    {nameOf(id)}
                    <button
                      type="button"
                      className="dash-row-x"
                      aria-label={`Bỏ ${nameOf(id)} khỏi dòng ${r.label}`}
                      onClick={() =>
                        edit((list) => {
                          list[i].appIds = list[i].appIds.filter((x) => x !== id);
                          return list;
                        })
                      }
                    >
                      <IcClose size={14} />
                    </button>
                  </span>
                ))}
                {options.length > 0 && (
                  <select
                    className="kml-input dash-row-add"
                    value=""
                    aria-label={`Gán thêm app vào dòng ${r.label}`}
                    onChange={(e) => {
                      const id = e.target.value;
                      if (!id) return;
                      edit((list) => {
                        list[i].appIds.push(id);
                        return list;
                      });
                    }}
                  >
                    <option value="">+ Gán app…</option>
                    {options.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                        {used.has(a.id) ? ' (đang ở dòng khác)' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="dash-row-act">
                <button
                  type="button"
                  className="kml-iconbtn"
                  aria-label={`Đưa dòng ${r.label} lên`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <IcChevronUp size={18} />
                </button>
                <button
                  type="button"
                  className="kml-iconbtn"
                  aria-label={`Đưa dòng ${r.label} xuống`}
                  disabled={i === rows.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <IcChevronDown size={18} />
                </button>
                <button
                  type="button"
                  className="kml-iconbtn"
                  aria-label={`Xoá dòng ${r.label}`}
                  onClick={() => edit((list) => list.filter((_, k) => k !== i))}
                >
                  <IcTrash size={18} />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className="kml-btn kml-btn-tonal"
        onClick={() => edit((list) => [...list, { label: '', appIds: [] }])}
      >
        <IcPlus size={18} />
        Thêm dòng
      </button>
      {outside.length > 0 && (
        <p className="dash-row-outside">
          App chưa có trong khung (vào Other tasks): {outside.map((a) => a.name).join(', ')}
        </p>
      )}
    </KpiDialog>
  );
}
