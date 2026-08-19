const axios = require("axios");
const env = require("../config/env");

async function callRouteServer(path, payload) {
    try {
        const response = await axios.post(`${env.routeServer.url}${path}`, payload, {
            timeout: 120000,
        });
        return response.data;
    } catch (error) {
        const detail = error.response?.data?.detail || error.message;
        throw new Error(`도로망 서버 호출에 실패했습니다: ${detail}`);
    }
}

function toRouteLocation(location, fallbackId) {
    const latitude = Number(location?.mapy ?? location?.latitude);
    const longitude = Number(location?.mapx ?? location?.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new Error(`좌표가 올바르지 않습니다: ${location?.name || fallbackId}`);
    }

    return {
        id: String(location?.id ?? fallbackId),
        name: String(location?.name || fallbackId),
        latitude,
        longitude,
    };
}

async function getRoadDistances({ origin, destinations }) {
    const response = await callRouteServer("/distances", {
        origin: toRouteLocation(origin, "origin"),
        destinations: destinations.map((destination, index) => (
            toRouteLocation(destination, `destination-${index + 1}`)
        )),
    });

    return response.distances;
}

async function getOptimizedRoute({
    origin,
    destinations,
    returnToOrigin = false,
}) {
    return await callRouteServer("/optimize", {
        origin: toRouteLocation(origin, "origin"),
        destinations: destinations.map((destination, index) => (
            toRouteLocation(destination, `destination-${index + 1}`)
        )),
        returnToOrigin,
    });

}

module.exports = {
    toRouteLocation,
    getRoadDistances,
    getOptimizedRoute,
};
