package com.leak.tracking;

import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

final class SyncHandshakeDeadline {
    interface Cancellation {
        void cancel();
    }

    interface Scheduler {
        Cancellation schedule(Runnable task, long delayMillis);
    }

    interface NanoClock {
        long nanoTime();
    }

    private final Scheduler scheduler;
    private final NanoClock clock;
    private final Runnable closeConnection;
    private final long durationMillis;
    private final AtomicBoolean settled = new AtomicBoolean();
    private final AtomicBoolean expired = new AtomicBoolean();
    private volatile Cancellation scheduledTask;
    private volatile long expiresAtNanos;
    private volatile boolean started;

    SyncHandshakeDeadline(
        Scheduler scheduler,
        NanoClock clock,
        Runnable closeConnection,
        long durationMillis
    ) {
        this.scheduler = scheduler;
        this.clock = clock;
        this.closeConnection = closeConnection;
        this.durationMillis = durationMillis;
    }

    synchronized void start() {
        if (started) throw new IllegalStateException("TLS deadline already started");
        started = true;
        expiresAtNanos =
            clock.nanoTime() + TimeUnit.MILLISECONDS.toNanos(durationMillis);
        Cancellation task = scheduler.schedule(this::expire, durationMillis);
        scheduledTask = task;
        // A test scheduler or an overloaded executor may run the callback
        // before schedule() returns. Do not retain that completed task.
        if (settled.get()) task.cancel();
    }

    boolean complete() {
        if (!started) throw new IllegalStateException("TLS deadline was not started");
        if (clock.nanoTime() - expiresAtNanos >= 0) expire();
        boolean completedBeforeDeadline = settled.compareAndSet(false, true);
        cancelScheduledTask();
        return completedBeforeDeadline;
    }

    void cancel() {
        settled.set(true);
        cancelScheduledTask();
    }

    boolean didExpire() {
        return expired.get();
    }

    private void expire() {
        if (!settled.compareAndSet(false, true)) return;
        expired.set(true);
        closeConnection.run();
    }

    private void cancelScheduledTask() {
        Cancellation task = scheduledTask;
        if (task != null) task.cancel();
    }
}
