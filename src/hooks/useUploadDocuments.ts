import { useCallback } from 'react';
import { useDocuments } from '../context/DocumentsContext';
import { filesToItems, type UploadItem } from '../lib/uploadHelpers';

// Kết quả một lần tải lên, để nơi gọi báo lại cho người dùng nếu cần.
export interface UploadResult {
  created: number; // số tài liệu tạo mới
  replaced: number; // số tài liệu cũ bị ghi đè nội dung
  skipped: number; // số file trùng tên bị bỏ qua (người dùng chọn không thay thế)
}

/**
 * Logic tải lên dùng chung cho mọi nơi (trang tải hàng loạt, kéo-thả file vào
 * ô folder ở trang chủ, kéo-thả vào trang folder đang mở).
 *
 * Quy ước trùng tên: nếu tiêu đề file trùng (không phân biệt hoa/thường) với
 * một tài liệu đã có TRONG CÙNG folder đích thì hỏi confirm:
 *   - OK     → ghi đè nội dung tài liệu cũ (giữ nguyên id, chỉ đổi content/type)
 *   - Cancel → bỏ qua các file trùng, vẫn tạo những file còn lại
 */
export function useUploadDocuments() {
  const { documents, addDocuments, updateDocument } = useDocuments();

  // Ghi danh sách item đã đọc sẵn nội dung vào folder đích.
  const commitItems = useCallback(
    (items: UploadItem[], folderId?: string): UploadResult => {
      const result: UploadResult = { created: 0, replaced: 0, skipped: 0 };
      if (items.length === 0) return result;

      // Tài liệu hiện có trong folder đích, tra theo tiêu đề đã chuẩn hóa.
      const byTitle = new Map<string, string>(); // tiêu đề (thường) → id
      for (const d of documents) {
        if ((d.folderId ?? '') === (folderId ?? '')) {
          byTitle.set(d.title.trim().toLowerCase(), d.id);
        }
      }

      const fresh: UploadItem[] = [];
      const dupes: { item: UploadItem; existingId: string }[] = [];
      for (const it of items) {
        const key = it.title.trim().toLowerCase();
        const existingId = key ? byTitle.get(key) : undefined;
        if (existingId) dupes.push({ item: it, existingId });
        else fresh.push(it);
      }

      // Có file trùng tên → hỏi người dùng một lần cho cả cụm.
      let replace = false;
      if (dupes.length > 0) {
        const names = dupes.map((d) => d.item.title).join(', ');
        replace = window.confirm(
          `Đã có ${dupes.length} tài liệu trùng tên trong thư mục đích:\n${names}\n\n` +
            `Thay thế nội dung các tài liệu này?\n` +
            `OK = thay thế · Cancel = bỏ qua các file trùng.`,
        );
      }

      // Tạo mới các file không trùng.
      if (fresh.length > 0) {
        const made = addDocuments(fresh, folderId);
        result.created = made.length;
      }
      // Ghi đè các file trùng nếu người dùng đồng ý.
      if (dupes.length > 0) {
        if (replace) {
          for (const d of dupes) {
            updateDocument(d.existingId, {
              content: d.item.content,
              type: d.item.type,
            });
          }
          result.replaced = dupes.length;
        } else {
          result.skipped = dupes.length;
        }
      }
      return result;
    },
    [documents, addDocuments, updateDocument],
  );

  // Đọc nội dung các file rồi ghi vào folder đích (dùng cho kéo-thả trực tiếp).
  const uploadFiles = useCallback(
    async (
      files: FileList | File[],
      folderId?: string,
    ): Promise<UploadResult> => {
      const arr = Array.from(files);
      if (arr.length === 0) return { created: 0, replaced: 0, skipped: 0 };
      const items = await filesToItems(arr);
      return commitItems(items, folderId);
    },
    [commitItems],
  );

  return { uploadFiles, commitItems };
}
