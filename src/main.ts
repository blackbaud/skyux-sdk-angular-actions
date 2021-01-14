import * as core from '@actions/core';
import * as fs from 'fs-extra';
import * as path from 'path';

import {
  npmPublish
} from './npm-publish';

import {
  runAngularCliCommand
} from './run-cli-command';

import {
  checkNewBaselineScreenshots,
  checkNewFailureScreenshots
} from './screenshot-comparator';

import {
  spawn
} from './spawn';

import {
  isPullRequest,
  isPush,
  isTag
} from './utils';

// Generate a unique build name to be used by BrowserStack.
const BUILD_ID = `${process.env.GITHUB_REPOSITORY?.split('/')[1]}-${process.env.GITHUB_EVENT_NAME}-${process.env.GITHUB_RUN_ID}-${Math.random().toString().slice(2,7)}`;

/**
 * Runs lifecycle hook Node.js scripts. The script must export an async function named `runAsync`.
 * @example
 * ```
 * module.exports = {
 *   runAsync: async () => {}
 * };
 * ```
 * @param name The name of the lifecycle hook to call. See the `action.yml` file at the project root for possible options.
 */
async function runLifecycleHook(name: string) {
  const scriptPath = core.getInput(name);
  if (scriptPath) {
    const basePath = path.join(process.cwd(), core.getInput('working-directory'));
    const fullPath = path.join(basePath, scriptPath);
    core.info(`Running '${name}' lifecycle hook: ${fullPath}`);
    const script = require(fullPath);
    await script.runAsync();
    core.info(`Lifecycle hook '${name}' successfully executed.`);
  }
}

async function installCerts(): Promise<void> {
  try {
    await spawn('npx', ['-p', '@skyux-sdk/cli', 'skyux', 'certs', 'install']);
  } catch (err) {
    core.setFailed('SSL certificates installation failed.');
    process.exit(1);
  }
}

async function install(): Promise<void> {
  try {
    await spawn('npm', ['ci']);
    await spawn('npm', ['install', '--no-save', '--no-package-lock', 'blackbaud/skyux-sdk-pipeline-settings']);
  } catch (err) {
    core.setFailed('Pipeline settings installation failed.');
    process.exit(1);
  }
}

async function build() {
  try {
    await runLifecycleHook('hook-before-script');
    await runAngularCliCommand('build', ['--prod']);
  } catch (err) {
    core.setFailed(err);
    process.exit(1);
  }
}

async function coverage(projectName: string, isCallerTrusted = false) {
  core.exportVariable('BROWSER_STACK_BUILD_ID', `${BUILD_ID}-coverage`);

  const args: string[] = [
    projectName,
    '--browsers', 'ChromeHeadless',
    '--no-watch'
  ];

  if (isCallerTrusted) {
    args.concat(['--skyux-ci-platform', 'gh-actions']);
  }

  try {
    await runLifecycleHook('hook-before-script');
    await runAngularCliCommand('test', args);
  } catch (err) {
    core.setFailed('Code coverage failed.');
    process.exit(1);
  }
}

async function visual(isCallerTrusted = false) {
  core.exportVariable('BROWSER_STACK_BUILD_ID', `${BUILD_ID}-visual`);

  const repository = process.env.GITHUB_REPOSITORY || '';

  const args = (isCallerTrusted)
    ? ['--skyux-ci-platform', 'gh-actions']
    : ['--skyux-headless'];

  try {
    await runLifecycleHook('hook-before-script');
    await runAngularCliCommand('e2e', args);

    if (isPush()) {
      await checkNewBaselineScreenshots(repository, BUILD_ID);
    }
  } catch (err) {
    if (isPullRequest()) {
      await checkNewFailureScreenshots(BUILD_ID);
    }
    core.setFailed('End-to-end tests failed.');
    process.exit(1);
  }
}

async function buildLibrary(projectName: string) {
  try {
    await runAngularCliCommand('build', [projectName, '--prod']);
    await runLifecycleHook('hook-after-build-public-library-success');
  } catch (err) {
    core.setFailed('Library build failed.');
    process.exit(1);
  }
}

async function publishLibrary(projectName: string) {
  const distPath = path.join(process.cwd(), core.getInput('working-directory'), 'dist', projectName);
  npmPublish(distPath);
}

async function run(): Promise<void> {
  if (isPush()) {
    // Get the last commit message.
    // See: https://stackoverflow.com/a/7293026/6178885
    const message = await spawn('git', ['log', '-1', '--pretty=%B', '--oneline'], {
      cwd: process.cwd()
    });

    if (message.indexOf('[ci skip]') > -1) {
      core.info('Found "[ci skip]" in last commit message. Aborting build and test run.');
      process.exit(0);
    }
  }

  // Set environment variables so that BrowserStack launcher can read them.
  core.exportVariable('BROWSER_STACK_ACCESS_KEY', core.getInput('browser-stack-access-key'));
  core.exportVariable('BROWSER_STACK_USERNAME', core.getInput('browser-stack-username'));
  core.exportVariable('BROWSER_STACK_PROJECT', core.getInput('browser-stack-project') || process.env.GITHUB_REPOSITORY);

  let isCallerTrusted = true;
  if (!core.getInput('browser-stack-access-key')) {
    core.warning(
      'BrowserStack credentials could not be found. ' +
      'Tests will run through the local instance of ChromeHeadless.'
    );
    isCallerTrusted = false;
  }

  const angularJson = fs.readJsonSync(path.join(process.cwd(), core.getInput('working-directory'), 'angular.json'));

  let projectName: string = '';
  Object.keys(angularJson.projects).find(key => {
    if (angularJson.projects[key].projectType === 'library') {
      projectName = key;
      return true;
    }
  });

  await install();
  await installCerts();

  // Don't run tests for tags.
  if (isTag()) {
    await buildLibrary(projectName);
    await publishLibrary(projectName);
  } else {
    await build();
    await coverage(projectName, isCallerTrusted);
    await visual(isCallerTrusted);
    await buildLibrary(projectName);
  }
}

(async () => {
  try {
    await run();
  } catch (err) {
    core.setFailed(err);
  }
})();
