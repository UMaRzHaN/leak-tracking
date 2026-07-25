package com.leak.tracking;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.Manifest;
import android.app.UiAutomation;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.FeatureInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayInputStream;
import java.io.DataInputStream;
import java.io.File;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.security.KeyStore;
import java.util.Arrays;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AndroidSecurityInstrumentedTest {
    private static final String[] RUNTIME_PERMISSIONS = {
        Manifest.permission.CAMERA,
        Manifest.permission.RECORD_AUDIO,
        Manifest.permission.ACCESS_COARSE_LOCATION,
        Manifest.permission.ACCESS_FINE_LOCATION,
    };

    @Test
    public void manifestUsesSecureNetworkAndOptionalCameraPolicy() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        PackageInfo info = context
            .getPackageManager()
            .getPackageInfo(
                context.getPackageName(),
                PackageManager.GET_PERMISSIONS | PackageManager.GET_CONFIGURATIONS
            );

        assertNotNull(info.requestedPermissions);
        for (String permission : RUNTIME_PERMISSIONS) {
            assertTrue(
                permission + " must be declared",
                Arrays.asList(info.requestedPermissions).contains(permission)
            );
        }
        assertFalse(
            "Cleartext traffic must stay disabled",
            (info.applicationInfo.flags & ApplicationInfo.FLAG_USES_CLEARTEXT_TRAFFIC) != 0
        );

        FeatureInfo camera = Arrays.stream(info.reqFeatures)
            .filter(feature -> PackageManager.FEATURE_CAMERA.equals(feature.name))
            .findFirst()
            .orElseThrow(() -> new AssertionError("Camera feature declaration is missing"));
        assertEquals(
            "Camera must remain optional for rugged devices with external scanners",
            0,
            camera.flags & FeatureInfo.FLAG_REQUIRED
        );
    }

    @Test
    public void runtimePermissionsCanBeGranted() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        UiAutomation automation = InstrumentationRegistry.getInstrumentation().getUiAutomation();
        String packageName = context.getPackageName();

        for (String permission : RUNTIME_PERMISSIONS) {
            automation.grantRuntimePermission(packageName, permission);
            assertEquals(
                permission,
                PackageManager.PERMISSION_GRANTED,
                context.checkSelfPermission(permission)
            );
        }
    }

    @Test
    public void localSyncCreatesAndroidKeystoreTlsIdentity() throws Exception {
        LocalSyncPlugin plugin = new LocalSyncPlugin();
        Method createTlsHostContext = LocalSyncPlugin.class.getDeclaredMethod(
            "createTlsHostContext"
        );
        createTlsHostContext.setAccessible(true);
        Object tlsHost = createTlsHostContext.invoke(plugin);

        Field aliasField = tlsHost.getClass().getDeclaredField("keyAlias");
        Field fingerprintField = tlsHost.getClass().getDeclaredField("fingerprint");
        aliasField.setAccessible(true);
        fingerprintField.setAccessible(true);
        String alias = (String) aliasField.get(tlsHost);
        String fingerprint = (String) fingerprintField.get(tlsHost);

        try {
            assertTrue(alias.startsWith("local-sync-"));
            assertTrue(fingerprint.matches("[0-9A-F]{64}"));
            KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
            keyStore.load(null);
            assertTrue(keyStore.containsAlias(alias));
        } finally {
            Method deleteTlsKey = LocalSyncPlugin.class.getDeclaredMethod(
                "deleteTlsKey",
                String.class
            );
            deleteTlsKey.setAccessible(true);
            deleteTlsKey.invoke(plugin, alias);
        }
    }

    @Test
    public void partialTransferFailsClosed() throws Exception {
        LocalSyncPlugin plugin = new LocalSyncPlugin();
        Method receiveFile = LocalSyncPlugin.class.getDeclaredMethod(
            "receiveFile",
            DataInputStream.class,
            File.class,
            long.class
        );
        receiveFile.setAccessible(true);
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File target = File.createTempFile("partial-sync-", ".zip", context.getCacheDir());

        try {
            DataInputStream input = new DataInputStream(
                new ByteArrayInputStream(new byte[] { 1, 2, 3 })
            );
            try {
                receiveFile.invoke(plugin, input, target, 10L);
                fail("A truncated archive must be rejected");
            } catch (InvocationTargetException error) {
                assertTrue(error.getCause().getMessage().contains("прервано"));
            }
            assertEquals(3L, target.length());
        } finally {
            assertTrue(target.delete() || !target.exists());
        }
    }
}
