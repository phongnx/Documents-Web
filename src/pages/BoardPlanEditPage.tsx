import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { usePm } from '../context/PmContext';
import BoardNav from '../components/board/BoardNav';
import {
  catMeta,
  DEFAULT_PLAN_CATEGORIES,
  type PlanProject,
  type PlanWorkstream,
  type WeeklyPlan,
} from '../pmTypes';
import { buildDetailedHtml, buildReleaseTestHtml } from '../lib/planExport';
import { downloadTextFile } from '../lib/downloadHelpers';
import TaskPickerDialog from '../components/board/TaskPickerDialog';

type PlanForm = Omit<WeeklyPlan, 'id' | 'order' | 'createdAt' | 'updatedAt'>;

function toForm(p: WeeklyPlan): PlanForm {
  return {
    title: p.title,
    description: p.description,
    weekStart: p.weekStart,
    weekEnd: p.weekEnd,
    projects: p.projects ?? [],
    timeline: p.timeline ?? [],
  };
}

// Tên file export gọn (bỏ ký tự cấm).
function fileBase(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_').slice(0, 80) || 'plan';
}

// Chuẩn hóa tên để so khớp gợi ý app (thường hóa, bỏ khoảng trắng & ký tự đặc biệt).
function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export default function BoardPlanEditPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { plans, apps, tasks, loading, updatePlan } = usePm();
  const plan = plans.find((p) => p.id === id);

  const [form, setForm] = useState<PlanForm | null>(null);
  const [dirty, setDirty] = useState(false);
  const seeded = useRef<string | null>(null);
  // Chỉ số dự án đang mở dialog chọn task (null = đóng).
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  // Giá trị select "thêm dự án từ app" (reset về '' sau mỗi lần chọn).
  const [addAppSel, setAddAppSel] = useState('');
  // Các loại nhánh do người dùng tự thêm trong phiên này (ngoài preset).
  const [extraCats, setExtraCats] = useState<string[]>([]);

  // Nạp dữ liệu vào form một lần khi plan (theo id) sẵn sàng — tránh ghi đè khi đang gõ.
  useEffect(() => {
    if (plan && seeded.current !== plan.id) {
      seeded.current = plan.id;
      setForm(toForm(plan));
      setDirty(false);
    }
  }, [plan]);

  // Cảnh báo khi rời/tải lại trang lúc còn thay đổi chưa lưu (đóng tab, F5, back trình duyệt).
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  if (loading && !form) {
    return (
      <div className="container">
        <BoardNav />
        <p className="muted">Đang tải…</p>
      </div>
    );
  }
  if (!plan || !form) {
    return (
      <div className="container">
        <BoardNav />
        <p className="muted empty">Không tìm thấy plan này.</p>
        <Link to="/board/plan" className="board-docs-link">
          ← Danh sách plan
        </Link>
      </div>
    );
  }

  // ----- Cập nhật bất biến -----
  const patch = (u: Partial<PlanForm>) => {
    setForm((f) => (f ? { ...f, ...u } : f));
    setDirty(true);
  };
  const patchProjects = (projects: PlanProject[]) => patch({ projects });

  const setProject = (pi: number, u: Partial<PlanProject>) =>
    patchProjects(form.projects.map((p, i) => (i === pi ? { ...p, ...u } : p)));
  const setWorkstream = (pi: number, wi: number, u: Partial<PlanWorkstream>) =>
    setProject(pi, {
      workstreams: form.projects[pi].workstreams.map((w, i) =>
        i === wi ? { ...w, ...u } : w,
      ),
    });

  const addProject = () =>
    patchProjects([...form.projects, { name: 'Dự án mới', workstreams: [] }]);
  // Thêm dự án gắn với 1 app có sẵn (để chọn task khi thêm nhánh).
  const addProjectFromApp = (appId: string) => {
    const app = apps.find((a) => a.id === appId);
    if (!app) return;
    patchProjects([...form.projects, { name: app.name, appId: app.id, workstreams: [] }]);
  };
  const removeProject = (pi: number) =>
    patchProjects(form.projects.filter((_, i) => i !== pi));

  const addWorkstream = (pi: number) =>
    setProject(pi, {
      workstreams: [
        ...form.projects[pi].workstreams,
        { title: 'Android', category: 'release', items: [''] },
      ],
    });
  // Thêm nhiều nhánh dựng sẵn từ dialog chọn task.
  const addWorkstreamsFromTasks = (pi: number, ws: PlanWorkstream[]) => {
    if (ws.length === 0) return;
    setProject(pi, { workstreams: [...form.projects[pi].workstreams, ...ws] });
  };
  const removeWorkstream = (pi: number, wi: number) =>
    setProject(pi, {
      workstreams: form.projects[pi].workstreams.filter((_, i) => i !== wi),
    });

  const toggleMilestone = (pi: number, wi: number, on: boolean) =>
    setWorkstream(pi, wi, {
      milestone: on ? { type: 'release', text: 'Build release v…' } : undefined,
    });

  const setTimeline = (list: PlanForm['timeline']) => patch({ timeline: list });

  // ----- Lưu / Export -----
  const save = () => {
    updatePlan(id, form);
    setDirty(false);
  };
  const exportHtml = (kind: 'detailed' | 'release') => {
    if (dirty) save();
    const full: WeeklyPlan = { ...plan, ...form };
    const html =
      kind === 'detailed' ? buildDetailedHtml(full) : buildReleaseTestHtml(full);
    const base =
      kind === 'detailed'
        ? `mobile_team_weekly_plan_${form.weekStart}_${form.weekEnd}`
        : `plan_team_mobile_release_test_${form.weekStart}_${form.weekEnd}`;
    downloadTextFile(`${fileBase(base)}.html`, html, 'text/html');
  };

  // Back về danh sách: nếu còn thay đổi chưa lưu thì hỏi lưu hay không.
  const onBack = () => {
    if (dirty) {
      const doSave = window.confirm(
        'Có thay đổi chưa lưu.\nOK để LƯU rồi rời đi, Cancel để rời mà KHÔNG lưu.',
      );
      if (doSave) save();
    }
    navigate('/board/plan');
  };

  // Danh sách loại nhánh cho dropdown: preset + tự thêm + loại đang có trong plan (giữ giá trị lạ).
  const usedCats = form.projects.flatMap((p) => p.workstreams.map((w) => w.category));
  const catOptions = [
    ...new Set([...DEFAULT_PLAN_CATEGORIES, ...extraCats, ...usedCats]),
  ].filter(Boolean);

  // Thêm loại nhánh mới rồi gán ngay cho nhánh hiện tại.
  const addCategory = (pi: number, wi: number) => {
    const name = window.prompt('Tên loại nhánh mới (VD: Research, QA…):')?.trim();
    if (!name) return;
    if (!catOptions.includes(name)) setExtraCats((cs) => [...cs, name]);
    setWorkstream(pi, wi, { category: name });
  };

  // Gợi ý app khớp tên project (khớp chính xác trước, rồi chứa nhau); '' nếu không có.
  const suggestAppId = (name: string): string => {
    const pn = normName(name);
    if (!pn) return '';
    const exact = apps.find((a) => normName(a.name) === pn);
    if (exact) return exact.id;
    const partial = apps.find(
      (a) => normName(a.name).includes(pn) || pn.includes(normName(a.name)),
    );
    return partial?.id ?? '';
  };

  // App focus mặc định cho dialog chọn task: ưu tiên appId của project,
  // rồi match theo tên project ↔ tên app (không phân biệt hoa/thường); không có → dialog tự về app đầu.
  const pickerAppId = (() => {
    if (pickerFor === null) return undefined;
    const pr = form.projects[pickerFor];
    if (!pr) return undefined;
    if (pr.appId) return pr.appId;
    const norm = pr.name.trim().toLowerCase();
    return apps.find((a) => a.name.trim().toLowerCase() === norm)?.id;
  })();

  return (
    <div className="container">
      <BoardNav />

      <div className="cal-header">
        <button type="button" className="board-docs-link" onClick={onBack}>
          ← Danh sách plan
        </button>
        <strong className="cal-title">Sửa plan tuần</strong>
        <div className="plan-toolbar">
          <button type="button" className="primary" onClick={save} disabled={!dirty}>
            {dirty ? '💾 Lưu' : '✓ Đã lưu'}
          </button>
          <button type="button" onClick={() => exportHtml('detailed')}>
            ⬇ Export bản chi tiết
          </button>
          <button type="button" onClick={() => exportHtml('release')}>
            ⬇ Export bản release/test
          </button>
        </div>
      </div>

      {/* Thông tin chung */}
      <section className="plan-block">
        <div className="task-form">
          <label className="task-field task-field-wide">
            <span>Tiêu đề</span>
            <input value={form.title} onChange={(e) => patch({ title: e.target.value })} />
          </label>
          <label className="task-field">
            <span>Tuần bắt đầu</span>
            <input
              type="date"
              value={form.weekStart}
              onChange={(e) => patch({ weekStart: e.target.value })}
            />
          </label>
          <label className="task-field">
            <span>Tuần kết thúc</span>
            <input
              type="date"
              value={form.weekEnd}
              onChange={(e) => patch({ weekEnd: e.target.value })}
            />
          </label>
          <label className="task-field task-field-wide">
            <span>Mô tả</span>
            <textarea
              className="md-textarea plan-desc"
              value={form.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </label>
        </div>
      </section>

      {/* Danh sách project */}
      <h2 className="chart-title">Dự án ({form.projects.length})</h2>
      {form.projects.map((p, pi) => (
        <section key={pi} className="plan-block plan-project">
          <div className="plan-row">
            <input
              className="plan-project-name"
              value={p.name}
              onChange={(e) => setProject(pi, { name: e.target.value })}
              placeholder="Tên dự án"
            />
            <select
              className="plan-project-app"
              value={p.appId ?? ''}
              title="Gắn app cho dự án (để dialog Chọn task trỏ đúng app)"
              onChange={(e) => setProject(pi, { appId: e.target.value || undefined })}
            >
              <option value="">🔗 (chưa gắn app)</option>
              {p.appId && !apps.some((a) => a.id === p.appId) && (
                <option value={p.appId}>(app không tồn tại)</option>
              )}
              {apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.platform}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="doc-action danger"
              title="Xóa dự án"
              onClick={() => removeProject(pi)}
            >
              🗑️
            </button>
          </div>

          {!p.appId &&
            (() => {
              const sug = suggestAppId(p.name);
              const app = sug ? apps.find((a) => a.id === sug) : null;
              return app ? (
                <button
                  type="button"
                  className="plan-app-suggest"
                  onClick={() => setProject(pi, { appId: app.id })}
                >
                  🔗 Gợi ý gắn: {app.name} · {app.platform}
                </button>
              ) : null;
            })()}

          {p.workstreams.map((w, wi) => (
            <div key={wi} className="plan-workstream">
              <div className="plan-row">
                <input
                  className="plan-ws-title"
                  value={w.title}
                  onChange={(e) => setWorkstream(pi, wi, { title: e.target.value })}
                  placeholder="Tiêu đề nhánh (VD: Android)"
                />
                <select
                  value={w.category}
                  onChange={(e) => setWorkstream(pi, wi, { category: e.target.value })}
                >
                  {catOptions.map((c) => (
                    <option key={c} value={c}>
                      {catMeta(c).label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="doc-action"
                  title="Thêm loại nhánh mới"
                  onClick={() => addCategory(pi, wi)}
                >
                  ＋
                </button>
                <button
                  type="button"
                  className="doc-action danger"
                  title="Xóa nhánh"
                  onClick={() => removeWorkstream(pi, wi)}
                >
                  ✖
                </button>
              </div>

              <textarea
                className="md-textarea plan-items"
                value={w.items.join('\n')}
                onChange={(e) =>
                  setWorkstream(pi, wi, { items: e.target.value.split('\n') })
                }
                placeholder="Mỗi dòng là 1 đầu việc"
              />

              <label className="plan-milestone-toggle">
                <input
                  type="checkbox"
                  checked={!!w.milestone}
                  onChange={(e) => toggleMilestone(pi, wi, e.target.checked)}
                />
                Có milestone
              </label>
              {w.milestone && (
                <div className="plan-row">
                  <select
                    value={w.milestone.type}
                    onChange={(e) =>
                      setWorkstream(pi, wi, {
                        milestone: {
                          type: e.target.value as 'release' | 'test',
                          text: w.milestone!.text,
                        },
                      })
                    }
                  >
                    <option value="release">Release</option>
                    <option value="test">Test/Fix</option>
                  </select>
                  <input
                    className="plan-ms-text"
                    value={w.milestone.text}
                    onChange={(e) =>
                      setWorkstream(pi, wi, {
                        milestone: { type: w.milestone!.type, text: e.target.value },
                      })
                    }
                    placeholder="VD: Build release v1.60"
                  />
                </div>
              )}
            </div>
          ))}

          <div className="plan-add-actions">
            <button
              type="button"
              className="plan-add-btn primary"
              onClick={() => setPickerFor(pi)}
            >
              ＋ Thêm nhánh từ task
            </button>
            <button type="button" className="plan-add-btn" onClick={() => addWorkstream(pi)}>
              ＋ Thêm nhánh trắng
            </button>
          </div>
        </section>
      ))}

      <div className="plan-add-project">
        <select
          value={addAppSel}
          onChange={(e) => {
            if (e.target.value) {
              addProjectFromApp(e.target.value);
              setAddAppSel('');
            }
          }}
        >
          <option value="">＋ Thêm dự án từ app…</option>
          {apps.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {a.platform}
            </option>
          ))}
        </select>
        <button type="button" className="plan-add-btn" onClick={addProject}>
          ＋ Dự án nhập tay
        </button>
      </div>

      {/* Timeline release */}
      <h2 className="chart-title">Timeline release ({form.timeline.length})</h2>
      <section className="plan-block">
        {form.timeline.map((t, ti) => (
          <div key={ti} className="plan-row">
            <input
              className="plan-tl-day"
              value={t.day}
              onChange={(e) =>
                setTimeline(
                  form.timeline.map((x, i) =>
                    i === ti ? { ...x, day: e.target.value } : x,
                  ),
                )
              }
              placeholder="Thứ 3"
            />
            <input
              className="plan-tl-rel"
              value={t.release}
              onChange={(e) =>
                setTimeline(
                  form.timeline.map((x, i) =>
                    i === ti ? { ...x, release: e.target.value } : x,
                  ),
                )
              }
              placeholder="VD: Music2 v1.60"
            />
            <button
              type="button"
              className="doc-action danger"
              title="Xóa dòng"
              onClick={() => setTimeline(form.timeline.filter((_, i) => i !== ti))}
            >
              ✖
            </button>
          </div>
        ))}
        <button
          type="button"
          className="plan-add-btn"
          onClick={() => setTimeline([...form.timeline, { day: '', release: '' }])}
        >
          ＋ Thêm dòng timeline
        </button>
      </section>

      {pickerFor !== null && (
        <TaskPickerDialog
          apps={apps}
          tasks={tasks}
          initialAppId={pickerAppId}
          onConfirm={(ws) => {
            addWorkstreamsFromTasks(pickerFor, ws);
            setPickerFor(null);
          }}
          onClose={() => setPickerFor(null)}
        />
      )}
    </div>
  );
}
