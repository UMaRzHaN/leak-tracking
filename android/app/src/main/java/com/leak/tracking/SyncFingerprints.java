package com.leak.tracking;

import java.security.MessageDigest;
import java.util.Locale;

/**
 * Отпечаток TLS-сертификата: как его записать, как прочитать и как сверить.
 *
 * Вынесено из плагина, потому что на нём держится всё доверие в протоколе:
 * сертификат никем не подписан, и единственное, что отличает хост от чужого,
 * — совпадение этих шестидесяти четырёх знаков. Внутри плагина это проверялось
 * только вживую, на двух телефонах; отдельным классом — тестами.
 */
final class SyncFingerprints {

    private static final int HEX_LENGTH = 64;

    private SyncFingerprints() {}

    /** Отпечаток так, как его показывают человеку и передают в QR. */
    static String normalize(String value) {
        return value == null ? "" : value.replaceAll("[^0-9A-Fa-f]", "").toUpperCase(Locale.ROOT);
    }

    static boolean isValid(String value) {
        return value != null && value.length() == HEX_LENGTH;
    }

    /**
     * Отпечаток в байты для побайтового сравнения.
     *
     * Длина проверяется здесь, а не у вызывающего: короткая строка дала бы
     * короткий массив, а сравнение с ним — совпадение по префиксу, то есть
     * пустой отпечаток подошёл бы к любому сертификату.
     */
    static byte[] hexToBytes(String value) throws Exception {
        if (!isValid(value)) throw new Exception("Invalid TLS certificate fingerprint");
        byte[] result = new byte[value.length() / 2];
        for (int index = 0; index < value.length(); index += 2) {
            result[index / 2] = (byte) Integer.parseInt(value.substring(index, index + 2), 16);
        }
        return result;
    }

    static String sha256(byte[] value) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] hash = digest.digest(value);
        StringBuilder result = new StringBuilder(hash.length * 2);
        for (byte item : hash) result.append(String.format(Locale.US, "%02X", item & 0xff));
        return result.toString();
    }
}
