package com.leak.tracking;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import org.junit.Test;

public class SyncFingerprintsTest {

    private static final String SIXTY_FOUR = "0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF";

    @Test
    public void keepsOnlyHexDigitsAndUppercasesThem() {
        assertEquals("AB12CD", SyncFingerprints.normalize(" ab:12-cd "));
        assertEquals("", SyncFingerprints.normalize(null));
        assertEquals("", SyncFingerprints.normalize("зырь"));
    }

    @Test
    public void acceptsOnlyAFullLengthFingerprint() {
        assertTrue(SyncFingerprints.isValid(SIXTY_FOUR));
        assertFalse(SyncFingerprints.isValid(SIXTY_FOUR.substring(1)));
        assertFalse(SyncFingerprints.isValid(SIXTY_FOUR + "AB"));
        assertFalse(SyncFingerprints.isValid(""));
        assertFalse(SyncFingerprints.isValid(null));
    }

    @Test
    public void convertsAFingerprintToTheBytesItNames() throws Exception {
        byte[] bytes = SyncFingerprints.hexToBytes(SIXTY_FOUR);

        assertEquals(32, bytes.length);
        assertArrayEquals(new byte[] { 0x01, 0x23, 0x45, 0x67 }, java.util.Arrays.copyOf(bytes, 4));
        assertEquals((byte) 0xEF, bytes[31]);
    }

    /**
     * Короткий отпечаток дал бы короткий массив, а сравнение с ним идёт по
     * префиксу — то есть пустая строка подошла бы к любому сертификату. Длина
     * проверяется здесь, до того как из неё получатся байты.
     */
    @Test
    public void refusesToTurnAShortFingerprintIntoBytes() {
        assertThrows(Exception.class, () -> SyncFingerprints.hexToBytes(""));
        assertThrows(Exception.class, () -> SyncFingerprints.hexToBytes("AB"));
        assertThrows(Exception.class, () -> SyncFingerprints.hexToBytes(SIXTY_FOUR.substring(2)));
        assertThrows(Exception.class, () -> SyncFingerprints.hexToBytes(null));
    }

    @Test
    public void hashesToUppercaseHexOfTheRightLength() throws Exception {
        String empty = SyncFingerprints.sha256(new byte[0]);

        // Известный SHA-256 пустого ввода — проверка и длины, и регистра, и
        // того, что хеш считается от того, что дали, а не от его текста.
        assertEquals("E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855", empty);
        assertTrue(SyncFingerprints.isValid(empty));
    }

    @Test
    public void survivesTheRoundTripFromHashToBytes() throws Exception {
        String hash = SyncFingerprints.sha256("сертификат".getBytes(StandardCharsets.UTF_8));

        assertEquals(hash, SyncFingerprints.normalize(hash));
        assertEquals(32, SyncFingerprints.hexToBytes(hash).length);
    }
}
