# Mods: custom team data

Create `public/mods/teams.json` (copy `teams.example.json`) to override team data for **new dynasties**. Every field is optional — include only what you want to change. Keys are team ids from `src/data/teams.ts`.

```json
{
  "teams": {
    "indiana": { "colors": ["#990000", "#EEEDEB"], "prestige": 92 },
    "my-school": { "school": "Springfield", "mascot": "Isotopes", "abbr": "SPR" }
  }
}
```

Overridable fields: `school`, `fullName`, `mascot`, `abbr`, `conf`, `city`, `state`, `lat`, `lng`, `colors` (`[primary, secondary]` hex), `prestige` (1–100), `arena`, `capacity`, `market` (1–10), `academics` (1–10), `facilities` (1–10).

You can also edit teams in-game in **Settings & Mods → Team Editor**, which can apply changes to your current dynasty or save them as a mod (and import/export the same JSON format).
