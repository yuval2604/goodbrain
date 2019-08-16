"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var fs_extra_1 = __importDefault(require("fs-extra"));
var path_1 = require("path");
var assertNever_1 = require("../assertNever");
exports.executeEffects = function (effects, _a) {
    var dryRun = _a.dryRun;
    effects.forEach(function (eff) {
        switch (eff.type) {
            case "file deletion":
                if (dryRun) {
                    if (!fs_extra_1.default.existsSync(eff.path)) {
                        throw new Error("Trying to delete file that doesn't exist: " + eff.path);
                    }
                }
                else {
                    // TODO: integrity checks
                    fs_extra_1.default.unlinkSync(eff.path);
                }
                break;
            case "rename":
                if (dryRun) {
                    // TODO: see what patch files look like if moving to exising path
                    if (!fs_extra_1.default.existsSync(eff.fromPath)) {
                        throw new Error("Trying to move file that doesn't exist: " + eff.fromPath);
                    }
                }
                else {
                    fs_extra_1.default.moveSync(eff.fromPath, eff.toPath);
                }
                break;
            case "file creation":
                if (dryRun) {
                    if (fs_extra_1.default.existsSync(eff.path)) {
                        throw new Error("Trying to create file that already exists: " + eff.path);
                    }
                    // todo: check file contents matches
                }
                else {
                    var fileContents = eff.hunk
                        ? eff.hunk.parts[0].lines.join("\n") +
                            (eff.hunk.parts[0].noNewlineAtEndOfFile ? "" : "\n")
                        : "";
                    fs_extra_1.default.ensureDirSync(path_1.dirname(eff.path));
                    fs_extra_1.default.writeFileSync(eff.path, fileContents, { mode: eff.mode });
                }
                break;
            case "patch":
                applyPatch(eff, { dryRun: dryRun });
                break;
            case "mode change":
                var currentMode = fs_extra_1.default.statSync(eff.path).mode;
                if ((isExecutable(eff.newMode) && isExecutable(currentMode)) ||
                    (!isExecutable(eff.newMode) && !isExecutable(currentMode))) {
                    throw new Error("Mode change is not required");
                }
                fs_extra_1.default.chmodSync(eff.path, eff.newMode);
                break;
            default:
                assertNever_1.assertNever(eff);
        }
    });
};
function isExecutable(fileMode) {
    // tslint:disable-next-line:no-bitwise
    return (fileMode & 64) > 0;
}
var trimRight = function (s) { return s.replace(/\s+$/, ""); };
function linesAreEqual(a, b) {
    return trimRight(a) === trimRight(b);
}
/**
 * How does noNewLineAtEndOfFile work?
 *
 * if you remove the newline from a file that had one without editing other bits:
 *
 *    it creates an insertion/removal pair where the insertion has \ No new line at end of file
 *
 * if you edit a file that didn't have a new line and don't add one:
 *
 *    both insertion and deletion have \ No new line at end of file
 *
 * if you edit a file that didn't have a new line and add one:
 *
 *    deletion has \ No new line at end of file
 *    but not insertion
 *
 * if you edit a file that had a new line and leave it in:
 *
 *    neither insetion nor deletion have the annoation
 *
 */
