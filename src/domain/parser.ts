import { dialectSettings, parseFieldType } from "../dialects";
import { buildSchemaIndex, findIndexedColumn, findIndexedTable } from "./schemaIndex";
import type { CheckConstraint, Column, CompositeCustomType, CustomType, Diagnostic, DomainCustomType, EnumCustomType, PostgresIndexMethod, Relationship, SchemaDocument, SourceRange, SqlDialect, Table, TableIndex } from "./types";
import { parseDatabaseLogic } from "./logicParser";

interface Token extends SourceRange {
  text: string;
  upper: string;
  kind: "word" | "quoted" | "symbol" | "string";
}

function unquoteIdentifier(value: string): string {
  if (value.startsWith('"')) return value.slice(1, -1).replaceAll('""', '"');
  if (value.startsWith("`")) return value.slice(1, -1).replaceAll("``", "`");
  return value;
}

function unquoteString(value: string): string {
  return value.startsWith("'") ? value.slice(1, -1).replaceAll("''", "'") : value;
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
    if (char === '"' || char === "`") {
      const quote = char;
      const start = index++;
      while (index < source.length) {
        if (source[index] === quote && source[index + 1] === quote) {
          index += 2;
        } else if (source[index++] === quote) {
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

function findTokenIndex(tokens: Token[], from: number, predicate: (token: Token, index: number) => boolean, through = tokens.length - 1): number {
  for (let index = Math.max(0, from); index <= Math.min(through, tokens.length - 1); index += 1) {
    if (predicate(tokens[index], index)) return index;
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

function parenBounds(tokens: Token[], from = 0): [number, number] | null {
  const open = tokens.findIndex((token, index) => index >= from && token.text === "(");
  if (open < 0) return null;
  const close = findClosing(tokens, open);
  return close < 0 ? null : [open, close];
}

function identifierNamesInsideParens(tokens: Token[], from = 0): string[] {
  const bounds = parenBounds(tokens, from);
  if (!bounds) return [];
  return splitDefinitions(tokens.slice(bounds[0] + 1, bounds[1]))
    .map((part) => part[0])
    .filter((token): token is Token => Boolean(token && (token.kind === "word" || token.kind === "quoted")))
    .map((token) => unquoteIdentifier(token.text));
}

function indexMethod(value: string | undefined): PostgresIndexMethod {
  const normalized = value?.toLowerCase();
  return (["btree", "hash", "gist", "spgist", "gin", "brin"] as const).includes(normalized as PostgresIndexMethod)
    ? normalized as PostgresIndexMethod
    : "btree";
}

interface PendingReference {
  sourceTableId: string;
  sourceColumnName: string;
  targetTableName: string;
  targetTableSchema?: string;
  targetColumnName: string;
  sourceColumnReferenceRange?: SourceRange;
  targetTableReferenceRange: SourceRange;
  targetColumnReferenceRange: SourceRange;
}

interface PendingCustomType {
  type: CustomType;
  body: Token[];
  bodyStart: number;
}

function statementEnd(tokens: Token[], from: number): number {
  const semicolon = findTokenIndex(tokens, from + 1, (token) => token.text === ";");
  return semicolon >= 0 ? semicolon : tokens.length - 1;
}

function qualifiedNameAt(tokens: Token[], index: number): { schema?: string; name: string; nameToken: Token; next: number } | null {
  const first = tokens[index];
  if (!first || !["word", "quoted"].includes(first.kind)) return null;
  if (tokens[index + 1]?.text === "." && tokens[index + 2]) {
    return { schema: unquoteIdentifier(first.text), name: unquoteIdentifier(tokens[index + 2].text), nameToken: tokens[index + 2], next: index + 3 };
  }
  return { name: unquoteIdentifier(first.text), nameToken: first, next: index + 1 };
}

function parsePostgresCustomTypes(tokens: Token[], source: string): CustomType[] {
  const pending: PendingCustomType[] = [];
  for (let cursor = 0; cursor < tokens.length - 3; cursor += 1) {
    if (tokens[cursor].upper !== "CREATE" || !["TYPE", "DOMAIN"].includes(tokens[cursor + 1]?.upper)) continue;
    const declaration = tokens[cursor + 1].upper;
    const qualified = qualifiedNameAt(tokens, cursor + 2);
    if (!qualified) continue;
    const endIndex = statementEnd(tokens, qualified.next);
    const asIndex = findTokenIndex(tokens, qualified.next, (token) => token.upper === "AS", endIndex);
    if (asIndex < 0) continue;
    const range = { start: tokens[cursor].start, end: tokens[endIndex].end };
    const base = {
      id: `custom-type:${stablePart(qualified.schema ? `${qualified.schema}.${qualified.name}` : qualified.name)}:${qualified.nameToken.start}`,
      name: qualified.name,
      originalName: qualified.name,
      schema: qualified.schema,
      statementRange: range,
    };
    if (declaration === "DOMAIN") {
      const type: DomainCustomType = { ...base, kind: "domain", baseType: { kind: "unresolved", typeId: "", parameters: {}, arrayDimensions: 0, unsigned: false, raw: "" }, nullable: true };
      pending.push({ type, body: tokens.slice(asIndex + 1, endIndex), bodyStart: asIndex + 1 });
      cursor = endIndex;
      continue;
    }
    if (tokens[asIndex + 1]?.upper === "ENUM") {
      const bounds = parenBounds(tokens, asIndex + 2);
      const values = bounds ? splitDefinitions(tokens.slice(bounds[0] + 1, bounds[1])).map((part) => unquoteIdentifier(part[0]?.text ?? "").replace(/^'|'$/g, "").replaceAll("''", "'")) : [];
      const type: EnumCustomType = { ...base, kind: "enum", values };
      pending.push({ type, body: [], bodyStart: asIndex + 1 });
      cursor = endIndex;
      continue;
    }
    if (tokens[asIndex + 1]?.text === "(") {
      const close = findClosing(tokens, asIndex + 1);
      const type: CompositeCustomType = { ...base, kind: "composite", fields: [] };
      pending.push({ type, body: close >= 0 ? tokens.slice(asIndex + 2, close) : [], bodyStart: asIndex + 2 });
      cursor = endIndex;
    }
  }

  const customTypes = pending.map((item) => item.type);
  return pending.map(({ type, body }) => {
    if (type.kind === "enum") return type;
    if (type.kind === "composite") {
      const fields = splitDefinitions(body).flatMap((definition, index) => {
        const nameToken = definition[0];
        if (!nameToken || definition.length < 2) return [];
        const rawType = source.slice(definition[1].start, definition.at(-1)!.end);
        return [{ id: `${type.id}:field:${stablePart(unquoteIdentifier(nameToken.text))}:${index}`, name: unquoteIdentifier(nameToken.text), type: parseFieldType(rawType, "postgresql", customTypes) }];
      });
      return { ...type, fields };
    }
    const words = new Set(dialectSettings("postgresql").constraintWords);
    let stop = body.findIndex((token) => words.has(token.upper));
    if (stop < 0) stop = body.length;
    const rawBase = stop > 0 ? source.slice(body[0].start, body[stop - 1].end) : "";
    const notNull = findSequence(body, ["NOT", "NULL"]) >= 0;
    const defaultIndex = body.findIndex((token) => token.upper === "DEFAULT");
    const checkIndex = body.findIndex((token) => token.upper === "CHECK");
    const defaultEnd = [checkIndex, findSequence(body, ["NOT", "NULL"])].filter((index) => index > defaultIndex).sort((a, b) => a - b)[0] ?? body.length;
    const defaultExpression = defaultIndex >= 0 && defaultEnd > defaultIndex + 1 ? source.slice(body[defaultIndex + 1].start, body[defaultEnd - 1].end) : undefined;
    const checkBounds = checkIndex >= 0 ? parenBounds(body, checkIndex + 1) : null;
    const checkExpression = checkBounds ? source.slice(body[checkBounds[0]].end, body[checkBounds[1]].start) : undefined;
    return { ...type, baseType: parseFieldType(rawBase, "postgresql", customTypes), nullable: !notNull, defaultExpression, checkExpression };
  });
}

export function parseSchema(source: string, dialect: SqlDialect = "postgresql"): SchemaDocument {
  const tokens = tokenize(source);
  const settings = dialectSettings(dialect);
  const constraintWords = new Set(settings.constraintWords);
  const diagnostics: Diagnostic[] = [];
  const tables: Table[] = [];
  const references: PendingReference[] = [];
  const customTypes = dialect === "postgresql" ? parsePostgresCustomTypes(tokens, source) : [];

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
    const createEndIndex = statementEnd(tokens, nameIndex);
    const openIndex = findTokenIndex(tokens, nameIndex + 1, (token) => token.text === "(", createEndIndex);
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
    const semicolonIndex = findTokenIndex(tokens, closeIndex + 1, (token) => token.text === ";");
    const statementEndIndex = semicolonIndex >= 0 ? semicolonIndex : closeIndex;
    const table: Table = {
      id: tableId,
      name,
      originalName: name,
      schema,
      columns: [],
      indexes: [],
      checkConstraints: [],
      nameRange: { start: nameToken.start, end: nameToken.end },
      statementRange: {
        start: tokens[cursor].start,
        end: tokens[statementEndIndex].end,
      },
      tableOptions: source.slice(tokens[closeIndex].end, tokens[statementEndIndex].start),
      position: { x: 0, y: 0 },
      color: "#7ee0b5",
      collapsed: false,
    };
    const tablePrimaryKeys = new Set<string>();
    const pendingIndexes: Array<{ definition: Token[]; normalized: Token[]; name?: string; unique: boolean }> = [];

    for (const definition of splitDefinitions(tokens.slice(openIndex + 1, closeIndex))) {
      let normalized = definition;
      const constraintName = normalized[0]?.upper === "CONSTRAINT" ? unquoteIdentifier(normalized[1]?.text ?? "") : undefined;
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
        const target = qualifiedNameAt(normalized, referencesIndex + 1);
        const targetNameToken = target?.nameToken;
        const targetColumnToken = target && tokenInsideParens(normalized, target.next);
        const targetName = target?.name;
        const targetColumnName = targetColumnToken && unquoteIdentifier(targetColumnToken.text);
        if (sourceColumnToken && sourceColumnName && targetNameToken && targetName && targetColumnToken && targetColumnName) {
          references.push({
            sourceTableId: tableId,
            sourceColumnName,
            targetTableName: targetName,
            targetTableSchema: target?.schema,
            targetColumnName,
            sourceColumnReferenceRange: { start: sourceColumnToken.start, end: sourceColumnToken.end },
            targetTableReferenceRange: { start: targetNameToken.start, end: targetNameToken.end },
            targetColumnReferenceRange: { start: targetColumnToken.start, end: targetColumnToken.end },
          });
        }
        continue;
      }
      if (normalized[0]?.upper === "CHECK") {
        const bounds = parenBounds(normalized);
        if (bounds) {
          const expressionStart = normalized[bounds[0]].end;
          const expressionEnd = normalized[bounds[1]].start;
          const constraint: CheckConstraint = {
            id: `${tableId}:check:${stablePart(constraintName || String(definition[0]?.start))}`,
            name: constraintName || undefined,
            expression: source.slice(expressionStart, expressionEnd),
            sourceRange: { start: definition[0].start, end: definition.at(-1)!.end },
          };
          table.checkConstraints.push(constraint);
        }
        continue;
      }
      const indexStart = normalized[0]?.upper === "UNIQUE" ? 1 : 0;
      if (["KEY", "INDEX"].includes(normalized[indexStart]?.upper)) {
        const possibleName = normalized[indexStart + 1];
        pendingIndexes.push({
          definition,
          normalized,
          name: possibleName && possibleName.text !== "(" ? unquoteIdentifier(possibleName.text) : undefined,
          unique: indexStart === 1,
        });
        continue;
      }
      if (settings.tableDefinitionWords.includes(normalized[0]?.upper)) continue;
      if (definition.length < 2 || !["word", "quoted"].includes(definition[0].kind)) {
        diagnostics.push({ level: "warning", message: "A table definition could not be represented visually.", offset: definition[0]?.start });
        continue;
      }

      const columnName = unquoteIdentifier(definition[0].text);
      let constraintIndex = definition.findIndex((token, index) => index > 0 && constraintWords.has(token.upper));
      if (constraintIndex < 0) constraintIndex = definition.length;
      const typeTokens = definition.slice(1, constraintIndex);
      if (typeTokens.length === 0) {
        diagnostics.push({ level: "warning", message: `Column ${columnName} has an unsupported type expression.`, offset: definition[0].start });
        continue;
      }
      const typeRange = { start: typeTokens[0].start, end: typeTokens.at(-1)!.end };
      const notNullIndex = findSequence(definition, ["NOT", "NULL"]);
      const primaryKey = findSequence(definition, ["PRIMARY", "KEY"]) >= 0;
      const defaultIndex = definition.findIndex((token) => token.upper === "DEFAULT");
      const defaultStop = defaultIndex >= 0
        ? definition.findIndex((token, index) => index > defaultIndex && constraintWords.has(token.upper))
        : -1;
      const defaultTokens = defaultIndex >= 0
        ? definition.slice(defaultIndex + 1, defaultStop >= 0 ? defaultStop : definition.length)
        : [];
      const columnId = `${tableId}:column:${stablePart(columnName)}:${definition[0].start}`;
      const column: Column = {
        id: columnId,
        tableId,
        name: columnName,
        originalName: columnName,
        dataType: source.slice(typeRange.start, typeRange.end),
        typeSpec: parseFieldType(source.slice(typeRange.start, typeRange.end), dialect, customTypes),
        originalDataType: source.slice(typeRange.start, typeRange.end),
        nullable: notNullIndex < 0 && !primaryKey,
        originalNullable: notNullIndex < 0 && !primaryKey,
        primaryKey,
        unique: definition.some((token) => token.upper === "UNIQUE"),
        defaultExpression: defaultTokens.length > 0 ? source.slice(defaultTokens[0].start, defaultTokens.at(-1)!.end) : undefined,
        nameRange: { start: definition[0].start, end: definition[0].end },
        typeRange,
        notNullRange: notNullIndex >= 0 ? { start: definition[notNullIndex].start, end: definition[notNullIndex + 1].end } : undefined,
      };
      table.columns.push(column);

      const referencesIndex = definition.findIndex((token) => token.upper === "REFERENCES");
      if (referencesIndex >= 0) {
        const target = qualifiedNameAt(definition, referencesIndex + 1);
        const targetNameToken = target?.nameToken;
        const targetColumnToken = target && tokenInsideParens(definition, target.next);
        const targetColumnName = targetColumnToken && unquoteIdentifier(targetColumnToken.text);
        if (targetNameToken && targetColumnToken && targetColumnName) {
          references.push({
            sourceTableId: tableId,
            sourceColumnName: columnName,
            targetTableName: target!.name,
            targetTableSchema: target!.schema,
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
    const columnsByName = new Map(table.columns.map((column) => [column.name.toLowerCase(), column]));
    for (const pending of pendingIndexes) {
      const columnNames = identifierNamesInsideParens(pending.normalized);
      const columnIds = columnNames.map((columnName) => columnsByName.get(columnName.toLowerCase())?.id).filter((value): value is string => Boolean(value));
      table.indexes.push({
        id: `${tableId}:index:${stablePart(pending.name || String(pending.definition[0].start))}`,
        name: pending.name,
        columnIds,
        unique: pending.unique,
        method: "btree",
        standalone: false,
        sourceRange: { start: pending.definition[0].start, end: pending.definition.at(-1)!.end },
      });
    }
    tables.push(table);
    cursor = closeIndex;
  }

  const schemaIndex = buildSchemaIndex({ tables });

  if (dialect === "postgresql") {
    for (let cursor = 0; cursor < tokens.length - 4; cursor += 1) {
      if (tokens[cursor].upper !== "CREATE") continue;
      const unique = tokens[cursor + 1]?.upper === "UNIQUE";
      const indexTokenOffset = unique ? 2 : 1;
      if (tokens[cursor + indexTokenOffset]?.upper !== "INDEX") continue;
      let nameIndex = cursor + indexTokenOffset + 1;
      if (tokens[nameIndex]?.upper === "IF" && tokens[nameIndex + 1]?.upper === "NOT" && tokens[nameIndex + 2]?.upper === "EXISTS") nameIndex += 3;
      const nameToken = tokens[nameIndex];
      const endIndex = statementEnd(tokens, nameIndex);
      const onIndex = findTokenIndex(tokens, nameIndex + 1, (token) => token.upper === "ON", endIndex);
      if (!nameToken || onIndex < 0) continue;
      const target = qualifiedNameAt(tokens, onIndex + 1);
      const table = target && findIndexedTable(schemaIndex, target.name, target.schema);
      if (!table || !target) continue;
      const usingIndex = findTokenIndex(tokens, target.next, (token) => token.upper === "USING", endIndex);
      const open = findTokenIndex(tokens, target.next, (token) => token.text === "(", endIndex);
      if (open < 0) continue;
      const close = findClosing(tokens, open);
      if (close < 0 || close > endIndex) continue;
      const columnNames = identifierNamesInsideParens(tokens.slice(open, close + 1));
      const columnIds = columnNames.map((columnName) => findIndexedColumn(schemaIndex, table.id, columnName)?.id).filter((value): value is string => Boolean(value));
      const parsedIndex: TableIndex = {
        id: `${table.id}:index:${stablePart(unquoteIdentifier(nameToken.text))}:${nameToken.start}`,
        name: unquoteIdentifier(nameToken.text),
        columnIds,
        unique,
        method: indexMethod(usingIndex >= 0 && usingIndex < open ? tokens[usingIndex + 1]?.text : undefined),
        standalone: true,
        sourceRange: { start: tokens[cursor].start, end: tokens[endIndex].end },
      };
      table.indexes.push(parsedIndex);
      cursor = endIndex;
    }

    for (let cursor = 0; cursor < tokens.length - 5; cursor += 1) {
      if (tokens[cursor].upper !== "COMMENT" || tokens[cursor + 1]?.upper !== "ON" || tokens[cursor + 2]?.upper !== "TABLE") continue;
      const target = qualifiedNameAt(tokens, cursor + 3);
      if (!target) continue;
      const endIndex = statementEnd(tokens, target.next);
      const isIndex = findTokenIndex(tokens, target.next, (token) => token.upper === "IS", endIndex);
      const valueToken = isIndex >= 0 ? tokens[isIndex + 1] : undefined;
      const table = findIndexedTable(schemaIndex, target.name, target.schema);
      if (!table || !valueToken || (valueToken.kind !== "string" && valueToken.upper !== "NULL")) continue;
      const comment = valueToken.kind === "string" ? unquoteString(valueToken.text) : undefined;
      table.comment = comment;
      table.originalComment = comment;
      table.commentStatementRange = { start: tokens[cursor].start, end: tokens[endIndex].end };
      table.commentValueRange = { start: valueToken.start, end: valueToken.end };
      cursor = endIndex;
    }
  }

  const relationships: Relationship[] = [];
  references.forEach((reference, index) => {
    const sourceTable = schemaIndex.tableById.get(reference.sourceTableId);
    const targetTable = findIndexedTable(schemaIndex, reference.targetTableName, reference.targetTableSchema);
    const sourceColumn = sourceTable && findIndexedColumn(schemaIndex, sourceTable.id, reference.sourceColumnName);
    const targetColumn = targetTable && findIndexedColumn(schemaIndex, targetTable.id, reference.targetColumnName);
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

  const logic = parseDatabaseLogic(source, dialect, tables);
  return {
    dialect,
    hasSavedLayout: false,
    source,
    tables,
    relationships,
    diagnostics,
    areas: [],
    notes: [],
    customTypes,
    ...logic,
    structuralTableIds: [],
    removedStatementRanges: [],
  };
}

export function quoteIdentifier(value: string, dialect: SqlDialect = "postgresql"): string {
  if (/^[a-z_][a-z0-9_$]*$/.test(value)) return value;
  const quote = dialectSettings(dialect).identifierQuote;
  return quote === "`" ? `\`${value.replaceAll("`", "``")}\`` : `"${value.replaceAll('"', '""')}"`;
}
