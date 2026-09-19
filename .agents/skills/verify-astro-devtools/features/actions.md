# Actions panel

Actions lists the project's Astro Actions and lets a user call each one from a form generated from its input schema (or a raw JSON box when no form can be generated); the call goes to the real `/_actions/` endpoint, so validation and middleware run as in the app, and the response is shown under the form.

## Sub-features

- `actions-list` shows the actions file and one expandable row per action in definition order.
- `actions-form` generates typed controls from the input schema: text, number, boolean and enum selects, JSON for arrays, plus a value select offering `empty string` and `null` where the schema allows them.
- `actions-call-json` calls a JSON action and shows the status and decoded result.
- `actions-call-form` calls an `accept: "form"` action as form data in a single request.
- `actions-error` shows a schema rejection as `BAD_REQUEST` with the endpoint's real HTTP status and per-field issues under the panel's own summary sentence, `The input did not validate against the action's schema.`
- `actions-invalid` refuses a value the panel cannot encode before any request is sent — a non-numeric `number` field or malformed `JSON` — and shows it as `invalid input` with the field's own message.
- `actions-file-limit` shows an action with a `File` input, whose call the endpoint rejects, as documented.
- `actions-focus` keeps focus on `Call action` across a call.

## How to get to it (user POV)

- Open the Astro group in the dock and click `Actions`.
- Click the `5 actions` card on Overview.
- Expand an action, fill its fields, click `Call action` (or press Enter in a field).

## Driving it with drive.ts

Preconditions:

- Baseline; the browser is on `/`.
- No action row is expanded (a fresh page load).

