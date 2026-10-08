package com.leak.tracking;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.net.InetAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.Test;

/**
 * Хост синхронизации слушает только объявленный локальный адрес.
 *
 * Плагин без Capacitor и ConnectivityManager не поднять, поэтому устройство
 * сокета сторожится по исходнику: ни одного серверного сокета без адреса, и
 * объявляется в QR тот самый адрес, к которому сокет привязан.
 */
public class LocalSyncBindAddressTest {

    private static final Path SOURCE = Paths.get(
        "src/main/java/com/leak/tracking/LocalSyncPlugin.java"
    );

    private static String source() throws Exception {
        return new String(Files.readAllBytes(SOURCE), StandardCharsets.UTF_8);
    }

    @Test
    public void serverSocketIsNeverOpenedOnAllInterfaces() throws Exception {
        Matcher calls = Pattern.compile("createServerSocket\\(([^)]*)\\)").matcher(source());
        int count = 0;
        while (calls.find()) {
            count++;
            assertEquals("0, SERVER_BACKLOG, bindAddress", calls.group(1).trim());
        }
        assertEquals(1, count);
    }

    @Test
    public void announcedHostIsTheBoundAddress() throws Exception {
        String text = source();
        assertTrue(text.contains("InetAddress bindAddress = findLocalIpv4Address();"));
        assertTrue(text.contains("result.put(\"host\", bindAddress.getHostAddress());"));
        // Без подходящей сети — ошибка, а не запасной вариант на всех интерфейсах.
        assertTrue(text.contains("LocalSyncFailure.NO_LOCAL_NETWORK"));
        assertFalse(text.contains("anyLocalAddress"));
        assertFalse(text.contains("0.0.0.0"));
    }

    @Test
    public void socketBoundToAnAddressDoesNotListenOnWildcard() throws Exception {
        InetAddress loopback = InetAddress.getByName("127.0.0.1");
        try (ServerSocket socket = new ServerSocket(0, 50, loopback)) {
            assertEquals(loopback, socket.getInetAddress());
            assertFalse(socket.getInetAddress().isAnyLocalAddress());
        }
    }
}
