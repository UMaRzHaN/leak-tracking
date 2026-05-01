import LeakDetailsSheet from "@/features/leakDetails/LeakDetailsSheet";
import StatusPickerModal from "@/features/status/StatusPickerModal/StatusPickerModal";
import ResolveModal from "@/features/resolve/ResolveModal/ResolveModal";
import { STATUS } from "@/utils/status";

export default function LeakModals({
  activeLeak, onCloseDetails, onSave, onDelete,
  pickerLeak, onStatusSelect, onClosePicker,
  resolveLeak, onResolveConfirm, onCloseResolve,
  resolveQueue, resolveTotal, onSequentialResolveConfirm, onCancelBulkResolve,
}) {
  return (
    <>
      {activeLeak && (
        <LeakDetailsSheet
          leak={activeLeak}
          onClose={onCloseDetails}
          onSave={onSave}
          onDelete={onDelete}
        />
      )}

      {pickerLeak && (
        <StatusPickerModal
          current={pickerLeak.status ?? STATUS.OPEN}
          onSelect={onStatusSelect}
          onClose={onClosePicker}
        />
      )}

      {resolveLeak && (
        <ResolveModal
          leak={resolveLeak}
          onConfirm={onResolveConfirm}
          onClose={onCloseResolve}
        />
      )}

      {resolveQueue.length > 0 && (
        <ResolveModal
          leak={resolveQueue[0]}
          progress={{ current: resolveTotal - resolveQueue.length + 1, total: resolveTotal }}
          onConfirm={onSequentialResolveConfirm}
          onClose={onCancelBulkResolve}
        />
      )}
    </>
  );
}
