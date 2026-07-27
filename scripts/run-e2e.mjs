import { spawn } from 'node:child_process';

const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', '3100'], {
  stdio: 'inherit',
  windowsHide: true,
});

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch('http://localhost:3100');
      if (response.ok) return;
    } catch {
      // The production server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('端對端測試伺服器啟動逾時');
}

function stopProcessTree(child) {
  if (!child.pid) return;
  child.kill('SIGTERM');
  child.stdout?.destroy();
  child.stderr?.destroy();
  child.unref();
}

let finalExitCode = 1;

try {
  await waitForServer();
  const test = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test'], {
    stdio: ['inherit', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  const exitCode = await new Promise((resolve) => {
    let settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      resolve(code);
    };
    const inspect = (chunk, target) => {
      const text = chunk.toString();
      target.write(text);
      output += text;
      if (/\d+ failed/.test(output)) finish(1);
      if (/\d+ passed/.test(output) && !/\d+ failed/.test(output)) {
        setTimeout(() => {
          finish(0);
          stopProcessTree(test);
        }, 500);
      }
    };
    test.stdout.on('data', (chunk) => inspect(chunk, process.stdout));
    test.stderr.on('data', (chunk) => inspect(chunk, process.stderr));
    test.on('exit', (code) => finish(code ?? 1));
  });
  finalExitCode = exitCode;
} finally {
  stopProcessTree(server);
}

setTimeout(() => process.exit(finalExitCode), 100);
