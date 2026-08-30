import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useSchemas } from "./useSchemas";
import { openSchemaExternally } from "./openSchemaExternally";
import { isNative } from "@/utils/platform";
import SchemaViewer from "./SchemaViewer";
import VirtualizedLeakList from "@/features/leakList/VirtualizedLeakList/VirtualizedLeakList";
import {
  formatSchemaSize,
  isImageSchema,
  isLargeSchema,
  isPdfSchema,
} from "@/domain/technologicalSchemas";
import s from "./SchemaList.module.scss";
import db from "@/pages/DataBase/DataBase.module.scss";

const ACCEPT = "image/*,application/pdf,.pdf";

/**
 * The drawings attached to a project.
 *
 * Loading them ahead of a walk and adding them part-way through are the same
 * path — nothing here treats an empty list as "not configured yet".
 */
export default function SchemaList({ project }) {
  const { t } = useLanguage();
  const { schemas, loading, error, addSchema, removeSchema, readSchemaFile } =
    useSchemas(project);

  const inputRef = useRef(/** @type {HTMLInputElement|null} */ (null));
  const [notice, setNotice] = useState(
    /** @type {{kind: string, text?: string, schema?: any}|null} */ (null),
  );
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(
    /** @type {{url?: string, schema?: any}|null} */ (null),
  );
  const [search, setSearch] = useState("");
  const listRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  // Меряется, а не задаётся: над списком стоит кнопка и, бывает, предупреждение.
  const [listHeight, setListHeight] = useState(600);

  useEffect(() => {
    const node = listRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;

    const measure = () => setListHeight(node.clientHeight || 600);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [loading, schemas.length]);

  // Object URLs outlive the component unless revoked by hand, and a drawing is
  // the largest thing the app holds — leaking one per open would add up fast.
  useEffect(
    () => () => {
      if (open?.url) URL.revokeObjectURL(open.url);
    },
    [open],
  );

  const handlePick = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      setBusy(true);
      setNotice(null);
      try {
        // Warned about, never refused: a drawing somebody needs is worth a slow
        // render, and they should hear about it before the wait, not after.
        if (isLargeSchema({ size: file.size })) {
          setNotice({
            kind: "warning",
            text: t("schemas.largeFile", { size: formatSchemaSize(file.size) }),
          });
        }
        await addSchema(file);
      } catch (addError) {
        setNotice({
          kind: "error",
          text:
            addError?.code === "SCHEMA_UNSUPPORTED"
              ? t("schemas.unsupported")
              : t("schemas.addFailed"),
        });
      } finally {
        setBusy(false);
      }
    },
    [addSchema, t],
  );

  const handleOpen = useCallback(
    async (schema) => {
      /*
       * Вкладка открывается прямо в обработчике нажатия, ещё пустой. Браузер
       * разрешает открыть её только пока обрабатывает касание, а чтение
       * чертежа из хранилища длится дольше — к моменту, когда байты готовы,
       * разрешения уже нет, и каждый PDF сообщал «браузер заблокировал новую
       * вкладку». Без noopener: без ссылки на окно его некуда направить.
       */
      let targetWindow = /** @type {Window|null} */ (null);
      if (!isNative && isPdfSchema(schema)) {
        try {
          targetWindow = window.open("", "_blank");
          if (targetWindow) targetWindow.opener = null;
        } catch {
          // Окно не открылось — ниже отработает обычный путь и, если браузер
          // откажет и там, человек увидит сообщение об этом.
          targetWindow = null;
        }
      }

      setBusy(true);
      setNotice(null);
      try {
        const blob = await readSchemaFile(schema);
        if (!blob) {
          targetWindow?.close();
          setNotice({ kind: "error", text: t("schemas.missingFile") });
          return;
        }

        if (isImageSchema(schema)) {
          setOpen({ schema, url: URL.createObjectURL(blob) });
          return;
        }
        // PDF goes to whatever the device already reads PDFs with — see
        // openSchemaExternally for why the app does not render it itself.
        await openSchemaExternally(project, schema, blob, { targetWindow });
      } catch (openError) {
        targetWindow?.close();
        setNotice({
          kind: "error",
          text:
            openError?.code === "SCHEMA_OPEN_BLOCKED"
              ? t("schemas.popupBlocked")
              : t("schemas.openFailed"),
        });
      } finally {
        setBusy(false);
      }
    },
    [project, readSchemaFile, t],
  );

  /*
   * Комплект чертежей месторождения — сотни листов, и нужный ищут по имени:
   * «обвязка устья», «уппг». Тем же поиском, что на базе и в реестре — по
   * названию и по подписи места, потому что чертёж подписывают и так, и так.
   */
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return schemas;
    return schemas.filter((schema) =>
      [schema.name, schema.location]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [schemas, search]);

  const renderSchema = useCallback(
    (schema) => (
      <div className={s.card}>
        <button
          type="button"
          className={s.cardBody}
          onClick={() => handleOpen(schema)}
          disabled={busy}
        >
          <span className={s.kind}>
            {isPdfSchema(schema) ? "PDF" : t("schemas.image")}
          </span>
          <span className={s.name}>{schema.name}</span>
          <span className={s.meta}>
            {[formatSchemaSize(schema.size), schema.location]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </button>
        <button
          type="button"
          className={s.remove}
          onClick={() => removeSchema(schema)}
          aria-label={t("schemas.remove")}
          disabled={busy}
        >
          ×
        </button>
      </div>
    ),
    [busy, handleOpen, removeSchema, t],
  );

  const handleClose = useCallback(() => {
    setOpen((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
  }, []);

  return (
    <div className={s.panel}>
      {/* Rendered over the list rather than instead of it: the drawing used to
          replace the whole screen, navigation included, leaving nothing to
          press to get back. */}
      {open && (
        <SchemaViewer
          src={open.url}
          alt={open.schema.name}
          onClose={handleClose}
          texts={{
            fit: t("schemas.fit"),
            close: t("schemas.close"),
            hint: t("schemas.viewerHint"),
          }}
        />
      )}

      {error && (
        <p className={s.error} role="alert">
          {t("schemas.loadError")}
        </p>
      )}

      {notice && (
        <p
          className={notice.kind === "error" ? s.error : s.warning}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          {notice.text}
        </p>
      )}

      {/* Поиск выше кнопки: комплект загружают однажды, а ищут в нём каждый
          раз, когда открывают вкладку. */}
      {schemas.length > 1 && (
        <div className={db.searchRow}>
          <div className={db.searchWrap}>
            <span className={db.searchIcon}>🔍</span>
            {/* Не type="search": браузер рисует свой крестик, и рядом с
                нашим их получалось два. */}
            <input
              className={db.searchInput}
              type="text"
              value={search}
              placeholder={t("schemas.searchPlaceholder")}
              aria-label={t("schemas.searchPlaceholder")}
              autoComplete="off"
              enterKeyHint="search"
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <button
                type="button"
                className={db.clearSearch}
                onClick={() => setSearch("")}
                aria-label={t("database.clearSearch")}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        className={s.primary}
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        {busy ? t("schemas.working") : t("schemas.add")}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={handlePick}
        className={s.hiddenInput}
        aria-label={t("schemas.add")}
      />

      {loading ? (
        <p className={s.muted}>{t("schemas.loading")}</p>
      ) : schemas.length === 0 ? (
        <p className={s.muted}>{t("schemas.empty")}</p>
      ) : visible.length === 0 ? (
        <p className={s.muted}>{t("schemas.noMatches")}</p>
      ) : (
        /*
         * Тот же виртуализатор, что у списка утечек и у реестра. Комплект
         * чертежей месторождения — это сотни листов, и отрисовывать их все
         * ради экрана, по которому пролистывают до нужного, незачем.
         */
        <div ref={listRef} className={s.list}>
          <VirtualizedLeakList
            items={visible}
            height={listHeight}
            bottomPadding={88}
            gap={8}
            renderItem={renderSchema}
          />
        </div>
      )}
    </div>
  );
}
