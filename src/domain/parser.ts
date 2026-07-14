import type { Column, Diagnostic, Relationship, SchemaDocument, SourceRange, Table } from "./types";

interface Token extends SourceRange {
  text: string;
  upper: string;
  kind: "word" | "quoted" | "symbol" | "string";
}

const CONSTRAINT_WORDS = new Set([
  "NOT",
  "NULL",
  "PRIMARY",
  "REFERENCES",
  "UNIQUE",
  "CHECK",
  "DEFAULT",
  "CONSTRAINT",
  "COLLATE",
  "GENERATED",
]);

function unquoteIdentifier(value: string): string {
  return value.startsWith('"') ? value.slice(1, -1).replaceAll('""', '"') : value;
}

function stablePart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]+/g, "-");
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === "-" && source[index + 1] === "-") {
      index = source.indexOf("\n", index + 2);
      if (index === -1) break;
      continue;
    }
    if (char === "/" && source[index + 1] === "*") {
      const end = source.indexOf("*/", index + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }
    if (char === "'") {
      const start = index++;
      while (index < source.length) {
        if (source[index] === "'" && source[index + 1] === "'") {
          index += 2;
        } else if (source[index++] === "'") {
          break;
        }
      }
      const text = source.slice(start, index);
      tokens.push({ start, end: index, text, upper: text.toUpperCase(), kind: "string" });
      continue;
    }
    if (char === '"') {
      const start = index++;
      while (index < source.length) {
        if (source[index] === '"' && source[index + 1] === '"') {
          index += 2;
        } else if (source[index++] === '"') {
          break;
        }
      }
      const text = source.slice(start, index);
      tokens.push({ start, end: index, text, upper: text.toUpperCase(), kind: "quoted" });
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const start = index++;
      while (index < source.length && /[A-Za-z0-9_$]/.test(source[index])) index += 1;
      const text = source.slice(start, index);
      tokens.push({ start, end: index, text, upper: text.toUpperCase(), kind: "word" });
      continue;
    }
    if (/[0-9]/.test(char)) {
      const start = index++;
      while (index < source.length && /[A-Za-z0-9_.]/.test(source[index])) index += 1;
      const text = source.slice(start, index);
      tokens.push({ start, end: index, text, upper: text.toUpperCase(), kind: "word" });
      continue;
    }
    tokens.push({ start: index, end: index + 1, text: char, upper: char, kind: "symbol" });
    index += 1;
  }
  return tokens;
}

