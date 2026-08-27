# Inventory command surface

The inventory command surface is a presentation and interaction layer over the existing private inventory state and controls. It does not introduce a new data model.

## Quick views

- **All** — active private inventory.
- **Low** — active spools at or below their configured reorder threshold.
- **Measure** — active spools whose remaining amount is unknown.
- **Loaded** — active spools assigned to Printer / AMS placement.
- **Recent** — the eight most recently touched active spools.

Selecting a quick view intentionally resets detailed inventory filters so the result is deterministic. Detailed filtering remains authoritative through the existing search, material, status, location, lifecycle, and sort controls.

## Fast find

- macOS / iPad hardware keyboard: `⌘K`
- Windows / Linux: `Ctrl+K`
- when focus is not in a form control: `/`

The shortcut opens Inventory and focuses the existing inventory search field.

## Architecture

`inventory-command-core.js` contains pure selectors and summary logic. `inventory-command-client.js` composes the UI and reuses the existing inventory controls, Add Spool action, rendered cards, and Weigh action. Styling remains in `ui-system.css` so the app retains one authoritative UI system.
