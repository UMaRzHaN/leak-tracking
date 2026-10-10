package com.leak.tracking;

/**
 * Сбои accept() подряд. Единичный сбой бывает временным — сеть моргнула, —
 * и цикл приёма его переживает. Но сбой, повторяющийся раз за разом при
 * открытом сервере, не проходит сам: цикл крутился вхолостую и слал
 * syncError на каждом круге. После лимита подряд сеанс закрывается, и
 * экран узнаёт об этом событием hostSessionEnded.
 */
final class AcceptFailureStreak {
    static final int LIMIT = 5;

    private int failures;

    /** Подключение принято — счёт начинается заново. */
    void success() {
        failures = 0;
    }

    /** @return true, если сбоев подряд набралось на закрытие сеанса */
    boolean failure() {
        failures += 1;
        return failures >= LIMIT;
    }
}
