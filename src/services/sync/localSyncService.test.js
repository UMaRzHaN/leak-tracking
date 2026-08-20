import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const QR_SESSION = {
  sessionId: "11111111-1111-4111-8111-111111111111",
  expiresAt: 4_102_444_800_000,
};

const mocks = vi.hoisted(() => {
  const remove = vi.fn().mockResolvedValue(undefined);
  return {
    remove,
    plugin: {
      addListener: vi.fn().mockResolvedValue({ remove }),
      prepareArchive: vi.fn().mockResolvedValue({
        token: "archive-token",
        maxArchiveBytes: 64 * 1024 * 1024,
      }),
      appendArchiveChunk: vi.fn().mockResolvedValue({}),
      discardArchive: vi.fn().mockResolvedValue({}),
      releaseReceivedArchive: vi.fn().mockResolvedValue({}),
      startHost: vi.fn().mockResolvedValue({
        host: "192.168.43.1",
        port: 49152,
        code: "123456",
        fingerprint: "A".repeat(64),
        sessionId: "11111111-1111-4111-8111-111111111111",
        expiresAt: 4_102_444_800_000,
        transferCount: 0,
      }),
      stopHost: vi.fn().mockResolvedValue({}),
      resolvePeerApproval: vi.fn().mockResolvedValue({}),
      exchange: vi.fn(),
      fetchArchive: vi.fn(),
    },
  };
});

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => true),
    getPlatform: vi.fn(() => "android"),
    convertFileSrc: vi.fn((uri) => uri),
  },
  registerPlugin: vi.fn(() => mocks.plugin),
}));

const { exchangeLocalSyncArchive, fetchLocalSyncArchive, startLocalSyncHost } =
  await import("./localSyncService");

