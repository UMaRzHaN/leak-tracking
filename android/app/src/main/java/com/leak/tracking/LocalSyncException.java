package com.leak.tracking;

/**
 * A sync failure that carries a {@link LocalSyncFailure} code alongside its
 * message, so the web layer can translate it instead of displaying the
 * Russian text this plugin produces.
 *
 * <p>The message is still filled in and still sent to the peer: a device
 * running an older build has no table of codes and would otherwise show the
 * identifier itself.
 */
final class LocalSyncException extends Exception {

    private final String code;

    LocalSyncException(String code, String message) {
        super(message);
        this.code = code;
    }

    String getCode() {
        return code;
    }

    /** The code of a failure, or null when it did not come with one. */
    static String codeOf(Throwable error) {
        return error instanceof LocalSyncException
            ? ((LocalSyncException) error).getCode()
            : null;
    }
}
