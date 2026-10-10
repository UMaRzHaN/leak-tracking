import s from "../Settings.module.scss";
import RequirementToggle from "./SettingsToggle";
import { useLanguage } from "@/app/hooks/useLanguage";

export default function PhotoRequirementsSection({
  activeProject,
  leakPhotoRequired,
  monitoringPhotoRequired,
  componentPhotoRequired,
  repairPhotoRequired,
  reconcilePhotoRequired,
  hasComponentRegistry = false,
  onLeakPhotoRequiredChange,
  onMonitoringPhotoRequiredChange,
  onComponentPhotoRequiredChange,
  onRepairPhotoRequiredChange,
  onReconcilePhotoRequiredChange,
}) {
  const { t } = useLanguage();

  if (!activeProject) return null;

  const requiredHint = t("settings.photoRequired");
  const optionalHint = t("settings.photoOptional");

  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle}>{t("settings.photoRequirements")}</h2>
      </div>
      <div className={s.photoRequirementsBody}>
        <RequirementToggle
          label={t("settings.photoWhenAdding")}
          hint={leakPhotoRequired ? requiredHint : optionalHint}
          checked={leakPhotoRequired}
          onChange={onLeakPhotoRequiredChange}
        />
        <RequirementToggle
          label={t("settings.photoWhenMonitoring")}
          hint={monitoringPhotoRequired ? requiredHint : optionalHint}
          checked={monitoringPhotoRequired}
          onChange={onMonitoringPhotoRequiredChange}
        />
        <RequirementToggle
          label={t("settings.photoWhenRepair")}
          hint={repairPhotoRequired ? requiredHint : optionalHint}
          checked={repairPhotoRequired}
          onChange={onRepairPhotoRequiredChange}
        />
        {/* Offered only where a registry exists, the same way the tab itself
            appears — a switch for a screen this project type does not have
            would be a promise the app cannot keep. */}
        {hasComponentRegistry && (
          <>
            <RequirementToggle
              label={t("settings.photoWhenComponent")}
              hint={componentPhotoRequired ? requiredHint : optionalHint}
              checked={componentPhotoRequired}
              onChange={onComponentPhotoRequiredChange}
            />
            <RequirementToggle
              label={t("settings.photoWhenReconcile")}
              hint={reconcilePhotoRequired ? requiredHint : optionalHint}
              checked={reconcilePhotoRequired}
              onChange={onReconcilePhotoRequiredChange}
            />
          </>
        )}
      </div>
    </section>
  );
}
