package com.leak.tracking;

final class SyncConnectionDeadline {
    interface Cancellation {
        void cancel();
    }

    interface Scheduler {
        Cancellation schedule(Runnable task, long delayMillis);
    }

    private final Scheduler scheduler;
    private final Runnable closeConnection;
    private final long preAuthDurationMillis;
    private final long protocolDurationMillis;
    private Cancellation activeDeadline;

    SyncConnectionDeadline(
        Scheduler scheduler,
        Runnable closeConnection,
        long preAuthDurationMillis,
        long protocolDurationMillis
    ) {
        this.scheduler = scheduler;
        this.closeConnection = closeConnection;
        this.preAuthDurationMillis = preAuthDurationMillis;
        this.protocolDurationMillis = protocolDurationMillis;
    }

    synchronized void startPreAuth() {
        replace(preAuthDurationMillis);
    }

    synchronized void markAuthenticated() {
        replace(protocolDurationMillis);
    }

    synchronized void cancel() {
        Cancellation deadline = activeDeadline;
        activeDeadline = null;
        if (deadline != null) deadline.cancel();
    }

    private void replace(long delayMillis) {
        cancel();
        activeDeadline = scheduler.schedule(closeConnection, delayMillis);
    }
}