describe("localSyncService", () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.plugin.addListener.mockResolvedValue({ remove: mocks.remove });
    mocks.plugin.prepareArchive.mockResolvedValue({
      token: "archive-token",
      maxArchiveBytes: 64 * 1024 * 1024,
    });
    mocks.plugin.appendArchiveChunk.mockResolvedValue({});
    mocks.plugin.startHost.mockResolvedValue({
      host: "192.168.43.1",
      port: 49152,
      code: "123456",
      fingerprint: "A".repeat(64),
      ...QR_SESSION,
      transferCount: 0,
    });
  });

  it("prepares a large archive in bounded chunks before opening a host", async () => {
    const archive = new Blob([new Uint8Array(1024 * 1024 + 100)]);

    const session = await startLocalSyncHost({
      archive,
      projectKey: "upstream:alpha",
      syncId: "sync-alpha-1234",
      onArchive: vi.fn(),
      onError: vi.fn(),
    });

    expect(mocks.plugin.prepareArchive).toHaveBeenCalledOnce();
    expect(mocks.plugin.appendArchiveChunk).toHaveBeenCalledTimes(3);
    expect(mocks.plugin.startHost).toHaveBeenCalledWith({
      archiveToken: "archive-token",
      projectKey: "upstream:alpha",
      syncId: "sync-alpha-1234",
      allowMultipleImports: false,
      sessionDurationMs: 180000,
    });

    await session.stop();
    expect(mocks.plugin.stopHost).toHaveBeenCalledOnce();
    expect(mocks.remove).toHaveBeenCalledTimes(5);
  });

  // The chunk writer accepts whatever the archive producer hands it. Before
  // the QR half moved out, these branches sat behind a coverage number the
  // scanner tests were carrying; on their own they were never exercised.
  it("accepts archive chunks as Uint8Array and ArrayBuffer, and refuses the rest", async () => {
    const session = await startLocalSyncHost({
      produceArchive: async (append) => {
        await append(new Uint8Array([1, 2, 3]));
        await append(new Uint8Array([4, 5]).buffer);
        return 5;
      },
      projectKey: "upstream:alpha",
      syncId: "sync-alpha-1234",
      onArchive: vi.fn(),
    });

    expect(mocks.plugin.appendArchiveChunk).toHaveBeenCalledTimes(2);
    await session.stop();

    await expect(
      startLocalSyncHost({
        produceArchive: async (append) => void (await append("not a chunk")),
        projectKey: "upstream:alpha",
        syncId: "sync-alpha-1234",
        onArchive: vi.fn(),
      }),
    ).rejects.toThrow(TypeError);
    expect(mocks.plugin.discardArchive).toHaveBeenCalled();
  });

  it("requires something to send before it opens the archive", async () => {
    await expect(
      startLocalSyncHost({
        projectKey: "upstream:alpha",
        syncId: "sync-alpha-1234",
        onArchive: vi.fn(),
      }),
    ).rejects.toThrow(TypeError);
    expect(mocks.plugin.prepareArchive).not.toHaveBeenCalled();
  });

  it("reports a chunk the reader could not turn into base64", async () => {
    class FailingReader {
      readAsDataURL() {
        this.error = new Error("reader exploded");
        this.onerror?.();
      }
    }
    vi.stubGlobal("FileReader", FailingReader);

    await expect(
      startLocalSyncHost({
        archive: new Blob(["archive"]),
        projectKey: "upstream:alpha",
        syncId: "sync-alpha-1234",
        onArchive: vi.fn(),
      }),
    ).rejects.toThrow("reader exploded");
    expect(mocks.plugin.discardArchive).toHaveBeenCalled();
  });

  it("resolves native peer approval requests and forwards session events", async () => {
    const callbacks = new Map();
    const removers = [];
    mocks.plugin.addListener.mockImplementation(async (eventName, callback) => {
      callbacks.set(eventName, callback);
      const remove = vi.fn().mockResolvedValue(undefined);
      removers.push(remove);
      return { remove };
    });
    const onApprovalRequest = vi.fn().mockResolvedValue(true);
    const onSessionUpdate = vi.fn();
    const onSessionEnded = vi.fn();

    const session = await startLocalSyncHost({
      archive: new Blob(["archive"]),
      projectKey: "upstream:alpha",
      syncId: "sync-alpha-1234",
      allowMultipleImports: true,
      onArchive: vi.fn(),
      onApprovalRequest,
      onSessionUpdate,
      onSessionEnded,
    });

    const approval = {
      requestId: "request-1",
      mode: "import",
      peerAddress: "192.168.43.22",
    };
    await callbacks.get("peerApprovalRequested")(approval);
    callbacks.get("hostSessionUpdated")({ transferCount: 1 });
    callbacks.get("hostSessionEnded")({
      reason: "completed",
      transferCount: 1,
    });

    expect(onApprovalRequest).toHaveBeenCalledWith(approval);
    expect(mocks.plugin.resolvePeerApproval).toHaveBeenCalledWith({
      requestId: "request-1",
      approved: true,
    });
    expect(onSessionUpdate).toHaveBeenCalledWith({ transferCount: 1 });
    expect(onSessionEnded).toHaveBeenCalledWith({
      reason: "completed",
      transferCount: 1,
    });
    expect(mocks.plugin.startHost).toHaveBeenCalledWith(
      expect.objectContaining({ allowMultipleImports: true }),
    );

    await session.stop();
    expect(removers).toHaveLength(5);
    removers.forEach((remove) => expect(remove).toHaveBeenCalledOnce());
  });

  it("discards an archive that exceeds the native size limit", async () => {
    mocks.plugin.prepareArchive.mockResolvedValueOnce({
      token: "too-large-token",
      maxArchiveBytes: 3,
    });

    await expect(
      startLocalSyncHost({
        archive: new Blob(["four"]),
        projectKey: "upstream:alpha",
        syncId: "sync-alpha-1234",
        onArchive: vi.fn(),
      }),
    ).rejects.toThrow();

    expect(mocks.plugin.discardArchive).toHaveBeenCalledWith({
      token: "too-large-token",
    });
    expect(mocks.plugin.startHost).not.toHaveBeenCalled();
    expect(mocks.remove).toHaveBeenCalledTimes(5);
  });

  it("fails closed when native archive preparation omits its limit", async () => {
    mocks.plugin.prepareArchive.mockResolvedValueOnce({
      token: "invalid-limit-token",
    });

    await expect(
      startLocalSyncHost({
        archive: new Blob(["archive"]),
        projectKey: "upstream:alpha",
        syncId: "sync-alpha-1234",
        onArchive: vi.fn(),
      }),
    ).rejects.toThrow("invalid archive limit");

    expect(mocks.plugin.discardArchive).toHaveBeenCalledWith({
      token: "invalid-limit-token",
    });
    expect(mocks.plugin.appendArchiveChunk).not.toHaveBeenCalled();
    expect(mocks.plugin.startHost).not.toHaveBeenCalled();
  });

  it("discards a partially prepared archive when chunk upload fails", async () => {
    mocks.plugin.appendArchiveChunk.mockRejectedValueOnce(
      new Error("chunk failed"),
    );

    await expect(
      startLocalSyncHost({
        archive: new Blob(["archive"]),
        projectKey: "upstream:alpha",
        syncId: "sync-alpha-1234",
        onArchive: vi.fn(),
      }),
    ).rejects.toThrow("chunk failed");

    expect(mocks.plugin.discardArchive).toHaveBeenCalledWith({
      token: "archive-token",
    });
    expect(mocks.remove).toHaveBeenCalledTimes(5);
  });

  it("rejects client transfers without a valid session id", async () => {
    await expect(
      exchangeLocalSyncArchive({
        host: "192.168.1.2",
        port: 49152,
        code: "123456",
        fingerprint: "A".repeat(64),
        archive: new Blob(["outgoing"]),
        projectKey: "upstream:alpha",
        syncId: "sync-alpha-1234",
        sessionId: "invalid",
      }),
    ).rejects.toThrow("идентификатор QR-сеанса");

    expect(mocks.plugin.exchange).not.toHaveBeenCalled();
    expect(mocks.plugin.discardArchive).toHaveBeenCalledWith({
      token: "archive-token",
    });
  });

  it("releases the native temporary archive after reading it", async () => {
    mocks.plugin.exchange.mockResolvedValue({
      uri: "file:///cache/incoming.zip",
      size: 3,
      archiveToken: "received-token",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: vi.fn().mockResolvedValue(new Blob(["zip"])),
      }),
    );

    await exchangeLocalSyncArchive({
      host: "192.168.1.2",
      port: 49152,
      code: "123456",
      fingerprint: "A".repeat(64),
      archive: new Blob(["outgoing"]),
      projectKey: "upstream:alpha",
      syncId: "sync-alpha-1234",
      sessionId: QR_SESSION.sessionId,
    });

    expect(mocks.plugin.releaseReceivedArchive).toHaveBeenCalledWith({
      archiveToken: "received-token",
    });
    vi.unstubAllGlobals();
  });

  it("discards the outgoing archive when the network exchange fails", async () => {
    mocks.plugin.exchange.mockRejectedValueOnce(new Error("connection lost"));

    await expect(
      exchangeLocalSyncArchive({
        host: "192.168.1.2",
        port: 49152,
        code: "123456",
        fingerprint: "A".repeat(64),
        archive: new Blob(["outgoing"]),
        projectKey: "upstream:alpha",
        syncId: "sync-alpha-1234",
        sessionId: QR_SESSION.sessionId,
      }),
    ).rejects.toThrow("connection lost");

    expect(mocks.plugin.discardArchive).toHaveBeenCalledWith({
      token: "archive-token",
    });
  });

  it("fetches a hosted archive for QR import without preparing an outgoing archive", async () => {
    mocks.plugin.fetchArchive.mockResolvedValue({
      uri: "file:///cache/import.zip",
      size: 3,
      archiveToken: "import-token",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: vi.fn().mockResolvedValue(new Blob(["zip"])),
      }),
    );

    await fetchLocalSyncArchive({
      host: "192.168.1.2",
      port: "49152",
      code: "123456",
      fingerprint: "A".repeat(64),
      projectKey: "upstream:alpha",
      syncId: "sync-alpha-1234",
      sessionId: QR_SESSION.sessionId,
    });

    expect(mocks.plugin.prepareArchive).not.toHaveBeenCalled();
    expect(mocks.plugin.fetchArchive).toHaveBeenCalledWith({
      host: "192.168.1.2",
      port: 49152,
      code: "123456",
      fingerprint: "A".repeat(64),
      projectKey: "upstream:alpha",
      syncId: "sync-alpha-1234",
      sessionId: QR_SESSION.sessionId,
    });
    expect(mocks.plugin.releaseReceivedArchive).toHaveBeenCalledWith({
      archiveToken: "import-token",
    });
    vi.unstubAllGlobals();
  });

  it("rejects an oversized native archive before fetching it into the WebView", async () => {
    mocks.plugin.fetchArchive.mockResolvedValue({
      uri: "file:///cache/oversized.zip",
      size: 256 * 1024 * 1024 + 1,
      archiveToken: "oversized-token",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchLocalSyncArchive({
        host: "192.168.1.2",
        port: "49152",
        code: "123456",
        fingerprint: "A".repeat(64),
        projectKey: "upstream:alpha",
        syncId: "sync-alpha-1234",
        sessionId: QR_SESSION.sessionId,
      }),
    ).rejects.toThrow("too large");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.plugin.releaseReceivedArchive).toHaveBeenCalledWith({
      archiveToken: "oversized-token",
    });
  });

  it("rejects a native result without a reported size before fetching it", async () => {
    mocks.plugin.fetchArchive.mockResolvedValue({
      uri: "file:///cache/missing-size.zip",
      archiveToken: "missing-size-token",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchLocalSyncArchive({
        host: "192.168.1.2",
        port: "49152",
        code: "123456",
        fingerprint: "A".repeat(64),
        projectKey: "upstream:alpha",
        syncId: "sync-alpha-1234",
        sessionId: QR_SESSION.sessionId,
      }),
    ).rejects.toThrow("размер");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.plugin.releaseReceivedArchive).toHaveBeenCalledWith({
      archiveToken: "missing-size-token",
    });
  });

  it("rejects a non-file archive URI before fetching it", async () => {
    mocks.plugin.fetchArchive.mockResolvedValue({
      uri: "https://attacker.invalid/archive.zip",
      size: 3,
      archiveToken: "remote-uri-token",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchLocalSyncArchive({
        host: "192.168.1.2",
        port: "49152",
        code: "123456",
        fingerprint: "A".repeat(64),
        projectKey: "upstream:alpha",
        syncId: "sync-alpha-1234",
        sessionId: QR_SESSION.sessionId,
      }),
    ).rejects.toThrow("путь");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.plugin.releaseReceivedArchive).toHaveBeenCalledWith({
      archiveToken: "remote-uri-token",
    });
  });

  it("rejects a native archive whose fetched size differs from the report", async () => {
    mocks.plugin.fetchArchive.mockResolvedValue({
      uri: "file:///cache/mismatched.zip",
      size: 2,
      archiveToken: "mismatched-token",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: vi.fn().mockResolvedValue(new Blob(["zip"])),
      }),
    );

    await expect(
      fetchLocalSyncArchive({
        host: "192.168.1.2",
        port: "49152",
        code: "123456",
        fingerprint: "A".repeat(64),
        projectKey: "upstream:alpha",
        syncId: "sync-alpha-1234",
        sessionId: QR_SESSION.sessionId,
      }),
    ).rejects.toThrow("не совпадает");

    expect(mocks.plugin.releaseReceivedArchive).toHaveBeenCalledWith({
      archiveToken: "mismatched-token",
    });
  });

  it("releases a received archive even when reading it fails", async () => {
    mocks.plugin.fetchArchive.mockResolvedValue({
      uri: "file:///cache/broken.zip",
      size: 3,
      archiveToken: "broken-token",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );

    await expect(
      fetchLocalSyncArchive({
        host: " 192.168.1.2 ",
        port: "49152",
        code: " 123456 ",
        fingerprint: "A".repeat(64),
        projectKey: "upstream:alpha",
        syncId: "sync-alpha-1234",
        sessionId: QR_SESSION.sessionId,
      }),
    ).rejects.toThrow("503");

    expect(mocks.plugin.fetchArchive).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "192.168.1.2",
        port: 49152,
        code: "123456",
        fingerprint: "A".repeat(64),
      }),
    );
    expect(mocks.plugin.releaseReceivedArchive).toHaveBeenCalledWith({
      archiveToken: "broken-token",
    });
  });
});