function findClosing(tokens: Token[], openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < tokens.length; index += 1) {
    if (tokens[index].text === "(") depth += 1;
    if (tokens[index].text === ")") depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function splitDefinitions(tokens: Token[]): Token[][] {
  const result: Token[][] = [];
  let depth = 0;
  let start = 0;
  tokens.forEach((token, index) => {
    if (token.text === "(") depth += 1;
    if (token.text === ")") depth -= 1;
    if (token.text === "," && depth === 0) {
      result.push(tokens.slice(start, index));
      start = index + 1;
    }
  });
  result.push(tokens.slice(start));
  return result.filter((part) => part.length > 0);
}

function findSequence(tokens: Token[], words: string[]): number {
  return tokens.findIndex((_, index) => words.every((word, offset) => tokens[index + offset]?.upper === word));
}

function tokenInsideParens(tokens: Token[], from: number): Token | undefined {
  const open = tokens.findIndex((token, index) => index >= from && token.text === "(");
  return open >= 0 ? tokens[open + 1] : undefined;
}

function nameInsideParens(tokens: Token[], from: number): string | undefined {
  const token = tokenInsideParens(tokens, from);
  return token ? unquoteIdentifier(token.text) : undefined;
}

interface PendingReference {
  sourceTableId: string;
  sourceColumnName: string;
  targetTableName: string;
  targetColumnName: string;
  sourceColumnReferenceRange?: SourceRange;
  targetTableReferenceRange: SourceRange;
  targetColumnReferenceRange: SourceRange;
}

export function parseSchema(source: string): SchemaDocument {
  const tokens = tokenize(source);
  const diagnostics: Diagnostic[] = [];
  const tables: Table[] = [];
  const references: PendingReference[] = [];

  for (let cursor = 0; cursor < tokens.length - 2; cursor += 1) {
    if (tokens[cursor].upper !== "CREATE" || tokens[cursor + 1]?.upper !== "TABLE") continue;
    let nameIndex = cursor + 2;
    if (tokens[nameIndex]?.upper === "IF" && tokens[nameIndex + 1]?.upper === "NOT" && tokens[nameIndex + 2]?.upper === "EXISTS") {
      nameIndex += 3;
    }
    let schema: string | undefined;
    if (tokens[nameIndex + 1]?.text === ".") {
      schema = unquoteIdentifier(tokens[nameIndex].text);
      nameIndex += 2;
    }
    const nameToken = tokens[nameIndex];
    const openIndex = tokens.findIndex((token, index) => index > nameIndex && token.text === "(");
    if (!nameToken || openIndex < 0) {
      diagnostics.push({ level: "error", message: "CREATE TABLE is missing a table name or column list.", offset: tokens[cursor].start });
      continue;
    }
    const closeIndex = findClosing(tokens, openIndex);
    if (closeIndex < 0) {
      diagnostics.push({ level: "error", message: `Table ${nameToken.text} has an unclosed column list.`, offset: nameToken.start });
      continue;
    }

    const name = unquoteIdentifier(nameToken.text);
    const tableId = `table:${stablePart(schema ? `${schema}.${name}` : name)}:${nameToken.start}`;
    const table: Table = {
      id: tableId,
      name,
      originalName: name,
      schema,
      columns: [],
      nameRange: { start: nameToken.start, end: nameToken.end },
      position: { x: 0, y: 0 },
    };
    const tablePrimaryKeys = new Set<string>();

    for (const definition of splitDefinitions(tokens.slice(openIndex + 1, closeIndex))) {
      let normalized = definition;
      if (normalized[0]?.upper === "CONSTRAINT") normalized = normalized.slice(2);
      if (normalized[0]?.upper === "PRIMARY" && normalized[1]?.upper === "KEY") {
        const columnName = nameInsideParens(normalized, 2);
        if (columnName) tablePrimaryKeys.add(columnName.toLowerCase());
        continue;
      }
      if (normalized[0]?.upper === "FOREIGN" && normalized[1]?.upper === "KEY") {
        const sourceColumnToken = tokenInsideParens(normalized, 2);
        const sourceColumnName = sourceColumnToken && unquoteIdentifier(sourceColumnToken.text);
        const referencesIndex = normalized.findIndex((token) => token.upper === "REFERENCES");
        const targetNameToken = normalized[referencesIndex + 1];
        const targetColumnToken = tokenInsideParens(normalized, referencesIndex + 2);
        const targetName = targetNameToken && unquoteIdentifier(targetNameToken.text);
        const targetColumnName = targetColumnToken && unquoteIdentifier(targetColumnToken.text);
        if (sourceColumnToken && sourceColumnName && targetNameToken && targetName && targetColumnToken && targetColumnName) {
          references.push({
            sourceTableId: tableId,
            sourceColumnName,
            targetTableName: targetName,
            targetColumnName,
            sourceColumnReferenceRange: { start: sourceColumnToken.start, end: sourceColumnToken.end },
            targetTableReferenceRange: { start: targetNameToken.start, end: targetNameToken.end },
            targetColumnReferenceRange: { start: targetColumnToken.start, end: targetColumnToken.end },
          });
        }
        continue;
      }
      if (["UNIQUE", "CHECK", "EXCLUDE"].includes(normalized[0]?.upper)) continue;
      if (definition.length < 2 || !["word", "quoted"].includes(definition[0].kind)) {
        diagnostics.push({ level: "warning", message: "A table definition could not be represented visually.", offset: definition[0]?.start });
        continue;
      }

      const columnName = unquoteIdentifier(definition[0].text);
      let constraintIndex = definition.findIndex((token, index) => index > 0 && CONSTRAINT_WORDS.has(token.upper));
      if (constraintIndex < 0) constraintIndex = definition.length;
      const typeTokens = definition.slice(1, constraintIndex);
      if (typeTokens.length === 0) {
        diagnostics.push({ level: "warning", message: `Column ${columnName} has an unsupported type expression.`, offset: definition[0].start });
        continue;
      }
      const typeRange = { start: typeTokens[0].start, end: typeTokens.at(-1)!.end };
      const notNullIndex = findSequence(definition, ["NOT", "NULL"]);
      const primaryKey = findSequence(definition, ["PRIMARY", "KEY"]) >= 0;
      const columnId = `${tableId}:column:${stablePart(columnName)}:${definition[0].start}`;
      const column: Column = {
        id: columnId,
        tableId,
        name: columnName,
        originalName: columnName,
        dataType: source.slice(typeRange.start, typeRange.end),
        originalDataType: source.slice(typeRange.start, typeRange.end),
        nullable: notNullIndex < 0 && !primaryKey,
        originalNullable: notNullIndex < 0 && !primaryKey,
        primaryKey,
        nameRange: { start: definition[0].start, end: definition[0].end },
        typeRange,
        notNullRange: notNullIndex >= 0 ? { start: definition[notNullIndex].start, end: definition[notNullIndex + 1].end } : undefined,
      };
      table.columns.push(column);

      const referencesIndex = definition.findIndex((token) => token.upper === "REFERENCES");
      if (referencesIndex >= 0) {
        const targetNameToken = definition[referencesIndex + 1];
        const targetColumnToken = tokenInsideParens(definition, referencesIndex + 2);
        const targetColumnName = targetColumnToken && unquoteIdentifier(targetColumnToken.text);
        if (targetNameToken && targetColumnToken && targetColumnName) {
          references.push({
            sourceTableId: tableId,
            sourceColumnName: columnName,
            targetTableName: unquoteIdentifier(targetNameToken.text),
            targetColumnName,
            targetTableReferenceRange: { start: targetNameToken.start, end: targetNameToken.end },
            targetColumnReferenceRange: { start: targetColumnToken.start, end: targetColumnToken.end },
          });
        }
      }
    }

    table.columns = table.columns.map((column) => ({
      ...column,
      primaryKey: column.primaryKey || tablePrimaryKeys.has(column.name.toLowerCase()),
      nullable: column.primaryKey || tablePrimaryKeys.has(column.name.toLowerCase()) ? false : column.nullable,
      originalNullable: column.primaryKey || tablePrimaryKeys.has(column.name.toLowerCase()) ? false : column.originalNullable,
    }));
    tables.push(table);
    cursor = closeIndex;
  }

  if (tables.length !== 2) {
    diagnostics.push({ level: "warning", message: `This sample is optimized for exactly two tables; found ${tables.length}.` });
  }

  const relationships: Relationship[] = [];
  references.forEach((reference, index) => {
    const sourceTable = tables.find((table) => table.id === reference.sourceTableId);
    const targetTable = tables.find((table) => table.name.toLowerCase() === reference.targetTableName.toLowerCase());
    const sourceColumn = sourceTable?.columns.find((column) => column.name.toLowerCase() === reference.sourceColumnName.toLowerCase());
    const targetColumn = targetTable?.columns.find((column) => column.name.toLowerCase() === reference.targetColumnName.toLowerCase());
    if (sourceTable && targetTable && sourceColumn && targetColumn) {
      relationships.push({
        id: `relationship:${index}:${sourceColumn.id}:${targetColumn.id}`,
        sourceTableId: sourceTable.id,
        sourceColumnId: sourceColumn.id,
        targetTableId: targetTable.id,
        targetColumnId: targetColumn.id,
        sourceColumnReferenceRange: reference.sourceColumnReferenceRange,
        targetTableReferenceRange: reference.targetTableReferenceRange,
        targetColumnReferenceRange: reference.targetColumnReferenceRange,
      });
    } else {
      diagnostics.push({ level: "warning", message: `Foreign key ${reference.sourceColumnName} could not be resolved.` });
    }
  });

  return { source, tables, relationships, diagnostics };
}

export function quoteIdentifier(value: string): string {
  return /^[a-z_][a-z0-9_$]*$/.test(value) ? value : `"${value.replaceAll('"', '""')}"`;
}
