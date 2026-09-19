import { describe, expect, it } from "vite-plus/test";

import {
  fieldsFromSchema,
  NULL_VALUE,
  OMITTED_VALUE,
  readFieldValues,
} from "../../../../src/client/features/actions/action-form.ts";

/** Representative JSON Schema output from zod 4.4.3 for the playground's survey action. */
const SURVEY_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    name: { type: "string" },
    age: { type: "number" },
    subscribed: { default: false, type: "boolean" },
    color: { type: "string", enum: ["red", "green", "blue"] },
    tags: { type: "array", items: { type: "string" } },
    note: { anyOf: [{ type: "string" }, { type: "null" }] },
    layout: { type: "string", enum: ["", "wide"] },
    when: {},
  },
  required: ["name"],
};

describe("fieldsFromSchema", () => {
  it("maps an object schema onto one control per field", () => {
    expect(fieldsFromSchema(SURVEY_SCHEMA)).toEqual([
      { name: "name", kind: "text", required: true },
      { name: "age", kind: "number", required: false },
      { name: "subscribed", kind: "boolean", required: false, defaultText: "false" },
      { name: "color", kind: "select", required: false, options: ["red", "green", "blue"] },
      { name: "tags", kind: "json", required: false },
      { name: "note", kind: "text", required: false, nullable: true },
      { name: "layout", kind: "select", required: false, options: ["", "wide"] },
      { name: "when", kind: "json", required: false },
    ]);
  });

  it("keeps a schema description as the field's tooltip", () => {
    const fields = fieldsFromSchema({
      type: "object",
      properties: { name: { type: "string", description: "Who to greet" } },
    });
    expect(fields).toEqual([
      { name: "name", kind: "text", required: false, description: "Who to greet" },
    ]);
  });

  it("reads a nullable's type, default, and description from around zod's anyOf", () => {
    // zod 4 emits `.nullable()` as a two-way anyOf: a default lands inside
    // the non-null branch while a description sits beside the union.
    const fields = fieldsFromSchema({
      type: "object",
      properties: {
        subscribed: {
          anyOf: [{ default: false, type: "boolean" }, { type: "null" }],
          description: "Opt in",
        },
        color: { anyOf: [{ type: "string", enum: ["red", "green"] }, { type: "null" }] },
      },
    });
    expect(fields).toEqual([
      {
        name: "subscribed",
        kind: "boolean",
        required: false,
        nullable: true,
        defaultText: "false",
        description: "Opt in",
      },
      { name: "color", kind: "select", required: false, nullable: true, options: ["red", "green"] },
    ]);
  });

  it("uses the non-null variant of a nullable's type array", () => {
    const fields = fieldsFromSchema({
      type: "object",
      properties: { note: { type: ["string", "null"] } },
    });
    expect(fields?.[0]).toMatchObject({ name: "note", kind: "text", nullable: true });
  });

  it("leaves a union of several value types to JSON input", () => {
    const fields = fieldsFromSchema({
      type: "object",
      properties: { id: { anyOf: [{ type: "string" }, { type: "number" }, { type: "null" }] } },
    });
    expect(fields?.[0]).toEqual({ name: "id", kind: "json", required: false });
  });

  it("keeps a non-string enum on its base type's control", () => {
    const fields = fieldsFromSchema({
      type: "object",
      properties: { level: { type: "number", enum: [1, 2, 3] } },
    });
    expect(fields?.[0]).toMatchObject({ name: "level", kind: "number" });
  });

  it("generates nothing when the schema is not an object of fields", () => {
    expect(fieldsFromSchema(undefined)).toBeUndefined();
    expect(fieldsFromSchema({})).toBeUndefined();
    expect(fieldsFromSchema({ type: "string" })).toBeUndefined();
    expect(fieldsFromSchema({ type: "object", properties: {} })).toBeUndefined();
  });
});

describe("readFieldValues", () => {
  const fields = fieldsFromSchema(SURVEY_SCHEMA) ?? [];
  const reader = (values: Record<string, string>) => (name: string) => values[name];

  it("decodes each control per its kind and skips omitted ones", () => {
    const fieldValuesResult = readFieldValues(
      fields,
      reader({
        name: "Ada",
        age: "36",
        subscribed: "true",
        color: "red",
        tags: '["a", "b"]',
        note: OMITTED_VALUE,
      }),
    );
    expect(fieldValuesResult).toEqual({
      ok: true,
      value: { name: "Ada", age: 36, subscribed: true, color: "red", tags: ["a", "b"] },
    });
  });

  it("sends an empty record when every control is untouched", () => {
    // Even required fields are omitted when blank: reporting "Required" is
    // left to the endpoint's validation, not the panel.
    expect(readFieldValues(fields, reader({}))).toEqual({ ok: true, value: {} });
  });

  it("sends an explicit empty string and null instead of omitting the field", () => {
    // "" is a value of its own — a text field's, or an enum member — and
    // null is the choice a nullable schema offers; neither is the blank that
    // omits.
    const fieldValuesResult = readFieldValues(
      fields,
      reader({ name: "", layout: "", note: NULL_VALUE }),
    );
    expect(fieldValuesResult).toEqual({
      ok: true,
      value: { name: "", layout: "", note: null },
    });
  });

  it("sends a boolean control's false as false, not as an omitted field", () => {
    const fieldValuesResult = readFieldValues(fields, reader({ subscribed: "false" }));
    expect(fieldValuesResult).toEqual({ ok: true, value: { subscribed: false } });
  });

  it("refuses a number that does not parse", () => {
    const fieldValuesResult = readFieldValues(fields, reader({ age: "abc" }));
    expect(fieldValuesResult).toEqual({ ok: false, message: "age is not a finite number." });
  });

  it("refuses non-finite numbers JSON would silently turn into null", () => {
    for (const text of ["Infinity", "-Infinity", "1e999"]) {
      expect(readFieldValues(fields, reader({ age: text }))).toEqual({
        ok: false,
        message: "age is not a finite number.",
      });
    }
  });

  it("refuses an empty or whitespace-only number instead of coercing it to 0", () => {
    for (const text of ["", " "]) {
      expect(readFieldValues(fields, reader({ age: text }))).toEqual({
        ok: false,
        message: "age is not a finite number.",
      });
    }
  });

  it("refuses a JSON field that is not JSON", () => {
    const fieldValuesResult = readFieldValues(fields, reader({ tags: "not json" }));
    expect(fieldValuesResult).toMatchObject({ ok: false });
    expect((fieldValuesResult as { message: string }).message).toContain("tags is not valid JSON.");
  });
});
