#!/usr/bin/env node
const { execSync } = require('child_process');

function isMusl() {
  if (process.platform !== 'linux') return false;
  try {
    const fs = require('fs');
    if (fs.existsSync('/usr/bin/ldd') && fs.readFileSync('/usr/bin/ldd', 'utf-8').includes('musl')) {
      return true;
    }
  } catch {}
  try {
    return execSync('ldd --version', { encoding: 'utf8' }).includes('musl');
  } catch {}
  return false;
}

if (process.platform === 'linux') {
  const musl = isMusl();
  const bindingPkg = musl
    ? `@rolldown/binding-linux-${process.arch}-musl`
    : `@rolldown/binding-linux-${process.arch}-gnu`;

  try {
    require(bindingPkg);
    console.log(`[Procurely Flow Build] Native ${bindingPkg} is already present.`);
  } catch {
    console.log(`[Procurely Flow Build] Linux ${process.arch} (${musl ? 'musl' : 'glibc'}) detected. Installing ${bindingPkg}@1.2.9...`);
    try {
      execSync(`npm install ${bindingPkg}@1.2.9 --no-save`, { stdio: 'inherit' });
      console.log(`[Procurely Flow Build] Successfully installed ${bindingPkg}!`);
    } catch (installErr) {
      console.error(`[Procurely Flow Build] Warning: Failed to install ${bindingPkg}:`, installErr.message);
    }
  }
} else {
  console.log(`[Procurely Flow Build] Platform is ${process.platform}-${process.arch}. No Linux native binding required.`);
}
