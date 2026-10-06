import { useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useProject } from "@/app/project/ProjectContext";
import { useLeakFormContext } from "@/features/leakForm/LeakFormContext";
import { isLeakFormDirty } from "@/features/leakForm/utils/isLeakFormDirty";
import { clearMapCache } from "@/services/maps/tileCache";
import { PROJECT_META } from "@/configs/projectMeta";
import ConfirmSheet from "@/components/ui/ConfirmSheet/ConfirmSheet";
import Icon from "@/components/ui/Icon/Icon";
import { ignoredError } from "@/utils/ignoredError";
import s from "./AppMenu.module.scss";

/**
 * Выбор проекта прямо в меню (3a): кнопка раскрывает список, тап по проекту
 * переключает на него. Переключение — то же, что в настройках: недописанная
 * форма утечки сначала спрашивает, кэш карты чистится. Заводить, переименовывать
 * и удалять проекты — по-прежнему в настройках, туда ведёт последняя строка.
 */
export default function ProjectPicker({ onSwitched, onManage }) {
  const { t } = useLanguage();
  const { projects, activeProject, selectProject } = useProject();
  const { form, clearForm } = useLeakFormContext();
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState(/** @type {string|null} */ (null));

  const perform = async (id) => {
    selectProject(id);
    clearForm?.();
    await clearMapCache().catch(ignoredError("appMenu.clearMapCache"));
    setOpen(false);
    onSwitched?.();
  };

  const pick = (id) => {
    if (id === activeProject?.id) {
      setOpen(false);
      return;
    }
    if (isLeakFormDirty(form)) setPendingId(id);
    else perform(id);
  };

  return (
    <>
      <button
        type="button"
        className={s.project}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title={t("appMenu.switchProject")}
      >
        <span className={s.projectText}>
          <span className={s.caption}>{t("appMenu.project")}</span>
          <span className={s.projectName}>{activeProject?.name}</span>
        </span>
        <span className={s.projectIcon}>
          <Icon name="swap" size={16} strokeWidth={1.8} />
        </span>
      </button>

      {open && (
        <ul className={s.projectList} aria-label={t("appMenu.projects")}>
          {projects.map((project) => {
            const active = project.id === activeProject?.id;
            return (
              <li key={project.id}>
                <button
                  type="button"
                  className={active ? s.projectOptionActive : s.projectOption}
                  aria-current={active ? "true" : undefined}
                  onClick={() => pick(project.id)}
                >
                  <span className={s.projectText}>
                    <span className={s.projectName}>{project.name}</span>
                    <span className={s.projectType}>
                      {PROJECT_META[project.type]?.title ?? project.type}
                    </span>
                  </span>
                  {active && <Icon name="check" size={18} strokeWidth={2.4} />}
                </button>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              className={s.projectManage}
              onClick={onManage}
            >
              <Icon name="settings" size={18} strokeWidth={1.7} />
              {t("appMenu.manageProjects")}
            </button>
          </li>
        </ul>
      )}

      <ConfirmSheet
        open={pendingId !== null}
        title={t("settings.switchProject")}
        description={t("settings.theLeakEntryForm")}
        confirmLabel={t("settings.switch")}
        cancelLabel={t("settings.cancel")}
        onConfirm={async () => {
          const id = pendingId;
          setPendingId(null);
          if (id) await perform(id);
        }}
        onCancel={() => setPendingId(null)}
      />
    </>
  );
}
