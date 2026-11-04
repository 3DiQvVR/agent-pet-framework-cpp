import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const root = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(root, 'vendor/cubism5/Framework/src');
const output = path.join(root, 'vendor/cubism5/Framework/dist');
const demoSource = path.join(root, 'vendor/cubism5/Demo/src');
const demoOutput = path.join(root, 'vendor/cubism5/Demo/dist');
fs.rmSync(output, { recursive: true, force: true });
fs.rmSync(demoOutput, { recursive: true, force: true });

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : entry.name.endsWith('.ts') ? [full] : [];
  });
}

for (const [file, base, targetRoot] of [
  ...walk(source).map((file) => [file, source, output]),
  ...walk(demoSource).map((file) => [file, demoSource, demoOutput]),
]) {
  const relative = path.relative(base, file).replace(/\.ts$/, '.js');
  const target = path.join(targetRoot, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  let js = stripTypeScriptTypes(fs.readFileSync(file, 'utf8'), { mode: 'transform' });
  js = js.replace(/(['"])@framework\//g, '$1../../Framework/dist/');
  // Native ES modules in browsers require explicit file extensions.
  js = js.replace(/(['"])(\.{1,2}\/[^'"\n]+)\1/g, (match, quote, specifier) => {
    return /\.[a-z0-9]+$/i.test(specifier) ? match : `${quote}${specifier}.js${quote}`;
  });
  fs.writeFileSync(target, js);
}
for (const targetRoot of [output, demoOutput]) {
  for (const file of walk(targetRoot).filter((file) => file.endsWith('.js'))) {
    const sourceText = fs.readFileSync(file, 'utf8');
    for (const match of sourceText.matchAll(/from\s+["']([^"']+)["']/g)) {
      if (match[1].startsWith('.') && !fs.existsSync(path.resolve(path.dirname(file), match[1]))) {
        throw new Error(`Unresolved browser module ${match[1]} imported by ${file}`);
      }
    }
  }
}
if (!fs.existsSync(path.join(root, 'vendor/cubism5/Core/live2dcubismcore.min.js'))) {
  throw new Error('Cubism Core runtime is missing');
}
console.log(`Compiled ${walk(source).length} Framework and ${walk(demoSource).length} Demo modules.`);
