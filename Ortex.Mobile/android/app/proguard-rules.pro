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
# React Native (`ReactAndroid/proguard-rules.pro`) and Expo
# (`expo-modules-core/proguard-rules.pro`) ship their own CONSUMER rules inside
# their AARs, and Gradle applies those automatically: the JNI bridge, the
# `DoNotStrip` annotations, Hermes, and every `expo.modules.kotlin.modules.Module`
# subclass are already kept by them. Restating those here, and wider (`-keep
# class expo.modules.** { *; }` kept the whole Expo runtime unobfuscated and
# unoptimised), only threw away what R8 was switched on to gain and would have
# hidden a genuinely missing rule until someone tightened it.
#
# So this file carries ONLY what no library's consumer rules cover. Add a rule
# here when a release build proves one is needed: the symptom is the JS bundle
# loading and then a screen dying at runtime with "ClassNotFoundException" or a
# native module that is suddenly null.

# Kotlin metadata, which expo-modules reads by reflection to build its type
# converters. Neither AAR keeps it.
-keep class kotlin.Metadata { *; }

# Hermes' ICU shim, resolved by name from C++. React Native's consumer rules
# keep `com.facebook.jni.**` for Hermes but not this package.
-keep class com.facebook.hermes.unicode.** { *; }
