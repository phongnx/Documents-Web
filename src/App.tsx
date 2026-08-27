import { useEffect } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/useAuth';
import { DocumentsProvider } from './context/DocumentsContext';
import { PmProvider } from './context/PmContext';
import { ThemeProvider } from './context/ThemeContext';
import DocsAllPage from './pages/DocsAllPage';
import FolderPage from './pages/FolderPage';
import BatchUploadPage from './pages/BatchUploadPage';
import DocViewerPage from './pages/DocViewerPage';
import LoginPage from './pages/LoginPage';
import SharePage from './pages/SharePage';
import SharedFolderPage from './pages/SharedFolderPage';
import BoardOverviewPage from './pages/BoardOverviewPage';
import BoardTasksPage from './pages/BoardTasksPage';
import BoardAppTasksPage from './pages/BoardAppTasksPage';
import BoardCalendarPage from './pages/BoardCalendarPage';
import BoardAppsPage from './pages/BoardAppsPage';
import BoardPlanListPage from './pages/BoardPlanListPage';
import BoardPlanEditPage from './pages/BoardPlanEditPage';
import BoardReportListPage from './pages/BoardReportListPage';
import BoardReportEditPage from './pages/BoardReportEditPage';
import BoardKpiListPage from './pages/BoardKpiListPage';
import BoardKpiMemberPage from './pages/BoardKpiMemberPage';
import BoardKpiSummaryPage from './pages/BoardKpiSummaryPage';
import KpiSummarySharePage from './pages/KpiSummarySharePage';
import BoardEstimateListPage from './pages/BoardEstimateListPage';
import BoardEstimateEditPage from './pages/BoardEstimateEditPage';
import KpiSharePage from './pages/KpiSharePage';
import EstimateSharePage from './pages/EstimateSharePage';

// Layout bọc các trang tài liệu bằng DocumentsProvider.
function DocsLayout() {
  return (
    <DocumentsProvider>
      <Outlet />
    </DocumentsProvider>
  );
}

// Đổi favicon + tiêu đề tab theo href cho trước.
function setFavicon(href: string, title: string) {
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = 'image/svg+xml';
  link.href = href;
  document.title = title;
}

// Layout bọc các trang "Bảng dự án" bằng PmProvider (giữ 1 provider xuyên các route).
// CỐ Ý KHÔNG bọc DocumentsProvider ở đây: nó onValue toàn bộ users/{uid}/documents
// (gồm cả trường content — vài MB) trong khi chỉ trang sửa plan tuần cần tài liệu;
// bọc cả khu khiến mọi trang board (KPI, task, lịch…) phải chờ tải thừa vài MB.
function BoardLayout() {
  // Khi vào khu Bảng dự án: đổi icon/tiêu đề tab; rời đi thì trả lại mặc định.
  useEffect(() => {
    setFavicon('/favicon-board.svg', 'Bảng dự án');
    return () => setFavicon('/favicon.svg', 'Docs Web');
  }, []);

  return (
    <PmProvider>
      <Outlet />
    </PmProvider>
  );
}

// Trang sửa plan tuần là nơi DUY NHẤT trong khu Bảng dự án cần tới tài liệu
// (upload bản export vào folder + kiểm tra trùng tên) → bọc DocumentsProvider
// riêng cho nó; mọi mutation tài liệu vẫn đi qua DocumentsContext như cũ.
function PlanEditRoute() {
  return (
    <DocumentsProvider>
      <BoardPlanEditPage />
    </DocumentsProvider>
  );
}

// Khu vực cần đăng nhập.
function AppShell() {
  const { user, loading, allowed, signOutUser } = useAuth();

  if (loading) return <div className="container">Đang tải…</div>;
  if (!user) return <LoginPage />;
  // Whitelist tài khoản: chỉ uid có trong `admin/allowed` mới dùng được app.
  // Database rules đã chặn server-side — màn này là UX, tránh người lạ vào UI
  // rồi gặp permission denied khắp nơi. Routes /share/* không qua đây.
  if (allowed === null)
    return <div className="container">Đang kiểm tra quyền truy cập…</div>;
  if (!allowed)
    return (
      <div className="container">
        <h1>Không có quyền truy cập</h1>
        <p className="muted">
          Tài khoản <strong>{user.email}</strong> chưa được cấp quyền sử dụng ứng
          dụng này. Liên hệ quản trị viên nếu bạn cho rằng đây là nhầm lẫn.
        </p>
        <button type="button" className="doc-action" onClick={() => void signOutUser()}>
          Đăng xuất
        </button>
      </div>
    );

  return (
    <Routes>
      <Route element={<DocsLayout />}>
        <Route path="/" element={<Navigate to="/docs" replace />} />
        <Route path="/docs" element={<DocsAllPage />} />
        <Route path="/docs/upload" element={<BatchUploadPage />} />
        <Route path="/docs/folder/:folderId" element={<FolderPage />} />
        <Route path="/docs/view/document/:id" element={<DocViewerPage />} />
      </Route>
      <Route element={<BoardLayout />}>
        <Route path="/board" element={<BoardOverviewPage />} />
        <Route path="/board/tasks" element={<BoardTasksPage />} />
        <Route path="/board/tasks/:appId" element={<BoardAppTasksPage />} />
        <Route path="/board/calendar" element={<BoardCalendarPage />} />
        <Route path="/board/apps" element={<BoardAppsPage />} />
        <Route path="/board/plan" element={<BoardPlanListPage />} />
        <Route path="/board/plan/:id" element={<PlanEditRoute />} />
        <Route path="/board/report" element={<BoardReportListPage />} />
        <Route path="/board/report/:id" element={<BoardReportEditPage />} />
        <Route path="/board/kpi" element={<BoardKpiListPage />} />
        {/* Đặt trước :memberId — segment tĩnh "summary" được ưu tiên match. */}
        <Route path="/board/kpi/summary/:monthKey" element={<BoardKpiSummaryPage />} />
        <Route path="/board/kpi/:memberId" element={<BoardKpiMemberPage />} />
        <Route path="/board/estimates" element={<BoardEstimateListPage />} />
        <Route path="/board/estimates/:id" element={<BoardEstimateEditPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/docs" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Routes>
          {/* Trang xem công khai — NẰM NGOÀI lớp đăng nhập */}
          <Route path="/share/d/:id" element={<SharePage />} />
          {/* Chia sẻ cả folder: danh sách tài liệu + xem từng tài liệu */}
          <Route path="/share/f/:id" element={<SharedFolderPage />} />
          <Route path="/share/f/:id/:docId" element={<SharedFolderPage />} />
          {/* Trang log KPI của member — link riêng, member edit ẩn danh */}
          <Route path="/share/kpi/:token" element={<KpiSharePage />} />
          {/* Bảng break task & estimate — member tham gia mở từ trang KPI của mình */}
          <Route path="/share/est/:id" element={<EstimateSharePage />} />
          {/* Bảng tổng kết KPI tháng — share chỉ xem */}
          <Route path="/share/kpisum/:id" element={<KpiSummarySharePage />} />
          {/* Mọi route còn lại đi qua lớp đăng nhập */}
          <Route path="/*" element={<AppShell />} />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  );
}
