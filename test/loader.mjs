/**
 * Lets `node --test` run the app's TypeScript as-is: maps the `@/` alias to
 * src/, finds extensionless imports, and compiles .ts/.tsx with the project's
 * own TypeScript (which drops type-only imports, unlike Node's type stripping).
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const SRC = new URL('../src/', import.meta.url);

export async function resolve(specifier, context, next) {
  const mapped = specifier.startsWith('@/') ? new URL(specifier.slice(2), SRC).href : specifier;
  try {
    return await next(mapped, context);
  } catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND' && error?.code !== 'ERR_UNSUPPORTED_DIR_IMPORT') throw error;
    for (const suffix of ['.ts', '.tsx', '/index.ts']) {
      try {
        return await next(mapped + suffix, context);
      } catch {
        // try the next form
      }
    }
    throw error;
  }
}

export async function load(url, context, next) {
  if (/\.(ts|tsx)$/.test(url)) {
    const fileName = fileURLToPath(url);
    const { outputText } = ts.transpileModule(await readFile(fileName, 'utf8'), {
      fileName,
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    });
    return { format: 'module', source: outputText, shortCircuit: true };
  }
  if (url.endsWith('.json')) {
    return { format: 'module', source: `export default ${await readFile(fileURLToPath(url), 'utf8')};`, shortCircuit: true };
  }
  return next(url, context);
}
