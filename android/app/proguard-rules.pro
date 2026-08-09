# Keep Capacitor plugin discovery and bridge methods while allowing the rest of
# the application to be optimized and obfuscated by R8.
-keepattributes *Annotation*
-keepattributes RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations,AnnotationDefault
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod <methods>;
}

# The rules above keep the plugin classes, but not the bridge that reads them.
# Capacitor resolves plugins, their methods and their permission declarations
# reflectively, so R8 sees no caller for that metadata and drops it. It removed
# PluginHandle.pluginAnnotation, which left getPluginAnnotation() folded to
# null, and Bridge.getPermissionStates dereferences that value to walk
# annotation.permissions(). Every plugin that checks a permission therefore
# died with a NullPointerException the moment it was called — camera and
# geolocation crashed on tap, in release builds only, because debug does not
# run R8.
#
# The permission declarations live inside the annotation itself
# (@CapacitorPlugin(permissions = @Permission(...))), so keeping the plugin
# classes is not enough on its own: the runtime holding the annotation has to
# survive too.
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-keep class com.capacitorjs.plugins.** { *; }

# Preserve useful source locations in release crash reports without exposing
# original source file names.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
