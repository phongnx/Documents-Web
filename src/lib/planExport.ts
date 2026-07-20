import {
  CATEGORY_META,
  type PlanWorkstream,
  type WeeklyPlan,
} from '../pmTypes';

// Sinh 2 file HTML tĩnh từ 1 WeeklyPlan, bám sát 2 template mẫu trong docs/plan.

function esc(s: string): string {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ??
      c,
  );
}

// 'yyyy-mm-dd' → 'dd/mm/yyyy' | 'dd/mm'
function dmy(iso: string): string {
  const [y, m, d] = (iso || '').split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso || '';
}
function dm(iso: string): string {
  const [, m, d] = (iso || '').split('-');
  return m && d ? `${d}/${m}` : iso || '';
}

const ROMAN = [
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
  'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX',
];
const roman = (i: number) => ROMAN[i] ?? String(i + 1);

// Có phải workstream thuộc nhóm release / test (theo category hoặc milestone).
const isRelease = (w: PlanWorkstream) =>
  w.category === 'release' || w.milestone?.type === 'release';
const isTest = (w: PlanWorkstream) =>
  w.category === 'test' || w.milestone?.type === 'test';

// ---------- Template 1: bản chi tiết (mobile_team_weekly_plan) ----------

const DETAILED_CSS = `
    :root {
      --bg: #f4f7fb;
      --card: #ffffff;
      --text: #1f2937;
      --muted: #6b7280;
      --primary: #2563eb;
      --primary-dark: #1d4ed8;
      --line: #e5e7eb;
      --tag-bg: #eff6ff;
      --tag-text: #1d4ed8;
      --release-bg: #ecfdf5;
      --release-text: #047857;
      --test-bg: #fff7ed;
      --test-text: #c2410c;
      --research-bg: #f5f3ff;
      --research-text: #6d28d9;
      --shadow: 0 10px 25px rgba(15, 23, 42, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      background: var(--bg); color: var(--text); line-height: 1.6;
    }
    .page { max-width: 1120px; margin: 0 auto; padding: 40px 24px 56px; }
    .hero {
      background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 55%, #60a5fa 100%);
      color: #ffffff; border-radius: 24px; padding: 36px 40px;
      box-shadow: var(--shadow); margin-bottom: 28px;
    }
    .hero .label {
      display: inline-block; padding: 6px 12px; border-radius: 999px;
      background: rgba(255, 255, 255, 0.16); font-size: 13px; font-weight: 600;
      letter-spacing: 0.02em; margin-bottom: 14px;
    }
    h1 { margin: 0 0 10px; font-size: 34px; line-height: 1.2; letter-spacing: -0.02em; }
    .hero p { margin: 0; color: rgba(255, 255, 255, 0.88); font-size: 16px; }
    .overview {
      display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 16px; margin-bottom: 28px;
    }
    .metric {
      background: var(--card); border: 1px solid var(--line); border-radius: 18px;
      padding: 18px 20px; box-shadow: 0 6px 14px rgba(15, 23, 42, 0.04);
    }
    .metric strong {
      display: block; font-size: 28px; line-height: 1.1; color: var(--primary); margin-bottom: 6px;
    }
    .metric span { color: var(--muted); font-size: 14px; }
    .section-title { margin: 34px 0 16px; font-size: 22px; letter-spacing: -0.01em; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
    .project-card {
      background: var(--card); border: 1px solid var(--line); border-radius: 20px;
      padding: 22px 24px; box-shadow: 0 8px 20px rgba(15, 23, 42, 0.05); break-inside: avoid;
    }
    .project-header {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
      border-bottom: 1px solid var(--line); padding-bottom: 14px; margin-bottom: 16px;
    }
    .project-title { margin: 0; font-size: 20px; color: #111827; }
    .project-index {
      flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center;
      min-width: 36px; height: 36px; border-radius: 12px; background: var(--tag-bg);
      color: var(--tag-text); font-weight: 700; font-size: 14px;
    }
    .workstream { margin-top: 16px; }
    .workstream:first-of-type { margin-top: 0; }
    .workstream-title {
      display: inline-flex; align-items: center; gap: 8px; margin: 0 0 8px;
      font-size: 15px; font-weight: 700; color: #374151;
    }
    .badge {
      display: inline-flex; align-items: center; padding: 3px 9px; border-radius: 999px;
      background: var(--tag-bg); color: var(--tag-text); font-size: 12px; font-weight: 700; white-space: nowrap;
    }
    .badge.release-badge { background: var(--release-bg); color: var(--release-text); }
    .badge.test-badge { background: var(--test-bg); color: var(--test-text); }
    .badge.research-badge { background: var(--research-bg); color: var(--research-text); }
    ul { margin: 0; padding-left: 20px; }
    li { margin: 6px 0; }
    .milestone {
      margin-top: 12px; padding: 10px 12px; border-radius: 12px; font-weight: 700;
      font-size: 14px; display: inline-flex; align-items: center; gap: 8px;
    }
    .release { background: var(--release-bg); color: var(--release-text); }
    .test { background: var(--test-bg); color: var(--test-text); }
    .summary-card {
      background: var(--card); border: 1px solid var(--line); border-radius: 20px;
      padding: 24px; box-shadow: 0 8px 20px rgba(15, 23, 42, 0.05); margin-top: 18px;
    }
    .summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
    .summary-block h3 { margin: 0 0 10px; font-size: 17px; color: #111827; }
    .summary-list { margin-top: 8px; }
    .note {
      margin-top: 18px; padding: 14px 16px; border-radius: 14px; background: #f9fafb;
      border: 1px dashed var(--line); color: var(--muted); font-size: 14px;
    }
    footer { margin-top: 36px; color: var(--muted); font-size: 13px; text-align: center; }
    @media (max-width: 860px) {
      .overview, .grid, .summary-grid { grid-template-columns: 1fr; }
      .hero { padding: 28px 24px; }
      h1 { font-size: 28px; }
    }
    @media print {
      body { background: #ffffff; }
      .page { max-width: none; padding: 24px; }
      .hero, .project-card, .metric, .summary-card { box-shadow: none; }
      .grid, .summary-grid { grid-template-columns: 1fr; }
    }`;

