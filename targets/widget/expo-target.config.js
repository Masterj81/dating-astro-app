/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: "widget",
  name: "AstroDatingWidget",
  bundleIdentifier: ".widget",
  deploymentTarget: "17.0",
  frameworks: ["SwiftUI", "WidgetKit", "AppIntents"],
  entitlements: {
    "com.apple.security.application-groups": ["group.com.astrodating.app"],
  },
};
