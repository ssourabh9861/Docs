# DSA Revision — LeetCode Hardcore

A self-contained static site for revising every problem in the **DSA tracker**:
statement · examples · constraints · **multiple approaches with Java 17** · solutions
hidden until you tap · progress **synced from the tracker sheet**.

## Run

```bash
python3 -m http.server -d docs 8000   # from repo root
# open http://localhost:8000
```

Serve it over HTTP (not `file://`) so the page can `fetch()` its JSON and Markdown.

## Publish (GitHub Pages)

Repo **Settings → Pages → Build and deployment → Deploy from a branch → `/docs`**.
The site is static (`.nojekyll`) and needs no build step.

## Layout

| Path | Purpose |
|------|---------|
| `index.html` | Landing: overall progress ring, difficulty bars, topic grid, sync banner |
| `topic.html` | Per-topic page (`?t=<topic-slug>`): collapsible, lazy-loaded problem cards |
| `assets/` | `style.css`, `app.js`, vendored `marked.min.js` |
| `data/progress.json` | One record per problem (status from the tracker) |
| `data/meta.json` | Totals + rollups + `lastSynced` |
| `content/<topic>/<problem>.md` | Each problem's full write-up |

Regenerate `data/` from the tracker with [`../scripts/sync_tracker.py`](../scripts/sync_tracker.py)
or the **Sync DSA tracker** GitHub Action.
