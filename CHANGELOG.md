# Changelog

## 1.0.5 — 2026-08-12

- Restore reliable clipboard-based transfer of complete Shape Layer Contents during Merge.
- Reacquire pasted vector groups by property index before applying transforms, avoiding invalid After Effects property references.
- Preserve visual placement through full parent and Null coordinate chains.
- Set source handling to `Delete` and anchor handling to `Visual Center` by default.
- Add optional debug alerts and show the loaded script version in settings.
- Keep source/group-based naming and the optional output suffix.

## 1.0.3 — 2026-08-12

- Fix incorrect Merge placement for ordinary 2D Shape Layers and layers sharing a Null parent.
- Transfer Anchor, Position, Scale, Rotation, and Opacity directly when sources share the same parent coordinate system.
- Make `Common Parent` the default Merge coordinate mode.
- Keep affine matrix conversion only for mixed parent-coordinate workflows.

## 1.0.2 — 2026-08-12

- Stop naming merged layers `Shapojuy Merge`.
- Build merged-layer names from the selected source Shape Layer names.
- Preserve original internal group names during Merge.
- Add an optional `Output suffix` field for newly created Shape Layer names.
- Keep the suffix empty by default so Explode uses group names and Merge uses source-layer names.

## 1.0.0 — 2026-08-12

- Initial public release.
- Compact dockable ScriptUI interface.
- Vector to Shapes and Vector to Explode workflows.
- Multi-layer Explode with empty Illustrator-group filtering.
- Merge with Comp Space, Common Parent, and First Layer coordinate modes.
- Key-time and every-frame transform-animation sampling.
- Clean operation, source handling, anchor options, and name normalization.
- Immediate one-click operation without modal alerts or confirmation dialogs.
- Russian and English documentation.
