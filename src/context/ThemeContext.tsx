import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

// Hai chế độ giao diện: sáng và tối.
type Theme = 'light' | 'dark';
const STORAGE_KEY = 'theme';

/**
 * Xác định theme khởi tạo, theo thứ tự ưu tiên:
 * 1) Thuộc tính data-theme đã được script trong index.html đặt sẵn (chống nháy sáng).
 * 2) Lựa chọn cũ lưu trong localStorage.
 * 3) Cài đặt sáng/tối của hệ điều hành.
 */
function getInitialTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // localStorage có thể bị chặn (chế độ riêng tư) → bỏ qua.
  }
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  } catch {
    return 'light';
  }
}

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  // Mỗi khi theme đổi: ghi lên thẻ <html> để CSS áp dụng, và nhớ lại lựa chọn.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Không lưu được thì vẫn đổi giao diện cho phiên hiện tại.
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme phải nằm trong <ThemeProvider>');
  return ctx;
}
