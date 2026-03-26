# DepsView

**Real-time dependency graph for your codebase.**
See your architecture, detect issues, and understand impact — at a glance.

![DepsView — collapsed view](https://raw.githubusercontent.com/jo050493/DepsView/master/media/readme/collapsed.png)

---

## Why DepsView?

AI coding tools generate code fast, but they don't see your architecture. They create phantom imports, circular dependencies, and tightly-coupled modules — and you won't notice until the project breaks.

DepsView gives you a **live architectural map** that updates in real-time as files change. You see what's connected, what's broken, and what's at risk — at a glance.

**No other tool does this.** Dependency Cruiser generates static SVGs. CodeSee is async. Graph-It-Live has no heatmap. DepsView is the only tool that shows modification activity on a live dependency graph.

---

## Features

### Live dependency graph
Interactive graph with hierarchical clustering. Files grouped by folder, colored by category (component, hook, service, page, util, config, test). Edges appear on hover — clean view by default.

![Hover — edges appear on mouseover](https://raw.githubusercontent.com/jo050493/DepsView/master/media/readme/hover.png)

### Expand all
Unfold every cluster to see all files at once. Full inventory of your project.

![Expanded view — all files visible](https://raw.githubusercontent.com/jo050493/DepsView/master/media/readme/expand%20all.png)

### Focus mode
Click any file or folder to isolate its connections. Toggle depth 1 (direct) or depth 2 (indirect). Everything else fades. Press Esc to exit.

| Depth 1 — direct connections | Depth 2 — indirect connections |
|:---:|:---:|
| ![Focus depth 1](https://raw.githubusercontent.com/jo050493/DepsView/master/media/readme/focus%201.png) | ![Focus depth 2](https://raw.githubusercontent.com/jo050493/DepsView/master/media/readme/focus%202.png) |

### Real-time heatmap
Recently modified files pulse with heat animations. See what the AI is touching right now.

### Architectural detections
Circular dependencies (CYCLE badge), phantom imports (missing files), shadow imports (AI hallucinations), orphan files, excessive coupling.

### Impact radius
Hover any file to see impact rings: which files break if you modify it. Three levels: direct (red), indirect (orange), far (yellow).

### Context Bridge
One-click copy of architectural context optimized for LLM prompts. Generate a diagnostic report or copy a fix prompt for any issue.

### MCP Server
AI assistants query your architecture directly. No copy-paste needed.

### Export PNG
High-resolution 2x retina export for docs, PRs, and architecture reviews.

### Search
`Ctrl+F` to find files by name. Navigate with Enter/arrows.

---

## Install

### VS Code / Cursor / Windsurf

Search **DepsView** in the Extensions marketplace, or:

```
ext install depsview.depsview
```

Open the command palette (`Ctrl+Shift+P`) and run **DepsView: Show Dependency Graph**.

The graph updates automatically on every file save.

### Standalone browser (no VS Code needed)

```bash
npx depsview serve .
```

Open `http://localhost:7890`. The graph updates live as you edit files in any editor.

```bash
# Custom port
npx depsview serve /path/to/project --port 8080
```

### CLI

```bash
npx depsview scan . --pretty
npx depsview scan /path/to/project -o graph.json
```

---

## MCP Server

Give your AI assistant direct access to architectural data.

**Claude Code** (`.claude/settings.json`):
```json
{
  "mcpServers": {
    "depsview": {
      "command": "node",
      "args": ["/path/to/depsview/dist/mcp.js", "--project", "."]
    }
  }
}
```

### Tools

| Tool | Description |
|------|-------------|
| `get_architecture_summary` | File count, deps, health score, top high-impact files |
| `get_file_dependencies` | Imports, dependents, and impact radius for a file |
| `get_detections` | Cycles, phantoms, shadows, orphans, coupling issues |
| `get_impact_radius` | Cascade impact of modifying a file, by depth |
| `get_coupling_analysis` | Most coupled folder pairs |

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| Hover | See connections and impact rings |
| Click | Enter focus mode |
| `Ctrl+F` | Search files |
| `Esc` | Exit focus mode |
| `1` / `2` | Focus depth (in focus mode) |

---

## Supported languages

| Language | Imports detected |
|----------|-----------------|
| TypeScript / JavaScript | `import`, `require()`, dynamic `import()` |
| Python | `import`, `from ... import` |
| Go | `import` |

---

## Configuration

VS Code settings (`settings.json`):

```json
{
  "depsview.entryPointPatterns": ["scripts/"],
  "depsview.couplingThreshold": 10,
  "depsview.diagnostics": {
    "cycle": "error",
    "phantom": "error",
    "shadow": "warning",
    "orphan": "hint",
    "coupling": "hint"
  }
}
```

| Setting | Description | Default |
|---------|-------------|---------|
| `entryPointPatterns` | Regex patterns for files that should not be flagged as orphans | `[]` |
| `couplingThreshold` | Connection count above which a file is flagged | `8` |
| `diagnostics` | Severity per issue type (`error`, `warning`, `hint`, `off`) | see above |

---

## What's next

DepsView is actively maintained. Upcoming features include minimap overview, color legend, zoom-to-cluster, enhanced search, disk caching, and support for more languages.

Feature requests and ideas are welcome — [open an issue](https://github.com/jo050493/DepsView/issues).

---

## License

MIT
