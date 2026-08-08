package com.leak.tracking;

/**
 * Reads numeric bridge arguments without depending on how JSON parsed them.
 *
 * <p>The Capacitor bridge parses the call payload with {@code org.json}, which
 * returns an {@link Integer} for every whole number that fits in 32 bits and a
 * {@link Long} only beyond that. {@code PluginCall#getLong} accepts nothing but
 * {@link Long}, so a plain JavaScript number such as {@code 524288} reads back
 * as {@code null}. Numeric arguments must be widened from whatever
 * {@link Number} arrived instead.
 */
final class PluginNumbers {
    private PluginNumbers() {}

    static Long asLong(Object value) {
        // Anything that is not a number is a caller bug, and null makes the
        // caller reject the call rather than quietly coercing it.
        return value instanceof Number ? ((Number) value).longValue() : null;
    }
}
