// react_dashboard/src/hooks/useOptimisticMutation.js
//
// Generic helper cho CRUD voi Optimistic UI:
//   1. Build 1 "pending" item voi id tam (vd: `__pending_<uuid>`).
//   2. Prepend vao list hien thi (optimistic).
//   3. Call API.
//   4. Success: replace pending bang item that tu server.
//   5. Error: rollback pending + show toast.
//
// Moi page tu implement theo nhu cau (vi du Room dung de tao/sua phong).

import { useCallback, useState } from 'react';

let _seq = 0;
const pendingId = (prefix = '__pending') => `${prefix}_${Date.now()}_${++_seq}`;

/**
 * @param {object} options
 * @param {(tempItem) => Promise<object>} options.mutationFn
 *   Nhan item tam (chua id pending) va goi API. Tra ve item that (co id that tu server).
 * @param {(optimisticItem) => void} options.onOptimistic
 *   Thuc hien them item tam vao UI (vd setState list).
 * @param {(tempId, realItem) => void} options.onSuccess
 *   Replace item tam bang item that.
 * @param {(tempId, error) => void} options.onError
 *   Rollback item tam va xu ly loi.
 * @param {(message: string) => void} [options.onToast]
 *   (Optional) hien toast khi co loi.
 */
export function useOptimisticMutation({
  mutationFn,
  onOptimistic,
  onSuccess,
  onError,
  onToast,
}) {
  const [pending, setPending] = useState([]);

  const run = useCallback(async (payload) => {
    const tempId = pendingId();
    const optimisticItem = { ...payload, id: tempId, _pending: true };
    setPending((p) => [...p, tempId]);
    onOptimistic && onOptimistic(optimisticItem);
    try {
      const realItem = await mutationFn(optimisticItem);
      setPending((p) => p.filter((id) => id !== tempId));
      onSuccess && onSuccess(tempId, realItem);
      return { ok: true, item: realItem };
    } catch (err) {
      setPending((p) => p.filter((id) => id !== tempId));
      onError && onError(tempId, err);
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        'Có lỗi xảy ra, vui lòng thử lại';
      if (onToast) onToast(msg);
      return { ok: false, error: err, message: msg };
    }
  }, [mutationFn, onOptimistic, onSuccess, onError, onToast]);

  const isPending = useCallback((id) => pending.includes(id), [pending]);

  return { run, isPending };
}

export default useOptimisticMutation;