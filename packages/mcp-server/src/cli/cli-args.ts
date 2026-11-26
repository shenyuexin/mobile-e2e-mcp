export function requireCliFlagValue(
  flag: string,
  next: string | undefined,
  allowDashValue = false,
): string | undefined {
  if (next === undefined || (!allowDashValue && next.startsWith("-"))) {
    return `Missing value for ${flag}.`;
  }
  return undefined;
}
