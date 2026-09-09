import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { usePm, useReleaseKeys } from '../context/PmContext';
import { useDocuments } from '../context/DocumentsContext';
import { useUploadDocuments } from '../hooks/useUploadDocuments';
import { useSeededForm } from '../hooks/useSeededForm';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';
import BoardNav from '../components/board/BoardNav';
import {
  catMeta,
  msKeyFromLabel,
  sortTimeline,
  type PlanProject,
  type PlanTimelineItem,
  type PlanWorkstream,
  type WeeklyPlan,
} from '../pmTypes';
import { buildDetailedHtml, buildReleaseTestHtml } from '../lib/planExport';
import { normName, suggestAppId } from '../lib/pmText';
import { isoLocal, weekdayVN } from '../lib/pmDates';
import { matchTimelineRow, reconcileTimeline, tokensOf } from '../lib/planProgress';
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

export default function BoardPlanEditPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { plans, apps, tasks, meta, loading, updatePlan, addMilestoneType, addPlanCategory } =
    usePm();
  const releaseKeys = useReleaseKeys();
  const plan = plans.find((p) => p.id === id);

  const { form, dirty, setDirty, patch } = useSeededForm<PlanForm, WeeklyPlan>(
    plan,
    toForm,
  );
  useUnsavedGuard(dirty);
  // Chỉ số dự án đang mở dialog chọn task (null = đóng).
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  // Giá trị select "thêm dự án từ app" (reset về '' sau mỗi lần chọn).
  const [addAppSel, setAddAppSel] = useState('');
  // Chỉ số dự án đang MỞ thân (nhánh/milestone); mặc định thu gọn hết (như Báo cáo ngày).
  // Reset khi chuyển sang plan khác.
  const [openProjects, setOpenProjects] = useState<Set<number>>(new Set());
  useEffect(() => setOpenProjects(new Set()), [id]);
  const toggleOpen = (pi: number) =>
    setOpenProjects((prev) => {
      const next = new Set(prev);
      if (next.has(pi)) next.delete(pi);
      else next.add(pi);
      return next;
    });

  // ----- Hook cho upload file export vào quản lý tài liệu -----
  // LƯU Ý: phải đặt TRƯỚC mọi early return bên dưới (Rules of Hooks — bài học 27/07).
  const { folders, addFolder, loading: docsLoading } = useDocuments();
  const { commitItems } = useUploadDocuments();
  // Cache id folder vừa tạo trong phiên: export 2 bản liên tiếp trước khi onValue
  // dội folder mới về sẽ không tạo folder trùng.
  const createdFolders = useRef<Record<string, string>>({});

  // Reconcile timeline theo task nguồn 1 LẦN mỗi khi mở plan (data cũ có thể lệch
  // từ trước khi có sync task→timeline). Chỉ plan tuần hiện tại/tương lai; kết quả
  // chỉ đổi form + đánh dấu "chưa lưu" — bấm Lưu mới ghi DB.
  const reconciled = useRef<string | null>(null);
  useEffect(() => {
    if (!form || loading || reconciled.current === id) return;
    reconciled.current = id;
    if (form.weekEnd < isoLocal(new Date())) return; // plan quá khứ: giữ lịch sử
    const fixed = reconcileTimeline(form, tasks, apps, releaseKeys);
    if (fixed) patch({ timeline: fixed });
  }, [form, loading, id, tasks, apps, releaseKeys, patch]);

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
  const patchProjects = (projects: PlanProject[]) => patch({ projects });

  const setProject = (pi: number, u: Partial<PlanProject>) =>
    patchProjects(form.projects.map((p, i) => (i === pi ? { ...p, ...u } : p)));
  const setWorkstream = (pi: number, wi: number, u: Partial<PlanWorkstream>) =>
    setProject(pi, {
      workstreams: form.projects[pi].workstreams.map((w, i) =>
        i === wi ? { ...w, ...u } : w,
      ),
    });

  // Dự án mới append cuối → tự MỞ để nhập được ngay.
  const openNewProject = () =>
    setOpenProjects((prev) => new Set([...prev, form.projects.length]));
  const addProject = () => {
    patchProjects([...form.projects, { name: 'Dự án mới', workstreams: [] }]);
    openNewProject();
  };
  // Thêm dự án gắn với 1 app có sẵn (để chọn task khi thêm nhánh).
  const addProjectFromApp = (appId: string) => {
    const app = apps.find((a) => a.id === appId);
    if (!app) return;
    patchProjects([...form.projects, { name: app.name, appId: app.id, workstreams: [] }]);
    openNewProject();
  };
  const removeProject = (pi: number) => {
    patchProjects(form.projects.filter((_, i) => i !== pi));
    // Dồn chỉ số mở phía sau xuống 1 để không lệch sang dự án khác.
    setOpenProjects(
      (prev) => new Set([...prev].filter((i) => i !== pi).map((i) => (i > pi ? i - 1 : i))),
    );
  };
  // Đổi chỗ 2 dự án (kéo lên/xuống) — trạng thái mở đi theo dự án.
  const moveProject = (pi: number, dir: -1 | 1) => {
    const to = pi + dir;
    if (to < 0 || to >= form.projects.length) return;
    const next = [...form.projects];
    [next[pi], next[to]] = [next[to], next[pi]];
    patchProjects(next);
    setOpenProjects(
      (prev) => new Set([...prev].map((i) => (i === pi ? to : i === to ? pi : i))),
    );
  };

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

  const setTimeline = (list: PlanForm['timeline']) => patch({ timeline: list });

  // ----- Tự cập nhật Timeline khi nhánh trở thành release -----
  // Timeline đã có dòng nói về app này chưa?
  // - version đã biết: dòng đúng version HOẶC dòng chưa có version đều tính là "đã có"
  //   (matchTimelineRow — dòng trần sẽ được reconcile nâng cấp, KHÔNG thêm dòng mới);
  // - version chưa biết: BẤT KỲ dòng nào của app cũng tính (không thêm dòng trần
  //   khi app đã có mốc trong timeline).
  const hasTimelineFor = (
    list: PlanTimelineItem[],
    appName: string,
    version: string,
  ): boolean =>
    list.some((x) =>
      version
        ? matchTimelineRow(x.release, appName, version)
        : tokensOf(appName).every((k) => normName(x.release).includes(k)),
    );
  // Parse version từ text milestone ("Build release v1.60" → "v1.60").
  const versionOf = (text: string): string =>
    (text.match(/v[0-9][\w.]*/i)?.[0] ?? '').replace(/\.$/, '');
  // Thêm dòng mới rồi sort cả danh sách theo dòng thời gian (dòng sẵn có đang lệch
  // thứ tự cũng được đưa về đúng vị trí luôn).
  const pushTimeline = (additions: PlanTimelineItem[]) => {
    if (additions.length === 0) return;
    setTimeline(sortTimeline([...form.timeline, ...additions]));
  };

  // Nhánh thêm từ dialog chọn task → thêm dòng timeline "Thứ x — App vX" CHỈ khi
  // nhánh có milestone loại Release; task có planDate trong tuần → điền đúng thứ.
  const addTimelineFromTasks = (ws: PlanWorkstream[]) => {
    const additions: PlanTimelineItem[] = [];
    for (const w of ws) {
      if (!w.milestone || !releaseKeys.has(w.milestone.type)) continue;
      for (const tid of w.sourceTaskIds ?? []) {
        const t = tasks.find((x) => x.id === tid);
        if (!t) continue;
        const appName = apps.find((a) => a.id === t.appId)?.name ?? '';
        const release = `${appName} ${t.version ?? ''}`.trim();
        if (!release) continue;
        if (
          hasTimelineFor(
            [...form.timeline, ...additions],
            appName || release,
            t.version ?? '',
          )
        )
          continue;
        const inWeek =
          !!t.planDate && form.weekStart <= t.planDate && t.planDate <= form.weekEnd;
        additions.push({ day: inWeek ? weekdayVN(t.planDate!) : '', release });
      }
    }
    pushTimeline(additions);
  };

  // Nhánh vừa TRỞ THÀNH release trong editor (bật milestone / đổi loại milestone)
  // → đảm bảo timeline có dòng của app đó (thứ để trống cho user điền; đã có thì thôi).
  // forceRelease: loại milestone mới thêm inline chưa kịp có trong releaseKeys.
  const ensureTimelineForRelease = (
    pi: number,
    ms: { type: string; text: string },
    forceRelease = false,
  ) => {
    if (!forceRelease && !releaseKeys.has(ms.type)) return;
    const pr = form.projects[pi];
    const appName = (apps.find((a) => a.id === pr.appId)?.name ?? pr.name).trim();
    if (!appName) return;
    const version = versionOf(ms.text);
    if (hasTimelineFor(form.timeline, appName, version)) return;
    pushTimeline([{ day: '', release: `${appName} ${version}`.trim() }]);
  };

  // Nhánh KHÔNG còn là release (tắt milestone / đổi sang loại khác) → gỡ dòng timeline
  // đã auto-add cho mốc đó. Giữ dòng nếu app vẫn còn nhánh release khác cùng mốc
  // (cùng version, hoặc 1 trong 2 chưa có version — không đoán được thì không xóa nhầm).
  const removeTimelineForRelease = (
    pi: number,
    wi: number,
    prev: { type: string; text: string },
  ) => {
    if (!releaseKeys.has(prev.type)) return; // trước đó không phải release → không có dòng để gỡ
    const pr = form.projects[pi];
    const appName = (apps.find((a) => a.id === pr.appId)?.name ?? pr.name).trim();
    if (!appName) return;
    const version = versionOf(prev.text);
    const stillRelease = form.projects.some((p2, pj) =>
      (p2.workstreams ?? []).some((w2, wj) => {
        if (pj === pi && wj === wi) return false;
        if (!w2.milestone || !releaseKeys.has(w2.milestone.type)) return false;
        const app2 = (apps.find((a) => a.id === p2.appId)?.name ?? p2.name).trim();
        if (normName(app2) !== normName(appName)) return false;
        const v2 = versionOf(w2.milestone.text);
        return !version || !v2 || normName(v2) === normName(version);
      }),
    );
    if (stillRelease) return;
    const i = form.timeline.findIndex((x) => matchTimelineRow(x.release, appName, version));
    if (i >= 0) setTimeline(form.timeline.filter((_, xi) => xi !== i));
  };

  const toggleMilestone = (pi: number, wi: number, on: boolean) => {
    const prev = form.projects[pi].workstreams[wi].milestone;
    const ms = { type: 'release', text: 'Build release v…' };
    setWorkstream(pi, wi, { milestone: on ? ms : undefined });
    // Bật milestone (mặc định loại release) → tự thêm dòng timeline cho app;
    // tắt milestone của nhánh release → gỡ dòng timeline tương ứng.
    if (on) ensureTimelineForRelease(pi, ms);
    else if (prev) removeTimelineForRelease(pi, wi, prev);
  };

  // ----- Lưu / Export -----
  const save = () => {
    updatePlan(id, form);
    setDirty(false);
  };

  // ----- Upload file export vào quản lý tài liệu (hook đã khai báo ở đầu component) -----
  const PLAN_FOLDER = 'THSOFT - Weekly Plan';
  const TESTER_SUBFOLDER = 'Tester';
  // Tìm-hoặc-tạo folder theo tên (không phân biệt hoa/thường) trong đúng cấp cha.
  const ensureFolder = (name: string, parentId?: string): string | null => {
    const key = `${parentId ?? ''}:${name.toLowerCase()}`;
    const cached = createdFolders.current[key];
    if (cached) return cached;
    // Trùng tên (đã lỡ tạo bản sao) → luôn lấy folder TẠO SỚM NHẤT để mọi lần
    // export đổ về đúng folder gốc, không nhảy qua lại giữa các bản sao.
    const matches = folders
      .filter(
        (f) =>
          f.name.trim().toLowerCase() === name.toLowerCase() &&
          (f.parentId ?? '') === (parentId ?? ''),
      )
      .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
    if (matches.length > 0) return matches[0].id;
    const created = addFolder(name, parentId);
    if (created) createdFolders.current[key] = created.id;
    return created?.id ?? null;
  };

  // 'yyyy-mm-dd' → 'MM-DD' / 'MM-DD-YYYY' (format tên file export).
  const mmdd = (iso: string) => iso.slice(5);
  const mmddyyyy = (iso: string) => `${iso.slice(5)}-${iso.slice(0, 4)}`;

  // Export = upload thẳng vào quản lý tài liệu (KHÔNG tải file — cần file .html
  // thì dùng nút download bên trang documents): bản chi tiết → folder
  // "THSOFT - Weekly Plan", bản release/test → sub-folder "Tester". Trùng tên
  // (re-export cùng tuần) → commitItems hỏi thay thế: OK = ghi đè giữ id
  // (share link cũ vẫn sống).
  const exportHtml = (kind: 'detailed' | 'release') => {
    // Chưa tải xong danh sách tài liệu/folder thì KHÔNG export: lúc đó folders và
    // documents còn rỗng, ensureFolder sẽ tạo folder trùng tên và commitItems tạo
    // file mới thay vì hỏi ghi đè — bản export cũ nằm lại folder khác.
    if (docsLoading) {
      window.alert('Đang tải danh sách tài liệu — thử lại sau giây lát.');
      return;
    }
    if (dirty) save();
    const full: WeeklyPlan = { ...plan, ...form };
    const html =
      kind === 'detailed'
        ? buildDetailedHtml(full, releaseKeys, tasks)
        : buildReleaseTestHtml(full, releaseKeys);
    const base = fileBase(
      kind === 'detailed'
        ? `mobile_team_weekly_plan_${mmdd(form.weekStart)}_to_${mmddyyyy(form.weekEnd)}`
        : `plan_team_mobile_release_test_${mmdd(form.weekStart)}_to_${mmddyyyy(form.weekEnd)}`,
    );
    const rootId = ensureFolder(PLAN_FOLDER);
    const folderId =
      rootId && kind === 'release' ? ensureFolder(TESTER_SUBFOLDER, rootId) : rootId;
    if (!folderId) {
      window.alert('Không upload được tài liệu (thiếu cấu hình Firebase hoặc lỗi tạo folder).');
      return;
    }
    const res = commitItems([{ type: 'html', title: base, content: html }], folderId);
    const dest = kind === 'release' ? `${PLAN_FOLDER} / ${TESTER_SUBFOLDER}` : PLAN_FOLDER;
    if (res.created > 0) window.alert(`Đã upload tài liệu "${base}" vào "${dest}".`);
    else if (res.replaced > 0)
      window.alert(`Đã cập nhật tài liệu "${base}" trong "${dest}".`);
    else window.alert('Bỏ qua — giữ nguyên tài liệu cũ, không ghi đè.');
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

  // Danh sách loại nhánh cho dropdown: danh mục (meta.planCategories) + loại đang có trong plan.
  const usedCats = form.projects.flatMap((p) => p.workstreams.map((w) => w.category));
  const catOptions = [...new Set([...meta.planCategories, ...usedCats])].filter(Boolean);

  // Thêm loại nhánh mới vào DANH MỤC (lưu bền) rồi gán ngay cho nhánh hiện tại.
  const addCategory = (pi: number, wi: number) => {
    const name = window.prompt('Tên loại nhánh mới (VD: Research, QA…):')?.trim();
    if (!name) return;
    addPlanCategory(name);
    setWorkstream(pi, wi, { category: name });
  };

  // Thêm loại milestone mới vào danh mục rồi gán ngay cho milestone hiện tại.
  const addMilestoneTypeInline = (pi: number, wi: number) => {
    const label = window.prompt('Tên loại milestone mới (VD: Beta, Submit store…):')?.trim();
    if (!label) return;
    const isRelease = window.confirm('Loại này có tính là RELEASE không? (OK = có, Cancel = không)');
    const key = msKeyFromLabel(label, meta.milestoneTypes.length);
    addMilestoneType(label, isRelease);
    const ms = {
      type: key,
      text: form.projects[pi].workstreams[wi].milestone?.text ?? '',
    };
    setWorkstream(pi, wi, { milestone: ms });
    // Loại mới là release (meta chưa kịp dội về releaseKeys) → thêm dòng timeline luôn.
    if (isRelease) ensureTimelineForRelease(pi, ms, true);
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
          <button
            type="button"
            onClick={() => exportHtml('detailed')}
            disabled={docsLoading}
            title={docsLoading ? 'Đang tải danh sách tài liệu…' : undefined}
          >
            {docsLoading ? '⏳ Đang tải tài liệu…' : '⬇ Export bản chi tiết'}
          </button>
          <button
            type="button"
            onClick={() => exportHtml('release')}
            disabled={docsLoading}
            title={docsLoading ? 'Đang tải danh sách tài liệu…' : undefined}
          >
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
      <h2 className="chart-title plan-projects-head">
        Dự án ({form.projects.length})
        {form.projects.length > 0 && (
          <button
            type="button"
            className="doc-action"
            onClick={() =>
              setOpenProjects(
                openProjects.size >= form.projects.length
                  ? new Set()
                  : new Set(form.projects.map((_, i) => i)),
              )
            }
          >
            {openProjects.size >= form.projects.length
              ? '🗕 Thu gọn tất cả'
              : '⛶ Mở tất cả'}
          </button>
        )}
      </h2>
      {form.projects.map((p, pi) => {
        const open = openProjects.has(pi);
        return (
        <section
          key={pi}
          className={`plan-block plan-project${open ? ' report-project-expanded' : ''}`}
        >
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
              className="doc-action"
              title={open ? 'Thu gọn dự án' : 'Mở rộng dự án'}
              onClick={() => toggleOpen(pi)}
            >
              {open ? '🗕' : '⛶'}
            </button>
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

          {/* Thu gọn: chỉ hiện tóm tắt các nhánh bên trong. */}
          {!open && (
            <p className="muted plan-proj-summary">
              {p.workstreams.length} nhánh
              {p.workstreams.length > 0 &&
                ': ' +
                  p.workstreams.map((w) => w.title || '(chưa đặt tên)').join(' · ')}
            </p>
          )}

          {open && !p.appId &&
            (() => {
              const sug = suggestAppId(p.name, apps);
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

          {open && p.workstreams.map((w, wi) => (
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
                    onChange={(e) => {
                      const prev = w.milestone!;
                      const ms = { type: e.target.value, text: prev.text };
                      setWorkstream(pi, wi, { milestone: ms });
                      // Đổi sang loại release → tự thêm dòng timeline cho app;
                      // release → loại khác → gỡ dòng timeline đã auto-add.
                      if (releaseKeys.has(ms.type)) ensureTimelineForRelease(pi, ms);
                      else removeTimelineForRelease(pi, wi, prev);
                    }}
                  >
                    {meta.milestoneTypes.map((mt) => (
                      <option key={mt.key} value={mt.key}>
                        {mt.label}
                        {mt.isRelease ? ' ⭐' : ''}
                      </option>
                    ))}
                    {/* Giữ giá trị lạ (loại đã bị xóa khỏi danh mục) để không mất. */}
                    {!meta.milestoneTypes.some((mt) => mt.key === w.milestone!.type) && (
                      <option value={w.milestone.type}>{w.milestone.type}</option>
                    )}
                  </select>
                  <button
                    type="button"
                    className="doc-action"
                    title="Thêm loại milestone mới"
                    onClick={() => addMilestoneTypeInline(pi, wi)}
                  >
                    ＋
                  </button>
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

          {open && (
            <div className="plan-add-actions">
              <button
                type="button"
                className="plan-add-btn primary"
                onClick={() => setPickerFor(pi)}
              >
                ＋ Thêm nhánh từ task
              </button>
              <button
                type="button"
                className="plan-add-btn"
                onClick={() => addWorkstream(pi)}
              >
                ＋ Thêm nhánh trắng
              </button>
            </div>
          )}
        </section>
        );
      })}

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
              onBlur={() => {
                // Rời ô Thứ → đưa dòng về đúng vị trí dòng thời gian
                // (không sort mỗi phím gõ để dòng không nhảy khi đang nhập).
                const sorted = sortTimeline(form.timeline);
                if (JSON.stringify(sorted) !== JSON.stringify(form.timeline))
                  setTimeline(sorted);
              }}
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
          week={{ start: form.weekStart, end: form.weekEnd }}
          onConfirm={(ws) => {
            addWorkstreamsFromTasks(pickerFor, ws);
            // Task release có lịch trong tuần → tự cập nhật timeline release.
            addTimelineFromTasks(ws);
            setPickerFor(null);
          }}
          onClose={() => setPickerFor(null)}
        />
      )}
    </div>
  );
}
