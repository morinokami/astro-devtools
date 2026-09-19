/**
 * Convert an action's JSON Schema into form fields when possible, and read
 * the generated controls back into an action input.
 *
 * Every control holds one string, and a blank text input omits its field.
 * The two values no typed text can mean get sentinels: omission chosen from
 * a select, and a JSON null. The empty string stays what it reads as.
 */

/**
 * Control value that leaves the field out of the input. A missing draft
 * entry means the same; the sentinel lets a select offer omission as a
 * choice apart from an enum's own "" value.
 */
export const OMITTED_VALUE = "\u0000omitted";

/** Control value that sends a JSON null, offered when the schema allows null. */
export const NULL_VALUE = "\u0000null";

/** The kind of control that a field renders as. */
type ActionFieldKind = "text" | "number" | "boolean" | "select" | "json";

/** One control of a generated call form. */
export interface ActionField {
  name: string;
  kind: ActionFieldKind;
  /** Whether the schema requires the field on input. */
  required: boolean;
  /** Set when the schema also accepts null, so the control offers it. */
  nullable?: boolean;
  /** Choices of a `select` field, from the schema's enum. */
  options?: string[];
  /** JSON-encoded schema default, shown on the control. */
  defaultText?: string;
  /** The schema's own description, offered as the control's tooltip. */
  description?: string;
}

/** Return fields in schema order, or `undefined` when a form cannot be generated. */
export function fieldsFromSchema(schema: unknown): ActionField[] | undefined {
  if (typeof schema !== "object" || schema === null) return undefined;
  const { type, properties, required } = schema as {
    type?: unknown;
    properties?: unknown;
    required?: unknown;
  };
  if (type !== "object" || typeof properties !== "object" || properties === null) return undefined;
  const requiredNames = new Set(Array.isArray(required) ? required.map(String) : []);
  const fields = Object.entries(properties).map(([name, property]) =>
    toField(name, property, requiredNames.has(name)),
  );
  return fields.length > 0 ? fields : undefined;
}

/** The JSON Schema keywords the form generator reads. */
interface SchemaObject {
  type?: unknown;
  enum?: unknown;
  const?: unknown;
  default?: unknown;
  description?: unknown;
  anyOf?: unknown;
}

function isSchemaObject(value: unknown): value is SchemaObject {
  return typeof value === "object" && value !== null;
}

function toField(name: string, property: unknown, required: boolean): ActionField {
  if (!isSchemaObject(property)) return { name, kind: "json", required };
  const { schema, nullable } = withoutNull(property);
  const base: ActionField = { name, kind: "json", required };
  if (nullable) base.nullable = true;
  if (typeof schema.description === "string") base.description = schema.description;
  if ("default" in schema) base.defaultText = JSON.stringify(schema.default);

  // String enums can use a select; other enums use their base field type.
  const options = Array.isArray(schema.enum)
    ? schema.enum
    : "const" in schema
      ? [schema.const]
      : [];
  if (options.length > 0 && options.every((option) => typeof option === "string")) {
    return { ...base, kind: "select", options };
  }

  switch (schema.type) {
    case "string":
      return { ...base, kind: "text" };
    case "number":
    case "integer":
      return { ...base, kind: "number" };
    case "boolean":
      return { ...base, kind: "boolean" };
    default:
      return base;
  }
}

/**
 * Split a nullable schema into its non-null part and a flag. zod emits
 * `.nullable()` as `anyOf: [schema, { type: "null" }]`, with a description
 * or default either beside the union or inside the branch; JSON Schema also
 * allows "null" inside a `type` array.
 */
function withoutNull(schema: SchemaObject): { schema: SchemaObject; nullable: boolean } {
  const { anyOf, ...keywords } = schema;
  if (Array.isArray(anyOf) && anyOf.length === 2) {
    const branches = anyOf.filter((branch) => !isNullSchema(branch));
    if (branches.length === 1 && isSchemaObject(branches[0])) {
      return { schema: { ...branches[0], ...keywords }, nullable: true };
    }
  }
  if (Array.isArray(schema.type) && schema.type.includes("null")) {
    const types = schema.type.filter((type) => type !== "null");
    return { schema: { ...schema, type: types.length === 1 ? types[0] : types }, nullable: true };
  }
  return { schema, nullable: false };
}

function isNullSchema(schema: unknown): boolean {
  return isSchemaObject(schema) && schema.type === "null";
}

/** A parsed field record or a validation message. */
type FieldValuesResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string };

/**
 * Parse generated form values into an action input object. A control that
 * is absent or holds `OMITTED_VALUE` leaves its field out and `NULL_VALUE`
 * sends null; anything else, the empty string included, is decoded per the
 * control's kind. A `File` input cannot be expressed by the generated
 * controls.
 */
export function readFieldValues(
  fields: ActionField[],
  readValue: (name: string) => string | undefined,
): FieldValuesResult {
  const value: Record<string, unknown> = {};
  for (const field of fields) {
    const controlValue = readValue(field.name);
    if (controlValue === undefined || controlValue === OMITTED_VALUE) continue;
    if (controlValue === NULL_VALUE) {
      value[field.name] = null;
      continue;
    }
    switch (field.kind) {
      case "text":
      case "select":
        value[field.name] = controlValue;
        break;
      case "number": {
        // Number() turns whitespace-only text into 0 and accepts "Infinity",
        // which JSON.stringify would then silently send as null.
        const parsed = controlValue.trim() === "" ? Number.NaN : Number(controlValue);
        if (!Number.isFinite(parsed)) {
          return { ok: false, message: `${field.name} is not a finite number.` };
        }
        value[field.name] = parsed;
        break;
      }
      case "boolean":
        value[field.name] = controlValue === "true";
        break;
      case "json": {
        try {
          value[field.name] = JSON.parse(controlValue);
        } catch (error) {
          return {
            ok: false,
            message: `${field.name} is not valid JSON. ${error instanceof Error ? error.message : ""}`,
          };
        }
        break;
      }
    }
  }
  return { ok: true, value };
}
