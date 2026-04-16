import { useState } from "react";
import { PROJECT_META } from "../../../configs/projects";
import s from "./ProjectList.module.scss";

const PROJECT_ICONS = { upstream: "⛽", midstream: "🔧", downstream: "🏭" };

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
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(project.name);
  const meta = PROJECT_META[project.type];

  const commitRename = () => {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== project.name) onRename(trimmed);
    setEditing(false);
  };

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
        {!editing && (
          <button
            className={s.actionBtn}
            type="button"
            title="Переименовать"
            onClick={() => { setNameInput(project.name); setEditing(true); }}
          >
            ✏
          </button>
        )}
        <button
          className={`${s.actionBtn} ${s.deleteBtn}`}
          type="button"
          title="Удалить проект"
          onClick={onRemove}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
