// Helper lấy ngày để sắp xếp task (nguồn duy nhất). Hai hàm khác ngữ nghĩa, giữ riêng.
import type { TaskItem } from '../pmTypes';

// Ngày "release liên quan": ưu tiên planDate → endDate (KHÔNG lấy startDate).
export const relDate = (t: TaskItem): string => t.planDate || t.endDate || '';

// Ngày để sắp xếp danh sách task: planDate → endDate → startDate.
export const sortDate = (t: TaskItem): string =>
  t.planDate || t.endDate || t.startDate || '';
