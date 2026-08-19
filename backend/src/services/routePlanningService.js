const { getOptimizedRoute } = require("./roadNetworkService");

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

function parseDate(value) {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
}

function getTripDates({ startDate, endDate }) {
    const start = parseDate(startDate);
    const end = parseDate(endDate);

    if (!start || !end || end < start) {
        return [];
    }

    const dates = [];
    for (let time = start.getTime(); time <= end.getTime(); time += DAY_IN_MILLISECONDS) {
        dates.push(new Date(time).toISOString().slice(0, 10));
    }
    return dates;
}

function distributePlacesByDate(places, dates) {
    if (dates.length === 0) return [];

    const baseSize = Math.floor(places.length / dates.length);
    const remainder = places.length % dates.length;
    let cursor = 0;

    return dates.map((date, index) => {
        const size = baseSize + (index < remainder ? 1 : 0);
        const dayPlaces = places.slice(cursor, cursor + size);
        cursor += size;
        return { date, places: dayPlaces };
    });
}

function buildRouteReply(dailyRoutes) {
    const sections = dailyRoutes.map((day) => {
        const stops = day.stops.map((stop) => (
            `${stop.order}. ${stop.name}`
            + (stop.fromPreviousKm !== null && stop.fromPreviousKm !== undefined
                ? ` (이전 장소에서 ${stop.fromPreviousKm}km)`
                : "")
        ));
        const returnLine = day.returnToOrigin
            ? `숙소 복귀${day.returnDistanceKm !== null && day.returnDistanceKm !== undefined
                ? ` (${day.returnDistanceKm}km)`
                : ""}`
            : null;
        const routeLines = [day.origin.name, ...stops, returnLine]
            .filter(Boolean)
            .join(" → ");

        const dateLabel = day.date ? ` (${day.date})` : "";
        return `${day.day}일 차${dateLabel}\n${routeLines}\n총 이동 거리: ${day.totalDistanceKm}km`;
    });

    return `선택한 관광지의 날짜별 추천 동선입니다.\n\n${sections.join("\n\n")}`;
}

async function planRouteOnlyByDays({ selectedPlaces = [], travelDays, origin = null }) {
    const days = Number.parseInt(travelDays, 10);
    if (!Number.isInteger(days) || days < 1) {
        throw new Error("여행 일수는 1일 이상이어야 합니다.");
    }
    if (selectedPlaces.length === 0) {
        throw new Error("선택한 관광지가 없습니다.");
    }
    if (days > selectedPlaces.length) {
        throw new Error("여행 일수는 관광지 수보다 많을 수 없습니다.");
    }

    const dayKeys = Array.from({ length: days }, (_, index) => index + 1);
    const schedules = distributePlacesByDate(selectedPlaces, dayKeys);
    const dailyRoutes = [];

    for (let index = 0; index < schedules.length; index += 1) {
        const places = schedules[index].places;
        const dayOrigin = origin || places[0];
        const destinations = origin ? places : places.slice(1);
        const returnToOrigin = Boolean(origin) && index < schedules.length - 1;
        const route = await getOptimizedRoute({
            origin: dayOrigin,
            destinations,
            returnToOrigin,
        });
        dailyRoutes.push({
            day: index + 1,
            date: null,
            origin: dayOrigin,
            ...route,
        });
    }

    return {
        dailyRoutes,
        reply: buildRouteReply(dailyRoutes),
    };
}

async function planDailyRoutes({
    startDate,
    endDate,
    tripType,
    origin,
    selectedPlaces = [],
}) {
    if (!origin) {
        throw new Error("동선 계산을 위한 숙소 또는 출발지 정보가 없습니다.");
    }
    if (selectedPlaces.length === 0) {
        throw new Error("선택한 관광지가 없습니다.");
    }

    let dates = getTripDates({ startDate, endDate });
    if (dates.length === 0 && tripType === "당일치기") {
        dates = [startDate || new Date().toISOString().slice(0, 10)];
    }
    if (dates.length === 0) {
        throw new Error("여행 시작일과 종료일을 확인해주세요.");
    }

    // 관광지가 없는 빈 날짜는 결과에서 제외한다.
    const schedules = distributePlacesByDate(selectedPlaces, dates)
        .filter(({ places }) => places.length > 0);
    const dailyRoutes = [];

    for (let index = 0; index < schedules.length; index += 1) {
        const schedule = schedules[index];
        const isLastTripDate = schedule.date === dates[dates.length - 1];
        const returnToOrigin = tripType === "숙박" && !isLastTripDate;
        const route = await getOptimizedRoute({
            origin,
            destinations: schedule.places,
            returnToOrigin,
        });

        dailyRoutes.push({
            day: index + 1,
            date: schedule.date,
            origin,
            ...route,
        });
    }

    return {
        dailyRoutes,
        reply: buildRouteReply(dailyRoutes),
    };
}

module.exports = {
    getTripDates,
    distributePlacesByDate,
    buildRouteReply,
    planDailyRoutes,
    planRouteOnlyByDays,
};
