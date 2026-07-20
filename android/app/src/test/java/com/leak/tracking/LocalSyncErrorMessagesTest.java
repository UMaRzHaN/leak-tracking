package com.leak.tracking;

import static org.junit.Assert.assertEquals;

import java.io.EOFException;
import java.net.ConnectException;
import java.net.SocketException;
import java.net.SocketTimeoutException;
import org.junit.Test;

public class LocalSyncErrorMessagesTest {
    @Test
    public void turnsUnexpectedEofIntoTransferMessage() {
        assertEquals(
            "Соединение прервано во время передачи",
            LocalSyncErrorMessages.readable(new EOFException())
        );
    }

    @Test
    public void distinguishesConnectionFailureFromInterruptedTransfer() {
        assertEquals(
            "Не удалось подключиться к устройству",
            LocalSyncErrorMessages.readable(new ConnectException("Connection refused"))
        );
    }

    @Test
    public void turnsSocketFailureIntoTransferMessage() {
        assertEquals(
            "Соединение прервано во время передачи",
            LocalSyncErrorMessages.readable(new SocketException("Connection reset"))
        );
    }

    @Test
    public void distinguishesTimeoutsFromDisconnectedTransfers() {
        assertEquals(
            "Время ожидания соединения истекло",
            LocalSyncErrorMessages.readable(new SocketTimeoutException("Read timed out"))
        );
    }

    @Test
    public void preservesUsefulProtocolErrors() {
        assertEquals(
            "Неверный код подключения",
            LocalSyncErrorMessages.readable(new Exception("Неверный код подключения"))
        );
    }
}
