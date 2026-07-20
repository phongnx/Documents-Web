import { useRef, useState } from 'react';
import { usePm } from '../../context/PmContext';
import type { PmImportPayload } from '../../pmTypes';

// Nút nhập dữ liệu từ file JSON (shape PmImportPayload) do script Python sinh ra.
// Ghi đè toàn bộ users/{uid}/pm — có confirm nếu đang có dữ liệu.
export default function ImportDataButton() {
  const { apps, tasks, importData } = usePm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = () => inputRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // cho phép chọn lại cùng file
    if (!file) return;

    try {
      const text = await file.text();
      const payload = JSON.parse(text) as PmImportPayload;
      const appCount = payload.apps ? Object.keys(payload.apps).length : 0;
      const taskCount = payload.tasks ? Object.keys(payload.tasks).length : 0;
      if (appCount === 0 && taskCount === 0) {
        window.alert('File không có app/task nào để nhập.');
        return;
      }

      const hasData = apps.length > 0 || tasks.length > 0;
      const msg =
        `Nhập ${appCount} app và ${taskCount} task.` +
        (hasData
          ? `\n\n⚠️ Toàn bộ dữ liệu bảng dự án hiện tại (${apps.length} app, ${tasks.length} task) sẽ bị GHI ĐÈ. Tiếp tục?`
          : '\n\nTiếp tục?');
      if (!window.confirm(msg)) return;

      setBusy(true);
      await importData(payload);
      window.alert('Đã nhập dữ liệu thành công.');
    } catch (err) {
      window.alert(
        'Không đọc được file JSON. Kiểm tra lại định dạng.\n' + String(err),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" onClick={pick} disabled={busy}>
        {busy ? 'Đang nhập…' : '⬆️ Import JSON'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        onChange={onFile}
        style={{ display: 'none' }}
      />
    </>
  );
}
