export function thumbPath(relativePath: string): string {
  return relativePath.replace(/\.webp$/, "-thumb.webp");
}

export function uploadUrl(relativePath: string, options: { thumb?: boolean } = {}): string {
  return `/uploads/${options.thumb ? thumbPath(relativePath) : relativePath}`;
}
