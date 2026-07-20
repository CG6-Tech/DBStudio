export interface ContextDeclaration {
  name: string;
  dataType: string;
  initialValue?: string;
  source: string;
}

export interface ContextProjection {
  declarations: ContextDeclaration[];
  unparsed: string[];
}

export const CONTEXT_DECLARATION_ROW_HEIGHT = 28;
export const CONTEXT_INITIALIZED_ROW_HEIGHT = 42;

export function contextProjectionHeight(context: ContextProjection): number {
  const declarationHeight = context.declarations.reduce((height, declaration) => height + (declaration.initialValue ? CONTEXT_INITIALIZED_ROW_HEIGHT : CONTEXT_DECLARATION_ROW_HEIGHT), 0);
  if (!context.unparsed.length) return declarationHeight;
  const visibleLines = Math.min(3, context.unparsed.join("\n").split("\n").length);
  return declarationHeight + visibleLines * 13 + 16;
}

interface ScanState {
  quote: "single" | "double" | null;
  dollarTag: string | null;
  depth: number;
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function splitDeclarations(source: string): string[] {
  const body = source.replace(/^\s*DECLARE\b/i, "");
  const declarations: string[] = [];
  const state: ScanState = { quote: null, dollarTag: null, depth: 0 };
  let start = 0;

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (state.dollarTag) {
      if (body.startsWith(state.dollarTag, index)) {
        index += state.dollarTag.length - 1;
        state.dollarTag = null;
      }
      continue;
    }
    if (state.quote === "single") {
      if (char === "'" && body[index + 1] === "'") index += 1;
      else if (char === "'") state.quote = null;
      continue;
    }
    if (state.quote === "double") {
      if (char === '"' && body[index + 1] === '"') index += 1;
      else if (char === '"') state.quote = null;
      continue;
    }
    if (char === "'") { state.quote = "single"; continue; }
    if (char === '"') { state.quote = "double"; continue; }
    if (char === "$") {
      const tag = body.slice(index).match(/^\$[a-z_][\w$]*\$|^\$\$/i)?.[0];
      if (tag) { state.dollarTag = tag; index += tag.length - 1; continue; }
    }
    if (char === "(") state.depth += 1;
    else if (char === ")") state.depth = Math.max(0, state.depth - 1);
    else if (char === ";" && state.depth === 0) {
      const declaration = body.slice(start, index).trim();
      if (declaration) declarations.push(declaration);
      start = index + 1;
    }
  }

  const remainder = body.slice(start).trim();
  if (remainder) declarations.push(remainder);
  return declarations;
}

function findInitializer(source: string): { index: number; length: number } | undefined {
  const state: ScanState = { quote: null, dollarTag: null, depth: 0 };
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (state.dollarTag) {
      if (source.startsWith(state.dollarTag, index)) { index += state.dollarTag.length - 1; state.dollarTag = null; }
      continue;
    }
    if (state.quote === "single") {
      if (char === "'" && source[index + 1] === "'") index += 1;
      else if (char === "'") state.quote = null;
      continue;
    }
    if (state.quote === "double") {
      if (char === '"' && source[index + 1] === '"') index += 1;
      else if (char === '"') state.quote = null;
      continue;
    }
    if (char === "'") { state.quote = "single"; continue; }
    if (char === '"') { state.quote = "double"; continue; }
    if (char === "$") {
      const tag = source.slice(index).match(/^\$[a-z_][\w$]*\$|^\$\$/i)?.[0];
      if (tag) { state.dollarTag = tag; index += tag.length - 1; continue; }
    }
    if (char === "(") { state.depth += 1; continue; }
    if (char === ")") { state.depth = Math.max(0, state.depth - 1); continue; }
    if (state.depth > 0) continue;
    if (source.startsWith(":=", index)) return { index, length: 2 };
    const defaultMatch = source.slice(index).match(/^DEFAULT\b/i);
    if (defaultMatch && /\s/.test(source[index - 1] ?? " ")) return { index, length: defaultMatch[0].length };
    if (char === "=" && source[index - 1] !== ":" && source[index + 1] !== ">") return { index, length: 1 };
  }
  return undefined;
}

function parseDeclaration(source: string): ContextDeclaration | null {
  const normalized = source.replace(/^\s*(?:--[^\n]*\n\s*)+/, "").trim();
  const nameMatch = normalized.match(/^([a-z_][\w$]*)\s+([\s\S]+)$/i);
  if (!nameMatch || /^(?:ALIAS|RENAME)\b/i.test(nameMatch[2])) return null;

  const name = nameMatch[1];
  const remainder = nameMatch[2].trim();
  const initializer = findInitializer(remainder);
  const rawType = (initializer ? remainder.slice(0, initializer.index) : remainder).trim();
  const dataType = compact(rawType.replace(/^CONSTANT\s+/i, "").replace(/\s+NOT\s+NULL$/i, ""));
  const initialValue = initializer ? compact(remainder.slice(initializer.index + initializer.length)) : undefined;
  if (!dataType || (initializer && !initialValue)) return null;
  return { name, dataType, ...(initialValue ? { initialValue } : {}), source: source.trim() };
}

export function projectContextDeclarations(source: string): ContextProjection {
  const declarations: ContextDeclaration[] = [];
  const unparsed: string[] = [];
  for (const item of splitDeclarations(source)) {
    const declaration = parseDeclaration(item);
    if (declaration) declarations.push(declaration);
    else unparsed.push(item.trim());
  }
  return { declarations, unparsed };
}
