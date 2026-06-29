export type DocumentType = 'note' | 'markdown' | 'html';

export interface Folder {
  id: string;
  name: string;
  order: number;
  createdAt: string;
  /** true = đã bật chia sẻ công khai, có bản sao tại shared/f/{id} */
  isShared?: boolean;
  /** undefined/rỗng = folder gốc (cấp 1); có giá trị = sub-folder của folder đó (chỉ 1 cấp) */
  parentId?: string;
}

export interface DocItem {
  id: string;
  type: DocumentType;
  title: string;
  /** note: chuỗi HTML (rich-text); markdown: Markdown thuần; html: tài liệu HTML đầy đủ (file) */
  content: string;
  createdAt: string;
  updatedAt: string;
  order: number;
  /** true = đã bật chia sẻ công khai, có bản sao tại shared/d/{id} */
  isShared?: boolean;
  /** undefined/rỗng = tài liệu đứng riêng (không folder); có giá trị = thuộc folder đó */
  folderId?: string;
}
