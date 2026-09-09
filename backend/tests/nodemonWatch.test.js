const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const match = require("nodemon/lib/monitor/match");
const settings = require("../nodemon.json");
const backend = path.resolve(__dirname, "..");

function watched(file) {
    const monitors = [
        ...settings.watch.map((entry) => path.resolve(backend, entry === "src" ? "src/**/*" : entry)),
        ...settings.ignore.map((entry) => `!${path.resolve(backend, entry)}`),
    ];
    return match([path.resolve(backend, file)], monitors, settings.ext).result.length > 0;
}

test("old default watcher restarts on a road-network JSON cache write", () => {
    assert.equal(match([path.join(backend, "route-server/cache/new-response.json")], ["*.*"], settings.ext).result.length, 1);
});

test("runtime cache writes no longer restart the backend", () => {
    for (const file of ["route-server/cache/new-response.json", "route-server/cache/existing-response.json", "cache/result.json", "logs/request.json"]) {
        assert.equal(watched(file), false, file);
    }
});

test("backend source changes still restart the backend", () => {
    for (const file of ["server.js", "src/services/chatService.js", "src/data/config.json", "nodemon.json"]) {
        assert.equal(watched(file), true, file);
    }
});
