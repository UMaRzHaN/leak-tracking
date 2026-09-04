import ImportExportDialogs from "./ImportExportDialogs";
import ProjectManagementDialogs from "./ProjectManagementDialogs";

/**
 * Диалоги настроек: конфликты архива и книги, подтверждения ввоза, смена
 * проекта и правка номера обмена.
 *
 * Берут не два десятка отдельных обработчиков, а сам результат хука: диалоги
 * ничего не решают сами, а протягивать через границу каждый обработчик
 * поимённо — та же страница, только записанная дважды.
 */
export default function SettingsDialogs({ page }) {
  return (
    <>
      <ImportExportDialogs
        backupConflict={{
          state: page.conflictState,
          onOverwrite: page.handleConflictOverwrite,
          onMerge: page.handleConflictMerge,
          onCopy: page.handleConflictCopy,
          onCancel: () => page.setConflictState({ open: false }),
        }}
        excelConflict={{
          state: page.excelConflictState,
          onOverwrite: page.handleExcelConflictOverwrite,
          onMerge: page.handleExcelConflictMerge,
          onCopy: page.handleExcelConflictCopy,
          onCancel: () => page.setExcelConflictState({ open: false }),
        }}
        excelImport={{
          state: page.excelImportState,
          onConfirm: page.confirmExcelImport,
          onCancel: page.cancelExcelImport,
        }}
        importConfirm={{
          state: page.importConfirmState,
          onConfirm: page.confirmImport,
          onCancel: page.cancelImport,
        }}
      />

      <ProjectManagementDialogs
        switchState={{
          state: page.projectSwitchState,
          onConfirm: page.confirmProjectSwitch,
          onCancel: page.cancelProjectSwitch,
        }}
        syncIdEditor={{
          state: page.syncIdEditorState,
          onChange: page.updateSyncIdEditorValue,
          onConfirm: page.confirmSyncIdEditor,
          onCancel: page.cancelSyncIdEditor,
        }}
      />
    </>
  );
}
