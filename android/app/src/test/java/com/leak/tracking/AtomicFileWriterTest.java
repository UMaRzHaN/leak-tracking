package com.leak.tracking;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class AtomicFileWriterTest {
    @Rule
    public TemporaryFolder temporaryFolder = new TemporaryFolder();

    @Test
    public void successfulReplacementPublishesNewBytes() throws Exception {
        File target = temporaryFolder.newFile("report.zip");
        Files.write(target.toPath(), "old".getBytes());
        byte[] replacement = "complete replacement".getBytes();

        AtomicFileWriter.replace(
            target,
            replacement,
            (source, destination) ->
                Files.move(source.toPath(), destination.toPath(), StandardCopyOption.REPLACE_EXISTING)
        );

        assertArrayEquals(replacement, Files.readAllBytes(target.toPath()));
        assertEquals(1, temporaryFolder.getRoot().listFiles().length);
    }

    @Test
    public void failedReplacementKeepsPreviousFileAndRemovesPendingFile() throws Exception {
        File target = temporaryFolder.newFile("report.zip");
        byte[] previous = "last usable export".getBytes();
        Files.write(target.toPath(), previous);

        assertThrows(
            IOException.class,
            () ->
                AtomicFileWriter.replace(
                    target,
                    "partial replacement".getBytes(),
                    (source, destination) -> {
                        throw new IOException("simulated storage failure");
                    }
                )
        );

        assertArrayEquals(previous, Files.readAllBytes(target.toPath()));
        assertEquals(1, temporaryFolder.getRoot().listFiles().length);
    }
}
