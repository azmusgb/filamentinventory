# PrintRequirement acceptance record template

Use this only after the corresponding validation stage actually runs.

```text
Source SHA:
PR / change:
Unit tests:
Browser / deploy preview:
Post-merge main CI:
Production deployment identity:
Production smoke:
Behavioral acceptance:
Known limitations:
Rollback path:
```

Do not mark a field passed based on an earlier stage. In particular, unit/CI success does not by itself prove production behavior, and this web-side change does not imply any WS350 physical acceptance.
