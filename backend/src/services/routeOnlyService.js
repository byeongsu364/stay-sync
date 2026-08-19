const { searchLocation } = require("./locationInputService");

function parsePlaceNames(input) {
    return [...new Set(
        String(input || "")
            .split(/[,，\n]|(?:\s*(?:그리고|이랑|랑|와|과)\s*)/)
            .map((name) => name.trim())
            .filter(Boolean),
    )];
}

async function resolveRouteOnlyAttractions(input, region) {
    const names = parsePlaceNames(input);
    if (names.length === 0) return { places: [], unresolved: [] };

    const results = await Promise.all(names.map(async (name) => {
        const location = await searchLocation(name, { region });
        return { inputName: name, location };
    }));

    return {
        places: results.filter(({ location }) => location).map(({ location }) => ({
            id: `kakao-${location.kakaoPlaceId}`,
            name: location.name,
            address: location.address,
            mapx: location.longitude,
            mapy: location.latitude,
            kakaoPlaceId: location.kakaoPlaceId,
        })),
        unresolved: results.filter(({ location }) => !location).map(({ inputName }) => inputName),
    };
}

function parseTravelDays(input) {
    const text = String(input || "").replace(/\s/g, "");
    if (text.includes("일주일")) return 7;

    const nightsAndDays = text.match(/(\d+)박(\d+)일/);
    if (nightsAndDays) return Number.parseInt(nightsAndDays[2], 10);

    const days = text.match(/(\d+)(?:일|일간)?/);
    return days ? Number.parseInt(days[1], 10) : null;
}

module.exports = {
    parsePlaceNames,
    parseTravelDays,
    resolveRouteOnlyAttractions,
};
