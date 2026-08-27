# CSS architecture

The UI is being migrated incrementally from the legacy `styles.css` + `ui-system.css` cascade to a token-first modular system. The migration must preserve the deployed UX while reducing cascade coupling.

## Load order

1. `css/tokens.css` — canonical design values and temporary compatibility aliases.
2. `styles.css` — legacy base/component layer while migration is in progress.
3. `ui-system.css` — existing feature/UI layer while migration is in progress.
4. `css/foundation.css` — cross-cutting accessibility, compatibility, print, and rendering safeguards.

New component modules should eventually sit between the token and foundation layers. Do not add new design values to legacy files when a canonical token exists.

## Naming

- Tokens: `--color-*`, `--space-*`, `--radius-*`, `--text-*`, `--shadow-*`, `--transition-*`.
- Components: descriptive classes with BEM-style elements/modifiers where a component needs substructure.
- State: `.is-*`, `.has-*`, or `data-state` attributes.
- Avoid IDs and DOM-position selectors for styling.

## Migration rules

- Preserve compatibility aliases until all legacy references are migrated.
- Do not introduce new `!important` declarations. Existing declarations should be removed opportunistically when the owning selector is migrated.
- Prefer component-local custom properties over selector-specific theme overrides.
- Animate `transform` and `opacity` for motion; color/background/border transitions are acceptable for state feedback.
- Hover-only visual effects belong behind `(hover: hover) and (pointer: fine)` when they do not benefit touch users.
- Long repeated collections may use `content-visibility: auto` with a stable intrinsic-size estimate.
- Themes should primarily override tokens rather than component rules.

## Target modules

```text
css/
  tokens.css
  base.css
  layout.css
  components/
    buttons.css
    cards.css
    forms.css
    dialogs.css
    inventory.css
    printer.css
    audit.css
  themes/
    light.css
    oled.css
    contrast.css
  utilities.css
  foundation.css
```

The split is intentionally incremental: each extraction should be independently reviewable and should not require a full rewrite of markup or application logic.
