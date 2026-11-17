const { readdir } = require('node:fs/promises');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await javascriptFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(entryPath);
    }
  }

  return files;
}

async function main() {
  const directories = ['src', 'scripts', 'test'];
  const files = (await Promise.all(directories.map(javascriptFiles))).flat();

  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], {
      encoding: 'utf8',
    });

    if (result.status !== 0) {
      process.stderr.write(result.stderr);
      process.exitCode = result.status || 1;
      return;
    }
  }

  console.log(`Sintaxis válida en ${files.length} archivos JavaScript.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
