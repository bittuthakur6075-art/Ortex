# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# ── Ortex release (R8 enabled via enableProguardInReleaseBuilds) ─────────────
#
# React Native and Expo ship their own consumer rules in their AARs, so this file
# only covers what those cannot know about: anything reached by REFLECTION or
# from native code, which R8 cannot see a reference to and will therefore strip.
#
# Symptom when one of these is missing: the JS bundle loads, then a screen that
# touches the module dies with "ClassNotFoundException" or a native module that
# is suddenly null — always at runtime, never at build time, which is why the
# rules are stated rather than discovered on a sales rep's phone.

# Anything the C++ layer resolves by name across the JNI boundary.
-keep class com.facebook.jni.** { *; }
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
    @com.facebook.common.internal.DoNotStrip *;
}

# Expo's module registry finds modules by class name at startup.
-keep class expo.modules.** { *; }
-keep class * extends expo.modules.kotlin.modules.Module { *; }

# Kotlin metadata, which expo-modules reads to build its type converters.
-keep class kotlin.Metadata { *; }

# Hermes.
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }
