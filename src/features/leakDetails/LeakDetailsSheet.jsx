import { useLeakDetailsSheet, MODE, TAB } from "./hooks/useLeakDetailsSheet";
import PhotoBlock from "./components/PhotoBlock";
import ViewBlock from "./components/ViewBlock";
import EditBlock from "./components/EditBlock";
import PhotoViewer from "@/features/photos/PhotoViewer/PhotoViewer";
import ResolveModal from "@/features/resolve/ResolveModal/ResolveModal";
import s from "./LeakDetailsSheet.module.scss";

export default function LeakDetailsSheet({ leak, onClose, onSave, onDelete }) {
  const {
    mode, activeTab, setActiveTab,
    localEdit, setLocalEdit,
    saving, viewerOpen, setViewerOpen,
    deleteArmed, resolveOpen, setResolveOpen,
    fileInputRef, fileInputAfterRef,
    src, srcAfter, isNative,
    projectConfig, status, ago, TABS, STATUS,
    handleSave, handleClose, handleStatusChange,
    handleResolveConfirm, handleAddComment,
    handleEdit, handleCancel,
    armDelete, confirmDelete,
    changePhoto, changePhotoAfter,
  } = useLeakDetailsSheet({ leak, onClose, onSave, onDelete });

  return (
    <>
      <div className={s.overlay} onClick={handleClose}>
        <div className={s.sheet} onClick={(e) => e.stopPropagation()}>
          <div className={s.handle} />

          {/* ── Hero photo + identity overlay ── */}
          <PhotoBlock
            src={mode === MODE.EDIT ? null : src}
            status={status}
            identityNum={`№ ${leak.leak_id ?? leak.index ?? "—"}`}
            identityTime={ago ?? leak.date ?? ""}
            onStatusChange={handleStatusChange}
            onView={mode === MODE.VIEW && src ? () => setViewerOpen(true) : undefined}
          />

          {/* ── Tab bar ── */}
          <div className={s.tabBar}>
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`${s.tab} ${activeTab === t.id ? s.tabActive : ""}`}
                onClick={() => setActiveTab(t.id)}
                type="button"
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Tab content ── */}
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
                showAfter={status === STATUS.RESOLVED}
                onEditBefore={() =>
                  isNative ? changePhoto() : fileInputRef.current?.click()
                }
                onEditAfter={() =>
                  isNative ? changePhotoAfter() : fileInputAfterRef.current?.click()
                }
              />
            )}
          </div>

          {/* ── Action bar ── */}
          {mode === MODE.VIEW ? (
            <div className={s.actionBar}>
              {onDelete &&
                (deleteArmed ? (
                  <button
                    className={s.btnDangerArmed}
                    type="button"
                    onClick={confirmDelete}
                  >
                    <span>Удалить?</span>
                    <span className={s.btnDangerProgress} />
                  </button>
                ) : (
                  <button
                    className={s.btnDanger}
                    type="button"
                    onClick={armDelete}
                    title="Удалить утечку"
                  >
                    🗑
                  </button>
                ))}
              <button className={s.btnPrimary} onClick={handleEdit}>
                Редактировать
              </button>
              <button className={s.btnGhost} onClick={handleClose}>
                Закрыть
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
                </>
              )}
              <button className={s.btnGhost} type="button" onClick={handleCancel}>
                Отмена
              </button>
              <button
                className={s.btnPrimary}
                type="button"
                disabled={saving}
                onClick={handleSave}
              >
                {saving ? "Сохранение…" : "Сохранить"}
              </button>
            </div>
          )}
        </div>
      </div>

      {viewerOpen && src && (
        <PhotoViewer src={src} onClose={() => setViewerOpen(false)} />
      )}

      {resolveOpen && (
        <ResolveModal
          leak={leak}
          onConfirm={handleResolveConfirm}
          onClose={() => setResolveOpen(false)}
        />
      )}
    </>
  );
}
