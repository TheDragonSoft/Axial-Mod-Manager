/**
 * Shared stack of currently open overlay layers (Modal, CommandPalette) so
 * Escape only ever closes the topmost one, no matter which component opened
 * what. Tokens are opaque symbols handed out by each overlay on mount.
 */
const stack: symbol[] = [];

export function pushOverlay(token: symbol): void {
  stack.push(token);
}

export function popOverlay(token: symbol): void {
  const i = stack.indexOf(token);
  if (i !== -1) stack.splice(i, 1);
}

export function isTopOverlay(token: symbol): boolean {
  return stack[stack.length - 1] === token;
}
