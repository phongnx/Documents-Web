import { useTheme } from '../context/ThemeContext';
import { IcMoon, IcSun } from './board/ksumIcons';

// Nút bật/tắt giao diện sáng ↔ tối. Hiện 🌙 khi đang sáng (bấm để sang tối)
// và ☀️ khi đang tối (bấm để về sáng).
// `className` (tùy chọn): trang đã redesign truyền class nút icon riêng → hiện icon SVG
// thay emoji; không truyền thì giữ nguyên nút cũ ở mọi trang khác.
export default function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className={className ?? 'theme-toggle'}
      onClick={toggleTheme}
      aria-label={isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
      title={isDark ? 'Giao diện sáng' : 'Giao diện tối'}
    >
      {!className ? (isDark ? '☀️' : '🌙') : isDark ? <IcSun size={20} /> : <IcMoon size={20} />}
    </button>
  );
}
