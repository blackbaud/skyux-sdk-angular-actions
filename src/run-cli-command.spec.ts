import {
  runAngularCliCommand
} from './run-cli-command';

import * as spawnModule from './spawn';

describe('Run SKY UX command', () => {

  let spawnSpy: jasmine.Spy;

  beforeEach(() => {
    spawnSpy = spyOn(spawnModule, 'spawn');
  });

  it('should run a SKY UX CLI command', async () => {
    await runAngularCliCommand('test');
    expect(spawnSpy).toHaveBeenCalledWith('npx', [
      '-p', '@angular/cli',
      'ng', 'test'
    ]);
  });

  it('should allow passing arguments', async () => {
    await runAngularCliCommand('test', ['--my-arg', 'foobar']);
    expect(spawnSpy).toHaveBeenCalledWith('npx', [
      '-p', '@angular/cli',
      'ng', 'test',
      '--my-arg', 'foobar'
    ]);
  });

});
