import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { usePhotoSrc } from "@/hooks/usePhotoSrc";
import { formatLeakDate } from "@/utils/locale";
import { getLeakDetailsHeroPhotoPath } from "@/utils/monitoring";
import { useLeakDetailsSheet, MODE } from "./hooks/useLeakDetailsSheet";
import PhotoBlock from "./components/PhotoBlock";
import { getLeakHeroPhotoPaths } from "./utils/heroPhotoPaths";
import ViewBlock from "./components/ViewBlock";
import EditBlock from "./components/EditBlock";
import PhotoViewer from "@/features/photos/PhotoViewer/PhotoViewer";
import ResolveModal from "@/features/resolve/ResolveModal/ResolveModal";
import ReopenLeakModal from "@/features/status/ReopenLeakModal/ReopenLeakModal";
import StatusPickerModal from "@/features/status/StatusPickerModal/StatusPickerModal";
import Notification from "@/components/ui/Notification/Notification";
import ConfirmSheet from "@/components/ui/ConfirmSheet/ConfirmSheet";
import { useModalDialog } from "@/hooks/useModalDialog";
import Icon from "@/components/ui/Icon/Icon";
import s from "./LeakDetailsSheet.module.scss";

export default function LeakDetailsSheet({
  leak,
  allLeaks,
  onClose,
  onSave,
  onDelete,
  userProfile,
}) {
  const { lang, t } = useLanguage();
  const titleId = useId();
  const tabRefsRef = useRef(new Map());
  const absoluteDate = formatLeakDate(leak.date, {}, lang);
  const {
    mode,
    activeTab,
    setActiveTab,
    localEdit,
    setLocalEdit,
    localCalcParams,
    setLocalCalcParams,
    recordEdits,
    setRecordEdits,
    saving,
    notification,
    setNotification,
    viewerOpen,
    setViewerOpen,
    closeConfirmOpen,
    deleteArmed,
    resolveOpen,
    setResolveOpen,
    repairOpen,
    setRepairOpen,
    reopenOpen,
    setReopenOpen,
    statusPickerOpen,
    setStatusPickerOpen,
    fileInputRef,
    fileInputAfterRef,
    fileInputRepairRef,
    src,
    srcAfter,
    srcRepair,
    isNative,
    projectConfig,
    vars,
    status,
    ago,
    TABS,
    STATUS,
    handleSave,
    handleClose,
    confirmClose,
    cancelClose,
    handleStatusChange,
    handleStatusSelect,
    handleResolveConfirm,
    handleRepairConfirm,
    handleReopenConfirm,
    handleEdit,
    handleCancel,
    armDelete,
    confirmDelete,
    changePhoto,
    choosePhoto,
    changePhotoAfter,
    choosePhotoAfter,
    changePhotoRepair,
    choosePhotoRepair,
  } = useLeakDetailsSheet({
    leak,
    allLeaks,
    onClose,
    onSave,
    onDelete,
    userProfile,
  });
  const heroSrc = usePhotoSrc(getLeakDetailsHeroPhotoPath(leak)) || src;
  // Все снимки записи листаются в шапке; тап открывает тот, что на экране.
  const heroPaths = useMemo(() => getLeakHeroPhotoPaths(leak), [leak]);
  const [viewerSrc, setViewerSrc] = useState(/** @type {string|null} */ (null));
  const dialogRef = useModalDialog({
    onClose: handleClose,
    closeDisabled: saving,
  });

  useEffect(() => {
    tabRefsRef.current.get(activeTab)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeTab]);

  return (
    <>
      <Notification
        notification={notification}
        onClose={() => setNotification(null)}
      />

      <div className={s.overlay} onClick={handleClose}>
        <div
          ref={dialogRef}
          className={s.sheet}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          onClick={(event) => event.stopPropagation()}
        >
          <h2 id={titleId} className={s.visuallyHidden}>
            {t("leakDetails.sheetTitle")}
          </h2>
          <PhotoBlock
            src={mode === MODE.EDIT ? null : heroSrc}
            photoPaths={mode === MODE.EDIT ? [] : heroPaths}
            counterLabel={(index, total) =>
              t("leakDetails.photoCounter", { index, total })
            }
            status={status}
            identityNum={`№ ${leak.leak_id ?? leak.index ?? "—"}`}
            identityTime={ago ?? absoluteDate ?? ""}
            onStatusChange={handleStatusChange}
            onBack={handleClose}
            backLabel={t("leakDetails.back")}
            onView={
              mode === MODE.VIEW && (heroSrc || heroPaths.length > 0)
                ? (shown) => {
                    setViewerSrc(shown || heroSrc);
                    setViewerOpen(true);
                  }
                : undefined
            }
          />

          <div className={s.tabBar}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                ref={(node) => {
                  if (node) tabRefsRef.current.set(tab.id, node);
                  else tabRefsRef.current.delete(tab.id);
                }}
                className={`${s.tab} ${activeTab === tab.id ? s.tabActive : ""}`}
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className={s.tabContent} key={`${mode}-${activeTab}`}>
            {mode === MODE.VIEW ? (
              <ViewBlock
                data={{ ...leak, ...localEdit }}
                activeTab={activeTab}
                projectConfig={projectConfig}
              />
            ) : (
              <EditBlock
                leak={leak}
                recordEdits={recordEdits}
                setRecordEdits={setRecordEdits}
                originalCoords={{ lat: leak.lat, lng: leak.lng }}
                localEdit={localEdit}
                setLocalEdit={setLocalEdit}
                localCalcParams={localCalcParams}
                setLocalCalcParams={setLocalCalcParams}
                activeTab={activeTab}
                projectConfig={projectConfig}
                srcBefore={src}
                srcAfter={srcAfter}
                srcRepair={srcRepair}
                showAfter={status === STATUS.RESOLVED}
                showRepair={status === STATUS.IN_PROGRESS || Boolean(srcRepair)}
                onEditBefore={() =>
                  isNative ? changePhoto() : fileInputRef.current?.click()
                }
                onPickBefore={() =>
                  isNative ? choosePhoto() : fileInputRef.current?.click()
                }
                onEditAfter={() =>
                  isNative
                    ? changePhotoAfter()
                    : fileInputAfterRef.current?.click()
                }
                onPickAfter={() =>
                  isNative
                    ? choosePhotoAfter()
                    : fileInputAfterRef.current?.click()
                }
                onEditRepair={() =>
                  isNative
                    ? changePhotoRepair()
                    : fileInputRepairRef.current?.click()
                }
                onPickRepair={() =>
                  isNative
                    ? choosePhotoRepair()
                    : fileInputRepairRef.current?.click()
                }
                isNative={isNative}
              />
            )}
          </div>

          {mode === MODE.VIEW ? (
            <div className={s.actionBar}>
              {onDelete &&
                (deleteArmed ? (
                  <button
                    className={s.btnDangerArmed}
                    type="button"
                    onClick={confirmDelete}
                  >
                    <span>{t("leakDetails.deleteConfirm")}</span>
                    <span className={s.btnDangerProgress} />
                  </button>
                ) : (
                  <button
                    className={s.btnDanger}
                    type="button"
                    onClick={armDelete}
                    title={t("leakDetails.deleteLeak")}
                    aria-label={t("leakDetails.deleteLeak")}
                  >
                    <Icon name="trash" size={22} />
                  </button>
                ))}
              <button className={s.btnPrimary} onClick={handleEdit}>
                {t("leakDetails.edit")}
              </button>
              <button className={s.btnGhost} onClick={handleClose}>
                {t("leakDetails.close")}
              </button>
            </div>
          ) : (
            <div className={s.actionBar}>
              {!isNative && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={changePhoto}
                  />
                  {status === STATUS.RESOLVED && (
                    <input
                      ref={fileInputAfterRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={changePhotoAfter}
                    />
                  )}
                  {(status === STATUS.IN_PROGRESS || srcRepair) && (
                    <input
                      ref={fileInputRepairRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={changePhotoRepair}
                    />
                  )}
                </>
              )}
              <button
                className={s.btnGhost}
                type="button"
                onClick={handleCancel}
              >
                {t("leakDetails.cancel")}
              </button>
              <button
                className={s.btnPrimary}
                type="button"
                disabled={saving}
                onClick={handleSave}
              >
                {saving ? t("leakDetails.saving") : t("leakDetails.save")}
              </button>
            </div>
          )}
        </div>
      </div>

      <ConfirmSheet
        open={closeConfirmOpen}
        title={t("leakDetails.closeWithoutSavingTitle")}
        description={t("leakDetails.closeWithoutSavingDescription")}
        confirmLabel={t("leakDetails.close")}
        cancelLabel={t("leakDetails.cancel")}
        onConfirm={confirmClose}
        onCancel={cancelClose}
      />

      {viewerOpen && (viewerSrc || heroSrc) && (
        <PhotoViewer
          src={viewerSrc || heroSrc}
          onClose={() => setViewerOpen(false)}
        />
      )}

      {statusPickerOpen && (
        <StatusPickerModal
          current={status}
          onSelect={handleStatusSelect}
          onClose={() => setStatusPickerOpen(false)}
        />
      )}

      {resolveOpen && (
        <ResolveModal
          leak={leak}
          onConfirm={handleResolveConfirm}
          onClose={() => setResolveOpen(false)}
        />
      )}

      {repairOpen && (
        <ResolveModal
          leak={leak}
          mode="repair"
          onConfirm={handleRepairConfirm}
          onClose={() => setRepairOpen(false)}
        />
      )}

      {reopenOpen && (
        <ReopenLeakModal
          leak={leak}
          vars={vars}
          onConfirm={handleReopenConfirm}
          onClose={() => setReopenOpen(false)}
        />
      )}
    </>
  );
}
