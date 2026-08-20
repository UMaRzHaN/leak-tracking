package com.leak.tracking;

import static org.junit.Assert.assertEquals;

import java.util.UUID;
import org.junit.Test;

public class ArchiveChannelCommandTest {

    @Test
    public void parsesBeginWithToken() {
        String token = UUID.randomUUID().toString();
        ArchiveChannelCommand command = ArchiveChannelCommand.parse("begin " + token);
        assertEquals(ArchiveChannelCommand.Type.BEGIN, command.type());
        assertEquals(token, command.token());
    }

    @Test
    public void parsesEnd() {
        assertEquals(ArchiveChannelCommand.Type.END, ArchiveChannelCommand.parse("end").type());
        assertEquals(ArchiveChannelCommand.Type.END, ArchiveChannelCommand.parse("  END  ").type());
    }

    @Test
    public void rejectsATokenThatIsNotAUuid() {
        assertEquals(
            ArchiveChannelCommand.Type.UNKNOWN,
            ArchiveChannelCommand.parse("begin ../../etc/passwd").type()
        );
        assertEquals(
            ArchiveChannelCommand.Type.UNKNOWN,
            ArchiveChannelCommand.parse("begin ").type()
        );
        assertEquals(
            ArchiveChannelCommand.Type.UNKNOWN,
            ArchiveChannelCommand.parse("begin 1234").type()
        );
    }

    @Test
    public void rejectsUnknownAndMissingMessages() {
        assertEquals(ArchiveChannelCommand.Type.UNKNOWN, ArchiveChannelCommand.parse(null).type());
        assertEquals(ArchiveChannelCommand.Type.UNKNOWN, ArchiveChannelCommand.parse("").type());
        assertEquals(
            ArchiveChannelCommand.Type.UNKNOWN,
            ArchiveChannelCommand.parse("append something").type()
        );
    }

    @Test
    public void carriesNoTokenOutsideBegin() {
        assertEquals("", ArchiveChannelCommand.parse("end").token());
        assertEquals("", ArchiveChannelCommand.parse("nonsense").token());
    }
}
