package com.leak.tracking;

final class SyncSessionClaim {
    private Object owner;

    synchronized boolean tryClaim(Object session) {
        if (session == null || owner != null) return false;
        owner = session;
        return true;
    }

    synchronized void release(Object session) {
        if (owner == session) owner = null;
    }

    synchronized void reset() {
        owner = null;
    }
}