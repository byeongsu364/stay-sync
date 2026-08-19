function getCoordinates(location) {
    const latitude = Number(location?.latitude ?? location?.mapy);
    const longitude = Number(location?.longitude ?? location?.mapx);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new Error(`좌표가 올바르지 않습니다: ${location?.name || "알 수 없는 장소"}`);
    }
    return { latitude, longitude };
}

function toKakaoPoint(location) {
    const { latitude, longitude } = getCoordinates(location);
    return `${encodeURIComponent(location.name)},${latitude},${longitude}`;
}

function buildKakaoMapUrl(location) {
    return `https://map.kakao.com/link/map/${toKakaoPoint(location)}`;
}

function splitRoutePoints(points, maximumPoints = 7) {
    const chunks = [];
    let cursor = 0;

    while (cursor < points.length - 1) {
        const chunk = points.slice(cursor, cursor + maximumPoints);
        chunks.push(chunk);
        cursor += chunk.length - 1;
    }
    return chunks;
}

function buildKakaoRouteUrls(dayRoute) {
    const points = [dayRoute.origin, ...dayRoute.stops];
    if (dayRoute.returnToOrigin) points.push(dayRoute.origin);

    return splitRoutePoints(points).map((chunk) => (
        `https://map.kakao.com/link/by/car/${chunk.map(toKakaoPoint).join("/")}`
    ));
}

function escapeCsv(value) {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
}

function buildRouteCsv(dailyRoutes) {
    const header = [
        "일차", "날짜", "방문순서", "구분", "장소명", "위도", "경도",
        "이전 장소에서 거리(km)", "카카오맵 장소 링크", "카카오맵 길찾기 링크",
    ];
    const rows = [header];

    for (const dayRoute of dailyRoutes) {
        const routeUrls = buildKakaoRouteUrls(dayRoute).join(" | ");
        const originCoordinates = getCoordinates(dayRoute.origin);
        rows.push([
            dayRoute.day,
            dayRoute.date,
            0,
            "출발지",
            dayRoute.origin.name,
            originCoordinates.latitude,
            originCoordinates.longitude,
            0,
            buildKakaoMapUrl(dayRoute.origin),
            routeUrls,
        ]);

        for (const stop of dayRoute.stops) {
            const coordinates = getCoordinates(stop);
            rows.push([
                dayRoute.day,
                dayRoute.date,
                stop.order,
                "관광지",
                stop.name,
                coordinates.latitude,
                coordinates.longitude,
                stop.fromPreviousKm,
                buildKakaoMapUrl(stop),
                "",
            ]);
        }

        if (dayRoute.returnToOrigin) {
            rows.push([
                dayRoute.day,
                dayRoute.date,
                dayRoute.stops.length + 1,
                "숙소 복귀",
                dayRoute.origin.name,
                originCoordinates.latitude,
                originCoordinates.longitude,
                dayRoute.returnDistanceKm,
                buildKakaoMapUrl(dayRoute.origin),
                "",
            ]);
        }
    }

    return `\uFEFF${rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n")}`;
}

module.exports = {
    buildKakaoMapUrl,
    splitRoutePoints,
    buildKakaoRouteUrls,
    buildRouteCsv,
};
