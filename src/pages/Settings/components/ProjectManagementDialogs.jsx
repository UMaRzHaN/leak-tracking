import ConfirmSheet from "@/components/ui/ConfirmSheet/ConfirmSheet";
import SyncIdEditorSheet from "./SyncIdEditorSheet";

export default function ProjectManagementDialogs({
  switchState,
  syncIdEditor,
}) {
  return (
    <>
      <ConfirmSheet
        open={switchState.state.open}
        title={switchState.state.title}
        description={switchState.state.description}
        confirmLabel={switchState.state.confirmLabel}
        cancelLabel={switchState.state.cancelLabel}
        onConfirm={switchState.onConfirm}
        onCancel={switchState.onCancel}
      />

      <SyncIdEditorSheet
        state={syncIdEditor.state}
        onChange={syncIdEditor.onChange}
        onConfirm={syncIdEditor.onConfirm}
        onCancel={syncIdEditor.onCancel}
      />
    </>
  );
}
