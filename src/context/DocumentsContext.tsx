import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ref, onValue, set, update } from 'firebase/database';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../lib/firebase';
import { useAuth } from '../auth/useAuth';
import type { DocItem, DocumentType, Folder } from '../types';

type DocUpdates = Partial<Pick<DocItem, 'title' | 'content' | 'type'>>;

/**
 * Trả về folder nếu folderId đó tồn tại VÀ đang được chia sẻ công khai;
 * ngược lại trả về undefined. Dùng để biết có cần đồng bộ bản sao
 * shared/f/{id}/documents/{docId} hay không.
 */
function findSharedFolder(
  folders: Folder[],
  folderId?: string,
): Folder | undefined {
  if (!folderId) return undefined;
  const f = folders.find((x) => x.id === folderId);
  return f?.isShared ? f : undefined;
}

interface DocumentsState {
  documents: DocItem[];
  folders: Folder[];
  loading: boolean;
  addDocument: (type: DocumentType, title?: string, folderId?: string) => DocItem | null;
  /** Tạo nhiều tài liệu cùng lúc (dùng cho tải lên hàng loạt) trong một lần ghi. */
  addDocuments: (
    items: { type: DocumentType; title: string; content: string }[],
    folderId?: string,
  ) => DocItem[];
  updateDocument: (id: string, updates: DocUpdates) => void;
  deleteDocument: (id: string) => void;
  toggleShareDocument: (id: string) => void;
  addFolder: (name?: string) => Folder | null;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  toggleShareFolder: (id: string) => void;
  /** folderId = undefined ⇒ đưa tài liệu ra ngoài (không folder) */
  moveDocument: (id: string, folderId: string | undefined) => void;
}

const DocumentsContext = createContext<DocumentsState | null>(null);

