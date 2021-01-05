import * as core from '@actions/core';

import {
  SkyUxCIPlatformConfig
} from './ci-platform-config';

import {
  spawn
} from './spawn';

/**
 *
 * @param command The Angular CLI command to execute.
 * @param args Any command line arguments.
 * @param platformConfigKey The name of the CI platform config to use.
 */
export function runAngularCliCommand(
  command: string,
  args: string[] = [],
  platform = SkyUxCIPlatformConfig.None
): Promise<string> {

  core.info(`
=====================================================
> Running Angular CLI command: '${command}'
=====================================================
`);

  if (platform === SkyUxCIPlatformConfig.None) {
    // Run `ChromeHeadless` since it comes pre-installed on the CI machine.
    // TODO does this work?
    // args.push('--headless');
  } else {
    args.push('--skyux-ci-platform', platform);
  }

  return spawn('npx', [
    '-p', '@angular/cli',
    'ng', command,
    ...args
  ]);
}
