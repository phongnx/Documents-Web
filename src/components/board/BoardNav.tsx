import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import ThemeToggle from '../ThemeToggle';
import CategoryManagerDialog from './CategoryManagerDialog';

// Thanh điều hướng dùng chung cho các trang "Bảng dự án".
export default function BoardNav() {
  const [catOpen, setCatOpen] = useState(false);
  return (
    <header className="board-nav">
      <div className="board-nav-left">
        <span className="board-brand">📊 Bảng dự án</span>
        <nav className="board-tabs">
          <NavLink to="/board" end className={({ isActive }) => (isActive ? 'active' : '')}>
            Tổng quan
          </NavLink>
          <NavLink to="/board/report" className={({ isActive }) => (isActive ? 'active' : '')}>
            Báo cáo ngày
          </NavLink>
          <NavLink to="/board/plan" className={({ isActive }) => (isActive ? 'active' : '')}>
            Plan tuần
          </NavLink>
          <NavLink to="/board/calendar" className={({ isActive }) => (isActive ? 'active' : '')}>
            Lịch release
          </NavLink>
          <NavLink to="/board/tasks" className={({ isActive }) => (isActive ? 'active' : '')}>
            Task
          </NavLink>
          <NavLink to="/board/apps" className={({ isActive }) => (isActive ? 'active' : '')}>
            App
          </NavLink>
        </nav>
      </div>
      <div className="board-nav-right">
        <button
          type="button"
          className="board-docs-link"
          onClick={() => setCatOpen(true)}
          title="Quản lý loại task & loại milestone"
        >
          ⚙️ Danh mục
        </button>
        <Link to="/docs" className="board-docs-link">📄 Tài liệu</Link>
        <ThemeToggle />
      </div>
      {catOpen && <CategoryManagerDialog onClose={() => setCatOpen(false)} />}
    </header>
  );
}
