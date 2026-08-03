package com.leak.tracking;

/**
 * Stable identifiers for the ways a local sync can fail.
 *
 * <p>The failure text this plugin produces is Russian, and it reaches the user
 * through the web layer, which has its own translations. Sending an identifier
 * alongside the text lets that layer show the message in the app's language
 * instead of passing a hard-coded Russian string straight to the screen.
 *
 * <p>Codes travel over the wire between two devices, so they are treated as a
 * protocol constant: rename one and an updated phone stops understanding a
 * message from an older one. The Russian text is still sent unchanged for
 * exactly that reason — see {@code LocalSyncPlugin#rejectPeer}.
 */
final class LocalSyncFailure {

    static final String INCOMPATIBLE_VERSION = "INCOMPATIBLE_VERSION";
    static final String SESSION_EXPIRED = "SESSION_EXPIRED";
    static final String SESSION_STOPPED = "SESSION_STOPPED";
    static final String INVALID_CODE = "INVALID_CODE";
    static final String DIFFERENT_ORIGIN = "DIFFERENT_ORIGIN";
    static final String SESSION_BUSY = "SESSION_BUSY";
    static final String TRANSFER_BUSY = "TRANSFER_BUSY";
    static final String NOT_CONFIRMED = "NOT_CONFIRMED";
    static final String ARCHIVE_CORRUPT = "ARCHIVE_CORRUPT";
    static final String WRONG_SESSION = "WRONG_SESSION";
    static final String FINGERPRINT_MISMATCH = "FINGERPRINT_MISMATCH";
    static final String CONNECTION_INTERRUPTED = "CONNECTION_INTERRUPTED";
    static final String ARCHIVE_EMPTY = "ARCHIVE_EMPTY";
    static final String ARCHIVE_TOO_LARGE = "ARCHIVE_TOO_LARGE";
    static final String NO_LOCAL_NETWORK = "NO_LOCAL_NETWORK";

    // Marks the status field of a rejection. Older builds compare the status
    // against "OK" and treat anything else as a failure, so appending a code
    // after the separator stays readable to them while giving newer builds
    // something to translate.
    static final String STATUS_PREFIX = "ERROR";
    static final String STATUS_SEPARATOR = ":";

    private LocalSyncFailure() {}

    /** A failure with no code degrades to the bare status older builds send. */
    static String status(String code) {
        return code == null || code.isEmpty()
            ? STATUS_PREFIX
            : STATUS_PREFIX + STATUS_SEPARATOR + code;
    }

    /**
     * Pulls the code out of a status field, or null when the peer is an older
     * build that sent a bare "ERROR".
     */
    static String codeFromStatus(String status) {
        if (status == null) return null;
        int separator = status.indexOf(STATUS_SEPARATOR);
        if (separator < 0 || separator == status.length() - 1) return null;
        return status.substring(separator + 1);
    }

    static boolean isFailureStatus(String status) {
        return status != null && !"OK".equals(status);
    }
}
