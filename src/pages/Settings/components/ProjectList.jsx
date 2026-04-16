import { useState, useRef, useEffect } from "react";
import { PROJECT_META } from "../../../configs/projects";
import s from "./ProjectList.module.scss";

const PROJECT_ICONS = { upstream: "⛽", midstream: "🔧", downstream: "🏭" };
const DELETE_ARM_MS = 3000;

export default function ProjectList({ projects, activeId, onSelect, onRename, onRemove }) {
  return (
    <div className={s.list}>
      {projects.map((p) => (
        <ProjectItem
          key={p.id}
          project={p}
          isActive={p.id === activeId}
          onSelect={() => onSelect(p.id)}
          onRename={(name) => onRename(p.id, name)}
          onRemove={() => onRemove(p.id)}
        />
      ))}
    </div>
  );
}

function ProjectItem({ project, isActive, onSelect, onRename, onRemove }) {
  const [editing, setEditing]         = useState(false);
  const [nameInput, setNameInput]     = useState(project.name);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const timerRef = useRef(null);
  const meta = PROJECT_META[project.type];

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

  // Disarm on edit mode enter or unmount
  useEffect(() => { if (editing) { clearTimeout(timerRef.current); setDeleteArmed(false); } }, [editing]);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <div className={`${s.item} ${isActive ? s.active : ""}`}>
      <button
        className={s.selectArea}
        type="button"
        onClick={onSelect}
        title={isActive ? "Активный проект" : "Выбрать проект"}
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
                if (e.key === "Escape") { setNameInput(project.name); setEditing(false); }
              }}
              onBlur={commitRename}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className={s.name}>{project.name}</span>
          )}
          <span className={s.type}>{meta?.title ?? project.type}</span>
          <span className={s.folder}>📁 {project.folderName}</span>
        </div>
      </button>

      <div className={s.actions}>
        {!editing && !deleteArmed && (
          <button
            className={s.actionBtn}
            type="button"
            title="Переименовать"
            onClick={() => { setNameInput(project.name); setEditing(true); }}
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
            <span className={s.deleteBtnLabel}>Удалить?</span>
            <span className={s.deleteBtnProgress} />
          </button>
        ) : (
          <button
            className={`${s.actionBtn} ${s.deleteBtn}`}
            type="button"
            title="Удалить проект"
            onClick={armDelete}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
