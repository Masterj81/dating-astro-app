const { spawnSync } = require('node:child_process');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..', '..');
const expoCli = require.resolve('@expo/cli', {
  paths: [require.resolve('expo/package.json', { paths: [projectRoot] })],
});

const forwardedArgs = process.argv.slice(2);
const bundleCommand = forwardedArgs[0];
const bundleArgs = bundleCommand === 'export:embed' ? forwardedArgs.slice(1) : forwardedArgs;

const result = spawnSync(process.execPath, [expoCli, 'export:embed', ...bundleArgs, projectRoot], {
  cwd: workspaceRoot,
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
