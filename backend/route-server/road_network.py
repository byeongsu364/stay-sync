import math
from dataclasses import dataclass
from functools import lru_cache

import networkx as nx
import osmnx as ox


DEFAULT_MARGIN_DEGREES = 0.02


@dataclass(frozen=True)
class Point:
    id: str
    name: str
    latitude: float
    longitude: float


def _validate_coordinate(latitude: float, longitude: float) -> None:
    if not (-90 <= latitude <= 90):
        raise ValueError(f"위도 범위를 벗어났습니다: {latitude}")
    if not (-180 <= longitude <= 180):
        raise ValueError(f"경도 범위를 벗어났습니다: {longitude}")


def _bbox_for_points(points: list[Point]) -> tuple[float, float, float, float]:
    if not points:
        raise ValueError("도로망을 구성할 좌표가 없습니다.")

    latitudes = [point.latitude for point in points]
    longitudes = [point.longitude for point in points]

    left = min(longitudes) - DEFAULT_MARGIN_DEGREES
    bottom = min(latitudes) - DEFAULT_MARGIN_DEGREES
    right = max(longitudes) + DEFAULT_MARGIN_DEGREES
    top = max(latitudes) + DEFAULT_MARGIN_DEGREES

    return left, bottom, right, top


def _rounded_bbox(points: list[Point]) -> tuple[float, float, float, float]:
    return tuple(round(value, 2) for value in _bbox_for_points(points))


@lru_cache(maxsize=16)
def _load_drive_graph(
    left: float,
    bottom: float,
    right: float,
    top: float,
):
    graph = ox.graph_from_bbox(
        bbox=(left, bottom, right, top),
        network_type="drive",
        simplify=True,
        retain_all=False,
    )
    graph.graph["crs"] = "EPSG:4326"
    return graph


def _nearest_node(graph, point: Point):
    _validate_coordinate(point.latitude, point.longitude)
    return ox.distance.nearest_nodes(
        graph,
        X=point.longitude,
        Y=point.latitude,
    )


def _shortest_distance(graph, source_node, target_node) -> float:
    try:
        return float(nx.shortest_path_length(
            graph,
            source=source_node,
            target=target_node,
            weight="length",
        ))
    except nx.NetworkXNoPath:
        return math.inf


def calculate_distances(origin: Point, destinations: list[Point]) -> list[dict]:
    if not destinations:
        return []

    all_points = [origin, *destinations]
    graph = _load_drive_graph(*_rounded_bbox(all_points))
    origin_node = _nearest_node(graph, origin)
    distances = nx.single_source_dijkstra_path_length(
        graph,
        source=origin_node,
        weight="length",
    )

    results = []
    for destination in destinations:
        destination_node = _nearest_node(graph, destination)
        distance_meters = float(distances.get(destination_node, math.inf))
        results.append({
            "id": destination.id,
            "name": destination.name,
            "distanceMeters": None if math.isinf(distance_meters) else round(distance_meters, 1),
            "distanceKm": None if math.isinf(distance_meters) else round(distance_meters / 1000, 3),
            "reachable": not math.isinf(distance_meters),
        })

    return sorted(
        results,
        key=lambda result: (
            not result["reachable"],
            result["distanceMeters"] if result["distanceMeters"] is not None else math.inf,
        ),
    )


def optimize_route(
    origin: Point,
    destinations: list[Point],
    return_to_origin: bool = False,
) -> dict:
    if not destinations:
        return {
            "stops": [],
            "totalDistanceMeters": 0,
            "totalDistanceKm": 0,
            "returnToOrigin": return_to_origin,
        }

    all_points = [origin, *destinations]
    graph = _load_drive_graph(*_rounded_bbox(all_points))
    nodes = {point.id: _nearest_node(graph, point) for point in all_points}
    points_by_id = {point.id: point for point in all_points}

    remaining = {destination.id for destination in destinations}
    current_id = origin.id
    ordered_stops = []
    total_distance = 0.0

    while remaining:
        candidates = []
        for destination_id in remaining:
            distance = _shortest_distance(
                graph,
                nodes[current_id],
                nodes[destination_id],
            )
            candidates.append((distance, destination_id))

        distance, next_id = min(candidates, key=lambda candidate: candidate[0])
        if math.isinf(distance):
            break

        point = points_by_id[next_id]
        total_distance += distance
        ordered_stops.append({
            "order": len(ordered_stops) + 1,
            "id": point.id,
            "name": point.name,
            "latitude": point.latitude,
            "longitude": point.longitude,
            "fromPreviousMeters": round(distance, 1),
            "fromPreviousKm": round(distance / 1000, 3),
        })
        remaining.remove(next_id)
        current_id = next_id

    return_distance = 0.0
    if return_to_origin and ordered_stops:
        return_distance = _shortest_distance(
            graph,
            nodes[current_id],
            nodes[origin.id],
        )
        if not math.isinf(return_distance):
            total_distance += return_distance

    return {
        "stops": ordered_stops,
        "unreachableDestinationIds": sorted(remaining),
        "returnToOrigin": return_to_origin,
        "returnDistanceMeters": None if math.isinf(return_distance) else round(return_distance, 1),
        "returnDistanceKm": None if math.isinf(return_distance) else round(return_distance / 1000, 3),
        "totalDistanceMeters": round(total_distance, 1),
        "totalDistanceKm": round(total_distance / 1000, 3),
    }
