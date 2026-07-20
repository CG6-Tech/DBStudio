const keywords = new Set([
  "add", "after", "alter", "and", "as", "asc", "before", "begin", "between", "by", "call", "case", "check", "column", "constraint", "create", "delete", "desc", "distinct", "do", "drop", "else", "elsif", "end", "exists", "false", "for", "foreign", "from", "function", "group", "having", "if", "in", "index", "inner", "insert", "into", "is", "join", "key", "language", "left", "like", "limit", "not", "null", "on", "or", "order", "outer", "primary", "procedure", "raise", "references", "replace", "return", "returns", "right", "row", "select", "set", "table", "then", "trigger", "true", "truncate", "unique", "update", "values", "when", "where",
]);

const types = new Set([
  "bigint", "boolean", "char", "date", "decimal", "double", "float", "int", "integer", "json", "jsonb", "numeric", "real", "serial", "smallint", "text", "time", "timestamp", "timestamptz", "uuid", "varchar",
]);

type SqlTokenKind = "plain" | "keyword" | "type" | "identifier" | "table" | "string" | "number" | "comment" | "operator" | "function";
interface SqlToken { kind: SqlTokenKind; value: string; }

const tableIntroducers = new Set(["from", "into", "join", "references", "table", "truncate", "update"]);

function readQuoted(sql: string, start: number, quote: string): number {
  let index = start + 1;
  while (index < sql.length) {
    if (sql[index] === quote) {
      if (sql[index + 1] === quote) { index += 2; continue; }
      return index + 1;
    }
    index += 1;
  }
  return sql.length;
}

function readDollarQuoted(sql: string, start: number): number {
  const match = sql.slice(start).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
  if (!match) return start;
  const close = sql.indexOf(match[0], start + match[0].length);
  return close < 0 ? sql.length : close + match[0].length;
}

function tokenizeSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let index = 0;
  let expectingTableName = false;
  while (index < sql.length) {
    const char = sql[index];
    if (/\s/.test(char)) {
      const start = index;
      while (index < sql.length && /\s/.test(sql[index])) index += 1;
      tokens.push({ kind: "plain", value: sql.slice(start, index) });
      continue;
    }
    if (sql.startsWith("--", index)) {
      const end = sql.indexOf("\n", index);
      const next = end < 0 ? sql.length : end;
      tokens.push({ kind: "comment", value: sql.slice(index, next) });
      index = next;
      continue;
    }
    if (sql.startsWith("/*", index)) {
      const end = sql.indexOf("*/", index + 2);
      const next = end < 0 ? sql.length : end + 2;
      tokens.push({ kind: "comment", value: sql.slice(index, next) });
      index = next;
      continue;
    }
    if (char === "'" || char === '"') {
      const next = readQuoted(sql, index, char);
      tokens.push({ kind: char === "'" ? "string" : expectingTableName ? "table" : "identifier", value: sql.slice(index, next) });
      if (char === '"' && expectingTableName) expectingTableName = false;
      index = next;
      continue;
    }
    if (char === "$") {
      const next = readDollarQuoted(sql, index);
      if (next > index) {
        tokens.push({ kind: "string", value: sql.slice(index, next) });
        index = next;
        continue;
      }
    }
    if (/\d/.test(char)) {
      const start = index;
      while (index < sql.length && /[\d._]/.test(sql[index])) index += 1;
      tokens.push({ kind: "number", value: sql.slice(start, index) });
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const start = index;
      while (index < sql.length && /[A-Za-z0-9_$]/.test(sql[index])) index += 1;
      const value = sql.slice(start, index);
      const lower = value.toLowerCase();
      const lookahead = sql.slice(index).match(/^\s*\(/);
      if (keywords.has(lower)) {
        tokens.push({ kind: "keyword", value });
        expectingTableName = tableIntroducers.has(lower);
      } else {
        tokens.push({ kind: lookahead ? "function" : expectingTableName ? "table" : types.has(lower) ? "type" : "plain", value });
        expectingTableName = false;
      }
      continue;
    }
    const two = sql.slice(index, index + 2);
    const operator = ["!=", "<=", ">=", "<>", "||", "::", ":=", "=>"].includes(two) ? two : char;
    tokens.push({ kind: /[()[\],.;]/.test(operator) ? "plain" : "operator", value: operator });
    index += operator.length;
  }
  return tokens;
}

export function SqlText({ sql, className = "", maxHeight }: { sql: string; className?: string; maxHeight?: number }) {
  const tokens = tokenizeSql(sql);
  return <pre className={`sql-text${className ? ` ${className}` : ""}`} style={maxHeight ? { maxHeight } : undefined} onWheel={(event) => event.stopPropagation()} onTouchMove={(event) => event.stopPropagation()}>
    <code>{tokens.map((token, index) => token.kind === "plain" ? token.value : <span key={index} className={`sql-token ${token.kind}`}>{token.value}</span>)}</code>
  </pre>;
}
