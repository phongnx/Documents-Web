import { useTheme } from '../context/ThemeContext';

// Nút bật/tắt giao diện sáng ↔ tối. Hiện 🌙 khi đang sáng (bấm để sang tối)
// và ☀️ khi đang tối (bấm để về sáng).
export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
      title={isDark ? 'Giao diện sáng' : 'Giao diện tối'}
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  );
}
