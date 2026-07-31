package com.leak.tracking;

import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.Semaphore;
import java.util.function.LongSupplier;

final class SyncConnectionGuard {
    private static final long DEFAULT_PRE_AUTH_BLOCK_MILLIS = 15_000L;

    private final Semaphore slots;
    private final int maxFailures;
    private final long preAuthBlockMillis;
    private final LongSupplier clock;
    private final Map<String, PeerState> peers = new HashMap<>();
    private int failures;

    SyncConnectionGuard(int maxConcurrentConnections, int maxFailures) {
        this(maxConcurrentConnections, maxFailures, DEFAULT_PRE_AUTH_BLOCK_MILLIS, System::currentTimeMillis);
    }

    SyncConnectionGuard(
        int maxConcurrentConnections,
        int maxFailures,
        long preAuthBlockMillis,
        LongSupplier clock
    ) {
        this.slots = new Semaphore(maxConcurrentConnections);
        this.maxFailures = maxFailures;
        this.preAuthBlockMillis = preAuthBlockMillis;
        this.clock = clock;
    }

    synchronized boolean tryAcquire(String peerKey) {
        long now = clock.getAsLong();
        pruneExpiredPeers(now);
        String key = normalizePeerKey(peerKey);
        PeerState state = peers.get(key);
        if (state != null && (state.active || state.blockedUntil > now)) {
            return false;
        }
        if (!slots.tryAcquire()) return false;

        if (state == null) {
            state = new PeerState();
            peers.put(key, state);
        }
        state.active = true;
        state.authenticated = false;
        return true;
    }

    synchronized void markAuthenticated(String peerKey) {
        PeerState state = peers.get(normalizePeerKey(peerKey));
        if (state != null && state.active) state.authenticated = true;
    }

    synchronized boolean registerPreAuthFailure(String peerKey) {
        PeerState state = peers.get(normalizePeerKey(peerKey));
        if (state == null || !state.active || state.authenticated) return false;
        state.blockedUntil = Math.max(
            state.blockedUntil,
            clock.getAsLong() + preAuthBlockMillis
        );
        return true;
    }

    synchronized void release(String peerKey) {
        String key = normalizePeerKey(peerKey);
        PeerState state = peers.get(key);
        if (state == null || !state.active) return;

        state.active = false;
        state.authenticated = false;
        slots.release();
        if (state.blockedUntil <= clock.getAsLong()) peers.remove(key);
    }

    synchronized boolean registerFailure() {
        if (failures < maxFailures) failures += 1;
        return failures >= maxFailures;
    }

    synchronized boolean isFailureLimitReached() {
        return failures >= maxFailures;
    }

    synchronized void resetFailures() {
        failures = 0;
    }

    private void pruneExpiredPeers(long now) {
        Iterator<Map.Entry<String, PeerState>> iterator = peers.entrySet().iterator();
        while (iterator.hasNext()) {
            PeerState state = iterator.next().getValue();
            if (!state.active && state.blockedUntil <= now) iterator.remove();
        }
    }

    private String normalizePeerKey(String peerKey) {
        return peerKey == null || peerKey.isEmpty() ? "unknown" : peerKey;
    }

    private static final class PeerState {
        private boolean active;
        private boolean authenticated;
        private long blockedUntil;
    }
}
