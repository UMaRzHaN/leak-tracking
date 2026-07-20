package com.leak.tracking;

import java.io.EOFException;
import java.net.ConnectException;
import java.net.NoRouteToHostException;
import java.net.SocketException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;

final class LocalSyncErrorMessages {
    private static final String CONNECTION_INTERRUPTED = "Соединение прервано во время передачи";

    private LocalSyncErrorMessages() {}

    static String readable(Exception error) {
        if (error instanceof SocketTimeoutException) {
            return "Время ожидания соединения истекло";
        }
        if (
            error instanceof ConnectException ||
            error instanceof NoRouteToHostException ||
            error instanceof UnknownHostException
        ) {
            return "Не удалось подключиться к устройству";
        }
        if (error instanceof EOFException || error instanceof SocketException) {
            return CONNECTION_INTERRUPTED;
        }

        String message = error.getMessage();
        return message == null || message.trim().isEmpty() ? error.getClass().getSimpleName() : message;
    }
}
