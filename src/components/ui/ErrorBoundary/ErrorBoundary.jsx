import { Component } from "react";
import { preserveAndResetCorruptedProjects } from "@/app/project/projectStorage";
import { logger } from "@/utils/logger";
import s from "./ErrorBoundary.module.scss";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    logger.error("[ErrorBoundary]", error, info);
  }

  downloadProjectRecovery = () => {
    const raw = this.state.error?.recoveryValue;
    if (raw == null) return;
    const url = URL.createObjectURL(
      new Blob([raw], { type: "application/json;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "leak-tracking-project-list-recovery.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  resetProjectStorage = () => {
    preserveAndResetCorruptedProjects(this.state.error?.recoveryValue);
    window.location.reload();
  };

  downloadDiagnostics = () => {
    const payload = logger.exportDiagnostics?.() ?? "{}";
    const url = URL.createObjectURL(
      new Blob([payload], { type: "application/json;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "leak-tracking-diagnostics.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
          onClick={() => this.setState({ hasError: false, error: null })}
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
      </div>
    );
  }
}
