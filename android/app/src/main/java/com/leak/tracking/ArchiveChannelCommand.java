package com.leak.tracking;

import java.util.Locale;
import java.util.UUID;

/**
 * The control half of the archive upload channel.
 *
 * Photos travel over that channel as raw ArrayBuffers, and an ArrayBuffer
 * carries nothing but bytes — no room for a token saying which upload it
 * belongs to. So the channel is opened and closed by two text messages around
 * the binary ones, and this parses them.
 *
 * Deliberately not JSON: the format has two commands and one argument, and a
 * parser with no dependencies is one that a plain JVM test can exercise.
 */
final class ArchiveChannelCommand {

    enum Type {
        BEGIN,
        END,
        UNKNOWN
    }

    private final Type type;
    private final String token;

    private ArchiveChannelCommand(Type type, String token) {
        this.type = type;
        this.token = token;
    }

    Type type() {
        return type;
    }

    /** The upload token of a BEGIN command; empty for every other command. */
    String token() {
        return token;
    }

    static ArchiveChannelCommand parse(String message) {
        if (message == null) return unknown();
        String trimmed = message.trim();
        if (trimmed.equalsIgnoreCase("end")) {
            return new ArchiveChannelCommand(Type.END, "");
        }

        String lower = trimmed.toLowerCase(Locale.ROOT);
        if (!lower.startsWith("begin ")) return unknown();

        String token = trimmed.substring("begin ".length()).trim();
        // The token is minted by prepareArchive as a UUID. Anything else never
        // matches a prepared archive anyway, and rejecting it here keeps a
        // malformed value from reaching the map lookup at all.
        if (!isUuid(token)) return unknown();
        return new ArchiveChannelCommand(Type.BEGIN, token);
    }

    private static boolean isUuid(String value) {
        if (value == null || value.length() != 36) return false;
        try {
            return UUID.fromString(value).toString().equalsIgnoreCase(value);
        } catch (IllegalArgumentException error) {
            return false;
        }
    }

    private static ArchiveChannelCommand unknown() {
        return new ArchiveChannelCommand(Type.UNKNOWN, "");
    }
}
