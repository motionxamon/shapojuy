# Shapojuy

[Русский гайд](README_RU.md) · [Home](README.md) · [Latest release](https://github.com/motionxamon/shapojuy/releases/latest)

Compact shape-layer toolbox for Adobe After Effects 2026.

Shapojuy converts vector footage, explodes and merges Shape Layers, removes empty Illustrator debris, and preserves visual placement across common 2D parenting workflows.

## Features

- Convert AI, EPS, PDF, and SVG footage to native Shape Layers.
- Convert vector footage and immediately explode the result.
- Explode multiple selected Shape Layers in one operation.
- Skip empty Illustrator groups and optionally preserve control paths without Fill or Stroke.
- Merge multiple Shape Layers while preserving their current visual placement.
- Support Shape Layers parented to 2D Null layers.
- Merge coordinate modes: Comp Space, Common Parent, and First Layer.
- Transform-animation sampling at source key times or on every frame.
- Clean empty nested groups and normalize generic layer/group names.
- Keep, disable, archive, or delete source layers.
- Run every operation inside a single After Effects Undo group.

## Compact controls

| Button | Action |
| --- | --- |
| `V→S` | Convert selected vector footage to Shape Layers |
| `V→X` | Convert selected vector footage and explode the result |
| `X` | Explode selected Shape Layers |
| `M` | Merge selected Shape Layers |
| `C` | Clean selected Shape Layers |
| `⚙` | Show or hide settings |

Hover over a button in After Effects to see its full description.

## Installation

### Download

1. Open the [Releases page](https://github.com/motionxamon/shapojuy/releases).
2. Select the latest release.
3. Download `Shapojuy.jsx` from **Assets**.

### Install

1. Copy `Shapojuy.jsx` to the After Effects ScriptUI Panels directory.

   macOS:

   ```text
   /Applications/Adobe After Effects 2026/Scripts/ScriptUI Panels/
   ```

   Windows:

   ```text
   C:\Program Files\Adobe\Adobe After Effects 2026\Support Files\Scripts\ScriptUI Panels\
   ```

2. Restart After Effects.
3. Open `Window → Shapojuy`.
4. Dock the panel in the desired workspace.

## Settings

### Source

- `Keep` — retain source layers.
- `Disable` — disable source layers after a successful operation.
- `Archive` — disable and shy source layers, and add an archive comment.
- `Delete` — remove source layers after successful processing.

### Anchor

- `Keep` — preserve the original anchor.
- `Visual Center` — move the anchor to the visible bounds without moving the artwork.
- `Comp` — move the anchor to the composition center without moving the artwork.

Animated, separated-dimension, and 3D transforms are left unchanged by automatic anchor adjustment.

### Merge coordinates

- `Comp Space` — build the merged result in composition coordinates.
- `Common Parent` — retain a common 2D parent when all selected layers share one. This is the default mode; Anchor, Position, Scale, Rotation, and Opacity are transferred directly without matrix decomposition.
- `First Layer` — use the first/top selected Shape Layer as the result coordinate system.

### Merge animation

- `Off` — preserve the current frame only.
- `Key Times` — sample source and parent transforms at their existing key times.
- `Every Frame` — sample every frame for the closest match with complex parent animation.

`Every Frame` creates substantially more keyframes.

### Output suffix

Optional suffix for newly created Shape Layers. Leave it empty to use source group names for Explode and merged source-layer names for Merge. Shapojuy does not insert its own name into output layers. `_v2` is appended directly; plain text such as `outline` is separated with a space.

## Current limitations

- Merge supports 2D Shape Layers and 2D parent chains. 3D layers and 3D parents are rejected.
- Effects, Masks, Layer Styles, and Track Mattes cannot be preserved independently inside separate Shape Groups.
- Key Times sampling can differ between original keys when several animated transforms are combined. Use Every Frame when exact intermediate motion matters.
- After Effects' native vector conversion limitations still apply to gradients and unsupported Illustrator features.

Shapojuy does not display modal confirmations or result dialogs. Operations run immediately; the last status is available in the `⚙` button tooltip and the ExtendScript Console.

## Compatibility

Developed for Adobe After Effects 2026 using ExtendScript and ScriptUI.

Version documented here: **1.0.3**.

## Background

Shapojuy is an independent implementation inspired by the general explode/merge workflow popularized by `zl_ExplodeShapeLayers`. It does not include or redistribute that script.
