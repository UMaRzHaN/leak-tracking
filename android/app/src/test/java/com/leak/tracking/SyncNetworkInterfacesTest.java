package com.leak.tracking;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class SyncNetworkInterfacesTest {

    /**
     * Отрицательная оценка — запрет: по такому интерфейсу соединение уходит за
     * пределы комнаты, в которой стоят два человека с телефонами, а дальше
     * комнаты эта синхронизация не рассчитана.
     */
    @Test
    public void rejectsTunnelsVpnAndMobileNetworks() {
        for (String name : new String[] { "tun0", "ppp0", "rmnet_data0", "myvpn", "VPN0" }) {
            assertEquals(name, SyncNetworkInterfaces.REJECTED, SyncNetworkInterfaces.score(name));
        }
    }

    @Test
    public void prefersWifiOverHotspotOverCable() {
        assertTrue(SyncNetworkInterfaces.score("wlan0") > SyncNetworkInterfaces.score("ap0"));
        assertTrue(SyncNetworkInterfaces.score("ap0") > SyncNetworkInterfaces.score("eth0"));
        assertTrue(SyncNetworkInterfaces.score("eth0") > SyncNetworkInterfaces.score("p2p0"));
        assertTrue(SyncNetworkInterfaces.score("p2p0") > SyncNetworkInterfaces.score("что-то"));
    }

    @Test
    public void readsHotspotsUnderEitherOfTheirNames() {
        assertEquals(SyncNetworkInterfaces.score("ap0"), SyncNetworkInterfaces.score("swlan0"));
        assertEquals(SyncNetworkInterfaces.score("ap0"), SyncNetworkInterfaces.score("softap0"));
    }

    /**
     * Имя проверяется по порядку, и `wlan` стоит раньше `softap`: точка
     * доступа, названная `wlan0-softap`, получает оценку Wi-Fi. На выбор это
     * не влияет — обе оценки положительные, а разница между ними значит лишь
     * то, какой из двух годных интерфейсов взять первым.
     */
    @Test
    public void treatsAHotspotNamedLikeWifiAsWifi() {
        assertEquals(SyncNetworkInterfaces.score("wlan0"), SyncNetworkInterfaces.score("wlan0-softap"));
    }

    @Test
    public void doesNotDependOnTheCaseOrOnHavingAName() {
        assertEquals(SyncNetworkInterfaces.score("wlan0"), SyncNetworkInterfaces.score("WLAN0"));
        assertEquals(10, SyncNetworkInterfaces.score(null));
    }
}
