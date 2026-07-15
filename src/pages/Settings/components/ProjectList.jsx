import { useState, useRef, useEffect } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { PROJECT_META } from "@/configs/projects";
import s from "./ProjectList.module.scss";

const PROJECT_ICONS = { upstream: "⛽", midstream: "🔧", downstream: "🏭" };
const DELETE_ARM_MS = 3000;

function projectTypeMeta(type, lang) {
  const meta = PROJECT_META[type];
  if (!meta) return { title: type };

  const titles = {
    upstream: lang === "ru" ? "Добыча" : "Upstream",
    midstream: lang === "ru" ? "Транспортировка" : "Midstream",
    downstream: lang === "ru" ? "Переработка" : "Downstream",
  };

  return { ...meta, title: titles[type] ?? meta.title };
}

export default function ProjectList({
  projects,
  activeId,
  onSelect,
  onRename,
  onRemove,
  onChangeSyncId,
}) {
  return (
    <div className={s.list}>
      {projects.map((project) => (
        <ProjectItem
          key={project.id}
          project={project}
          isActive={project.id === activeId}
          onSelect={() => onSelect(project.id)}
          onRename={(name) => onRename(project.id, name)}
          onRemove={() => onRemove(project.id)}
          onChangeSyncId={() => onChangeSyncId(project.id, project.syncId)}
        />
      ))}
    </div>
  );
}

function ProjectItem({
  project,
  isActive,
  onSelect,
  onRename,
  onRemove,
  onChangeSyncId,
}) {
  const { lang } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(project.name);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const timerRef = useRef(null);
  const meta = projectTypeMeta(project.type, lang);

  const commitRename = () => {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== project.name) onRename(trimmed);
    setEditing(false);
  };

  const armDelete = () => {
    setDeleteArmed(true);
    timerRef.current = setTimeout(() => setDeleteArmed(false), DELETE_ARM_MS);
  };

  const confirmDelete = () => {
    clearTimeout(timerRef.current);
    setDeleteArmed(false);
    onRemove();
  };

  useEffect(() => {
    if (editing) {
      clearTimeout(timerRef.current);
      setDeleteArmed(false);
    }
  }, [editing]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <div className={`${s.item} ${isActive ? s.active : ""}`}>
      <button
        className={s.selectArea}
        type="button"
        onClick={onSelect}
        title={
          isActive
            ? lang === "ru"
              ? "Активный проект"
              : "Active project"
            : lang === "ru"
              ? "Выбрать проект"
              : "Select project"
        }
      >
        <span className={s.activeIndicator}>{isActive ? "●" : "○"}</span>
        <span className={s.icon}>{PROJECT_ICONS[project.type]}</span>
        <div className={s.info}>
          {editing ? (
            <input
              className={s.nameInput}
              value={nameInput}
              autoFocus
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") {
                  setNameInput(project.name);
                  setEditing(false);
                }
              }}
              onBlur={commitRename}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className={s.name}>{project.name}</span>
          )}
          <span className={s.type}>{meta.title ?? project.type}</span>
          <span className={s.syncId}>
            syncId:{" "}
            <code>
              {project.syncId ||
                (lang === "ru" ? "еще не создан" : "not created yet")}
            </code>
          </span>
          <span className={s.folder}>📁 {project.folderName}</span>
        </div>
      </button>

      <div className={s.actions}>
        {!editing && !deleteArmed && (
          <button
            className={s.actionBtn}
            type="button"
            title={lang === "ru" ? "Изменить syncId" : "Change syncId"}
            onClick={onChangeSyncId}
          >
            ID
          </button>
        )}
        {!editing && !deleteArmed && (
          <button
            className={s.actionBtn}
            type="button"
            title={lang === "ru" ? "Переименовать" : "Rename"}
            onClick={() => {
              setNameInput(project.name);
              setEditing(true);
            }}
          >
            ✏
          </button>
        )}
        {deleteArmed ? (
          <button
            className={`${s.actionBtn} ${s.deleteBtnArmed}`}
            type="button"
            onClick={confirmDelete}
          >
            <span className={s.deleteBtnLabel}>
              {lang === "ru" ? "Удалить?" : "Delete?"}
            </span>
            <span className={s.deleteBtnProgress} />
          </button>
        ) : (
          <button
            className={`${s.actionBtn} ${s.deleteBtn}`}
            type="button"
            title={lang === "ru" ? "Удалить проект" : "Delete project"}
            onClick={armDelete}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
