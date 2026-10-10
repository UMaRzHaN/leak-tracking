import { lazy, Suspense } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import Notification from "@/components/ui/Notification/Notification";
import ConfirmSheet from "@/components/ui/ConfirmSheet/ConfirmSheet";
import MonitoringSheet from "../MonitoringSheet";
import { createMonitoringDraft } from "../monitoringDomain";

const LeakDetailsSheet = lazy(
  () => import("@/features/leakDetails/LeakDetailsSheet"),
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
  onConfirmMonitoringReopen,
  onDeleteLeak,
  onRepeatConfirm,
  onRepeatCancel,
  onRepeatNewRound,
  onSaveLeak,
  onSaveRecord,
  onStartRound,
  onUpdateDraft,
  pendingMonitoringReopen,
  photoRequired,
  repeatConfirmLeak,
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
        // Без «нового обхода», если новые обходы выключены в настройках.
        secondaryActionLabel={
          onRepeatNewRound ? t("monitoring.repeatSecondary") : null
        }
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
