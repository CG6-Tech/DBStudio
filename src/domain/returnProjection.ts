export interface ReturnProjection {
  value: string;
}

export const RETURN_PROJECTION_HEIGHT = 27;

export function projectReturnStatement(source: string): ReturnProjection | null {
  const match = source.trim().match(/^RETURN\s+([\s\S]+?)\s*;?$/i);
  if (!match) return null;
  const value = match[1].replace(/;$/, "").replace(/\s+/g, " ").trim();
  return value ? { value } : null;
}
