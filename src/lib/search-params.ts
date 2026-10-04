/** `?q=a&q=b` arrives as an array: keep the first value. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
