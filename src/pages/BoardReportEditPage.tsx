import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { usePm } from '../context/PmContext';
import BoardNav from '../components/board/BoardNav';
import ReportPreview from '../components/board/ReportPreview';
import { buildReportText } from '../lib/reportFormat';
import { downloadTextFile } from '../lib/downloadHelpers';
import type { DailyReport, ReportProject } from '../pmTypes';

type ReportForm = Omit<DailyReport, 'id' | 'order' | 'createdAt' | 'updatedAt'>;

function toForm(r: DailyReport): ReportForm {
  return {
    title: r.title,
    date: r.date,
    projects: r.projects ?? [],
  };
}

// Chuẩn hóa tên để so khớp gợi ý app (thường hóa, bỏ khoảng trắng & ký tự đặc biệt).
function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export default function BoardReportEditPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { reports, apps, loading, updateReport } = usePm();
  const report = reports.find((r) => r.id === id);

  const [form, setForm] = useState<ReportForm | null>(null);
  const [dirty, setDirty] = useState(false);
  const [copied, setCopied] = useState(false);
  const seeded = useRef<string | null>(null);

  useEffect(() => {
    if (report && seeded.current !== report.id) {
      seeded.current = report.id;
      setForm(toForm(report));
      setDirty(false);
    }
  }, [report]);

  // Cảnh báo khi rời/tải lại trang lúc còn thay đổi chưa lưu.
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
  if (!report || !form) {
    return (
      <div className="container">
        <BoardNav />
        <p className="muted empty">Không tìm thấy báo cáo này.</p>
        <Link to="/board/report" className="board-docs-link">
          ← Danh sách báo cáo
        </Link>
      </div>
    );
  }

  // ----- Cập nhật bất biến -----
  const patch = (u: Partial<ReportForm>) => {
    setForm((f) => (f ? { ...f, ...u } : f));
    setDirty(true);
  };
  const patchProjects = (projects: ReportProject[]) => patch({ projects });
  const setProject = (pi: number, u: Partial<ReportProject>) =>
    patchProjects(form.projects.map((p, i) => (i === pi ? { ...p, ...u } : p)));

  const addProject = () =>
    patchProjects([...form.projects, { name: 'Dự án mới', body: '' }]);
  const addProjectFromApp = (appId: string) => {
    const app = apps.find((a) => a.id === appId);
    if (!app) return;
    patchProjects([...form.projects, { name: app.name, appId: app.id, body: '' }]);
  };
  const removeProject = (pi: number) =>
    patchProjects(form.projects.filter((_, i) => i !== pi));
  // Đổi chỗ 2 dự án (kéo lên/xuống).
  const moveProject = (pi: number, dir: -1 | 1) => {
    const to = pi + dir;
    if (to < 0 || to >= form.projects.length) return;
    const next = [...form.projects];
    [next[pi], next[to]] = [next[to], next[pi]];
    patchProjects(next);
  };

  // ----- Lưu / Back / Copy / Export -----
  const save = () => {
    updateReport(id, form);
    setDirty(false);
  };
  const onBack = () => {
    if (dirty) {
      const doSave = window.confirm(
        'Có thay đổi chưa lưu.\nOK để LƯU rồi rời đi, Cancel để rời mà KHÔNG lưu.',
      );
      if (doSave) save();
    }
    navigate('/board/report');
  };

  const full: DailyReport = { ...report, ...form };
  const onCopy = async () => {
    if (dirty) save();
    try {
      await navigator.clipboard.writeText(buildReportText(full));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Trình duyệt chặn clipboard → xuất file thay thế.
      onExport();
    }
  };
  const onExport = () => {
    if (dirty) save();
    downloadTextFile(`report_${form.date}.txt`, buildReportText(full), 'text/plain');
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

  return (
    <div className="container">
      <BoardNav />

      <div className="cal-header">
        <button type="button" className="board-docs-link" onClick={onBack}>
          ← Danh sách báo cáo
        </button>
        <strong className="cal-title">Sửa báo cáo ngày</strong>
        <div className="plan-toolbar">
          <button type="button" className="primary" onClick={save} disabled={!dirty}>
            {dirty ? '💾 Lưu' : '✓ Đã lưu'}
          </button>
          <button type="button" onClick={onCopy}>
            {copied ? '✓ Đã copy' : '📋 Copy text'}
          </button>
          <button type="button" onClick={onExport}>
            ⬇ Export .txt
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
            <span>Ngày</span>
            <input
              type="date"
              value={form.date}
              onChange={(e) => patch({ date: e.target.value })}
            />
          </label>
        </div>
        <p className="muted report-hint">
          Mỗi dòng bắt đầu bằng: <code>#</code> nhánh · <code>-</code> đầu việc ·{' '}
          <code>-&gt;</code> kết quả/mốc · <code>+</code> mục con.
        </p>
      </section>

      {/* Danh sách dự án */}
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
              title="Gắn app cho dự án (tùy chọn)"
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
              className="doc-action"
              title="Lên"
              disabled={pi === 0}
              onClick={() => moveProject(pi, -1)}
            >
              ▲
            </button>
            <button
              type="button"
              className="doc-action"
              title="Xuống"
              disabled={pi === form.projects.length - 1}
              onClick={() => moveProject(pi, 1)}
            >
              ▼
            </button>
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

          <textarea
            className="md-textarea report-body"
            value={p.body}
            onChange={(e) => setProject(pi, { body: e.target.value })}
            placeholder={'# Android:\n- Nội dung công việc\n-> Kết quả / mốc\n+ Mục con'}
          />
        </section>
      ))}

      <div className="plan-add-project">
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) addProjectFromApp(e.target.value);
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

      {/* Xem trước */}
      <h2 className="chart-title">Xem trước</h2>
      <section className="plan-block report-preview-panel">
        <ReportPreview report={full} />
      </section>
    </div>
  );
}
