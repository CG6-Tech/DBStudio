import type { CustomType, FieldTypeSpec, SqlDialect } from "../domain/types";
import { mysqlSettings } from "./mysql";
import { postgresqlSettings } from "./postgresql";
import type { DialectDataType, DialectSettings } from "./types";

export type { DialectDataType, DialectSettings } from "./types";

export function dialectSettings(dialect: SqlDialect): DialectSettings {
  return dialect === "mysql" ? mysqlSettings : postgresqlSettings;
}

function unquoteLiteral(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("'") && trimmed.endsWith("'")
    ? trimmed.slice(1, -1).replaceAll("''", "'")
    : trimmed;
}

function splitArguments(value: string): string[] {
  const result: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "'" && value[index + 1] === "'" && quoted) { current += "''"; index += 1; continue; }
    if (char === "'") quoted = !quoted;
    if (char === "," && !quoted) { result.push(current.trim()); current = ""; } else current += char;
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

export function resolveDataType(settings: DialectSettings, value: string): DialectDataType | undefined {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  return settings.dataTypes.find((type) => type.id === normalized || type.label.toLowerCase() === normalized || type.aliases?.some((alias) => alias === normalized));
}

export function parseFieldType(rawValue: string, dialect: SqlDialect, customTypes: CustomType[] = []): FieldTypeSpec {
  const settings = dialectSettings(dialect);
  let raw = rawValue.trim();
  let arrayDimensions = 0;
  if (dialect === "postgresql") {
    while (/\[\]\s*$/.test(raw)) { arrayDimensions += 1; raw = raw.replace(/\[\]\s*$/, "").trim(); }
  }
  const unsigned = dialect === "mysql" && /\s+unsigned\s*$/i.test(raw);
  if (unsigned) raw = raw.replace(/\s+unsigned\s*$/i, "").trim();
  const match = raw.match(/^(.+?)(?:\s*\((.*)\))?$/s);
  const base = (match?.[1] ?? raw).trim().replace(/^['"`]|['"`]$/g, "");
  const args = match?.[2] ? splitArguments(match[2]) : [];
  const builtIn = resolveDataType(settings, base);
  if (builtIn) {
    return {
      kind: "builtin",
      typeId: builtIn.id,
      parameters: builtIn.parameter === "values" ? { values: args.map(unquoteLiteral) } : builtIn.parameter === "precision-scale" ? { precision: args[0] ?? "", scale: args[1] ?? "" } : builtIn.parameter ? { length: args[0] ?? "" } : {},
      arrayDimensions,
      unsigned,
      raw: rawValue.trim(),
    };
  }
  const normalizedBase = base.includes(".") ? base.split(".").at(-1)! : base;
  const custom = customTypes.find((type) => type.name.toLowerCase() === normalizedBase.toLowerCase());
  if (custom) return { kind: "custom", customTypeId: custom.id, typeId: custom.name, parameters: {}, arrayDimensions, unsigned: false, raw: rawValue.trim() };
  return { kind: "unresolved", typeId: base, parameters: {}, arrayDimensions, unsigned, raw: rawValue.trim() };
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function formatFieldType(spec: FieldTypeSpec, dialect: SqlDialect, customTypes: CustomType[] = []): string {
  const settings = dialectSettings(dialect);
  const builtIn = spec.kind === "builtin" ? settings.dataTypes.find((type) => type.id === spec.typeId) : undefined;
  let value = builtIn?.label ?? (spec.kind === "custom" ? customTypes.find((type) => type.id === spec.customTypeId)?.name ?? spec.typeId : spec.raw || spec.typeId);
  if (builtIn?.parameter === "values") {
    const values = spec.parameters.values ?? [];
    value += `(${values.map(sqlLiteral).join(", ")})`;
  } else if (builtIn?.parameter === "precision-scale") {
    const precision = spec.parameters.precision?.trim();
    const scale = spec.parameters.scale?.trim();
    if (precision) value += `(${precision}${scale ? `, ${scale}` : ""})`;
  } else if (builtIn?.parameter) {
    const length = spec.parameters.length?.trim();
    if (length) value += `(${length})`;
  }
  if (spec.unsigned && builtIn?.supportsUnsigned) value += " UNSIGNED";
  if (dialect === "postgresql" && spec.arrayDimensions > 0) value += "[]".repeat(spec.arrayDimensions);
  return value;
}
