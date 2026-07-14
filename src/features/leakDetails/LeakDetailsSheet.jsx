import { useEffect, useRef } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { usePhotoSrc } from "@/hooks/usePhotoSrc";
import { formatLeakDate } from "@/utils/locale";
import { getLeakDetailsHeroPhotoPath } from "@/utils/monitoring";
import { useLeakDetailsSheet, MODE } from "./hooks/useLeakDetailsSheet";
import PhotoBlock from "./components/PhotoBlock";
import ViewBlock from "./components/ViewBlock";
import EditBlock from "./components/EditBlock";
import PhotoViewer from "@/features/photos/PhotoViewer/PhotoViewer";
import ResolveModal from "@/features/resolve/ResolveModal/ResolveModal";
import ReopenLeakModal from "@/features/status/ReopenLeakModal/ReopenLeakModal";
import StatusPickerModal from "@/features/status/StatusPickerModal/StatusPickerModal";
import Notification from "@/components/ui/Notification/Notification";
import ConfirmSheet from "@/components/ui/ConfirmSheet/ConfirmSheet";
import s from "./LeakDetailsSheet.module.scss";

export default function LeakDetailsSheet({
  leak,
  onClose,
  onSave,
  onDelete,
  userProfile,
}) {
  const { lang } = useLanguage();
  const tabRefs = useRef(new Map());
  const absoluteDate = formatLeakDate(leak.date, {}, lang);
  const {
    mode,
    activeTab,
    setActiveTab,
    localEdit,
    setLocalEdit,
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
    handleAddComment,
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
  } = useLeakDetailsSheet({ leak, onClose, onSave, onDelete, userProfile });
  const heroSrc = usePhotoSrc(getLeakDetailsHeroPhotoPath(leak)) || src;

  useEffect(() => {
    tabRefs.current.get(activeTab)?.scrollIntoView({
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
        <div className={s.sheet} onClick={(event) => event.stopPropagation()}>
          <PhotoBlock
            src={mode === MODE.EDIT ? null : heroSrc}
            status={status}
            identityNum={`№ ${leak.leak_id ?? leak.index ?? "—"}`}
            identityTime={ago ?? absoluteDate ?? ""}
            onStatusChange={handleStatusChange}
            onView={
              mode === MODE.VIEW && heroSrc
                ? () => setViewerOpen(true)
                : undefined
            }
          />

          <div className={s.tabBar}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                ref={(node) => {
                  if (node) tabRefs.current.set(tab.id, node);
                  else tabRefs.current.delete(tab.id);
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
                onAddComment={handleAddComment}
              />
            ) : (
              <EditBlock
                localEdit={localEdit}
                setLocalEdit={setLocalEdit}
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
                    <span>{lang === "ru" ? "Удалить?" : "Delete?"}</span>
                    <span className={s.btnDangerProgress} />
                  </button>
                ) : (
                  <button
                    className={s.btnDanger}
                    type="button"
                    onClick={armDelete}
                    title={lang === "ru" ? "Удалить утечку" : "Delete leak"}
                  >
                    🗑
                  </button>
                ))}
              <button className={s.btnPrimary} onClick={handleEdit}>
                {lang === "ru" ? "Редактировать" : "Edit"}
              </button>
              <button className={s.btnGhost} onClick={handleClose}>
                {lang === "ru" ? "Закрыть" : "Close"}
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
                {lang === "ru" ? "Отмена" : "Cancel"}
              </button>
              <button
                className={s.btnPrimary}
                type="button"
                disabled={saving}
                onClick={handleSave}
              >
                {saving
                  ? lang === "ru"
                    ? "Сохранение..."
                    : "Saving..."
                  : lang === "ru"
                    ? "Сохранить"
                    : "Save"}
              </button>
            </div>
          )}
        </div>
      </div>

      <ConfirmSheet
        open={closeConfirmOpen}
        title={
          lang === "ru" ? "Закрыть без сохранения?" : "Close without saving?"
        }
        description={
          lang === "ru"
            ? "Изменения не сохранены. Они будут потеряны."
            : "Your unsaved changes will be lost."
        }
        confirmLabel={lang === "ru" ? "Закрыть" : "Close"}
        cancelLabel={lang === "ru" ? "Отмена" : "Cancel"}
        onConfirm={confirmClose}
        onCancel={cancelClose}
      />

      {viewerOpen && heroSrc && (
        <PhotoViewer src={heroSrc} onClose={() => setViewerOpen(false)} />
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
