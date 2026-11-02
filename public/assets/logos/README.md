# Custom team logos

Drop logo files in this folder and the game picks them up automatically — no code changes.

**File name = team id**, e.g.

```
public/assets/logos/duke.png
public/assets/logos/north-carolina.svg
public/assets/logos/gonzaga.webp
```

- Supported: `.svg`, `.png`, `.webp` (checked in that order). Square images with transparent backgrounds look best (256×256 or larger).
- Team ids are the kebab-case slugs in `src/data/teams.ts` (they're also shown next to every team in **Settings & Mods → Logos & Files** in-game).
- Teams without a file fall back to a generated badge in the school's colors.

### Optional: `manifest.json`
For large logo packs you can add `manifest.json` here listing the files you've provided. The game then loads exactly these and skips probing for the rest:

```json
["duke.png", "north-carolina.svg", "kentucky.png"]
```

### Prefer not to touch files?
Upload logos per team in-game: **Settings & Mods → Logos & Files → Upload**. Uploaded logos are stored in your browser and override files in this folder.

> Logos are trademarks of their respective schools and are not included with the game.
