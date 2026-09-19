import { Select, TextInput } from "@astro-devtools/ui";
import { useId } from "preact/hooks";

import type { ActionField } from "./action-form.ts";

import { NULL_VALUE, OMITTED_VALUE } from "./action-form.ts";

/* How the empty string reads as a choice; the value itself would be a blank option. */
const EMPTY_STRING_LABEL = "empty string";

/** One generated field: its name (starred when required) beside its control. */
export function FieldRow({
  field,
  value,
  onInput,
}: {
  field: ActionField;
  value: string;
  onInput: (value: string) => void;
}) {
  const controlId = useId();
  const descriptionId = `${controlId}-description`;
  return (
    <div class="grid grid-cols-[minmax(96px,180px)_minmax(0,1fr)] items-center gap-2 text-xs @max-[480px]/panel:grid-cols-1 @max-[480px]/panel:gap-0.5">
      <label for={controlId} class="truncate font-mono" title={field.description ?? field.name}>
        {field.name}
        {field.required ? (
          <span class="ml-0.5 text-lavender" title="required" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {field.description === undefined ? null : (
        <span id={descriptionId} class="sr-only">
          {field.description}
        </span>
      )}
      <FieldControl
        field={field}
        value={value}
        controlId={controlId}
        descriptionId={field.description === undefined ? undefined : descriptionId}
        onInput={onInput}
      />
    </div>
  );
}

/** Render the input control for one generated action field. */
function FieldControl({
  field,
  value,
  controlId,
  descriptionId,
  onInput,
}: {
  field: ActionField;
  value: string;
  controlId: string;
  descriptionId: string | undefined;
  onInput: (value: string) => void;
}) {
  // The first choice omits the field, allowing the schema default to apply.
  const blankLabel = field.defaultText === undefined ? "—" : `default: ${field.defaultText}`;
  if (field.kind === "boolean" || field.kind === "select") {
    const options = field.kind === "boolean" ? ["true", "false"] : (field.options ?? []);
    return (
      <Select
        id={controlId}
        name={field.name}
        required={field.required}
        aria-describedby={descriptionId}
        class="font-mono"
        value={value}
        onChange={(event) => onInput(event.currentTarget.value)}
      >
        <option value={OMITTED_VALUE}>{blankLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option === "" ? EMPTY_STRING_LABEL : option}
          </option>
        ))}
        {field.nullable ? <option value={NULL_VALUE}>null</option> : null}
      </Select>
    );
  }

  // Text, number, and JSON fields share one text input; without a schema
  // default, number and JSON placeholders name the expected format. A blank
  // input omits the field, so the values it cannot show — null, and a text
  // field's empty string — are chosen in a select beside it, and the
  // placeholder echoes the choice.
  const choices = valueChoices(field);
  const chosen = choices?.find((choice) => choice.value === value);
  const defaultPlaceholder =
    field.defaultText === undefined ? undefined : `default: ${field.defaultText}`;
  const input = (
    <TextInput
      id={controlId}
      name={field.name}
      type="text"
      inputMode={field.kind === "number" ? "decimal" : undefined}
      required={field.required}
      aria-describedby={descriptionId}
      spellcheck={false}
      class="flex-1 font-mono"
      placeholder={
        chosen?.placeholder ??
        defaultPlaceholder ??
        { text: undefined, number: "number", json: "JSON" }[field.kind]
      }
      value={value === OMITTED_VALUE || value === NULL_VALUE ? "" : value}
      onInput={(event) => onInput(event.currentTarget.value || OMITTED_VALUE)}
    />
  );
  if (choices === undefined) return input;
  return (
    <div class="flex min-w-0 gap-1.5">
      {input}
      <Select
        aria-label={`${field.name} value`}
        class="font-mono"
        value={chosen?.value ?? OMITTED_VALUE}
        onChange={(event) => onInput(event.currentTarget.value)}
      >
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

/** A value the input beside the select cannot show. */
interface ValueChoice {
  value: string;
  label: string;
  /** Shown in the blank input while this value is chosen. */
  placeholder?: string;
}

/**
 * Choices of the select beside a text or number input: the typed text
 * itself, a text field's empty string, and null when the schema allows it.
 * `undefined` when typing can express every value.
 */
function valueChoices(field: ActionField): ValueChoice[] | undefined {
  if (field.kind === "json") return undefined;
  const choices: ValueChoice[] = [{ value: OMITTED_VALUE, label: field.kind }];
  if (field.kind === "text") {
    choices.push({ value: "", label: EMPTY_STRING_LABEL, placeholder: '""' });
  }
  if (field.nullable) choices.push({ value: NULL_VALUE, label: "null", placeholder: "null" });
  return choices.length > 1 ? choices : undefined;
}
