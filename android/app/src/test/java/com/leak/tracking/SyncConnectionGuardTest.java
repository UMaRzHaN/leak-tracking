package com.leak.tracking;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.concurrent.atomic.AtomicLong;
import org.junit.Test;

public class SyncConnectionGuardTest {
    @Test
    public void boundsConcurrentHandshakesAndReleasesCapacity() {
        SyncConnectionGuard guard = new SyncConnectionGuard(2, 5);

        assertTrue(guard.tryAcquire("peer-a"));
        assertTrue(guard.tryAcquire("peer-b"));
        assertFalse(guard.tryAcquire("peer-c"));

        guard.release("peer-a");
        assertTrue(guard.tryAcquire("peer-c"));
    }

    @Test
    public void reservesAtMostOneHandshakeSlotPerPeer() {
        SyncConnectionGuard guard = new SyncConnectionGuard(4, 5);

        assertTrue(guard.tryAcquire("peer-a"));
        assertFalse(guard.tryAcquire("peer-a"));
        assertTrue(guard.tryAcquire("peer-b"));
    }

    @Test
    public void temporarilyBlocksPeersThatFailBeforeAuthentication() {
        AtomicLong now = new AtomicLong(1_000L);
        SyncConnectionGuard guard = new SyncConnectionGuard(
            4,
            5,
            15_000L,
            now::get
        );

        assertTrue(guard.tryAcquire("peer-a"));
        assertTrue(guard.registerPreAuthFailure("peer-a"));
        guard.release("peer-a");
        assertFalse(guard.tryAcquire("peer-a"));
        assertTrue(guard.tryAcquire("peer-b"));

        now.addAndGet(15_001L);
        assertTrue(guard.tryAcquire("peer-a"));
    }

    @Test
    public void authenticatedTransferFailuresAreNotClassifiedAsPreAuth() {
        SyncConnectionGuard guard = new SyncConnectionGuard(1, 5);

        assertTrue(guard.tryAcquire("peer-a"));
        guard.markAuthenticated("peer-a");

        assertFalse(guard.registerPreAuthFailure("peer-a"));
    }

    @Test
    public void stopsAfterFailureLimitAndCanResetForANewSession() {
        SyncConnectionGuard guard = new SyncConnectionGuard(1, 3);

        assertFalse(guard.registerFailure());
        assertFalse(guard.registerFailure());
        assertTrue(guard.registerFailure());
        assertTrue(guard.isFailureLimitReached());
        assertTrue(guard.registerFailure());
        assertTrue(guard.isFailureLimitReached());

        guard.resetFailures();
        assertFalse(guard.registerFailure());
        assertFalse(guard.isFailureLimitReached());
    }
}
