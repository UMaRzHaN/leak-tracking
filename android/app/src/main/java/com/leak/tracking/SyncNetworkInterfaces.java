package com.leak.tracking;

import java.util.Locale;

/**
 * Насколько сетевой интерфейс годится, чтобы объявить по нему адрес хоста.
 *
 * Отрицательная оценка — запрет, а не «похуже»: туннель, VPN и мобильная сеть
 * уводят соединение за пределы того помещения, в котором два человека стоят с
 * телефонами, а весь смысл этой синхронизации в том, что дальше комнаты она не
 * уходит. Остальное — предпочтения: Wi-Fi лучше точки доступа, точка доступа
 * лучше провода, прямое соединение p2p — на крайний случай.
 */
final class SyncNetworkInterfaces {

    static final int REJECTED = -1;

    private SyncNetworkInterfaces() {}

    static int score(String rawName) {
        String name = rawName == null ? "" : rawName.toLowerCase(Locale.ROOT);
        if (name.startsWith("tun") || name.startsWith("ppp") || name.startsWith("rmnet") || name.contains("vpn")) {
            return REJECTED;
        }
        if (name.startsWith("wlan")) return 100;
        if (name.startsWith("ap") || name.contains("softap") || name.startsWith("swlan")) return 95;
        if (name.startsWith("eth")) return 90;
        if (name.contains("p2p")) return 50;
        return 10;
    }
}
