import { useState } from 'react';
import { useAuth } from '../auth/useAuth';
import ThemeToggle from '../components/ThemeToggle';

export default function LoginPage() {
  const { signIn, ready } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const onSignIn = async () => {
    setError(null);
    try {
      await signIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Đăng nhập thất bại.');
    }
  };

  return (
    <div className="login-page">
      <div className="login-theme-toggle">
        <ThemeToggle />
      </div>
      <div className="login-card">
        <h1>📄 Docs Web</h1>
        <p className="muted">Quản lý tài liệu cá nhân: ghi chú (rich-text) và Markdown.</p>

        {!ready && (
          <p className="warn">
            Chưa cấu hình Firebase (thiếu file <code>.env</code>). Đăng nhập sẽ không hoạt động.
          </p>
        )}

        <button type="button" className="primary" onClick={onSignIn} disabled={!ready}>
          Đăng nhập bằng Google
        </button>

        {error && <p className="warn">{error}</p>}
      </div>
    </div>
  );
}
