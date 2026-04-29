const { withAppBuildGradle } = require('@expo/config-plugins');

const MARKER = '// expo-monorepo-native-paths-injected';

const INJECTED = `
${MARKER}
def __resolvedReactNativeDir = new File(
  ["node", "--print", "require.resolve('react-native/package.json')"]
    .execute(null, rootDir).text.trim()
).getParentFile().getAbsoluteFile()
def __resolvedWorkletsDir = new File(
  ["node", "--print", "require.resolve('react-native-worklets/package.json')"]
    .execute(null, rootDir).text.trim()
).getParentFile().getAbsoluteFile()
rootProject.ext.REACT_NATIVE_NODE_MODULES_DIR = __resolvedReactNativeDir.absolutePath
rootProject.ext.REACT_NATIVE_WORKLETS_NODE_MODULES_DIR = __resolvedWorkletsDir.absolutePath
project.ext.REACT_NATIVE_NODE_MODULES_DIR = __resolvedReactNativeDir.absolutePath
project.ext.REACT_NATIVE_WORKLETS_NODE_MODULES_DIR = __resolvedWorkletsDir.absolutePath
`;

module.exports = function withMonorepoNativePaths(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes(MARKER)) {
      return cfg;
    }
    const contents = cfg.modResults.contents;
    const anchor = /def projectRoot = rootDir\.getAbsoluteFile\(\)\.getParentFile\(\)\.getAbsolutePath\(\)/;
    if (!anchor.test(contents)) {
      throw new Error(
        '[withMonorepoNativePaths] Could not locate `def projectRoot = ...` anchor in app/build.gradle'
      );
    }
    cfg.modResults.contents = contents.replace(
      anchor,
      (match) => `${match}\n${INJECTED}`
    );
    return cfg;
  });
};
