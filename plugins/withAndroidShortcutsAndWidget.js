const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin for Android App Shortcuts and Widget
 *
 * This plugin:
 * 1. Adds app shortcuts XML to res/xml
 * 2. Adds shortcut strings to res/values
 * 3. Adds widget layout and resources
 * 4. Adds widget provider to AndroidManifest
 * 5. Copies Kotlin widget provider class
 */

function withAndroidShortcutsAndWidget(config) {
  // Step 1: Modify AndroidManifest.xml
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const application = manifest.manifest.application[0];

    // Add meta-data for shortcuts
    if (!application['meta-data']) {
      application['meta-data'] = [];
    }

    // Check if shortcuts meta-data already exists
    const hasShortcuts = application['meta-data'].some(
      (meta) => meta.$['android:name'] === 'android.app.shortcuts'
    );

    if (!hasShortcuts) {
      application['meta-data'].push({
        $: {
          'android:name': 'android.app.shortcuts',
          'android:resource': '@xml/shortcuts',
        },
      });
    }

    // Add widget receiver
    if (!application.receiver) {
      application.receiver = [];
    }

    const hasWidgetReceiver = application.receiver.some(
      (receiver) => receiver.$['android:name'] === '.widget.HoroscopeWidgetProvider'
    );

    if (!hasWidgetReceiver) {
      application.receiver.push({
        $: {
          'android:name': '.widget.HoroscopeWidgetProvider',
          'android:exported': 'true',
          'android:label': '@string/widget_name',
        },
        'intent-filter': [
          {
            action: [
              {
                $: {
                  'android:name': 'android.appwidget.action.APPWIDGET_UPDATE',
                },
              },
            ],
          },
        ],
        'meta-data': [
          {
            $: {
              'android:name': 'android.appwidget.provider',
              'android:resource': '@xml/widget_info',
            },
          },
        ],
      });
    }

    return config;
  });

  // Step 2: Copy native files
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const androidPath = path.join(projectRoot, 'android', 'app', 'src', 'main');

      // Ensure directories exist
      const xmlDir = path.join(androidPath, 'res', 'xml');
      const valuesDir = path.join(androidPath, 'res', 'values');
      const layoutDir = path.join(androidPath, 'res', 'layout');
      const drawableDir = path.join(androidPath, 'res', 'drawable');
      const kotlinDir = path.join(androidPath, 'java', 'com', 'astrodating', 'app', 'widget');

      [xmlDir, valuesDir, layoutDir, drawableDir, kotlinDir].forEach((dir) => {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      });

      // Source files
      const nativeDir = path.join(projectRoot, 'android-native');
      const shortcutsDir = path.join(nativeDir, 'shortcuts');
      const widgetDir = path.join(nativeDir, 'widget');

      // Copy shortcuts.xml
      const shortcutsSource = path.join(shortcutsDir, 'shortcuts.xml');
      if (fs.existsSync(shortcutsSource)) {
        fs.copyFileSync(shortcutsSource, path.join(xmlDir, 'shortcuts.xml'));
      }

      // Copy widget_info.xml
      const widgetInfoSource = path.join(widgetDir, 'widget_info.xml');
      if (fs.existsSync(widgetInfoSource)) {
        fs.copyFileSync(widgetInfoSource, path.join(xmlDir, 'widget_info.xml'));
      }

      // Copy widget_layout.xml
      const widgetLayoutSource = path.join(widgetDir, 'widget_layout.xml');
      if (fs.existsSync(widgetLayoutSource)) {
        fs.copyFileSync(widgetLayoutSource, path.join(layoutDir, 'widget_layout.xml'));
      }

      // Copy widget_background.xml
      const widgetBgSource = path.join(widgetDir, 'widget_background.xml');
      if (fs.existsSync(widgetBgSource)) {
        fs.copyFileSync(widgetBgSource, path.join(drawableDir, 'widget_background.xml'));
      }

      // Merge strings
      const stringsSource = path.join(shortcutsDir, 'strings.xml');
      const stringsTarget = path.join(valuesDir, 'shortcuts_strings.xml');
      if (fs.existsSync(stringsSource)) {
        fs.copyFileSync(stringsSource, stringsTarget);
      }

      // Copy Kotlin widget provider
      const kotlinSource = path.join(widgetDir, 'HoroscopeWidgetProvider.kt');
      if (fs.existsSync(kotlinSource)) {
        fs.copyFileSync(kotlinSource, path.join(kotlinDir, 'HoroscopeWidgetProvider.kt'));
      }

      // Create placeholder drawable icons for shortcuts
      const iconPlaceholder = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#E94560"
        android:pathData="M12,2L15.09,8.26L22,9.27L17,14.14L18.18,21.02L12,17.77L5.82,21.02L7,14.14L2,9.27L8.91,8.26L12,2Z"/>
</vector>`;

      ['ic_horoscope.xml', 'ic_matches.xml', 'ic_discover.xml', 'widget_preview.xml'].forEach((icon) => {
        const iconPath = path.join(drawableDir, icon);
        if (!fs.existsSync(iconPath)) {
          fs.writeFileSync(iconPath, iconPlaceholder);
        }
      });

      return config;
    },
  ]);

  return config;
}

module.exports = withAndroidShortcutsAndWidget;