export function DocumentsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid;

  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);

  // Luôn giữ bản state mới nhất để các mutator đọc từ đây (KHÔNG đọc closure),
  // tránh lỗi "tạo hàng loạt chỉ lưu được item cuối".
  const stateRef = useRef<{ documents: DocItem[]; folders: Folder[] }>({
    documents: [],
    folders: [],
  });
  stateRef.current.documents = documents;
  stateRef.current.folders = folders;

  useEffect(() => {
    if (!db || !uid) {
      setDocuments([]);
      setFolders([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    const docsRef = ref(db, `users/${uid}/documents`);
    const unsubDocs = onValue(docsRef, (snap) => {
      const val = snap.val() as Record<string, DocItem> | null;
      const list = val ? Object.values(val) : [];
      list.sort(
        (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt),
      );
      setDocuments(list);
      setLoading(false);
    });

    const foldersRef = ref(db, `users/${uid}/folders`);
    const unsubFolders = onValue(foldersRef, (snap) => {
      const val = snap.val() as Record<string, Folder> | null;
      const list = val ? Object.values(val) : [];
      list.sort(
        (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt),
      );
      setFolders(list);
    });

    return () => {
      unsubDocs();
      unsubFolders();
    };
  }, [uid]);

  const addDocument = useCallback(
    (type: DocumentType, title?: string, folderId?: string): DocItem | null => {
      if (!db || !uid) return null;
      const cur = stateRef.current.documents;
      // order tính trong phạm vi cùng folder (General = không folder).
      const scope = cur.filter((d) => (d.folderId ?? '') === (folderId ?? ''));
      const now = new Date().toISOString();
      const created: DocItem = {
        id: uuidv4(),
        type,
        title: title ?? (type === 'note' ? 'New note' : 'New document'),
        content: '',
        createdAt: now,
        updatedAt: now,
        order: scope.length,
        ...(folderId ? { folderId } : {}),
      };
      const writes: Record<string, unknown> = {
        [`users/${uid}/documents/${created.id}`]: created,
      };
      // Tạo trong folder đang chia sẻ ⇒ thêm luôn vào bản công khai của folder.
      if (findSharedFolder(stateRef.current.folders, folderId)) {
        writes[`shared/f/${folderId}/documents/${created.id}`] = created;
      }
      update(ref(db), writes);
      return created;
    },
    [uid],
  );

  const addDocuments = useCallback(
    (
      items: { type: DocumentType; title: string; content: string }[],
      folderId?: string,
    ): DocItem[] => {
      if (!db || !uid || items.length === 0) return [];
      const cur = stateRef.current.documents;
      // order tính trong phạm vi cùng folder; mỗi item nối tiếp nhau từ cuối.
      const scope = cur.filter((d) => (d.folderId ?? '') === (folderId ?? ''));
      const sharedFolder = findSharedFolder(stateRef.current.folders, folderId);
      const now = new Date().toISOString();
      const created: DocItem[] = [];
      // Gom toàn bộ đường dẫn rồi ghi MỘT lần (multi-path update, nguyên tử).
      const writes: Record<string, unknown> = {};
      items.forEach((it, i) => {
        const doc: DocItem = {
          id: uuidv4(),
          type: it.type,
          title:
            it.title.trim() || (it.type === 'note' ? 'New note' : 'New document'),
          content: it.content,
          createdAt: now,
          updatedAt: now,
          order: scope.length + i,
          ...(folderId ? { folderId } : {}),
        };
        created.push(doc);
        writes[`users/${uid}/documents/${doc.id}`] = doc;
        // Nếu tạo trong folder đang chia sẻ ⇒ thêm luôn vào bản công khai của folder.
        if (sharedFolder) {
          writes[`shared/f/${folderId}/documents/${doc.id}`] = doc;
        }
      });
      update(ref(db), writes);
      return created;
    },
    [uid],
  );

  const updateDocument = useCallback(
    (id: string, updates: DocUpdates) => {
      if (!db || !uid) return;
      const cur = stateRef.current.documents.find((d) => d.id === id);
      const now = new Date().toISOString();
      // Ghi nhiều đường dẫn cùng lúc (multi-path update) từ gốc cây dữ liệu.
      const writes: Record<string, unknown> = {
        [`users/${uid}/documents/${id}/updatedAt`]: now,
      };
      for (const [k, v] of Object.entries(updates)) {
        writes[`users/${uid}/documents/${id}/${k}`] = v;
      }
      // Nếu tài liệu đang chia sẻ công khai, cập nhật luôn bản sao shared/d/{id}.
      if (cur?.isShared) {
        const merged: DocItem = { ...cur, ...updates, updatedAt: now };
        writes[`shared/d/${id}`] = { document: merged, ownerId: uid };
      }
      // Nếu tài liệu nằm trong folder đang chia sẻ, cập nhật bản trong folder công khai.
      if (cur && findSharedFolder(stateRef.current.folders, cur.folderId)) {
        const merged: DocItem = { ...cur, ...updates, updatedAt: now };
        writes[`shared/f/${cur.folderId}/documents/${id}`] = merged;
      }
      update(ref(db), writes);
    },
    [uid],
  );

  const deleteDocument = useCallback(
    (id: string) => {
      if (!db || !uid) return;
      const cur = stateRef.current.documents.find((d) => d.id === id);
      const writes: Record<string, unknown> = {
        [`users/${uid}/documents/${id}`]: null,
      };
      // Xóa luôn bản công khai nếu đang chia sẻ.
      if (cur?.isShared) writes[`shared/d/${id}`] = null;
      // Gỡ khỏi bản công khai của folder nếu folder đang chia sẻ.
      if (cur && findSharedFolder(stateRef.current.folders, cur.folderId)) {
        writes[`shared/f/${cur.folderId}/documents/${id}`] = null;
      }
      update(ref(db), writes);
    },
    [uid],
  );

  const toggleShareDocument = useCallback(
    (id: string) => {
      if (!db || !uid) return;
      const cur = stateRef.current.documents.find((d) => d.id === id);
      if (!cur) return;
      const enabling = !cur.isShared;
      const writes: Record<string, unknown> = {
        [`users/${uid}/documents/${id}/isShared`]: enabling,
      };
      if (enabling) {
        const merged: DocItem = { ...cur, isShared: true };
        writes[`shared/d/${id}`] = { document: merged, ownerId: uid };
      } else {
        // Tắt chia sẻ → xóa bản công khai.
        writes[`shared/d/${id}`] = null;
      }
      update(ref(db), writes);
    },
    [uid],
  );

  const addFolder = useCallback(
    (name?: string): Folder | null => {
      if (!db || !uid) return null;
      const cur = stateRef.current.folders;
      const now = new Date().toISOString();
      const created: Folder = {
        id: uuidv4(),
        name: name ?? 'Folder mới',
        order: cur.length,
        createdAt: now,
      };
      set(ref(db, `users/${uid}/folders/${created.id}`), created);
      return created;
    },
    [uid],
  );

  const renameFolder = useCallback(
    (id: string, name: string) => {
      if (!db || !uid) return;
      const writes: Record<string, unknown> = {
        [`users/${uid}/folders/${id}/name`]: name,
      };
      // Nếu folder đang chia sẻ, đổi tên luôn trong bản công khai.
      if (findSharedFolder(stateRef.current.folders, id)) {
        writes[`shared/f/${id}/folder/name`] = name;
      }
      update(ref(db), writes);
    },
    [uid],
  );

  const deleteFolder = useCallback(
    (id: string) => {
      if (!db || !uid) return;
      const docs = stateRef.current.documents;
      // Xóa folder và TẤT CẢ tài liệu bên trong (theo lựa chọn của người dùng).
      const writes: Record<string, unknown> = {
        [`users/${uid}/folders/${id}`]: null,
      };
      // Nếu folder đang chia sẻ công khai, xóa luôn cả cụm shared/f/{id}.
      const folder = stateRef.current.folders.find((f) => f.id === id);
      if (folder?.isShared) writes[`shared/f/${id}`] = null;
      for (const d of docs) {
        if (d.folderId === id) {
          writes[`users/${uid}/documents/${d.id}`] = null;
          // Xóa luôn bản công khai nếu tài liệu đang chia sẻ.
          if (d.isShared) writes[`shared/d/${d.id}`] = null;
        }
      }
      update(ref(db), writes);
    },
    [uid],
  );

  const toggleShareFolder = useCallback(
    (id: string) => {
      if (!db || !uid) return;
      const folder = stateRef.current.folders.find((f) => f.id === id);
      if (!folder) return;
      const enabling = !folder.isShared;
      const writes: Record<string, unknown> = {
        [`users/${uid}/folders/${id}/isShared`]: enabling,
      };
      if (enabling) {
        // Gom toàn bộ tài liệu trong folder thành bản sao công khai.
        const docsMap: Record<string, DocItem> = {};
        for (const d of stateRef.current.documents) {
          if (d.folderId === id) docsMap[d.id] = d;
        }
        writes[`shared/f/${id}`] = {
          folder: { ...folder, isShared: true },
          ownerId: uid,
          documents: docsMap,
        };
      } else {
        // Tắt chia sẻ → xóa cả cụm công khai.
        writes[`shared/f/${id}`] = null;
      }
      update(ref(db), writes);
    },
    [uid],
  );

  const moveDocument = useCallback(
    (id: string, folderId: string | undefined) => {
      if (!db || !uid) return;
      const cur = stateRef.current.documents.find((d) => d.id === id);
      if (!cur) return;
      if ((cur.folderId ?? '') === (folderId ?? '')) return; // đã ở đúng chỗ
      const now = new Date().toISOString();
      // order = về cuối phạm vi folder đích.
      const scope = stateRef.current.documents.filter(
        (d) => d.id !== id && (d.folderId ?? '') === (folderId ?? ''),
      );
      const writes: Record<string, unknown> = {
        // folderId = null để gỡ trường khi đưa ra ngoài (không folder).
        [`users/${uid}/documents/${id}/folderId`]: folderId ?? null,
        [`users/${uid}/documents/${id}/order`]: scope.length,
        [`users/${uid}/documents/${id}/updatedAt`]: now,
      };
      // Đồng bộ bản chia sẻ nếu tài liệu đang công khai.
      if (cur.isShared) {
        const merged: DocItem = { ...cur, updatedAt: now };
        if (folderId) merged.folderId = folderId;
        else delete merged.folderId;
        writes[`shared/d/${id}`] = { document: merged, ownerId: uid };
      }
      // Gỡ khỏi folder cũ nếu folder cũ đang chia sẻ.
      if (findSharedFolder(stateRef.current.folders, cur.folderId)) {
        writes[`shared/f/${cur.folderId}/documents/${id}`] = null;
      }
      // Thêm vào folder mới nếu folder mới đang chia sẻ.
      if (findSharedFolder(stateRef.current.folders, folderId)) {
        const moved: DocItem = {
          ...cur,
          folderId,
          order: scope.length,
          updatedAt: now,
        };
        writes[`shared/f/${folderId}/documents/${id}`] = moved;
      }
      update(ref(db), writes);
    },
    [uid],
  );

  return (
    <DocumentsContext.Provider
      value={{
        documents,
        folders,
        loading,
        addDocument,
        addDocuments,
        updateDocument,
        deleteDocument,
        toggleShareDocument,
        addFolder,
        renameFolder,
        deleteFolder,
        toggleShareFolder,
        moveDocument,
      }}
    >
      {children}
    </DocumentsContext.Provider>
  );
}

export function useDocuments() {
  const ctx = useContext(DocumentsContext);
  if (!ctx) throw new Error('useDocuments must be used within DocumentsProvider');
  return ctx;
}