export function buildDetailedHtml(plan: WeeklyPlan): string {
  const projects = plan.projects ?? [];
  const allWs = projects.flatMap((p) => p.workstreams ?? []);
  const releaseCount = allWs.filter((w) => w.milestone?.type === 'release').length;
  const testCount = allWs.filter((w) => w.milestone?.type === 'test').length;
  const planCount = allWs.filter((w) => w.category === 'plan').length;

  const cards = projects
    .map((p, i) => {
      const streams = (p.workstreams ?? [])
        .map((w) => {
          const meta = CATEGORY_META[w.category] ?? CATEGORY_META.other;
          const items = (w.items ?? [])
            .filter((it) => it.trim())
            .map((it) => `            <li>${esc(it)}</li>`)
            .join('\n');
          const ms = w.milestone
            ? `\n          <div class="milestone ${w.milestone.type}">→ ${esc(w.milestone.text)}</div>`
            : '';
          return `        <div class="workstream">
          <h4 class="workstream-title">${esc(w.title)} <span class="badge ${meta.badgeClass}">${esc(meta.label)}</span></h4>
          <ul>
${items}
          </ul>${ms}
        </div>`;
        })
        .join('\n\n');
      return `      <article class="project-card">
        <div class="project-header">
          <h3 class="project-title">${esc(p.name)}</h3>
          <span class="project-index">${roman(i)}</span>
        </div>

${streams}
      </article>`;
    })
    .join('\n\n');

  const releaseSummary = projects
    .flatMap((p) =>
      (p.workstreams ?? [])
        .filter((w) => w.milestone?.type === 'release')
        .map(
          (w) =>
            `            <li><strong>${esc(p.name)} ${esc(w.title)}:</strong> ${esc(w.milestone!.text)}.</li>`,
        ),
    )
    .join('\n');
  const testSummary = projects
    .flatMap((p) =>
      (p.workstreams ?? [])
        .filter((w) => w.milestone?.type === 'test')
        .map(
          (w) =>
            `            <li><strong>${esc(p.name)} ${esc(w.title)}:</strong> ${esc(w.milestone!.text)}.</li>`,
        ),
    )
    .join('\n');

  const range = `${dm(plan.weekStart)} – ${dmy(plan.weekEnd)}`;
  const rangeFull = `${dmy(plan.weekStart)} – ${dmy(plan.weekEnd)}`;

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Weekly Plan Mobile Team - ${esc(dm(plan.weekStart))} - ${esc(dmy(plan.weekEnd))}</title>
  <style>${DETAILED_CSS}
  </style>
</head>
<body>
  <main class="page">
    <section class="hero">
      <div class="label">Mobile Team Weekly Plan</div>
      <h1>${esc(plan.title || `Kế hoạch tuần ${range}`)}</h1>
      <p>${esc(plan.description)}</p>
    </section>

    <section class="overview" aria-label="Tổng quan kế hoạch">
      <div class="metric"><strong>${projects.length}</strong><span>Nhóm dự án chính</span></div>
      <div class="metric"><strong>${releaseCount}</strong><span>Mốc build release</span></div>
      <div class="metric"><strong>${testCount}</strong><span>Nhóm có build test & fix bugs</span></div>
      <div class="metric"><strong>${planCount}</strong><span>Nhóm plan / hỗ trợ kỹ thuật</span></div>
    </section>

    <h2 class="section-title">Danh sách công việc theo dự án</h2>

    <section class="grid">
${cards}
    </section>

    <h2 class="section-title">Milestone cần theo dõi</h2>
    <section class="summary-card">
      <div class="summary-grid">
        <div class="summary-block">
          <h3>Mốc build release <span class="badge release-badge">${releaseCount}</span></h3>
          <ul class="summary-list">
${releaseSummary}
          </ul>
        </div>

        <div class="summary-block">
          <h3>Nhóm build test & fix bugs <span class="badge test-badge">${testCount}</span></h3>
          <ul class="summary-list">
${testSummary}
          </ul>
        </div>
      </div>
    </section>

    <footer>
      Mobile Team Weekly Plan · ${esc(rangeFull)}
    </footer>
  </main>
</body>
</html>
`;
}

// ---------- Template 2: bản release/test (plan_team_mobile_release_test) ----------

const RELEASE_TEST_CSS = `
    :root {
      --bg: #f5f7fb;
      --card: #ffffff;
      --text: #1f2937;
      --muted: #6b7280;
      --primary: #2563eb;
      --primary-soft: #e8f0ff;
      --border: #e5e7eb;
      --release: #16a34a;
      --test: #f59e0b;
      --timeline: #7c3aed;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 32px 16px; font-family: Arial, Helvetica, sans-serif;
      background: var(--bg); color: var(--text); line-height: 1.6;
    }
    .container { max-width: 980px; margin: 0 auto; }
    .header {
      padding: 28px 32px; margin-bottom: 24px;
      background: linear-gradient(135deg, #2563eb, #7c3aed); color: #ffffff;
      border-radius: 18px; box-shadow: 0 14px 35px rgba(37, 99, 235, 0.22);
    }
    .header h1 { margin: 0 0 8px; font-size: 30px; line-height: 1.25; }
    .header p { margin: 0; font-size: 16px; opacity: 0.92; }
    .section {
      margin-bottom: 24px; padding: 24px; background: var(--card);
      border: 1px solid var(--border); border-radius: 16px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
    }
    .section-title {
      display: flex; align-items: center; gap: 10px; margin: 0 0 20px;
      font-size: 22px; line-height: 1.3;
    }
    .badge {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 34px; height: 34px; padding: 0 10px; color: #ffffff;
      border-radius: 999px; font-size: 14px; font-weight: 700;
    }
    .badge.release { background: var(--release); }
    .badge.test { background: var(--test); }
    .badge.timeline { background: var(--timeline); }
    .workstream {
      padding: 18px 18px 16px; margin-bottom: 16px; background: #fafafa;
      border: 1px solid var(--border); border-radius: 14px;
    }
    .workstream:last-child { margin-bottom: 0; }
    .workstream h3 { margin: 0 0 8px; font-size: 18px; color: #111827; }
    .sub-title { margin: 0 0 8px; color: var(--primary); font-weight: 700; }
    ul { margin: 0; padding-left: 22px; }
    li { margin: 4px 0; }
    .timeline-list {
      display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px; padding: 0; list-style: none;
    }
    .timeline-item {
      padding: 16px; background: var(--primary-soft); border: 1px solid #dbeafe; border-radius: 14px;
    }
    .timeline-day { display: block; margin-bottom: 4px; color: var(--muted); font-size: 14px; font-weight: 700; }
    .timeline-release { display: block; color: #111827; font-size: 16px; font-weight: 700; }
    @media (max-width: 900px) { .timeline-list { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 760px) {
      body { padding: 20px 12px; }
      .header { padding: 24px 20px; }
      .header h1 { font-size: 24px; }
      .section { padding: 20px; }
      .timeline-list { grid-template-columns: 1fr; }
    }`;

// Một workstream trong bản release/test: h3 = "roman. project", sub-title = milestone/tiêu đề.
function rtWorkstream(
  projectName: string,
  w: PlanWorkstream,
  index: number,
): string {
  const sub = w.milestone?.text || w.title;
  const subLine = sub ? `        <p class="sub-title">${esc(sub)}</p>\n` : '';
  const items = (w.items ?? [])
    .filter((it) => it.trim())
    .map((it) => `          <li>${esc(it)}</li>`)
    .join('\n');
  return `      <article class="workstream">
        <h3>${roman(index)}. ${esc(projectName)}</h3>
${subLine}        <ul>
${items}
        </ul>
      </article>`;
}

export function buildReleaseTestHtml(plan: WeeklyPlan): string {
  const projects = plan.projects ?? [];
  const releaseWs: string[] = [];
  const testWs: string[] = [];
  for (const p of projects) {
    for (const w of p.workstreams ?? []) {
      if (isRelease(w)) releaseWs.push(rtWorkstream(p.name, w, releaseWs.length));
      else if (isTest(w)) testWs.push(rtWorkstream(p.name, w, testWs.length));
    }
  }

  const timeline = (plan.timeline ?? [])
    .filter((t) => t.day.trim() || t.release.trim())
    .map(
      (t) => `        <li class="timeline-item">
          <span class="timeline-day">${esc(t.day)}</span>
          <span class="timeline-release">${esc(t.release)}</span>
        </li>`,
    )
    .join('\n');

  const range = `${dm(plan.weekStart)} - ${dmy(plan.weekEnd)}`;

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Plan tuần ${esc(range)} - Team Mobile</title>
  <style>${RELEASE_TEST_CSS}
  </style>
</head>
<body>
  <main class="container">
    <header class="header">
      <h1>Plan tuần ${esc(range)} của Team Mobile</h1>
      <p>Kế hoạch build release, build test và timeline release trong tuần.</p>
    </header>

    <section class="section">
      <h2 class="section-title"><span class="badge release">1</span>Build Release</h2>
${releaseWs.join('\n\n') || '      <p>Chưa có mục release.</p>'}
    </section>

    <section class="section">
      <h2 class="section-title"><span class="badge test">2</span>Build Test</h2>
${testWs.join('\n\n') || '      <p>Chưa có mục test.</p>'}
    </section>

    <section class="section">
      <h2 class="section-title"><span class="badge timeline">3</span>Timeline Release</h2>
      <ul class="timeline-list">
${timeline || '        <li class="timeline-item"><span class="timeline-release">Chưa có timeline.</span></li>'}
      </ul>
    </section>
  </main>
</body>
</html>
`;
}
