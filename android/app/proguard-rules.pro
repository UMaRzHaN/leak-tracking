# Keep Capacitor plugin discovery and bridge methods while allowing the rest of
# the application to be optimized and obfuscated by R8.
-keepattributes RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations,AnnotationDefault
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod <methods>;
}

# Preserve useful source locations in release crash reports without exposing
# original source file names.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
