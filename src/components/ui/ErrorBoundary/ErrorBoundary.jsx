import { Component } from "react";
import { preserveAndResetCorruptedProjects } from "@/app/project/projectStorage";
import { logger } from "@/utils/logger";
import { saveRecoveryFile } from "@/services/storage/saveRecoveryFile";
import s from "./ErrorBoundary.module.scss";

// The only screen that keeps its Russian text in the source. It renders after
// something has already failed, and i18n is one of the things that can be the
// failure: asking for a translation here risks showing raw keys — or nothing —
// at the exact moment the reader needs to be told what to press. The locale
// test allows this file by name.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, saveNotice: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    logger.error("[ErrorBoundary]", error, info);
  }

  // Исход сохранения виден на экране, а не только в файловом менеджере. В
  // браузере файл падает в загрузки сам собой, на телефоне — в папку, которую
  // без подсказки не найти; а отказ на обеих платформах раньше выглядел ровно
  // как успех, потому что не выглядел никак.
  saveFile = async (fileName, text) => {
    this.setState({ saveNotice: null });
    const result = await saveRecoveryFile({ fileName, text });
    if (!result.ok) {
      logger.error("[ErrorBoundary] save failed", result.error);
      this.setState({ saveNotice: "Не удалось сохранить файл" });
      return;
    }
    this.setState({
      saveNotice: result.path
        ? `Сохранено в Документы/${result.path}`
        : `Файл сохранён: ${result.fileName}`,
    });
  };

  downloadProjectRecovery = () => {
    const raw = this.state.error?.recoveryValue;
    if (raw == null) return;
    void this.saveFile("leak-tracking-project-list-recovery.json", raw);
  };

  resetProjectStorage = () => {
    preserveAndResetCorruptedProjects(this.state.error?.recoveryValue);
    window.location.reload();
  };

  downloadDiagnostics = () => {
    void this.saveFile(
      "leak-tracking-diagnostics.json",
      logger.exportDiagnostics?.() ?? "{}",
    );
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.state.error?.code === "PROJECT_LIST_READ_FAILED") {
      return (
        <div className={s.screen}>
          <div className={s.icon}>⚠️</div>
          <h2 className={s.title}>Повреждён список проектов</h2>
          <p className={s.msg}>
            Исходное значение сохранено. Скачайте его для восстановления, затем
            сбросьте только список проектов, чтобы снова открыть приложение.
          </p>
          {this.state.error?.recoveryValue != null && (
            <button className={s.btn} onClick={this.downloadProjectRecovery}>
              Скачать данные для восстановления
            </button>
          )}
          <button className={s.btnSecondary} onClick={this.resetProjectStorage}>
            Сохранить копию и сбросить список
          </button>
          {this.renderSaveNotice()}
        </div>
      );
    }

    return (
      <div className={s.screen}>
        <div className={s.icon}>⚠️</div>
        <h2 className={s.title}>Что-то пошло не так</h2>
        <p className={s.msg}>
          {this.state.error?.message ?? "Неизвестная ошибка"}
        </p>
        <button
          className={s.btn}
          onClick={() =>
            this.setState({ hasError: false, error: null, saveNotice: null })
          }
        >
          Попробовать снова
        </button>
        <button
          className={s.btnSecondary}
          onClick={() => window.location.reload()}
        >
          Перезагрузить приложение
        </button>
        <button className={s.btnSecondary} onClick={this.downloadDiagnostics}>
          Скачать диагностику
        </button>
        {this.renderSaveNotice()}
      </div>
    );
  }

  renderSaveNotice() {
    if (!this.state.saveNotice) return null;
    return (
      <p className={s.notice} role="status" aria-live="polite">
        {this.state.saveNotice}
      </p>
    );
  }
}
