package com.leak.tracking;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import org.junit.Test;

public class HostSessionEndTest {
    @Test
    public void reasonNamedByTheClientWins() {
        assertEquals(
            HostSessionEnd.COMPLETED,
            HostSessionEnd.afterClient(HostSessionEnd.COMPLETED, true, false)
        );
        assertEquals(
            HostSessionEnd.AUTH_LIMIT,
            HostSessionEnd.afterClient(HostSessionEnd.AUTH_LIMIT, true, true)
        );
    }

    @Test
    public void exhaustedCodeBudgetIsReportedEvenWhenTheClientCouldNotSayIt() {
        // Ответ об ошибке не записался после последнего неверного кода:
        // обработка вернула CONTINUE, но сеанс всё равно закрывается.
        assertEquals(
            HostSessionEnd.AUTH_LIMIT,
            HostSessionEnd.afterClient(null, false, true)
        );
    }

    @Test
    public void completedSyncExchangeIsNotReportedAsSessionEnd() {
        // Об обмене WebView узнаёт из archiveReceived и уже сливает архив;
        // hostSessionEnded сбросил бы экран в ожидание посреди слияния.
        assertNull(HostSessionEnd.afterClient(null, true, false));
        assertNull(HostSessionEnd.afterClient(null, true, true));
        assertNull(HostSessionEnd.afterClient(null, false, false));
    }

    @Test
    public void pluginReportsAuthLimitAndAbortedAcceptLoop() throws Exception {
        // Сам плагин без Capacitor не поднять — проверяется, что обе дороги
        // к закрытию сеанса доходят до hostSessionEnded.
        String source = new String(
            Files.readAllBytes(
                Paths.get("src/main/java/com/leak/tracking/LocalSyncPlugin.java")
            ),
            StandardCharsets.UTF_8
        );
        assertTrue(source.contains("shouldStop ? ClientOutcome.AUTH_LIMIT : ClientOutcome.CONTINUE"));
        assertTrue(!source.contains("shouldStop ? ClientOutcome.STOP : ClientOutcome.CONTINUE"));
        assertTrue(source.contains("notifyHostSessionEnded(HostSessionEnd.ERROR, transferCount)"));
        assertTrue(source.contains("HostSessionEnd.afterClient("));
    }
}
