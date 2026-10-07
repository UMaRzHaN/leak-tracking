import { useMemo, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { usePhotoRequirements } from "@/app/project/hooks/usePhotoRequirements";
import { useProjectData } from "@/app/project/ProjectContext";
import { useAcceptances } from "@/utils/acceptanceStorage";
import { receivedItems } from "@/domain/equipmentAcceptance";
import { deletePhotoIfUnreferenced } from "@/domain/leakLifecycle";
import {
  REPAIR_CHECK_OUTCOME,
  applyRepairCheck,
  repairCheckOutcome,
} from "@/domain/repairCheck";
import { errorText } from "@/utils/appError";
import { ignoredError } from "@/utils/ignoredError";
import AcceptRepairScreen from "./AcceptRepairScreen";

const SAVED_TEXT = {
  [REPAIR_CHECK_OUTCOME.RESOLVED]: "repairs.accept.saved",
  [REPAIR_CHECK_OUTCOME.IN_REPAIR]: "repairs.accept.savedInRepair",
  [REPAIR_CHECK_OUTCOME.WAITING_MTR]: "repairs.accept.savedWaiting",
};

/**
 * Проверка ремонта (7c) вместе с сохранением: её открывают и обход ремонтов,
 * и свайп по карточке в модуле ремонтов — с любой страницы, поверх неё.
 * Запись пишется во весь проект, а не в отфильтрованный список: иначе
 * сохранение стёрло бы всё, что вне выбранного места.
 *
 * @param {{
 *   leak: any,
 *   data: any[],
 *   setData: (next: any[]) => Promise<void>|void,
 *   userProfile?: { name?: string }|null,
 *   progress?: { index: number, total: number }|null,
 *   onSaved?: () => void,
 *   onClose: () => void,
 *   onNotify: (notice: { type: string, message: string }) => void,
 * }} props
 */
export default function RepairCheck({
  leak,
  data,
  setData,
  userProfile,
  progress = null,
  onSaved,
  onClose,
  onNotify,
}) {
  const { t } = useLanguage();
  const { deletePhoto } = usePhotoStorage();
  const { activeProject } = useProjectData();
  // «МТР по факту» — из того, что принято по накладным (7f).
  const [invoices] = useAcceptances(activeProject?.id ?? null);
  const items = useMemo(() => receivedItems(invoices), [invoices]);
  const { repairPhotoRequired } = usePhotoRequirements(
    activeProject?.id ?? null,
  );
  const [saving, setSaving] = useState(false);
  const user = userProfile?.name?.trim() || undefined;

  const save = async (draft) => {
    if (!user) {
      onNotify({ type: "error", message: t("database.fillUserName") });
      return;
    }
    setSaving(true);
    try {
      await setData(
        data.map((record) =>
          record.id === leak.id
            ? applyRepairCheck(record, draft, { user })
            : record,
        ),
      );
      // В очереди после сохранения открывается следующая утечка.
      (onSaved ?? onClose)();
      onNotify({
        type: "success",
        message: t(SAVED_TEXT[repairCheckOutcome(draft)]),
      });
    } catch (error) {
      onNotify({
        type: "error",
        message: t("common.saveError", { message: errorText(error, t) }),
      });
      // Снимок уже лежит в хранилище, а запись его не получила.
      if (draft.photo_after) {
        deletePhotoIfUnreferenced(draft.photo_after, data, deletePhoto).catch(
          ignoredError("repairs.photoCleanup"),
        );
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <AcceptRepairScreen
      leak={leak}
      items={items}
      saving={saving}
      progress={progress}
      photoRequired={repairPhotoRequired}
      onSave={save}
      onClose={onClose}
    />
  );
}
