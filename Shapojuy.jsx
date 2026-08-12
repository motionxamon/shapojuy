#target aftereffects

/*
    Shapojuy 1.0.2
    Shape layer toolbox for After Effects 2026.
    Clean-room rewrite inspired by the workflow of zl_ExplodeShapeLayers.
*/

(function Shapojuy(thisObj) {
    var APP_NAME = "Shapojuy";
    var VERSION = "1.0.2";
    var CMD_COPY = 19;
    var CMD_PASTE = 20;
    var STATUS_BUTTON = null;

    var GEOMETRY = {
        "ADBE Vector Shape - Group": true,
        "ADBE Vector Shape - Rect": true,
        "ADBE Vector Shape - Ellipse": true,
        "ADBE Vector Shape - Star": true
    };
    var PAINT = {
        "ADBE Vector Graphic - Fill": true,
        "ADBE Vector Graphic - G-Fill": true,
        "ADBE Vector Graphic - Stroke": true,
        "ADBE Vector Graphic - G-Stroke": true
    };

    function setStatus(message, isError) {
        var prefix = isError ? "ERROR: " : "";
        try { $.writeln(APP_NAME + " — " + prefix + message); } catch (ignore) {}
        if (STATUS_BUTTON !== null) {
            STATUS_BUTTON.helpTip = "Show/hide Shapojuy settings\n\nLast status: " + prefix + message;
        }
    }

    function activeComp() {
        var item = app.project ? app.project.activeItem : null;
        return item instanceof CompItem ? item : null;
    }

    function deselectAll(comp) {
        var i;
        for (i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
    }

    function contains(array, item) {
        var i;
        for (i = 0; i < array.length; i++) if (array[i] === item) return true;
        return false;
    }

    function pushUniqueNumber(array, value) {
        var i;
        for (i = 0; i < array.length; i++) {
            if (Math.abs(array[i] - value) < 0.000001) return;
        }
        array.push(value);
    }

    function shapeLayersFromSelection(comp) {
        var selected = comp.selectedLayers;
        var result = [];
        var i;
        for (i = 0; i < selected.length; i++) {
            if (selected[i] instanceof ShapeLayer) result.push(selected[i]);
        }
        return result;
    }

    function scanProperty(base, result) {
        var i, child;
        if (GEOMETRY[base.matchName] === true) result.geometry = true;
        if (PAINT[base.matchName] === true) result.paint = true;
        if (base.numProperties !== undefined && base.numProperties > 0) {
            for (i = 1; i <= base.numProperties; i++) {
                child = base.property(i);
                scanProperty(child, result);
                if (result.geometry && result.paint) return;
            }
        }
    }

    function hasGeometry(base) {
        var result = {geometry: false, paint: false};
        scanProperty(base, result);
        return result.geometry;
    }

    function renderState(layer) {
        var result = {geometry: false, paint: false};
        var rect;
        scanProperty(layer.property("ADBE Root Vectors Group"), result);
        if (!(result.geometry && result.paint)) return result;
        try {
            rect = layer.sourceRectAtTime(layer.containingComp.time, true);
            result.bounds = Math.abs(rect.width) > 0.001 || Math.abs(rect.height) > 0.001;
        } catch (ignore) {
            result.bounds = true;
        }
        return result;
    }

    function cleanName(value, fallback, index) {
        var name = value || "";
        name = name.replace(/^\s+|\s+$/g, "");
        name = name.replace(/^(Group|Shape|Path)\s*\d*$/i, "");
        name = name.replace(/\s+/g, " ");
        if (name === "") name = fallback + " " + index;
        return name;
    }

    function uniqueLayerName(comp, requested, exceptLayer) {
        var candidate = requested;
        var suffix = 2;
        var i, collision;
        while (true) {
            collision = false;
            for (i = 1; i <= comp.numLayers; i++) {
                if (comp.layer(i) !== exceptLayer && comp.layer(i).name === candidate) {
                    collision = true;
                    break;
                }
            }
            if (!collision) return candidate;
            candidate = requested + " " + suffix;
            suffix++;
        }
    }

    function outputSuffix(value) {
        var suffix = value || "";
        suffix = suffix.replace(/^\s+|\s+$/g, "");
        if (suffix === "") return "";
        if (/^[._-]/.test(suffix)) return suffix;
        return " " + suffix;
    }

    function mergedLayerName(layers, normalizeNames, suffix) {
        var names = [];
        var i, name;
        for (i = 0; i < layers.length; i++) {
            name = normalizeNames ? cleanName(layers[i].name, "Shape", i + 1) : layers[i].name;
            names.push(name);
        }
        name = names.join(" + ");
        if (name.length > 180) name = name.substring(0, 177) + "...";
        return name + outputSuffix(suffix);
    }

    function applySourceAction(layers, action) {
        var i;
        if (action === "Keep") return;
        for (i = layers.length - 1; i >= 0; i--) {
            if (action === "Delete") layers[i].remove();
            else {
                layers[i].enabled = false;
                if (action === "Archive") {
                    layers[i].shy = true;
                    try { layers[i].comment = "Shapojuy archived source"; } catch (ignore) {}
                }
            }
        }
    }

    function centerAnchor(layer, mode) {
        var comp = layer.containingComp;
        var transform = layer.property("ADBE Transform Group");
        var anchor = transform.property("ADBE Anchor Point");
        var position = transform.property("ADBE Position");
        var oldAnchor = anchor.value;
        var newAnchor;
        var oldPoint;
        var newPoint;
        var coordinateTarget;

        if (mode === "Keep") return;
        if (layer.threeDLayer) return;
        if (anchor.numKeys > 0 || position.numKeys > 0 || position.dimensionsSeparated) return;

        if (mode === "Comp") newAnchor = compPointInLayer(layer, [comp.width / 2, comp.height / 2], comp.time);
        else {
            var rect = layer.sourceRectAtTime(comp.time, true);
            newAnchor = [rect.left + rect.width / 2, rect.top + rect.height / 2];
        }

        // Measure the anchor delta in the coordinate system used by Position.
        coordinateTarget = layer.parent === null ? null : layer.parent;
        oldPoint = mapPoint(layer, coordinateTarget, oldAnchor, comp.time);
        newPoint = mapPoint(layer, coordinateTarget, newAnchor, comp.time);
        anchor.setValue(newAnchor);
        position.setValue([
            position.value[0] + newPoint[0] - oldPoint[0],
            position.value[1] + newPoint[1] - oldPoint[1]
        ]);
    }

    function propertyTopCandidates(layer, selectedOnly) {
        var root = layer.property("ADBE Root Vectors Group");
        var result = [];
        var i, child;
        for (i = 1; i <= root.numProperties; i++) {
            child = root.property(i);
            if (hasGeometry(child) && (!selectedOnly || child.selected)) {
                result.push({index: child.propertyIndex, name: child.name});
            }
        }
        return result;
    }

    function isolateTopCandidate(layer, candidate) {
        var root = layer.property("ADBE Root Vectors Group");
        var i, child;
        for (i = root.numProperties; i >= 1; i--) {
            child = root.property(i);
            if (child.propertyIndex !== candidate.index && hasGeometry(child)) child.remove();
        }
    }

    function explodeOne(layer, options, stats) {
        var comp = layer.containingComp;
        var candidates = propertyTopCandidates(layer, options.selectedGroupsOnly);
        var created = [];
        var i, duplicate, state, baseName;

        stats.inputLayers++;
        if (candidates.length === 0) {
            stats.skippedLayers++;
            return created;
        }

        for (i = 0; i < candidates.length; i++) {
            duplicate = layer.duplicate();
            isolateTopCandidate(duplicate, candidates[i]);
            state = renderState(duplicate);
            if (!state.geometry || (!options.keepControlPaths && (!state.paint || !state.bounds))) {
                duplicate.remove();
                stats.emptyRemoved++;
                continue;
            }
            baseName = options.normalizeNames ?
                cleanName(candidates[i].name, cleanName(layer.name, "Shape", i + 1), i + 1) :
                layer.name + " - " + candidates[i].name;
            baseName += outputSuffix(options.outputSuffix);
            duplicate.name = uniqueLayerName(comp, baseName, duplicate);
            centerAnchor(duplicate, options.anchorMode);
            created.push(duplicate);
            stats.created++;
        }

        if (created.length > 0) applySourceAction([layer], options.sourceAction);
        return created;
    }

    function explodeSelected(options, showReport) {
        var comp = activeComp();
        var layers, created = [];
        var stats = {inputLayers: 0, created: 0, emptyRemoved: 0, skippedLayers: 0};
        var i, result;
        if (!comp) throw new Error("Open a composition.");
        layers = shapeLayersFromSelection(comp);
        if (layers.length === 0) throw new Error("Select one or more Shape Layers.");
        for (i = 0; i < layers.length; i++) {
            result = explodeOne(layers[i], options, stats);
            created = created.concat(result);
        }
        deselectAll(comp);
        for (i = 0; i < created.length; i++) created[i].selected = true;
        if (showReport !== false) setStatus(
            "Exploded layers: " + stats.inputLayers +
            "\nCreated Shape Layers: " + stats.created +
            "\nEmpty items removed: " + stats.emptyRemoved +
            "\nSkipped layers: " + stats.skippedLayers
        );
        return {layers: created, stats: stats};
    }

    function removeEmptyGroups(group, stats, preserveControlPaths) {
        var i, child, state;
        for (i = group.numProperties; i >= 1; i--) {
            child = group.property(i);
            if (child.matchName === "ADBE Vector Group") {
                removeEmptyGroups(child.property("ADBE Vectors Group"), stats, preserveControlPaths);
                state = {geometry: false, paint: false};
                scanProperty(child, state);
                if (!state.geometry) {
                    child.remove();
                    stats.groups++;
                }
            }
        }
    }

    function normalizeGroupNames(group, fallback, stats) {
        var i, child, newName;
        for (i = 1; i <= group.numProperties; i++) {
            child = group.property(i);
            if (child.matchName === "ADBE Vector Group") {
                newName = cleanName(child.name, fallback, i);
                if (newName !== child.name) {
                    child.name = newName;
                    stats.renamed++;
                }
                normalizeGroupNames(child.property("ADBE Vectors Group"), newName, stats);
            }
        }
    }

    function cleanSelected(options) {
        var comp = activeComp();
        var layers, i, state;
        var stats = {layers: 0, groups: 0, emptyLayers: 0, renamed: 0};
        if (!comp) throw new Error("Open a composition.");
        layers = shapeLayersFromSelection(comp);
        if (layers.length === 0) throw new Error("Select one or more Shape Layers.");
        for (i = 0; i < layers.length; i++) {
            stats.layers++;
            removeEmptyGroups(
                layers[i].property("ADBE Root Vectors Group"),
                stats,
                options.keepControlPaths
            );
            if (options.normalizeNames) {
                normalizeGroupNames(
                    layers[i].property("ADBE Root Vectors Group"),
                    cleanName(layers[i].name, "Shape", i + 1),
                    stats
                );
            }
            state = renderState(layers[i]);
            if (!state.geometry || (!options.keepControlPaths && (!state.paint || !state.bounds))) {
                stats.emptyLayers++;
                applySourceAction([layers[i]], options.sourceAction);
            } else if (options.normalizeNames) {
                var newName = cleanName(layers[i].name, "Shape", i + 1);
                if (newName !== layers[i].name) {
                    layers[i].name = uniqueLayerName(comp, newName, layers[i]);
                    stats.renamed++;
                }
            }
        }
        setStatus(
            "Checked Shape Layers: " + stats.layers +
            "\nEmpty groups removed: " + stats.groups +
            "\nEmpty layers found: " + stats.emptyLayers +
            "\nLayers/groups renamed: " + stats.renamed
        );
    }

    function isVectorFootage(layer) {
        var name, ext;
        if (!(layer instanceof AVLayer) || layer.nullLayer ||
            !(layer.source instanceof FootageItem) || layer.source.file === null) return false;
        name = layer.source.file.name.toLowerCase();
        ext = name.substring(name.lastIndexOf(".") + 1);
        return ext === "ai" || ext === "eps" || ext === "epsf" || ext === "pdf" || ext === "svg";
    }

    function convertSelectedVectors(showReport, sourceAction) {
        var comp = activeComp();
        var selected, vectors = [], created = [];
        var convertedSources = [];
        var commandId, i, j, before, candidate, locked;
        var skipped = 0, failed = 0;
        if (!comp) throw new Error("Open a composition.");
        selected = comp.selectedLayers;
        for (i = 0; i < selected.length; i++) {
            if (isVectorFootage(selected[i])) vectors.push(selected[i]);
            else skipped++;
        }
        if (vectors.length === 0) throw new Error("Select AI, EPS, PDF or SVG footage layers.");
        commandId = app.findMenuCommandId("Create Shapes from Vector Layer");
        if (commandId === 0) commandId = 3973;

        for (i = 0; i < vectors.length; i++) {
            before = [];
            for (j = 1; j <= comp.numLayers; j++) before.push(comp.layer(j));
            locked = vectors[i].locked;
            try {
                vectors[i].locked = false;
                deselectAll(comp);
                vectors[i].selected = true;
                app.executeCommand(commandId);
                candidate = null;
                for (j = 1; j <= comp.numLayers; j++) {
                    if (comp.layer(j) instanceof ShapeLayer && !contains(before, comp.layer(j))) {
                        candidate = comp.layer(j);
                        break;
                    }
                }
                if (candidate) {
                    created.push(candidate);
                    convertedSources.push(vectors[i]);
                }
                else failed++;
            } catch (ignore) {
                failed++;
            } finally {
                vectors[i].locked = locked;
            }
        }
        sourceAction = sourceAction || "Disable";
        if (sourceAction === "Keep") {
            for (i = 0; i < convertedSources.length; i++) convertedSources[i].enabled = true;
        } else if (sourceAction === "Delete" || sourceAction === "Archive") {
            applySourceAction(convertedSources, sourceAction);
        }
        deselectAll(comp);
        for (i = 0; i < created.length; i++) created[i].selected = true;
        if (showReport !== false) setStatus(
            "Converted: " + created.length +
            "\nSkipped: " + skipped +
            "\nFailed: " + failed
        );
        return {layers: created, sources: convertedSources, skipped: skipped, failed: failed};
    }

    function vectorToExplode(options) {
        var comp = activeComp();
        var originalAction = options.sourceAction;
        var converted;
        if (!comp) throw new Error("Open a composition.");
        converted = convertSelectedVectors(false, originalAction);
        if (converted.layers.length === 0) throw new Error("No vector layers were converted.");
        deselectAll(comp);
        var selectedIndex;
        for (selectedIndex = 0; selectedIndex < converted.layers.length; selectedIndex++)
            converted.layers[selectedIndex].selected = true;
        explodeSelected(options, true);
    }

    function mapPoint(sourceLayer, targetLayer, point, time) {
        var host = sourceLayer;
        var effects = host.property("ADBE Effect Parade");
        var control;
        var prop;
        var comp = sourceLayer.containingComp;
        var oldTime = comp.time;
        var wasLocked = sourceLayer.locked;
        var expression, value;
        try {
            sourceLayer.locked = false;
            control = effects.addProperty("ADBE Point Control");
            prop = control.property("ADBE Point Control-0001");
            if (targetLayer) {
                expression = "var s=thisComp.layer(" + sourceLayer.index + ");" +
                    "var d=thisComp.layer(" + targetLayer.index + ");" +
                    "var p=d.fromWorld(s.toWorld([" + point[0] + "," + point[1] + ",0]));[p[0],p[1]];";
            } else {
                expression = "var s=thisComp.layer(" + sourceLayer.index + ");" +
                    "var p=s.toComp([" + point[0] + "," + point[1] + ",0]);[p[0],p[1]];";
            }
            prop.expression = expression;
            comp.time = time;
            value = prop.value;
            if (prop.expressionError !== "") throw new Error(prop.expressionError);
        } finally {
            comp.time = oldTime;
            if (control) control.remove();
            sourceLayer.locked = wasLocked;
        }
        return [value[0], value[1]];
    }

    function compPointInLayer(layer, point, time) {
        var effects = layer.property("ADBE Effect Parade");
        var wasLocked = layer.locked;
        var control;
        var prop;
        var comp = layer.containingComp;
        var oldTime = comp.time;
        var value;
        try {
            layer.locked = false;
            control = effects.addProperty("ADBE Point Control");
            prop = control.property("ADBE Point Control-0001");
            prop.expression = "var p=fromComp([" + point[0] + "," + point[1] + "]);[p[0],p[1]];";
            comp.time = time;
            value = prop.value;
            if (prop.expressionError !== "") throw new Error(prop.expressionError);
        } finally {
            comp.time = oldTime;
            if (control) control.remove();
            layer.locked = wasLocked;
        }
        return [value[0], value[1]];
    }

    function relativeTransformAtTime(source, target, time) {
        var p0 = mapPoint(source, target, [0, 0], time);
        var px = mapPoint(source, target, [100, 0], time);
        var py = mapPoint(source, target, [0, 100], time);
        var a = (px[0] - p0[0]) / 100;
        var b = (px[1] - p0[1]) / 100;
        var c = (py[0] - p0[0]) / 100;
        var d = (py[1] - p0[1]) / 100;
        var sx = Math.sqrt(a * a + b * b);
        var determinant, sy, rotation, skew;
        if (sx < 0.0000001) throw new Error("Zero X scale: " + source.name);
        determinant = a * d - b * c;
        sy = determinant / sx;
        rotation = Math.atan2(b, a) * 180 / Math.PI;
        skew = Math.abs(sy) < 0.0000001 ? 0 :
            Math.atan((a * c + b * d) / (sx * sy)) * 180 / Math.PI;
        return {position: p0, scale: [sx * 100, sy * 100], rotation: rotation, skew: skew};
    }

    function collectTransformTimes(layer, times) {
        var current = layer;
        var matchNames = ["ADBE Anchor Point", "ADBE Position", "ADBE Scale", "ADBE Rotate Z", "ADBE Opacity"];
        var i, k, prop, transform;
        while (current !== null) {
            transform = current.property("ADBE Transform Group");
            for (i = 0; i < matchNames.length; i++) {
                prop = transform.property(matchNames[i]);
                if (prop) for (k = 1; k <= prop.numKeys; k++) pushUniqueNumber(times, prop.keyTime(k));
            }
            prop = transform.property("ADBE Position");
            if (prop && prop.dimensionsSeparated) {
                var dimension;
                var follower;
                for (dimension = 0; dimension < 2; dimension++) {
                    follower = prop.getSeparationFollower(dimension);
                    for (k = 1; k <= follower.numKeys; k++) pushUniqueNumber(times, follower.keyTime(k));
                }
            }
            current = current.parent;
        }
    }

    function applyGroupTransform(group, data, opacity, time, keyed) {
        var transform = group.property("ADBE Vector Transform Group");
        var position = transform.property("ADBE Vector Position");
        var scale = transform.property("ADBE Vector Scale");
        var rotation = transform.property("ADBE Vector Rotation");
        var skew = transform.property("ADBE Vector Skew");
        var opacityProp = transform.property("ADBE Vector Group Opacity");
        transform.property("ADBE Vector Anchor").setValue([0, 0]);
        transform.property("ADBE Vector Skew Axis").setValue(0);
        if (keyed) {
            position.setValueAtTime(time, data.position);
            scale.setValueAtTime(time, data.scale);
            rotation.setValueAtTime(time, data.rotation);
            skew.setValueAtTime(time, data.skew);
            opacityProp.setValueAtTime(time, opacity);
        } else {
            position.setValue(data.position);
            scale.setValue(data.scale);
            rotation.setValue(data.rotation);
            skew.setValue(data.skew);
            opacityProp.setValue(opacity);
        }
    }

    function copyContents(source, target, wrapper) {
        var comp = source.containingComp;
        var root = source.property("ADBE Root Vectors Group");
        var destination = wrapper.property("ADBE Vectors Group");
        var locked = source.locked;
        var i;
        if (root.numProperties === 0) return;
        try {
            source.locked = false;
            deselectAll(comp);
            source.selected = true;
            for (i = 1; i <= root.numProperties; i++) root.property(i).selected = true;
            app.executeCommand(CMD_COPY);
            source.selected = false;
            target.selected = true;
            destination.selected = true;
            app.executeCommand(CMD_PASTE);
        } finally {
            target.selected = false;
            source.locked = locked;
        }
    }

    function copyLayerAppearance(source, target) {
        try { target.label = source.label; } catch (ignore1) {}
        try { target.blendingMode = source.blendingMode; } catch (ignore2) {}
        try { target.motionBlur = source.motionBlur; } catch (ignore3) {}
        try { target.shy = source.shy; } catch (ignore4) {}
        try { target.quality = source.quality; } catch (ignore5) {}
        try { target.collapseTransformation = source.collapseTransformation; } catch (ignore6) {}
        try { target.comment = source.comment; } catch (ignore7) {}
    }

    function configureMergeTarget(target, first, commonParent, mode) {
        var targetTransform = target.property("ADBE Transform Group");
        var firstTransform = first.property("ADBE Transform Group");
        var props = ["ADBE Anchor Point", "ADBE Position", "ADBE Scale", "ADBE Rotate Z"];
        var i;
        target.threeDLayer = false;
        if (mode === "First Layer") {
            target.parent = first.parent;
            for (i = 0; i < props.length; i++) {
                targetTransform.property(props[i]).setValue(firstTransform.property(props[i]).value);
            }
        } else {
            target.parent = mode === "Common Parent" ? commonParent : null;
            targetTransform.property("ADBE Anchor Point").setValue([0, 0]);
            targetTransform.property("ADBE Position").setValue([0, 0]);
            targetTransform.property("ADBE Scale").setValue([100, 100]);
            targetTransform.property("ADBE Rotate Z").setValue(0);
        }
        targetTransform.property("ADBE Opacity").setValue(100);
    }

    function mergeSelected(options) {
        var comp = activeComp();
        var layers, ordered, first, commonParent, i, target, root, wrapper;
        var times, t, data, opacity, topLayer;
        if (!comp) throw new Error("Open a composition.");
        layers = shapeLayersFromSelection(comp);
        if (layers.length < 2) throw new Error("Select at least two Shape Layers.");
        for (i = 0; i < layers.length; i++) {
            if (layers[i].threeDLayer) throw new Error("3D Shape Layers are not supported by Merge.");
            var ancestor = layers[i].parent;
            while (ancestor !== null) {
                if (ancestor.threeDLayer) throw new Error("3D parents are not supported by Merge: " + layers[i].name);
                ancestor = ancestor.parent;
            }
        }
        ordered = layers.slice(0);
        ordered.sort(function (a, b) { return a.index - b.index; });
        first = ordered[0];
        commonParent = first.parent;
        for (i = 1; i < ordered.length; i++) {
            if (ordered[i].parent !== commonParent) commonParent = null;
        }
        topLayer = ordered[0];
        target = comp.layers.addShape();
        target.name = uniqueLayerName(
            comp,
            mergedLayerName(ordered, options.normalizeNames, options.outputSuffix),
            target
        );
        target.moveBefore(topLayer);
        configureMergeTarget(target, first, commonParent, options.mergeMode);
        copyLayerAppearance(first, target);
        target.inPoint = ordered[ordered.length - 1].inPoint;
        target.outPoint = ordered[0].outPoint;
        for (i = 0; i < ordered.length; i++) {
            if (ordered[i].inPoint < target.inPoint) target.inPoint = ordered[i].inPoint;
            if (ordered[i].outPoint > target.outPoint) target.outPoint = ordered[i].outPoint;
        }

        root = target.property("ADBE Root Vectors Group");
        try {
            for (i = 0; i < ordered.length; i++) {
                wrapper = root.addProperty("ADBE Vector Group");
                wrapper.name = options.normalizeNames ? cleanName(ordered[i].name, "Shape", i + 1) : ordered[i].name;
                copyContents(ordered[i], target, wrapper);
                times = [comp.time];
                if (options.animationMode === "Key Times") collectTransformTimes(ordered[i], times);
                else if (options.animationMode === "Every Frame") {
                    var frameTime;
                    times = [];
                    for (frameTime = ordered[i].inPoint;
                         frameTime <= ordered[i].outPoint + comp.frameDuration * 0.25;
                         frameTime += comp.frameDuration) {
                        pushUniqueNumber(times, frameTime);
                    }
                }
                times.sort(function (a, b) { return a - b; });
                for (t = 0; t < times.length; t++) {
                    data = relativeTransformAtTime(ordered[i], target, times[t]);
                    opacity = ordered[i].property("ADBE Transform Group")
                        .property("ADBE Opacity").valueAtTime(times[t], false);
                    applyGroupTransform(wrapper, data, opacity, times[t], options.animationMode !== "Off" && times.length > 1);
                }
            }
        } catch (error) {
            target.remove();
            throw error;
        }
        applySourceAction(layers, options.sourceAction);
        deselectAll(comp);
        target.selected = true;
        setStatus(
            "Merged Shape Layers: " + layers.length +
            "\nGroups created: " + ordered.length +
            (options.animationMode !== "Off" ? "\nAnimation sampling: " + options.animationMode : "")
        );
    }

    function withUndo(label, callback) {
        app.beginUndoGroup(APP_NAME + " - " + label);
        try { callback(); }
        catch (error) { setStatus(label + " failed: " + error.toString(), true); }
        finally { app.endUndoGroup(); }
    }

    function buildUI(host) {
        var win = host instanceof Panel ? host : new Window("palette", APP_NAME + " " + VERSION, undefined, {resizeable: true});
        var settings = {
            selectedGroupsOnly: false,
            keepControlPaths: true,
            normalizeNames: true,
            animationMode: "Key Times",
            outputSuffix: "",
            sourceAction: "Disable",
            anchorMode: "Keep",
            mergeMode: "Comp Space"
        };
        var toolbar, optionsPanel, line, sourceDrop, anchorDrop, mergeDrop, animationDrop, suffixInput;

        win.orientation = "column";
        win.alignChildren = ["left", "top"];
        win.spacing = 3;
        win.margins = 4;

        toolbar = win.add("group");
        toolbar.orientation = "row";
        toolbar.alignChildren = ["left", "center"];
        toolbar.spacing = 2;

        var convertButton = toolbar.add("button", undefined, "V→S");
        var vectorExplodeButton = toolbar.add("button", undefined, "V→X");
        var explodeButton = toolbar.add("button", undefined, "X");
        var mergeButton = toolbar.add("button", undefined, "M");
        var cleanButton = toolbar.add("button", undefined, "C");
        var optionsButton = toolbar.add("button", undefined, "\u2699");
        STATUS_BUTTON = optionsButton;

        convertButton.preferredSize = [42, 24];
        vectorExplodeButton.preferredSize = [42, 24];
        explodeButton.preferredSize = [30, 24];
        mergeButton.preferredSize = [30, 24];
        cleanButton.preferredSize = [30, 24];
        optionsButton.preferredSize = [30, 24];

        convertButton.helpTip = "Vector footage → Shape Layers";
        vectorExplodeButton.helpTip = "Vector footage → convert and Explode";
        explodeButton.helpTip = "Explode selected Shape Layers";
        mergeButton.helpTip = "Merge selected Shape Layers";
        cleanButton.helpTip = "Clean empty Illustrator groups";
        optionsButton.helpTip = "Show/hide Shapojuy settings";

        optionsPanel = win.add("panel", undefined, "Chewing options");
        optionsPanel.orientation = "column";
        optionsPanel.alignChildren = ["fill", "top"];
        optionsPanel.margins = 10;
        optionsPanel.visible = false;

        line = optionsPanel.add("group");
        line.add("statictext", undefined, "Source:");
        sourceDrop = line.add("dropdownlist", undefined, ["Keep", "Disable", "Archive", "Delete"]);
        sourceDrop.selection = 1;
        line.add("statictext", undefined, "Anchor:");
        anchorDrop = line.add("dropdownlist", undefined, ["Keep", "Visual Center", "Comp"]);
        anchorDrop.selection = 0;

        line = optionsPanel.add("group");
        line.add("statictext", undefined, "Merge coordinates:");
        mergeDrop = line.add("dropdownlist", undefined, ["Comp Space", "Common Parent", "First Layer"]);
        mergeDrop.selection = 0;

        line = optionsPanel.add("group");
        line.add("statictext", undefined, "Merge animation:");
        animationDrop = line.add("dropdownlist", undefined, ["Off", "Key Times", "Every Frame"]);
        animationDrop.selection = 1;

        line = optionsPanel.add("group");
        line.add("statictext", undefined, "Output suffix:");
        suffixInput = line.add("edittext", undefined, "");
        suffixInput.characters = 20;
        suffixInput.helpTip = "Optional suffix for newly created Shape Layer names, for example _v2 or outline";

        var selectedOnly = optionsPanel.add("checkbox", undefined, "Explode selected top-level groups only");
        var keepPaths = optionsPanel.add("checkbox", undefined, "Keep control Paths without Fill/Stroke");
        keepPaths.value = true;
        var normalizeNames = optionsPanel.add("checkbox", undefined, "Normalize names and avoid duplicates");
        normalizeNames.value = true;

        function syncSettings() {
            settings.sourceAction = sourceDrop.selection.text;
            settings.anchorMode = anchorDrop.selection.text;
            settings.mergeMode = mergeDrop.selection.text;
            settings.animationMode = animationDrop.selection.text;
            settings.outputSuffix = suffixInput.text;
            settings.selectedGroupsOnly = selectedOnly.value;
            settings.keepControlPaths = keepPaths.value;
            settings.normalizeNames = normalizeNames.value;
            return settings;
        }

        convertButton.onClick = function () {
            withUndo("Vector to Shapes", function () { convertSelectedVectors(true, syncSettings().sourceAction); });
        };
        vectorExplodeButton.onClick = function () {
            withUndo("Vector to Explode", function () { vectorToExplode(syncSettings()); });
        };
        explodeButton.onClick = function () {
            withUndo("Explode", function () { explodeSelected(syncSettings(), true); });
        };
        mergeButton.onClick = function () {
            withUndo("Merge", function () { mergeSelected(syncSettings()); });
        };
        cleanButton.onClick = function () {
            withUndo("Clean", function () { cleanSelected(syncSettings()); });
        };
        optionsButton.onClick = function () {
            optionsPanel.visible = !optionsPanel.visible;
            optionsButton.text = optionsPanel.visible ? "\u25B2" : "\u2699";
            win.alignChildren = optionsPanel.visible ? ["fill", "top"] : ["left", "top"];
            win.layout.layout(true);
            if (win instanceof Window) win.pack();
            else win.layout.resize();
        };

        win.onResizing = win.onResize = function () { this.layout.resize(); };
        if (win instanceof Window) {
            win.pack();
            win.center();
            win.show();
        } else {
            win.layout.layout(true);
        }
        return win;
    }

    buildUI(thisObj);
}(this));
