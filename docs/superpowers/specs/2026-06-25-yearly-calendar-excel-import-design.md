# Yearly Calendar Excel Import Design

## Context

The yearly calendar currently stores one row per calendar entry in
`yearly_calendar_entries`, grouped by `school_year`. A kindergarten year starts
in August, so `2027/2028` is stored as `school_year = 2027` and contains months
August-December 2027 and January-July 2028.

Logged-in users with the existing yearly-calendar editor roles (`admin`,
`member`, and `staff`) can already create, edit, move, and delete entries on
`/arskalender`. The import feature should use the same permissions and data
model.

## Goals

- Let an editor download an Excel template for the selected kindergarten year.
- Include existing entries for that year in the template so the file can be
  edited and re-imported.
- Let an editor import a completed Excel file through a preview flow.
- Add only genuinely new rows automatically.
- Detect unchanged rows and ignore them.
- Detect likely changes to existing entries and ask the editor what to do.
- Explain invalid rows clearly, with row-specific reasons.
- Ensure the default kindergarten year changes automatically every 1 August.

## Non-Goals

- CSV import/export is out of scope for this implementation; Excel is the only
  supported import template format.
- The feature will not add a new database table for entry types or colors.
- The feature will not create a separate draft/import-job workflow.
- The feature will not replace the existing single-entry editor.

## User Flow

On `/arskalender`, the selected kindergarten year controls both export and
import.

Editors see two actions:

- `Last ned Excel-mal`: downloads an `.xlsx` file for the selected kindergarten
  year.
- `Importer Excel`: lets the editor upload a completed `.xlsx` file.

Import is two-step:

1. Preview the file and compare it with the database.
2. Commit only the rows/actions the editor confirms.

No database changes happen during preview.

## Default Kindergarten Year

The app should calculate the active kindergarten year from the current date:

- From 1 August through 31 December, the default school year is the current
  calendar year.
- From 1 January through 31 July, the default school year is the previous
  calendar year.

Examples:

- 25 June 2026 defaults to `2025/2026`.
- 1 August 2026 defaults to `2026/2027`.
- 15 January 2028 defaults to `2027/2028`.

This logic should live in one shared client helper and be used by both the
yearly-calendar page and homepage yearly-calendar lookups.

## Excel Template

The workbook has two sheets.

### Sheet: Oppføringer

This sheet contains one row per entry. Downloaded templates include existing
entries for the selected kindergarten year.

Columns:

- `entry_type`
- `tittel`
- `dato`
- `år`
- `måned`
- `uke_fra`
- `uke_til`
- `beskrivelse`
- `farge`
- `vis_på_forside`
- `for_foreldre`

Valid `entry_type` values:

- `week_event`
- `day_event`
- `food`
- `closed`
- `note`

Valid `farge` values:

- `red`
- `yellow`
- `green`
- `blue`
- `orange`
- `pink`
- `purple`

Empty `farge` is allowed and means the app can use its existing default color
for the entry type.

Date values use `YYYY-MM-DD`.

Boolean values use `true` or `false`.

### Sheet: Veiledning

This sheet explains everything an editor needs to fill out the template:

- The purpose of each column.
- Valid `entry_type` values and what they mean.
- Required fields for each `entry_type`.
- Valid color values.
- Date and boolean formats.
- Example rows.

The workbook should also use Excel data validation/dropdowns where practical
for `entry_type`, `farge`, `vis_på_forside`, and `for_foreldre`.

## Field Rules

`day_event`:

- Requires `tittel`, `dato`, `år`, and `måned`.
- Can use `vis_på_forside` and `for_foreldre`.
- Ignores week fields.

`closed`:

- Requires `tittel`, `dato`, `år`, and `måned`.
- Ignores homepage flags.
- Ignores week fields.

`week_event`:

- Requires `tittel`, `år`, `måned`, and `uke_fra`.
- Can use `uke_til`.
- Ignores `dato` and homepage flags.

`note`:

- Requires `tittel`, `år`, `måned`, and `uke_fra`.
- Can use `uke_til`.
- Ignores `dato` and homepage flags.

`food`:

- Requires `tittel`, `år`, `måned`, and `uke_fra`.
- Ignores `uke_til`, `dato`, and homepage flags.

All rows must belong to the selected kindergarten year. For `2027/2028`, valid
months are August-December 2027 and January-July 2028.

## Matching And Conflict Detection

Rows are matched against existing entries by normalized title within the
selected kindergarten year.

Normalized title means:

- Trim leading and trailing whitespace.
- Collapse repeated internal whitespace.
- Compare case-insensitively.

Preview statuses:

- `new`: no existing entry with the same normalized title.
- `unchanged`: matching title exists and relevant fields are unchanged.
- `changed`: matching title exists, but one or more relevant fields changed.
- `invalid`: row cannot be imported.
- `ambiguous`: more than one existing entry has the same normalized title.

For `changed`, the preview shows changed fields with old and new values. Example:

`Sommerfest har fått ny dato. Gammel dato: 2027-06-02. Ny dato: 2027-06-04.`

The editor chooses one action for each changed row:

- `Oppdater eksisterende`
- `Opprett som ny`
- `Ignorer`

For `new`, the default action is create.

For `unchanged`, the default action is ignore.

For `ambiguous`, the row is not updated automatically. The editor can either
create it as a new entry or ignore it.

## Invalid Rows

Invalid rows must include row-specific explanations. A row can have multiple
errors.

Examples:

- `Rad 12: Mangler tittel.`
- `Rad 18: Ugyldig entry_type "event". Bruk en av: week_event, day_event, food, closed, note.`
- `Rad 22: Fargen "grey" er ikke tillatt. Bruk en av: red, yellow, green, blue, orange, pink, purple.`
- `Rad 31: Dato 2029-02-01 ligger utenfor barnehageåret 2027/2028.`
- `Rad 40: closed krever dato i format YYYY-MM-DD.`

Invalid rows are never imported. If there are invalid rows, the editor can still
import valid rows through a clearly labelled action such as `Importer gyldige
rader`.

## API Shape

The existing `api/yearly-calendar.js` route should stay the backend home for
this feature to avoid adding a new Vercel serverless function.

Recommended route shape:

- `GET /api/yearly-calendar?schoolYear=2027` keeps returning entries.
- `POST /api/yearly-calendar?action=preview-import` validates and compares rows.
- `POST /api/yearly-calendar?action=commit-import` applies confirmed actions.

Both import endpoints require the existing yearly-calendar editor roles and
CSRF protection.

The client parses `.xlsx` in the browser and sends structured JSON rows to the
API. The API remains the source of truth for validation, comparison, and writes.

## UI

The import preview should group rows into:

- New entries.
- Unchanged entries.
- Changes that need confirmation.
- Rows with errors.

The preview should show counts for each group and make the default result clear
before the editor commits.

For changed rows, show the entry title, each changed field, old value, new
value, and the three available actions.

For invalid rows, show row number, title if available, and all validation
messages.

## Testing

Add focused tests or scripts around pure import helpers where practical:

- Default kindergarten-year calculation around 1 August.
- Excel row normalization.
- Validation errors.
- Matching by normalized title.
- Changed-field detection.
- Commit payload construction.

Also run the existing checks:

- `npm run check`
- `npm test`