- **Open it.** Run `drive.ts browser goto /`, `drive.ts browser dock Actions` and `drive.ts browser wait --role button --name greet --exact`.
- **List.** Run `drive.ts browser aria actions-list --selector devframes-dock-embedded`. It shows `heading "Actions file"` with `button "src/actions/index.ts"`, `heading "5 actions"`, and collapsed buttons `greet`, `feedback.submit`, `survey`, `upload`, `likes.add`.
- **Expand greet.** Run `drive.ts browser click --role button --name greet --exact` and `drive.ts browser aria greet-form --selector 'form:has-text("/_actions/greet")'`. The form has `textbox "name"`, `combobox "name value"` (`text`, `empty string`), `button "Call action"` and the text `POST /_actions/greet/`.
- **Call greet (JSON).** Run `drive.ts browser fill --within 'form:has-text("/_actions/greet")' --role textbox --name name --exact --value Ada`, `drive.ts browser click --within 'form:has-text("/_actions/greet")' --role button --name "Call action"` and `drive.ts browser wait --within 'form:has-text("/_actions/greet")' --testid call-result --has-text 200`. `drive.ts browser text --within 'form:has-text("/_actions/greet")' --testid call-result` reads `200action returned"Hello, Ada!"`; `drive.ts browser requests --match /_actions/greet` lists `POST /_actions/greet/` with status `200`; `drive.ts log --grep '_actions/greet'` shows `[200] POST /_actions/greet/`. Take `drive.ts browser screenshot actions-greet-200` now, while the `200` is still on screen — the schema-error step below overwrites this row's result.
- **Focus and Enter.** With the greet result on screen, run `drive.ts browser eval 'let e=document.activeElement,p=[];while(e){p.push(e.tagName);e=e.shadowRoot?e.shadowRoot.activeElement:null}JSON.stringify(p)'`: the path ends in `BUTTON`, the `Call action` button, because it goes inactive through `aria-disabled` rather than `disabled`. Then run `drive.ts browser requests --clear`, `drive.ts browser fill --within 'form:has-text("/_actions/greet")' --role textbox --name name --exact --value Grace` and `drive.ts browser press Enter --within 'form:has-text("/_actions/greet")' --role textbox --name name --exact`: the result becomes `200action returned"Hello, Grace!"` and `drive.ts browser requests --match /_actions/greet` lists exactly one `POST`.
- **Schema error.** Run `drive.ts browser fill --within 'form:has-text("/_actions/greet")' --role textbox --name name --exact --value ""`, click `Call action` as above and `drive.ts browser wait --within 'form:has-text("/_actions/greet")' --testid call-result --has-text BAD_REQUEST`. The result reads `BAD_REQUESTHTTP 400The input did not validate against the action's schema.name: Invalid input: expected string, received undefined`; the log shows `[400] POST /_actions/greet/`; `drive.ts browser console` lists one `400 (Bad Request)` resource error for that URL, which is expected here.
- **Call feedback.submit (form data).** Run `drive.ts browser click --role button --name feedback.submit --exact`, `drive.ts browser fill --within 'form:has-text("/_actions/feedback.submit")' --role textbox --name message --exact --value hi`, click its `Call action` (`--within 'form:has-text("/_actions/feedback.submit")'`) and `drive.ts browser wait --within 'form:has-text("/_actions/feedback.submit")' --testid call-result --has-text 200`. The result reads `200form dataaction returned{ "received": 2 }`; `drive.ts browser requests --match feedback.submit` lists exactly one `POST`.
- **Survey controls.** Run `drive.ts browser click --role button --name survey --exact` and `drive.ts browser aria survey-form --selector 'form:has-text("/_actions/survey")'`. Controls: `textbox "name"` with its `name value` select, `textbox "age"` (placeholder `number`), `combobox "subscribed"` (`default: false`, `true`, `false`), `combobox "color"` (`—`, `red`, `green`, `blue`), `textbox "tags"` (placeholder `JSON`), `textbox "note"` with a `note value` select offering `text`, `empty string` and `null`, `combobox "layout"` (`—`, `empty string`, `wide`). To call: `drive.ts browser fill --within 'form:has-text("/_actions/survey")' --role textbox --name name --exact --value Ada`, `drive.ts browser select --within 'form:has-text("/_actions/survey")' --role combobox --name subscribed --exact --option true`, click `Call action`, wait for `200`; the result echoes `{ "name": "Ada", "subscribed": true }`.
- **Invalid input, no request.** In the survey form run `drive.ts browser fill --within 'form:has-text("/_actions/survey")' --role textbox --name age --exact --value abc`, `drive.ts browser requests --clear`, click its `Call action` and `drive.ts browser wait --within 'form:has-text("/_actions/survey")' --testid call-result --has-text "invalid input"`. The result reads `invalid inputage is not a finite number.` and `drive.ts browser requests --match /_actions/survey` is empty: the panel refused the value and sent nothing. `tags` set to `not json` fails the same way with `invalid inputtags is not valid JSON. …` — but only once `age` is valid again (`--value ""`): the panel reports the first failing field in schema order, and `age` precedes `tags`.
- **File limitation.** Run `drive.ts browser click --role button --name upload --exact` and `drive.ts browser aria upload-form --selector 'form:has-text("/_actions/upload")'`. The only control is `textbox "file"` with placeholder `JSON`. Run `drive.ts browser fill --within 'form:has-text("/_actions/upload")' --role textbox --name file --exact --value '"notes.txt"'`, click its `Call action` and `drive.ts browser wait --within 'form:has-text("/_actions/upload")' --testid call-result --has-text BAD_REQUEST`. The result reads `BAD_REQUESTform dataHTTP 400The input did not validate against the action's schema.file: Invalid input: expected File, received string`.
- **Proof.** `actions-greet-200` was captured above; close the run with `drive.ts browser aria actions-after-calls --selector devframes-dock-embedded`.

## Gotchas

- `--label name` matches both the text box and the `name value` select; use `--role textbox --name name --exact`, and scope every control with `--within 'form:has-text("/_actions/<name>")'` because several expanded forms coexist.
- The `Actions file` button opens the editor; prove its text, never click.
- A blank control omits its field; the empty string and `null` are explicit choices in the value select next to the input (`--option "empty string"`, `--option null`).
- Results replace each other in place; when re-calling the same row, wait for the new status text rather than for any result.
- Calls are real: `likes.add` and the others run their handlers on the dev server. The playground's handlers are side-effect free, but a project's may not be.
- Two `400 (Bad Request)` resource errors are expected by the end of this recipe, one for `/_actions/greet/` (schema error) and one for `/_actions/upload/` (the `File` limitation); run `drive.ts browser console --clear` before the next feature.
