import type { SqlDialect } from "../domain/types";

export type TypeParameterKind = "length" | "precision-scale" | "values" | "time-precision";

export interface DialectDataType {
  id: string;
  label: string;
  aliases?: string[];
  category: "numeric" | "text" | "boolean" | "date-time" | "binary" | "json" | "network" | "other";
  parameter?: TypeParameterKind;
  supportsArray?: boolean;
  supportsUnsigned?: boolean;
  defaultParameters?: {
    length?: string;
    precision?: string;
    scale?: string;
    values?: string[];
  };
}

export interface DialectSettings {
  id: SqlDialect;
  label: string;
  identifierQuote: '"' | "`";
  constraintWords: readonly string[];
  tableDefinitionWords: readonly string[];
  dataTypes: readonly DialectDataType[];
  customTypeKinds: readonly ("enum" | "domain" | "composite")[];
  inlineValueTypes: readonly string[];
}
