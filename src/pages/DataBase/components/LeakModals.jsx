import LeakDetailsSheet from "@/features/leakDetails/LeakDetailsSheet";
import StatusPickerModal from "@/features/status/StatusPickerModal/StatusPickerModal";
import ReopenLeakModal from "@/features/status/ReopenLeakModal/ReopenLeakModal";
import ResolveModal from "@/features/resolve/ResolveModal/ResolveModal";
import { STATUS } from "@/utils/status";

export default function LeakModals({
  activeLeak,
  allLeaks,
  onCloseDetails,
  onSave,
  onDelete,
  pickerLeak,
  onStatusSelect,
  onClosePicker,
  resolveLeak,
  onResolveConfirm,
  onCloseResolve,
  repairLeak,
  onRepairConfirm,
  onCloseRepair,
  reopenLeak,
  vars,
  onReopenConfirm,
  onCloseReopen,
  resolveQueue,
  resolveTotal,
  onSequentialResolveConfirm,
  onCancelBulkResolve,
  repairQueue,
  repairTotal,
  onSequentialRepairConfirm,
  onCancelBulkRepair,
  bulkPickerOpen,
  onBulkStatusSelect,
  onCloseBulkPicker,
  userProfile,
}) {
  return (
    <>
      {activeLeak && (
        <LeakDetailsSheet
          leak={activeLeak}
          allLeaks={allLeaks}
          onClose={onCloseDetails}
          onSave={onSave}
          onDelete={onDelete}
          userProfile={userProfile}
        />
      )}

      {pickerLeak && (
        <StatusPickerModal
          current={pickerLeak.status ?? STATUS.OPEN}
          onSelect={onStatusSelect}
          onClose={onClosePicker}
        />
      )}

      {bulkPickerOpen && (
        <StatusPickerModal
          current={null}
          onSelect={onBulkStatusSelect}
          onClose={onCloseBulkPicker}
        />
      )}

      {resolveLeak && (
        <ResolveModal
          key={resolveLeak.id}
          leak={resolveLeak}
          onConfirm={onResolveConfirm}
          onClose={onCloseResolve}
        />
      )}

      {repairLeak && (
        <ResolveModal
          key={repairLeak.id}
          leak={repairLeak}
          mode="repair"
          onConfirm={onRepairConfirm}
          onClose={onCloseRepair}
        />
      )}

      {reopenLeak && (
        <ReopenLeakModal
          key={reopenLeak.id}
          leak={reopenLeak}
          vars={vars}
          onConfirm={onReopenConfirm}
          onClose={onCloseReopen}
        />
      )}

      {resolveQueue.length > 0 && (
        <ResolveModal
          key={resolveQueue[0].id}
          leak={resolveQueue[0]}
          progress={{
            current: resolveTotal - resolveQueue.length + 1,
            total: resolveTotal,
          }}
          onConfirm={onSequentialResolveConfirm}
          onClose={onCancelBulkResolve}
        />
      )}

      {repairQueue.length > 0 && (
        <ResolveModal
          key={repairQueue[0].id}
          leak={repairQueue[0]}
          mode="repair"
          progress={{
            current: repairTotal - repairQueue.length + 1,
            total: repairTotal,
          }}
          onConfirm={onSequentialRepairConfirm}
          onClose={onCancelBulkRepair}
        />
      )}
    </>
  );
}
