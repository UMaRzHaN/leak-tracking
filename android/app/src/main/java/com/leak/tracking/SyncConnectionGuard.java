package com.leak.tracking;

import java.util.concurrent.Semaphore;

final class SyncConnectionGuard {
    private final Semaphore slots;
    private final int maxFailures;
    private int failures;

    SyncConnectionGuard(int maxConcurrentConnections, int maxFailures) {
        this.slots = new Semaphore(maxConcurrentConnections);
        this.maxFailures = maxFailures;
    }

    boolean tryAcquire() {
        return slots.tryAcquire();
    }

    void release() {
        slots.release();
    }

    synchronized boolean registerFailure() {
        failures += 1;
        return failures >= maxFailures;
    }

    synchronized void resetFailures() {
        failures = 0;
    }
}
