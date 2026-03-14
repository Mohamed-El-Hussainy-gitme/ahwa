import { spawn } from 'node:child_process';

function run(name, cmd, args) {
  const child = spawn(cmd, args, {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });

  child.on('exit', (code) => {
    if (code && code !== 0) {
      process.exitCode = code;
    }
  });

  return child;
}

run('web', 'npm', ['run', 'dev:web']);
