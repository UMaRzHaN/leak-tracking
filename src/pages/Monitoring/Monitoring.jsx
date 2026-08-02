import { useRenderMetric } from "@/utils/renderMetrics";
import MonitoringRoundOverview from "./MonitoringRoundOverview";
import MonitoringDialogs from "./components/MonitoringDialogs";
import MonitoringLeakList from "./components/MonitoringLeakList";
import { useMonitoringPage } from "./hooks/useMonitoringPage";
import s from "./Monitoring.module.scss";

export {
  buildMonitoringPatch,
  getMonitoringPhotoPathsToKeep,
} from "./monitoringDomain";

export default function Monitoring(props) {
  useRenderMetric("Monitoring");

  const {
    activeLeak,
    counts,
    deleteLeak,
    displayRoundSummary,
    drafts,
    filters,
    finishRound,
    handleMonitoringReopenConfirm,
    handlePickStatus,
    handleReopenConfirm,
    handleRepairConfirm,
    handleResolveConfirm,
    handleStatusSelect,
    hasActiveMonitoringRound,
    hasMonitoringRound,
    isSaving,
    items,
    lang,
    listHeight,
    listRef,
    monitoringFilter,
    monitoringRound,
    monitoringRoundId,
    monitoringRoundNumber,
    monitorLeak,
    monitorQueueIds,
    monitorQueueTotal,
    notification,
    openMonitoringSheet,
    pendingMonitoringReopen,
    photoRequired,
    pickerLeak,
    projectConfig,
    reopenLeak,
    repairLeak,
    repeatConfirmLeak,
    resolveLeak,
    roundConfirmOpen,
    saveLeak,
    saveRecord,
    setActiveLeak,
    setMonitorLeak,
    setMonitorQueueIds,
    setMonitorQueueTotal,
    setMonitoringFilter,
    setNotification,
    setPendingMonitoringReopen,
    setPendingRoundLeakId,
    setPickerLeak,
    setReopenLeak,
    setRepairLeak,
    setRepeatConfirmLeak,
    setResolveLeak,
    setRoundConfirmOpen,
    setSubmitted,
    showCompletion,
    showMonitoringSheet,
    startNewRound,
    submitted,
    texts,
    updateDraft,
    vars,
  } = useMonitoringPage(props);
  const { userProfile } = props;

  return (
    <div className={`${s.page} content`}>
      <MonitoringRoundOverview
        round={monitoringRound}
        lang={lang}
        texts={texts}
        summary={displayRoundSummary}
        showCompletion={showCompletion}
        hasRound={hasMonitoringRound}
        onStartRound={() => {
          setPendingRoundLeakId(null);
          setRoundConfirmOpen(true);
        }}
        onFinishRound={finishRound}
      />

      <MonitoringLeakList
        counts={counts}
        filters={filters}
        hasMonitoringRound={hasMonitoringRound}
        hasActiveMonitoringRound={hasActiveMonitoringRound}
        items={items}
        lang={lang}
        listHeight={listHeight}
        listRef={listRef}
        monitoringFilter={monitoringFilter}
        monitoringRoundId={monitoringRoundId}
        monitoringRoundNumber={monitoringRoundNumber}
        onMonitor={openMonitoringSheet}
        onOpenDetails={setActiveLeak}
        onPickStatus={handlePickStatus}
        projectConfig={projectConfig}
        setMonitoringFilter={setMonitoringFilter}
        texts={texts}
      />

      <MonitoringDialogs
        activeLeak={activeLeak}
        allLeaks={props.data}
        drafts={drafts}
        hasMonitoringRound={hasMonitoringRound}
        isSaving={isSaving}
        lang={lang}
        monitorLeak={monitorLeak}
        monitorQueueIds={monitorQueueIds}
        monitorQueueTotal={monitorQueueTotal}
        notification={notification}
        onCancelRound={() => {
          setPendingRoundLeakId(null);
          setMonitorQueueIds([]);
          setMonitorQueueTotal(0);
          setRoundConfirmOpen(false);
        }}
        onCloseActiveLeak={() => setActiveLeak(null)}
        onCloseMonitor={() => {
          setSubmitted(false);
          setMonitorLeak(null);
          setMonitorQueueIds([]);
          setMonitorQueueTotal(0);
        }}
        onCloseNotification={() => setNotification(null)}
        onClosePendingReopen={() => setPendingMonitoringReopen(null)}
        onClosePicker={() => setPickerLeak(null)}
        onCloseReopen={() => setReopenLeak(null)}
        onCloseRepair={() => setRepairLeak(null)}
        onCloseResolve={() => setResolveLeak(null)}
        onConfirmMonitoringReopen={handleMonitoringReopenConfirm}
        onConfirmReopen={handleReopenConfirm}
        onConfirmRepair={handleRepairConfirm}
        onConfirmResolve={handleResolveConfirm}
        onDeleteLeak={deleteLeak}
        onRepeatConfirm={() => {
          const leak = repeatConfirmLeak;
          setRepeatConfirmLeak(null);
          if (leak) showMonitoringSheet(leak);
        }}
        onRepeatCancel={() => setRepeatConfirmLeak(null)}
        onRepeatNewRound={() => {
          const leak = repeatConfirmLeak;
          setRepeatConfirmLeak(null);
          setPendingRoundLeakId(leak?.id ?? null);
          setRoundConfirmOpen(true);
        }}
        onSaveLeak={saveLeak}
        onSaveRecord={saveRecord}
        onSelectStatus={handleStatusSelect}
        onStartRound={startNewRound}
        onUpdateDraft={updateDraft}
        pendingMonitoringReopen={pendingMonitoringReopen}
        photoRequired={photoRequired}
        pickerLeak={pickerLeak}
        reopenLeak={reopenLeak}
        repairLeak={repairLeak}
        repeatConfirmLeak={repeatConfirmLeak}
        resolveLeak={resolveLeak}
        roundConfirmOpen={roundConfirmOpen}
        submitted={submitted}
        texts={texts}
        userProfile={userProfile}
        vars={vars}
      />
    </div>
  );
}
