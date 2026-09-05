package com.leak.tracking;

import java.util.ArrayList;
import javax.net.ssl.SSLServerSocket;
import javax.net.ssl.SSLSocket;

/**
 * Какие версии TLS разрешены сокетам синхронизации.
 *
 * Список задаётся перечислением разрешённого, а не вычёркиванием устаревшего:
 * версия, о которой этот код не знает, не включается сама. Пустой результат —
 * отказ, а не соединение по тому, что осталось.
 */
final class SyncTlsProtocols {

    private SyncTlsProtocols() {}

    static void enable(SSLServerSocket socket) throws Exception {
        socket.setEnabledProtocols(modern(socket.getSupportedProtocols()));
    }

    static void enable(SSLSocket socket) throws Exception {
        socket.setEnabledProtocols(modern(socket.getSupportedProtocols()));
    }

    static String[] modern(String[] supportedProtocols) throws Exception {
        ArrayList<String> enabled = new ArrayList<>();
        if (supportedProtocols != null) {
            for (String protocol : supportedProtocols) {
                if ("TLSv1.3".equals(protocol) || "TLSv1.2".equals(protocol)) {
                    enabled.add(protocol);
                }
            }
        }
        if (enabled.isEmpty()) {
            throw new Exception("This Android version does not support TLS 1.2");
        }
        return enabled.toArray(new String[0]);
    }
}
