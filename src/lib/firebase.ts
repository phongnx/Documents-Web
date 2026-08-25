import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
};

// Chỉ khởi tạo Firebase khi có đủ config (tránh app crash trắng màn hình
// khi thiếu file .env). Nếu chưa cấu hình, mọi export là null và nơi dùng
// phải kiểm tra null trước (vd: if (!db) return;).
const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

export const app = isConfigured ? initializeApp(firebaseConfig) : null;

// App Check (reCAPTCHA v3): chứng thực request đến từ ĐÚNG app này, chặn người
// khác lấy config trong bundle JS rồi tự gọi REST API. Không thay thế database
// rules — rules quyết định "ai được đọc/ghi gì", App Check chỉ xác nhận "request
// từ app thật". Bật enforcement ở Firebase Console; app phải deploy kèm SDK này
// TRƯỚC, nếu không chính app sẽ bị Realtime Database từ chối.
//
// Thiếu site key → bỏ qua (giữ quy ước null-safety của file này: app vẫn chạy
// được khi chưa cấu hình, chỉ mất lớp App Check).
const appCheckKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY;
if (app && appCheckKey) {
  // DEV: dùng debug token thay vì gọi reCAPTCHA thật — token in ra console lần
  // chạy đầu, phải safelist trong Console (App Check → Apps → Manage debug tokens).
  // BẮT BUỘC đặt trước initializeAppCheck. Không bao giờ commit token đó vào repo.
  if (import.meta.env.DEV) {
    (self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(appCheckKey),
    isTokenAutoRefreshEnabled: true,
  });
}

export const auth = isConfigured ? getAuth(app!) : null;
export const db = isConfigured ? getDatabase(app!) : null;
export const googleProvider = isConfigured ? new GoogleAuthProvider() : null;
export const firebaseReady = isConfigured;