function applyPatch(_a, _b) {
    var hunks = _a.hunks, path = _a.path;
    var dryRun = _b.dryRun;
    // modifying the file in place
    var fileContents = fs_extra_1.default.readFileSync(path).toString();
    var mode = fs_extra_1.default.statSync(path).mode;
    var fileLines = fileContents.split(/\n/);
    var result = [];
    for (var _i = 0, hunks_1 = hunks; _i < hunks_1.length; _i++) {
        var hunk = hunks_1[_i];
        var fuzzingOffset = 0;
        while (true) {
            var modifications = evaluateHunk(hunk, fileLines, fuzzingOffset);
            if (modifications) {
                result.push(modifications);
                break;
            }
            fuzzingOffset =
                fuzzingOffset < 0 ? fuzzingOffset * -1 : fuzzingOffset * -1 - 1;
            if (Math.abs(fuzzingOffset) > 20) {
                throw new Error("Cant apply hunk " + hunks.indexOf(hunk) + " for file " + path);
            }
        }
    }
    if (dryRun) {
        return;
    }
    var diffOffset = 0;
    for (var _c = 0, result_1 = result; _c < result_1.length; _c++) {
        var modifications = result_1[_c];
        for (var _d = 0, modifications_1 = modifications; _d < modifications_1.length; _d++) {
            var modification = modifications_1[_d];
            switch (modification.type) {
                case "splice":
                    fileLines.splice.apply(fileLines, [modification.index + diffOffset,
                        modification.numToDelete].concat(modification.linesToInsert));
                    diffOffset +=
                        modification.linesToInsert.length - modification.numToDelete;
                    break;
                case "pop":
                    fileLines.pop();
                    break;
                case "push":
                    fileLines.push(modification.line);
                    break;
                default:
                    assertNever_1.assertNever(modification);
            }
        }
    }
    fs_extra_1.default.writeFileSync(path, fileLines.join("\n"), { mode: mode });
}
function evaluateHunk(hunk, fileLines, fuzzingOffset) {
    var result = [];
    var contextIndex = hunk.header.original.start - 1 + fuzzingOffset;
    // do bounds checks for index
    if (contextIndex < 0) {
        return null;
    }
    if (fileLines.length - contextIndex < hunk.header.original.length) {
        return null;
    }
    for (var _i = 0, _a = hunk.parts; _i < _a.length; _i++) {
        var part = _a[_i];
        switch (part.type) {
            case "deletion":
            case "context":
                for (var _b = 0, _c = part.lines; _b < _c.length; _b++) {
                    var line = _c[_b];
                    var originalLine = fileLines[contextIndex];
                    if (!linesAreEqual(originalLine, line)) {
                        return null;
                    }
                    contextIndex++;
                }
                if (part.type === "deletion") {
                    result.push({
                        type: "splice",
                        index: contextIndex - part.lines.length,
                        numToDelete: part.lines.length,
                        linesToInsert: [],
                    });
                    if (part.noNewlineAtEndOfFile) {
                        result.push({
                            type: "push",
                            line: "",
                        });
                    }
                }
                break;
            case "insertion":
                result.push({
                    type: "splice",
                    index: contextIndex,
                    numToDelete: 0,
                    linesToInsert: part.lines,
                });
                if (part.noNewlineAtEndOfFile) {
                    result.push({ type: "pop" });
                }
                break;
            default:
                assertNever_1.assertNever(part.type);
        }
    }
    return result;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwbHkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvcGF0Y2gvYXBwbHkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxzREFBeUI7QUFDekIsNkJBQThCO0FBRTlCLDhDQUE0QztBQUUvQixRQUFBLGNBQWMsR0FBRyxVQUM1QixPQUF3QixFQUN4QixFQUErQjtRQUE3QixrQkFBTTtJQUVSLE9BQU8sQ0FBQyxPQUFPLENBQUMsVUFBQSxHQUFHO1FBQ2pCLFFBQVEsR0FBRyxDQUFDLElBQUksRUFBRTtZQUNoQixLQUFLLGVBQWU7Z0JBQ2xCLElBQUksTUFBTSxFQUFFO29CQUNWLElBQUksQ0FBQyxrQkFBRSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUU7d0JBQzVCLE1BQU0sSUFBSSxLQUFLLENBQ2IsNENBQTRDLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FDeEQsQ0FBQTtxQkFDRjtpQkFDRjtxQkFBTTtvQkFDTCx5QkFBeUI7b0JBQ3pCLGtCQUFFLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQTtpQkFDeEI7Z0JBQ0QsTUFBSztZQUNQLEtBQUssUUFBUTtnQkFDWCxJQUFJLE1BQU0sRUFBRTtvQkFDVixpRUFBaUU7b0JBQ2pFLElBQUksQ0FBQyxrQkFBRSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLEVBQUU7d0JBQ2hDLE1BQU0sSUFBSSxLQUFLLENBQ2IsMENBQTBDLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FDMUQsQ0FBQTtxQkFDRjtpQkFDRjtxQkFBTTtvQkFDTCxrQkFBRSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQTtpQkFDdEM7Z0JBQ0QsTUFBSztZQUNQLEtBQUssZUFBZTtnQkFDbEIsSUFBSSxNQUFNLEVBQUU7b0JBQ1YsSUFBSSxrQkFBRSxDQUFDLFVBQVUsQ0FBQyxHQUFH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LE1BQU0sQ0FBQTtBQUNmLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgZnMgZnJvbSBcImZzLWV4dHJhXCJcbmltcG9ydCB7IGRpcm5hbWUgfSBmcm9tIFwicGF0aFwiXG5pbXBvcnQgeyBQYXJzZWRQYXRjaEZpbGUsIEZpbGVQYXRjaCwgSHVuayB9IGZyb20gXCIuL3BhcnNlXCJcbmltcG9ydCB7IGFzc2VydE5ldmVyIH0gZnJvbSBcIi4uL2Fzc2VydE5ldmVyXCJcblxuZXhwb3J0IGNvbnN0IGV4ZWN1dGVFZmZlY3RzID0gKFxuICBlZmZlY3RzOiBQYXJzZWRQYXRjaEZpbGUsXG4gIHsgZHJ5UnVuIH06IHsgZHJ5UnVuOiBib29sZWFuIH0sXG4pID0+IHtcbiAgZWZmZWN0cy5mb3JFYWNoKGVmZiA9PiB7XG4gICAgc3dpdGNoIChlZmYudHlwZSkge1xuICAgICAgY2FzZSBcImZpbGUgZGVsZXRpb25cIjpcbiAgICAgICAgaWYgKGRyeVJ1bikge1xuICAgICAgICAgIGlmICghZnMuZXhpc3RzU3luYyhlZmYucGF0aCkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgXCJUcnlpbmcgdG8gZGVsZXRlIGZpbGUgdGhhdCBkb2Vzbid0IGV4aXN0OiBcIiArIGVmZi5wYXRoLFxuICAgICAgICAgICAgKVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBUT0RPOiBpbnRlZ3JpdHkgY2hlY2tzXG4gICAgICAgICAgZnMudW5saW5rU3luYyhlZmYucGF0aClcbiAgICAgICAgfVxuICAgICAgICBicmVha1xuICAgICAgY2FzZSBcInJlbmFtZVwiOlxuICAgICAgICBpZiAoZHJ5UnVuKSB7XG4gICAgICAgICAgLy8gVE9ETzogc2VlIHdoYXQgcGF0Y2ggZmlsZXMgbG9vayBsaWtlIGlmIG1vdmluZyB0byBleGlzaW5nIHBhdGhcbiAgICAgICAgICBpZiAoIWZzLmV4aXN0c1N5bmMoZWZmLmZyb21QYXRoKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICAgICBcIlRyeWluZyB0byBtb3ZlIGZpbGUgdGhhdCBkb2Vzbid0IGV4aXN0OiBcIiArIGVmZi5mcm9tUGF0aCxcbiAgICAgICAgICAgIClcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZnMubW92ZVN5bmMoZWZmLmZyb21QYXRoLCBlZmYudG9QYXRoKVxuICAgICAgICB9XG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlIFwiZmlsZSBjcmVhdGlvblwiOlxuICAgICAgICBpZiAoZHJ5UnVuKSB7XG4gICAgICAgICAgaWYgKGZzLmV4aXN0c1N5bmMoZWZmLnBhdGgpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgIFwiVHJ5aW5nIHRvIGNyZWF0ZSBmaWxlIHRoYXQgYWxyZWFkeSBleGlzdHM6IFwiICsgZWZmLnBhdGgsXG4gICAgICAgICAgICApXG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIHRvZG86IGNoZWNrIGZpbGUgY29udGVudHMgbWF0Y2hlc1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnN0IGZpbGVDb250ZW50cyA9IGVmZi5odW5rXG4gICAgICAgICAgICA/IGVmZi5odW5rLnBhcnRzWzBdLmxpbmVzLmpvaW4oXCJcXG5cIikgK1xuICAgICAgICAgICAgICAoZWZmLmh1bmsucGFydHNbMF0ubm9OZXdsaW5lQXRFbmRPZkZpbGUgPyBcIlwiIDogXCJcXG5cIilcbiAgICAgICAgICAgIDogXCJcIlxuICAgICAgICAgIGZzLmVuc3VyZURpclN5bmMoZGlybmFtZShlZmYucGF0aCkpXG4gICAgICAgICAgZnMud3JpdGVGaWxlU3luYyhlZmYucGF0aCwgZmlsZUNvbnRlbnRzLCB7IG1vZGU6IGVmZi5tb2RlIH0pXG4gICAgICAgIH1cbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgXCJwYXRjaFwiOlxuICAgICAgICBhcHBseVBhdGNoKGVmZiwgeyBkcnlSdW4gfSlcbiAgICAgICAgYnJlYWtcbiAgICAgIGNhc2UgXCJtb2RlIGNoYW5nZVwiOlxuICAgICAgICBjb25zdCBjdXJyZW50TW9kZSA9IGZzLnN0YXRTeW5jKGVmZi5wYXRoKS5tb2RlXG4gICAgICAgIGlmIChcbiAgICAgICAgICAoaXNFeGVjdXRhYmxlKGVmZi5uZXdNb2RlKSAmJiBpc0V4ZWN1dGFibGUoY3VycmVudE1vZGUpKSB8fFxuICAgICAgICAgICghaXNFeGVjdXRhYmxlKGVmZi5uZXdNb2RlKSAmJiAhaXNFeGVjdXRhYmxlKGN1cnJlbnRNb2RlKSlcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTW9kZSBjaGFuZ2UgaXMgbm90IHJlcXVpcmVkXCIpXG4gICAgICAgIH1cbiAgICAgICAgZnMuY2htb2RTeW5jKGVmZi5wYXRoLCBlZmYubmV3TW9kZSlcbiAgICAgICAgYnJlYWtcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGFzc2VydE5ldmVyKGVmZilcbiAgICB9XG4gIH0pXG59XG5cbmZ1bmN0aW9uIGlzRXhlY3V0YWJsZShmaWxlTW9kZTogbnVtYmVyKSB7XG4gIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZTpuby1iaXR3aXNlXG4gIHJldHVybiAoZmlsZU1vZGUgJiAwYjAwMV8wMDBfMDAwKSA+IDBcbn1cblxuY29uc3QgdHJpbVJpZ2h0ID0gKHM6IHN0cmluZykgPT4gcy5yZXBsYWNlKC9cXHMrJC8sIFwiXCIpXG5mdW5jdGlvbiBsaW5lc0FyZUVxdWFsKGE6IHN0cmluZywgYjogc3RyaW5nKSB7XG4gIHJldHVybiB0cmltUmlnaHQoYSkgPT09IHRyaW1SaWdodChiKVxufVxuXG4vKipcbiAqIEhvdyBkb2VzIG5vTmV3TGluZUF0RW5kT2ZGaWxlIHdvcms/XG4gKlxuICogaWYgeW91IHJlbW92ZSB0aGUgbmV3bGluZSBmcm9tIGEgZmlsZSB0aGF0IGhhZCBvbmUgd2l0aG91dCBlZGl0aW5nIG90aGVyIGJpdHM6XG4gKlxuICogICAgaXQgY3JlYXRlcyBhbiBpbnNlcnRpb24vcmVtb3ZhbCBwYWlyIHdoZXJlIHRoZSBpbnNlcnRpb24gaGFzIFxcIE5vIG5ldyBsaW5lIGF0IGVuZCBvZiBmaWxlXG4gKlxuICogaWYgeW91IGVkaXQgYSBmaWxlIHRoYXQgZGlkbid0IGhhdmUgYSBuZXcgbGluZSBhbmQgZG9uJ3QgYWRkIG9uZTpcbiAqXG4gKiAgICBib3RoIGluc2VydGlvbiBhbmQgZGVsZXRpb24gaGF2ZSBcXCBObyBuZXcgbGluZSBhdCBlbmQgb2YgZmlsZVxuICpcbiAqIGlmIHlvdSBlZGl0IGEgZmlsZSB0aGF0IGRpZG4ndCBoYXZlIGEgbmV3IGxpbmUgYW5kIGFkZCBvbmU6XG4gKlxuICogICAgZGVsZXRpb24gaGFzIFxcIE5vIG5ldyBsaW5lIGF0IGVuZCBvZiBmaWxlXG4gKiAgICBidXQgbm90IGluc2VydGlvblxuICpcbiAqIGlmIHlvdSBlZGl0IGEgZmlsZSB0aGF0IGhhZCBhIG5ldyBsaW5lIGFuZCBsZWF2ZSBpdCBpbjpcbiAqXG4gKiAgICBuZWl0aGVyIGluc2V0aW9uIG5vciBkZWxldGlvbiBoYXZlIHRoZSBhbm5vYXRpb25cbiAqXG4gKi9cblxuZnVuY3Rpb24gYXBwbHlQYXRjaChcbiAgeyBodW5rcywgcGF0aCB9OiBGaWxlUGF0Y2gsXG4gIHsgZHJ5UnVuIH06IHsgZHJ5UnVuOiBib29sZWFuIH0sXG4pOiB2b2lkIHtcbiAgLy8gbW9kaWZ5aW5nIHRoZSBmaWxlIGluIHBsYWNlXG4gIGNvbnN0IGZpbGVDb250ZW50cyA9IGZzLnJlYWRGaWxlU3luYyhwYXRoKS50b1N0cmluZygpXG4gIGNvbnN0IG1vZGUgPSBmcy5zdGF0U3luYyhwYXRoKS5tb2RlXG5cbiAgY29uc3QgZmlsZUxpbmVzOiBzdHJpbmdbXSA9IGZpbGVDb250ZW50cy5zcGxpdCgvXFxuLylcblxuICBjb25zdCByZXN1bHQ6IE1vZGlmaWNhaXRvbltdW10gPSBbXVxuXG4gIGZvciAoY29uc3QgaHVuayBvZiBodW5rcykge1xuICAgIGxldCBmdXp6aW5nT2Zmc2V0ID0gMFxuICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICBjb25zdCBtb2RpZmljYXRpb25zID0gZXZhbHVhdGVIdW5rKGh1bmssIGZpbGVMaW5lcywgZnV6emluZ09mZnNldClcbiAgICAgIGlmIChtb2RpZmljYXRpb25zKSB7XG4gICAgICAgIHJlc3VsdC5wdXNoKG1vZGlmaWNhdGlvbnMpXG4gICAgICAgIGJyZWFrXG4gICAgICB9XG5cbiAgICAgIGZ1enppbmdPZmZzZXQgPVxuICAgICAgICBmdXp6aW5nT2Zmc2V0IDwgMCA/IGZ1enppbmdPZmZzZXQgKiAtMSA6IGZ1enppbmdPZmZzZXQgKiAtMSAtIDFcblxuICAgICAgaWYgKE1hdGguYWJzKGZ1enppbmdPZmZzZXQpID4gMjApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgIGBDYW50IGFwcGx5IGh1bmsgJHtodW5rcy5pbmRleE9mKGh1bmspfSBmb3IgZmlsZSAke3BhdGh9YCxcbiAgICAgICAgKVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGlmIChkcnlSdW4pIHtcbiAgICByZXR1cm5cbiAgfVxuXG4gIGxldCBkaWZmT2Zmc2V0ID0gMFxuXG4gIGZvciAoY29uc3QgbW9kaWZpY2F0aW9ucyBvZiByZXN1bHQpIHtcbiAgICBmb3IgKGNvbnN0IG1vZGlmaWNhdGlvbiBvZiBtb2RpZmljYXRpb25zKSB7XG4gICAgICBzd2l0Y2ggKG1vZGlmaWNhdGlvbi50eXBlKSB7XG4gICAgICAgIGNhc2UgXCJzcGxpY2VcIjpcbiAgICAgICAgICBmaWxlTGluZXMuc3BsaWNlKFxuICAgICAgICAgICAgbW9kaWZpY2F0aW9uLmluZGV4ICsgZGlmZk9mZnNldCxcbiAgICAgICAgICAgIG1vZGlmaWNhdGlvbi5udW1Ub0RlbGV0ZSxcbiAgICAgICAgICAgIC4uLm1vZGlmaWNhdGlvbi5saW5lc1RvSW5zZXJ0LFxuICAgICAgICAgIClcbiAgICAgICAgICBkaWZmT2Zmc2V0ICs9XG4gICAgICAgICAgICBtb2RpZmljYXRpb24ubGluZXNUb0luc2VydC5sZW5ndGggLSBtb2RpZmljYXRpb24ubnVtVG9EZWxldGVcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlIFwicG9wXCI6XG4gICAgICAgICAgZmlsZUxpbmVzLnBvcCgpXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSBcInB1c2hcIjpcbiAgICAgICAgICBmaWxlTGluZXMucHVzaChtb2RpZmljYXRpb24ubGluZSlcbiAgICAgICAgICBicmVha1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIGFzc2VydE5ldmVyKG1vZGlmaWNhdGlvbilcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmcy53cml0ZUZpbGVTeW5jKHBhdGgsIGZpbGVMaW5lcy5qb2luKFwiXFxuXCIpLCB7IG1vZGUgfSlcbn1cblxuaW50ZXJmYWNlIFB1c2gge1xuICB0eXBlOiBcInB1c2hcIlxuICBsaW5lOiBzdHJpbmdcbn1cbmludGVyZmFjZSBQb3Age1xuICB0eXBlOiBcInBvcFwiXG59XG5pbnRlcmZhY2UgU3BsaWNlIHtcbiAgdHlwZTogXCJzcGxpY2VcIlxuICBpbmRleDogbnVtYmVyXG4gIG51bVRvRGVsZXRlOiBudW1iZXJcbiAgbGluZXNUb0luc2VydDogc3RyaW5nW11cbn1cblxudHlwZSBNb2RpZmljYWl0b24gPSBQdXNoIHwgUG9wIHwgU3BsaWNlXG5cbmZ1bmN0aW9uIGV2YWx1YXRlSHVuayhcbiAgaHVuazogSHVuayxcbiAgZmlsZUxpbmVzOiBzdHJpbmdbXSxcbiAgZnV6emluZ09mZnNldDogbnVtYmVyLFxuKTogTW9kaWZpY2FpdG9uW10gfCBudWxsIHtcbiAgY29uc3QgcmVzdWx0OiBNb2RpZmljYWl0b25bXSA9IFtdXG4gIGxldCBjb250ZXh0SW5kZXggPSBodW5rLmhlYWRlci5vcmlnaW5hbC5zdGFydCAtIDEgKyBmdXp6aW5nT2Zmc2V0XG4gIC8vIGRvIGJvdW5kcyBjaGVja3MgZm9yIGluZGV4XG4gIGlmIChjb250ZXh0SW5kZXggPCAwKSB7XG4gICAgcmV0dXJuIG51bGxcbiAgfVxuICBpZiAoZmlsZUxpbmVzLmxlbmd0aCAtIGNvbnRleHRJbmRleCA8IGh1bmsuaGVhZGVyLm9yaWdpbmFsLmxlbmd0aCkge1xuICAgIHJldHVybiBudWxsXG4gIH1cblxuICBmb3IgKGNvbnN0IHBhcnQgb2YgaHVuay5wYXJ0cykge1xuICAgIHN3aXRjaCAocGFydC50eXBlKSB7XG4gICAgICBjYXNlIFwiZGVsZXRpb25cIjpcbiAgICAgIGNhc2UgXCJjb250ZXh0XCI6XG4gICAgICAgIGZvciAoY29uc3QgbGluZSBvZiBwYXJ0LmxpbmVzKSB7XG4gICAgICAgICAgY29uc3Qgb3JpZ2luYWxMaW5lID0gZmlsZUxpbmVzW2NvbnRleHRJbmRleF1cbiAgICAgICAgICBpZiAoIWxpbmVzQXJlRXF1YWwob3JpZ2luYWxMaW5lLCBsaW5lKSkge1xuICAgICAgICAgICAgcmV0dXJuIG51bGxcbiAgICAgICAgICB9XG4gICAgICAgICAgY29udGV4dEluZGV4KytcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwYXJ0LnR5cGUgPT09IFwiZGVsZXRpb25cIikge1xuICAgICAgICAgIHJlc3VsdC5wdXNoKHtcbiAgICAgICAgICAgIHR5cGU6IFwic3BsaWNlXCIsXG4gICAgICAgICAgICBpbmRleDogY29udGV4dEluZGV4IC0gcGFydC5saW5lcy5sZW5ndGgsXG4gICAgICAgICAgICBudW1Ub0RlbGV0ZTogcGFydC5saW5lcy5sZW5ndGgsXG4gICAgICAgICAgICBsaW5lc1RvSW5zZXJ0OiBbXSxcbiAgICAgICAgICB9KVxuXG4gICAgICAgICAgaWYgKHBhcnQubm9OZXdsaW5lQXRFbmRPZkZpbGUpIHtcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKHtcbiAgICAgICAgICAgICAgdHlwZTogXCJwdXNoXCIsXG4gICAgICAgICAgICAgIGxpbmU6IFwiXCIsXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBicmVha1xuICAgICAgY2FzZSBcImluc2VydGlvblwiOlxuICAgICAgICByZXN1bHQucHVzaCh7XG4gICAgICAgICAgdHlwZTogXCJzcGxpY2VcIixcbiAgICAgICAgICBpbmRleDogY29udGV4dEluZGV4LFxuICAgICAgICAgIG51bVRvRGVsZXRlOiAwLFxuICAgICAgICAgIGxpbmVzVG9JbnNlcnQ6IHBhcnQubGluZXMsXG4gICAgICAgIH0pXG4gICAgICAgIGlmIChwYXJ0Lm5vTmV3bGluZUF0RW5kT2ZGaWxlKSB7XG4gICAgICAgICAgcmVzdWx0LnB1c2goeyB0eXBlOiBcInBvcFwiIH0pXG4gICAgICAgIH1cbiAgICAgICAgYnJlYWtcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGFzc2VydE5ldmVyKHBhcnQudHlwZSlcbiAgICB9XG4gIH1cblxuICByZXR1cm4gcmVzdWx0XG59XG4iXX0=