import { useCallback, useState } from 'react';

// Quản lý chế độ "chọn nhiều để xóa": bật/tắt select mode và 2 tập đã chọn
// (tài liệu và folder). Dùng chung cho trang chủ lẫn trang folder.
export function useMultiSelect() {
  const [selectMode, setSelectMode] = useState(false);
  const [docs, setDocs] = useState<Set<string>>(new Set());
  const [folders, setFolders] = useState<Set<string>>(new Set());

  // Thoát hẳn: tắt mode và bỏ mọi lựa chọn.
  const exit = useCallback(() => {
    setSelectMode(false);
    setDocs(new Set());
    setFolders(new Set());
  }, []);

  // Bật/tắt mode; tắt thì xóa luôn lựa chọn đang có.
  const toggleMode = useCallback(() => {
    setSelectMode((m) => {
      if (m) {
        setDocs(new Set());
        setFolders(new Set());
      }
      return !m;
    });
  }, []);

  const toggleDoc = useCallback((id: string) => {
    setDocs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleFolder = useCallback((id: string) => {
    setFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const count = docs.size + folders.size;

  return {
    selectMode,
    toggleMode,
    exit,
    docs,
    folders,
    toggleDoc,
    toggleFolder,
    count,
  };
}
