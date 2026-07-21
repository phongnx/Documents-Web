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

// Khu vực cần đăng nhập.
function AppShell() {
  const { user, loading } = useAuth();

  if (loading) return <div className="container">Đang tải…</div>;
  if (!user) return <LoginPage />;

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
        <Route path="/board/plan/:id" element={<BoardPlanEditPage />} />
        <Route path="/board/report" element={<BoardReportListPage />} />
        <Route path="/board/report/:id" element={<BoardReportEditPage />} />
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
          {/* Mọi route còn lại đi qua lớp đăng nhập */}
          <Route path="/*" element={<AppShell />} />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  );
}
