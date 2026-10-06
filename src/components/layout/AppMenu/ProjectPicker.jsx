import { useId, useState } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useProject } from "@/app/project/ProjectContext";
import { useLeakFormContext } from "@/features/leakForm/LeakFormContext";
import { isLeakFormDirty } from "@/features/leakForm/utils/isLeakFormDirty";
import { clearMapCache } from "@/services/maps/tileCache";
import { PROJECT_META } from "@/configs/projectMeta";
import ConfirmSheet from "@/components/ui/ConfirmSheet/ConfirmSheet";
import AddProjectForm from "@/pages/Settings/components/AddProjectForm";
import { useModalDialog } from "@/hooks/useModalDialog";
import Icon from "@/components/ui/Icon/Icon";
import { ignoredError } from "@/utils/ignoredError";
import s from "./AppMenu.module.scss";

/**
 * Выбор проекта прямо в меню (3a): кнопка раскрывает список, тап по проекту
 * переключает на него. Переключение — то же, что в настройках: недописанная
 * форма утечки сначала спрашивает, кэш карты чистится. Последняя строка
 * заводит новый проект — в окне поверх меню, не уходя в настройки.
 */
export default function ProjectPicker({ onSwitched }) {
  const { t } = useLanguage();
  const { projects, activeProject, selectProject, addProject } = useProject();
  const [adding, setAdding] = useState(false);
  // Новый проект, ждущий подтверждения из-за недописанной формы утечки.
  const [pendingAdd, setPendingAdd] = useState(
    /** @type {{name: string, type: string}|null} */ (null),
  );
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

  const performAdd = async ({ name, type }) => {
    addProject(name, type);
    clearForm?.();
    await clearMapCache().catch(ignoredError("appMenu.clearMapCache"));
    setAdding(false);
    setOpen(false);
    onSwitched?.();
  };

  const add = (name, type) => {
    if (isLeakFormDirty(form)) setPendingAdd({ name, type });
    else performAdd({ name, type });
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
              onClick={() => setAdding(true)}
            >
              <Icon name="plus" size={18} strokeWidth={2} />
              {t("appMenu.addProject")}
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

      {adding && (
        <AddProjectDialog onConfirm={add} onClose={() => setAdding(false)} />
      )}

      <ConfirmSheet
        open={pendingAdd !== null}
        title={t("settings.switchProject")}
        description={t("settings.theLeakEntryForm")}
        confirmLabel={t("settings.switch")}
        cancelLabel={t("settings.cancel")}
        onConfirm={async () => {
          const next = pendingAdd;
          setPendingAdd(null);
          if (next) await performAdd(next);
        }}
        onCancel={() => setPendingAdd(null)}
      />
    </>
  );
}

/** Окно «Новый проект» поверх меню: та же форма, что была в настройках. */
function AddProjectDialog({ onConfirm, onClose }) {
  const { t } = useLanguage();
  const titleId = useId();
  const dialogRef = useModalDialog({ onClose });
  // В корень страницы: меню выдвигается сдвигом, и внутри него окно
  // занимало бы только его полосу, не затемняя экран целиком.
  return createPortal(
    <div className={s.addProjectRoot}>
      <div
        className={s.addProjectBackdrop}
        data-modal-backdrop=""
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        className={s.addProjectDialog}
        role="dialog"
        aria-modal="true"
        aria-label={t("settings.newProject")}
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <span id={titleId} hidden>
          {t("settings.newProject")}
        </span>
        <AddProjectForm onConfirm={onConfirm} onCancel={onClose} />
      </div>
    </div>,
    document.body,
  );
}
