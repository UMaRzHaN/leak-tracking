package com.leak.tracking;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class SyncConnectionGuardTest {
    @Test
    public void boundsConcurrentHandshakesAndReleasesCapacity() {
        SyncConnectionGuard guard = new SyncConnectionGuard(2, 5);

        assertTrue(guard.tryAcquire());
        assertTrue(guard.tryAcquire());
        assertFalse(guard.tryAcquire());

        guard.release();
        assertTrue(guard.tryAcquire());
    }

    @Test
    public void stopsAfterFailureLimitAndCanResetForANewSession() {
        SyncConnectionGuard guard = new SyncConnectionGuard(1, 3);

        assertFalse(guard.registerFailure());
        assertFalse(guard.registerFailure());
        assertTrue(guard.registerFailure());

        guard.resetFailures();
        assertFalse(guard.registerFailure());
    }
}
