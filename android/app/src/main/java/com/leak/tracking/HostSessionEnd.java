package com.leak.tracking;

/**
 * Причины, с которыми хост сообщает WebView о закрытии сеанса
 * (событие hostSessionEnded). Без события экран продолжает показывать QR,
 * хотя сервер за ним уже закрыт, — поэтому причина нужна любому закрытию,
 * которое WebView не начинало само.
 */
final class HostSessionEnd {
    static final String EXPIRED = "expired";
    static final String COMPLETED = "completed";
    /** Исчерпан лимит неверных кодов подключения. */
    static final String AUTH_LIMIT = "auth-limit";
    /** Цикл приёма подключений оборвался сам, не по остановке сеанса. */
    static final String ERROR = "error";

    private HostSessionEnd() {}

    /**
     * Причина закрытия после обработки одного клиента.
     *
     * @param outcomeReason причина, которую назвала сама обработка, или null
     * @param outcomeStops обработка сама попросила закрыть сеанс
     * @param failureLimitReached лимит неверных кодов исчерпан — в том числе
     *     когда ответ клиенту об ошибке уже не удалось записать
     * @return причина для hostSessionEnded или null, если сообщать не нужно:
     *     успешный обмен в режиме синхронизации закрывает сеанс сам и
     *     сообщает о себе событием archiveReceived
     */
    static String afterClient(
        String outcomeReason,
        boolean outcomeStops,
        boolean failureLimitReached
    ) {
        if (outcomeReason != null) return outcomeReason;
        if (!outcomeStops && failureLimitReached) return AUTH_LIMIT;
        return null;
    }
}
