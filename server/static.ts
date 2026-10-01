// Which file a static request may be answered with. Kept apart from the server so the containment rule can be tested.
import { realpath } from 'node:fs/promises';
import path from 'node:path';

/** True when `target` is `root` itself or lies inside it (compared as paths, not as string prefixes). */
export function inside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * The file under `root` that a URL path names, or null when it must not be served: an undecodable path, a NUL byte,
 * or anything that resolves outside `root` — by `..`, by encoded separators, by a sibling directory whose name merely
 * starts like root's ("dist-old"), or by a symbolic link pointing elsewhere. Returns the real path of an existing file
 * or directory, or the lexical path of a missing one (the caller then falls back to index.html).
 */
export async function resolveStatic(root: string, pathname: string): Promise<{ file: string; exists: boolean } | null> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const base = await realpath(root).catch(() => path.resolve(root));
  const target = path.resolve(base, `.${path.posix.normalize(`/${decoded.replace(/\\/g, '/')}`)}`);
  if (!inside(base, target)) return null;
  try {
    const real = await realpath(target);
    return inside(base, real) ? { file: real, exists: true } : null;
  } catch {
    return { file: target, exists: false };
  }
}
