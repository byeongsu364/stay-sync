from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from road_network import Point, calculate_distances, optimize_route


app = FastAPI(title="Stay Sync Road Network API", version="1.0.0")


class Location(BaseModel):
    id: str
    name: str
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class DistanceRequest(BaseModel):
    origin: Location
    destinations: list[Location]


class RouteRequest(DistanceRequest):
    returnToOrigin: bool = False


def to_point(location: Location) -> Point:
    return Point(
        id=location.id,
        name=location.name,
        latitude=location.latitude,
        longitude=location.longitude,
    )


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/distances")
def distances(request: DistanceRequest):
    try:
        return {
            "distances": calculate_distances(
                to_point(request.origin),
                [to_point(destination) for destination in request.destinations],
            ),
        }
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=503, detail=f"도로망 계산에 실패했습니다: {error}") from error


@app.post("/optimize")
def route(request: RouteRequest):
    try:
        return optimize_route(
            to_point(request.origin),
            [to_point(destination) for destination in request.destinations],
            return_to_origin=request.returnToOrigin,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=503, detail=f"도로망 계산에 실패했습니다: {error}") from error
