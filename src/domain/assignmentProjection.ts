export interface AssignmentProjection {
  target: string;
  value: string;
}

export function projectAssignmentStatement(source: string): AssignmentProjection | null {
  const match = source.trim().match(/^([A-Za-z_][\w$]*(?:\s*\.\s*(?:"[^"]+"|[A-Za-z_][\w$]*))*)\s*:=\s*([\s\S]+?)\s*;?$/);
  if (!match) return null;
  const target = match[1].replace(/\s*\.\s*/g, ".").trim();
  const value = match[2].replace(/;\s*$/, "").replace(/\s+/g, " ").trim();
  return target && value ? { target, value } : null;
}
