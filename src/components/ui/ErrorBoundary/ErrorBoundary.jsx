import { Component } from "react";
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

  render() {
    if (!this.state.hasError) return this.props.children;

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
      </div>
    );
  }
}
