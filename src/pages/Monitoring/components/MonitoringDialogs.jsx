import { lazy, Suspense } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import Notification from "@/components/ui/Notification/Notification";
import ConfirmSheet from "@/components/ui/ConfirmSheet/ConfirmSheet";
import { STATUS } from "@/utils/status";
import MonitoringSheet from "../MonitoringSheet";
import { createMonitoringDraft } from "../monitoringDomain";

const LeakDetailsSheet = lazy(
  () => import("@/features/leakDetails/LeakDetailsSheet"),
);
const StatusPickerModal = lazy(
  () => import("@/features/status/StatusPickerModal/StatusPickerModal"),
);
const ResolveModal = lazy(
  () => import("@/features/resolve/ResolveModal/ResolveModal"),
);
const ReopenLeakModal = lazy(
  () => import("@/features/status/ReopenLeakModal/ReopenLeakModal"),
);

export default function MonitoringDialogs({
  activeLeak,
  allLeaks,
  drafts,
  hasMonitoringRound,
  isSaving,
  lang,
  monitorLeak,
  monitorQueueIds,
  monitorQueueTotal,
  notification,
  onCancelRound,
  onCloseActiveLeak,
  onCloseMonitor,
  onCloseNotification,
  onClosePendingReopen,
  onClosePicker,
  onCloseReopen,
  onCloseRepair,
  onCloseResolve,
  onConfirmMonitoringReopen,
  onConfirmReopen,
  onConfirmRepair,
  onConfirmResolve,
  onDeleteLeak,
  onRepeatConfirm,
  onRepeatCancel,
  onRepeatNewRound,
  onSaveLeak,
  onSaveRecord,
  onSelectStatus,
  onStartRound,
  onUpdateDraft,
  pendingMonitoringReopen,
  photoRequired,
  pickerLeak,
  reopenLeak,
  repairLeak,
  repeatConfirmLeak,
  resolveLeak,
  roundConfirmOpen,
  submitted,
  texts,
  userProfile,
  vars,
}) {
  const { t } = useLanguage();

  return (
    <>
      <Notification notification={notification} onClose={onCloseNotification} />
      <ConfirmSheet
        open={roundConfirmOpen}
        title={t(
          hasMonitoringRound
            ? "monitoring.startNewRoundTitle"
            : "monitoring.startMonitoringTitle",
        )}
        description={t("monitoring.startRoundDescription")}
        confirmLabel={t("monitoring.startRoundConfirm")}
        cancelLabel={t("monitoring.cancel")}
        onConfirm={onStartRound}
        onCancel={onCancelRound}
      />
      <ConfirmSheet
        open={Boolean(repeatConfirmLeak)}
        title={t("monitoring.repeatTitle")}
        description={t("monitoring.repeatDescription")}
        confirmLabel={t("monitoring.repeatConfirm")}
        cancelLabel={t("monitoring.cancel")}
        secondaryActionLabel={t("monitoring.repeatSecondary")}
        onSecondaryAction={onRepeatNewRound}
        onConfirm={onRepeatConfirm}
        onCancel={onRepeatCancel}
      />

      <Suspense fallback={null}>
        {activeLeak && (
          <LeakDetailsSheet
            leak={activeLeak}
            allLeaks={allLeaks}
            onClose={onCloseActiveLeak}
            onSave={onSaveLeak}
            onDelete={onDeleteLeak}
            userProfile={userProfile}
          />
        )}

        {monitorLeak && !pendingMonitoringReopen && (
          <MonitoringSheet
            leak={monitorLeak}
            draft={drafts[monitorLeak.id] ?? createMonitoringDraft(monitorLeak)}
            texts={texts}
            lang={lang}
            progress={
              monitorQueueTotal > 1
                ? {
                    current: monitorQueueTotal - monitorQueueIds.length + 1,
                    total: monitorQueueTotal,
                  }
                : null
            }
            submitted={submitted}
            saving={isSaving}
            photoRequired={photoRequired}
            onChange={(patch) => onUpdateDraft(monitorLeak.id, patch)}
            onSave={() => onSaveRecord(monitorLeak)}
            onClose={onCloseMonitor}
          />
        )}

        {pickerLeak && (
          <StatusPickerModal
            current={pickerLeak.status ?? STATUS.OPEN}
            onSelect={onSelectStatus}
            onClose={onClosePicker}
          />
        )}

        {resolveLeak && (
          <ResolveModal
            leak={resolveLeak}
            onConfirm={onConfirmResolve}
            onClose={onCloseResolve}
          />
        )}

        {repairLeak && (
          <ResolveModal
            leak={repairLeak}
            mode="repair"
            onConfirm={onConfirmRepair}
            onClose={onCloseRepair}
          />
        )}

        {reopenLeak && (
          <ReopenLeakModal
            leak={reopenLeak}
            vars={vars}
            onConfirm={onConfirmReopen}
            onClose={onCloseReopen}
          />
        )}

        {pendingMonitoringReopen && (
          <ReopenLeakModal
            leak={pendingMonitoringReopen.leak}
            vars={vars}
            onConfirm={onConfirmMonitoringReopen}
            onClose={onClosePendingReopen}
          />
        )}
      </Suspense>
    </>
  );
}
