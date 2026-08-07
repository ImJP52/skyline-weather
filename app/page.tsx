"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Place = {
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
};

type WeatherData = {
  current: Record<string, number>;
  current_units: Record<string, string>;
  hourly: Record<string, (number | string)[]>;
  daily: Record<string, (number | string)[]>;
};

type HistoryDay = {
  date: string;
  maxTemp: number;
  minTemp: number;
  precipitation: number;
  source: "MRMS" | "station";
};

type HistoryData = {
  days: HistoryDay[];
  sourceLabel: string;
  stationName?: string;
};

type ForecastDiscussion = {
  issued?: string;
  messages: string[];
};

type Alert = {
  id: string;
  properties: {
    event: string;
    headline?: string;
    severity?: string;
    urgency?: string;
    sent?: string;
    effective?: string;
    onset?: string;
    expires?: string;
    areaDesc?: string;
    description?: string;
    instruction?: string;
    web?: string;
  };
};

type SpcOutlook = {
  label: string;
  code: string;
  issued?: string;
  expires?: string;
  color: string;
};

type NwsPeriod = {
  number: number;
  name: string;
  startTime: string;
  isDaytime: boolean;
  temperature: number;
  temperatureUnit: string;
  probabilityOfPrecipitation?: { value: number | null };
  shortForecast: string;
  detailedForecast: string;
};

type NwsData = {
  periods: NwsPeriod[];
  stationName?: string;
  observation?: Record<string, { value: number | null } | string | null>;
};

const DEFAULT_PLACE: Place = {
  name: "Johnston",
  admin1: "Iowa",
  country: "United States",
  latitude: 41.673,
  longitude: -93.6977,
  timezone: "America/Chicago",
};

const weatherCodes: Record<number, { label: string; icon: string }> = {
  0: { label: "Clear sky", icon: "☀" },
  1: { label: "Mostly clear", icon: "🌤" },
  2: { label: "Partly cloudy", icon: "⛅" },
  3: { label: "Overcast", icon: "☁" },
  45: { label: "Foggy", icon: "🌫" },
  48: { label: "Freezing fog", icon: "🌫" },
  51: { label: "Light drizzle", icon: "🌦" },
  53: { label: "Drizzle", icon: "🌦" },
  55: { label: "Heavy drizzle", icon: "🌧" },
  56: { label: "Freezing drizzle", icon: "🌧" },
  57: { label: "Freezing drizzle", icon: "🌧" },
  61: { label: "Light rain", icon: "🌦" },
  63: { label: "Rain", icon: "🌧" },
  65: { label: "Heavy rain", icon: "🌧" },
  66: { label: "Freezing rain", icon: "🌧" },
  67: { label: "Freezing rain", icon: "🌧" },
  71: { label: "Light snow", icon: "🌨" },
  73: { label: "Snow", icon: "❄" },
  75: { label: "Heavy snow", icon: "❄" },
  77: { label: "Snow grains", icon: "🌨" },
  80: { label: "Rain showers", icon: "🌦" },
  81: { label: "Rain showers", icon: "🌧" },
  82: { label: "Heavy showers", icon: "🌧" },
  85: { label: "Snow showers", icon: "🌨" },
  86: { label: "Heavy snow showers", icon: "🌨" },
  95: { label: "Thunderstorms", icon: "⛈" },
  96: { label: "Storms with hail", icon: "⛈" },
  99: { label: "Severe storms", icon: "⛈" },
};

const weatherInfo = (code: number) =>
  weatherCodes[code] ?? { label: "Conditions unavailable", icon: "◌" };

const formatHour = (value: string) =>
  new Date(value).toLocaleTimeString([], { hour: "numeric" });

const formatDay = (value: string, index: number) =>
  index === 0
    ? "Today"
    : new Date(`${value}T12:00:00`).toLocaleDateString([], { weekday: "short" });

const formatClock = (value: string) =>
  new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const formatUpdated = () =>
  new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const windDirection = (degrees: number) => {
  const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return points[Math.round(degrees / 45) % 8];
};

const alertIcon = (event: string) => {
  const name = event.toLowerCase();
  if (name.includes("tornado")) return "🌪️";
  if (name.includes("thunderstorm")) return "⛈️";
  if (name.includes("flood")) return "🌊";
  if (name.includes("snow") || name.includes("winter") || name.includes("blizzard")) return "❄️";
  if (name.includes("ice") || name.includes("freez")) return "🧊";
  if (name.includes("wind")) return "💨";
  if (name.includes("heat")) return "🌡️";
  if (name.includes("fog")) return "🌫️";
  if (name.includes("fire") || name.includes("red flag")) return "🔥";
  return "⚠️";
};

const pointInRing = (point: [number, number], ring: number[][]) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
};

const pointInPolygon = (point: [number, number], rings: number[][][]) =>
  pointInRing(point, rings[0]) &&
  !rings.slice(1).some((hole) => pointInRing(point, hole));

const featureContainsPoint = (
  point: [number, number],
  geometry: { type: string; coordinates: number[][][] | number[][][][] },
) => {
  if (geometry.type === "Polygon") {
    return pointInPolygon(point, geometry.coordinates as number[][][]);
  }
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates as number[][][][]).some((polygon) =>
      pointInPolygon(point, polygon),
    );
  }
  return false;
};

function WeatherMark({ code, large = false }: { code: number; large?: boolean }) {
  return (
    <span className={large ? "weather-mark weather-mark--large" : "weather-mark"} aria-hidden="true">
      {weatherInfo(code).icon}
    </span>
  );
}

export default function Home() {
  const [place, setPlace] = useState<Place>(DEFAULT_PLACE);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [spcOutlook, setSpcOutlook] = useState<SpcOutlook | null>(null);
  const [discussion, setDiscussion] = useState<ForecastDiscussion | null>(null);
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [nws, setNws] = useState<NwsData | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState("");
  const [enthusiastView, setEnthusiastView] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);

  useEffect(() => {
    if (!selectedAlert) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedAlert(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedAlert]);

  useEffect(() => {
    const syncView = () => setEnthusiastView(new URLSearchParams(window.location.search).get("view") === "enthusiast");
    syncView();
    window.addEventListener("popstate", syncView);
    return () => window.removeEventListener("popstate", syncView);
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const serviceWorkerUrl = new URL("./sw.js", window.location.href).href;
    navigator.serviceWorker.register(serviceWorkerUrl).catch(() => undefined);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError("");
      setResults([]);
      const params = new URLSearchParams({
        latitude: String(place.latitude),
        longitude: String(place.longitude),
        current:
          "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
        hourly:
          "temperature_2m,dew_point_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,pressure_msl,cloud_cover,visibility,uv_index",
        daily:
          "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max",
        temperature_unit: "fahrenheit",
        wind_speed_unit: "mph",
        precipitation_unit: "inch",
        timezone: "auto",
        forecast_days: "7",
      });

      try {
        const weatherRequest = fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
          signal: controller.signal,
        }).then((response) => {
          if (!response.ok) throw new Error("Weather service did not respond.");
          return response.json();
        });

        const nwsRequest = (async (): Promise<NwsData | null> => {
          const pointResponse = await fetch(
            `https://api.weather.gov/points/${place.latitude},${place.longitude}`,
            { signal: controller.signal, headers: { Accept: "application/geo+json" } },
          );
          if (!pointResponse.ok) return null;
          const pointData = await pointResponse.json();
          const forecastUrl = pointData.properties?.forecast;
          const stationsUrl = pointData.properties?.observationStations;
          if (!forecastUrl) return null;

          const [forecastResponse, stationsResponse] = await Promise.all([
            fetch(forecastUrl, {
              signal: controller.signal,
              headers: { Accept: "application/geo+json" },
            }),
            stationsUrl
              ? fetch(stationsUrl, {
                  signal: controller.signal,
                  headers: { Accept: "application/geo+json" },
                })
              : Promise.resolve(null),
          ]);
          if (!forecastResponse.ok) return null;
          const forecastData = await forecastResponse.json();
          const nearestStation = stationsResponse?.ok
            ? (await stationsResponse.json()).features?.[0]
            : null;
          let observation;
          if (nearestStation?.id) {
            const observationResponse = await fetch(`${nearestStation.id}/observations/latest`, {
              signal: controller.signal,
              headers: { Accept: "application/geo+json" },
            });
            if (observationResponse.ok) observation = (await observationResponse.json()).properties;
          }
          return {
            periods: forecastData.properties?.periods ?? [],
            stationName: nearestStation?.properties?.name,
            observation,
          };
        })().catch(() => null);

        const alertRequest = fetch(
          `https://api.weather.gov/alerts/active?point=${place.latitude},${place.longitude}`,
          { signal: controller.signal, headers: { Accept: "application/geo+json" } },
        )
          .then((response) => (response.ok ? response.json() : { features: [] }))
          .catch(() => ({ features: [] }));

        const spcRequest = fetch(
          "https://www.spc.noaa.gov/products/outlook/day1otlk_cat.nolyr.geojson",
          { signal: controller.signal },
        )
          .then((response) => (response.ok ? response.json() : { features: [] }))
          .catch(() => ({ features: [] }));

        const discussionRequest = fetch(
          "https://api.weather.gov/products/types/AFD/locations/DMX",
          { signal: controller.signal, headers: { Accept: "application/ld+json" } },
        )
          .then(async (response) => {
            if (!response.ok) return null;
            const list = await response.json();
            const latest = list["@graph"]?.[0];
            if (!latest?.id) return null;
            const productResponse = await fetch(`https://api.weather.gov/products/${latest.id}`, {
              signal: controller.signal,
              headers: { Accept: "application/ld+json" },
            });
            if (!productResponse.ok) return null;
            const product = await productResponse.json();
            const text = String(product.productText ?? "");
            const keySection = text.match(/\.KEY MESSAGES\.\.\.([\s\S]*?)&&/i)?.[1] ?? "";
            const messages = keySection
              .split(/\n\s*-\s+/)
              .map((message: string) => message.replace(/\s+/g, " ").trim())
              .filter(Boolean)
              .slice(0, 3);
            return {
              issued: product.issuanceTime ?? latest.issuanceTime,
              messages,
            };
          })
          .catch(() => null);

        const now = new Date();
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const dateString = (date: Date) =>
          `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        const historyRequest = (async (): Promise<HistoryData | null> => {
          const startDate = dateString(monthStart);
          const endDate = dateString(yesterday);
          const iemUrl = `https://mesonet.agron.iastate.edu/iemre/multiday/${startDate}/${endDate}/${place.latitude}/${place.longitude}/json`;
          const iemResponse = await fetch(iemUrl, { signal: controller.signal });
          if (!iemResponse.ok) return null;
          const iemData = await iemResponse.json();

          let stationName: string | undefined;
          let stationDays = new Map<string, number>();
          if (place.admin1 === "Iowa") {
            const networkResponse = await fetch(
              "https://mesonet.agron.iastate.edu/api/1/network/IA_ASOS.json",
              { signal: controller.signal },
            );
            if (networkResponse.ok) {
              const networkData = await networkResponse.json();
              const stations = (networkData.data ?? []).filter(
                (station: { online: boolean; latitude: number; longitude: number }) =>
                  station.online && Number.isFinite(station.latitude) && Number.isFinite(station.longitude),
              );
              const nearest = stations.sort(
                (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) =>
                  Math.hypot(a.latitude - place.latitude, a.longitude - place.longitude) -
                  Math.hypot(b.latitude - place.latitude, b.longitude - place.longitude),
              )[0];
              if (nearest) {
                stationName = `${nearest.name} (${nearest.id})`;
                const stationResponse = await fetch(
                  `https://mesonet.agron.iastate.edu/api/1/daily.json?station=${nearest.id}&network=IA_ASOS&year=${now.getFullYear()}&month=${now.getMonth() + 1}`,
                  { signal: controller.signal },
                );
                if (stationResponse.ok) {
                  const stationData = await stationResponse.json();
                  stationDays = new Map(
                    (stationData.data ?? [])
                      .filter((day: { date: string; precip: number | null }) => day.precip !== null)
                      .map((day: { date: string; precip: number }) => [day.date, Number(day.precip)]),
                  );
                }
              }
            }
          }

          const days: HistoryDay[] = (iemData.data ?? []).map(
            (day: {
              date: string;
              mrms_precip_in: number | null;
              daily_high_f: number;
              daily_low_f: number;
            }) => {
              const hasMrms = day.mrms_precip_in !== null && Number.isFinite(day.mrms_precip_in);
              const stationPrecip = stationDays.get(day.date);
              return {
                date: day.date,
                maxTemp: Number(day.daily_high_f),
                minTemp: Number(day.daily_low_f),
                precipitation: hasMrms
                  ? Number(day.mrms_precip_in)
                  : Number.isFinite(stationPrecip)
                    ? Number(stationPrecip)
                    : 0,
                source: hasMrms ? "MRMS" : "station",
              };
            },
          );
          if (!days.length) return null;
          const usedStationFallback = days.some((day) => day.source === "station");
          return {
            days,
            sourceLabel: usedStationFallback
              ? `IEM MRMS · ${stationName ?? "station"} fallback`
              : "IEM MRMS",
            stationName,
          };
        })().catch(() => null);

        const [weatherResponse, nwsResponse, alertResponse, spcResponse, discussionResponse, historyResponse] = await Promise.all([
          weatherRequest,
          nwsRequest,
          alertRequest,
          spcRequest,
          discussionRequest,
          historyRequest,
        ]);
        setWeather(weatherResponse);
        setNws(nwsResponse);
        setAlerts(alertResponse.features ?? []);
        setDiscussion(discussionResponse);
        setHistory(historyResponse);
        const point: [number, number] = [place.longitude, place.latitude];
        const matchingOutlooks = (spcResponse.features ?? [])
          .filter((feature: { geometry: { type: string; coordinates: number[][][] | number[][][][] } }) =>
            featureContainsPoint(point, feature.geometry),
          )
          .sort(
            (a: { properties: { DN?: number } }, b: { properties: { DN?: number } }) =>
              Number(b.properties.DN ?? 0) - Number(a.properties.DN ?? 0),
          );
        const localOutlook = matchingOutlooks[0]?.properties;
        setSpcOutlook(
          localOutlook
            ? {
                label: localOutlook.LABEL2 ?? "Day 1 outlook",
                code: localOutlook.LABEL ?? "SPC",
                issued: localOutlook.ISSUE_ISO,
                expires: localOutlook.EXPIRE_ISO,
                color: localOutlook.fill ?? "#dbe8de",
              }
            : {
                label: "No Day 1 outlook area",
                code: "NONE",
                color: "#dfe9e4",
              },
        );
        setUpdated(formatUpdated());
      } catch (requestError) {
        if ((requestError as Error).name !== "AbortError") {
          setError("We couldn’t load the latest weather. Check your connection and try again.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [place]);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    setError("");
    try {
      const params = new URLSearchParams({
        name: query.trim(),
        count: "6",
        language: "en",
        format: "json",
      });
      const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
      if (!response.ok) throw new Error("Search failed");
      const data = await response.json();
      setResults(data.results ?? []);
      if (!data.results?.length) setError(`No places found for “${query.trim()}.”`);
    } catch {
      setError("Location search is temporarily unavailable. Please try again.");
    } finally {
      setSearching(false);
    }
  };

  const choosePlace = (selection: Place) => {
    setPlace(selection);
    setQuery("");
    setResults([]);
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      setError("Location services are not supported on this device.");
      return;
    }

    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const latitude = Number(coords.latitude.toFixed(4));
        const longitude = Number(coords.longitude.toFixed(4));
        let nextPlace: Place = {
          name: "Current location",
          latitude,
          longitude,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };

        try {
          const response = await fetch(
            `https://api.weather.gov/points/${latitude},${longitude}`,
            { headers: { Accept: "application/geo+json" } },
          );
          if (response.ok) {
            const point = await response.json();
            const relative = point.properties?.relativeLocation?.properties;
            nextPlace = {
              ...nextPlace,
              name: relative?.city || "Current location",
              admin1: relative?.state,
              country: "United States",
              timezone: point.properties?.timeZone ?? nextPlace.timezone,
            };
          }
        } catch {
          // Coordinates are still enough to load weather if the place-name lookup fails.
        } finally {
          setQuery("");
          setResults([]);
          setPlace(nextPlace);
          setLocating(false);
        }
      },
      (locationError) => {
        setLocating(false);
        setError(
          locationError.code === 1
            ? "Location access was declined. Enable it in your browser settings or continue using search."
            : "Your location could not be determined. Please try again or use search.",
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };

  const currentHourIndex = useMemo(() => {
    if (!weather) return 0;
    const now = Date.now();
    const times = weather.hourly.time as string[];
    const next = times.findIndex((time) => new Date(time).getTime() >= now);
    return next < 0 ? 0 : next;
  }, [weather]);

  const hourly = weather
    ? (weather.hourly.time as string[])
        .slice(currentHourIndex, currentHourIndex + 24)
        .map((time, offset) => ({ time, index: currentHourIndex + offset }))
    : [];

  const currentCode = weather ? Number(weather.current.weather_code) : 0;
  const currentInfo = weatherInfo(currentCode);
  const celsiusToFahrenheit = (value: number) => value * 9 / 5 + 32;
  const kilometersToMiles = (value: number) => value * 0.621371;
  const pascalsToInHg = (value: number) => value * 0.0002953;
  const observedValue = (key: string) => {
    const field = nws?.observation?.[key];
    return field && typeof field === "object" && "value" in field && Number.isFinite(field.value)
      ? Number(field.value)
      : null;
  };
  const observedTemperature = observedValue("temperature");
  const observedFeelsLike = observedValue("heatIndex") ?? observedValue("windChill");
  const observedHumidity = observedValue("relativeHumidity");
  const observedDewPoint = observedValue("dewpoint");
  const observedVisibility = observedValue("visibility");
  const observedWind = observedValue("windSpeed");
  const observedWindDirection = observedValue("windDirection");
  const observedGust = observedValue("windGust");
  const observedPressure = observedValue("seaLevelPressure") ?? observedValue("barometricPressure");
  const currentTemperature = observedTemperature === null
    ? Number(weather?.current.temperature_2m ?? 0)
    : celsiusToFahrenheit(observedTemperature);
  const currentFeelsLike = observedFeelsLike === null
    ? Number(weather?.current.apparent_temperature ?? 0)
    : celsiusToFahrenheit(observedFeelsLike);
  const currentHumidity = observedHumidity ?? Number(weather?.current.relative_humidity_2m ?? 0);
  const currentWind = observedWind === null
    ? Number(weather?.current.wind_speed_10m ?? 0)
    : kilometersToMiles(observedWind);
  const currentWindDirection = observedWindDirection ?? Number(weather?.current.wind_direction_10m ?? 0);
  const currentGust = observedGust === null
    ? Number(weather?.current.wind_gusts_10m ?? 0)
    : kilometersToMiles(observedGust);
  const currentPressure = observedPressure === null
    ? Number(weather?.current.surface_pressure ?? 0) * 0.02953
    : pascalsToInHg(observedPressure);
  const currentDewPoint = observedDewPoint === null
    ? Number(weather?.hourly.dew_point_2m[currentHourIndex] ?? 0)
    : celsiusToFahrenheit(observedDewPoint);
  const currentVisibility = observedVisibility === null
    ? Number(weather?.hourly.visibility[currentHourIndex] ?? 0) / 5280
    : observedVisibility / 1609.344;
  const observationTimestamp = typeof nws?.observation?.timestamp === "string"
    ? nws.observation.timestamp
    : null;
  const observationAge = observationTimestamp
    ? Math.max(0, Math.round((Date.now() - new Date(observationTimestamp).getTime()) / 60000))
    : null;
  const nwsDaily = useMemo(() => {
    if (!nws?.periods.length) return [];
    const days: Array<{ date: string; name: string; forecast: string; detail: string; high?: number; low?: number; rain: number }> = [];
    nws.periods.forEach((period) => {
      const date = period.startTime.slice(0, 10);
      let day = days.find((candidate) => candidate.date === date);
      if (!day) {
        day = { date, name: period.name, forecast: period.shortForecast, detail: period.detailedForecast, rain: 0 };
        days.push(day);
      }
      if (period.isDaytime) {
        day.high = period.temperature;
        day.name = period.name;
        day.forecast = period.shortForecast;
        day.detail = period.detailedForecast;
      } else {
        day.low = period.temperature;
        if (!day.forecast) day.forecast = period.shortForecast;
      }
      day.rain = Math.max(day.rain, Number(period.probabilityOfPrecipitation?.value ?? 0));
    });
    return days.slice(0, 7);
  }, [nws]);
  const nextTwelveHours = hourly.slice(0, 12);
  const trendTemperatures = weather
    ? nextTwelveHours.map(({ index }) => Number(weather.hourly.temperature_2m[index]))
    : [];
  const trendMinimum = trendTemperatures.length ? Math.min(...trendTemperatures) : 0;
  const trendMaximum = trendTemperatures.length ? Math.max(...trendTemperatures) : 0;
  const trendRange = Math.max(1, trendMaximum - trendMinimum);
  const trendPoints = trendTemperatures
    .map((temperature, index) => {
      const x = trendTemperatures.length > 1 ? (index / (trendTemperatures.length - 1)) * 1100 : 0;
      const y = 125 - ((temperature - trendMinimum) / trendRange) * 90;
      return `${x},${y}`;
    })
    .join(" ");
  const hourlyWindSpeeds = weather
    ? nextTwelveHours.map(({ index }) => Number(weather.hourly.wind_speed_10m[index]))
    : [];
  const maximumHourlyWind = Math.max(1, ...hourlyWindSpeeds);
  const peakRainHour = nextTwelveHours.reduce(
    (peak, hour) =>
      !weather ||
      Number(weather.hourly.precipitation_probability[hour.index]) <=
        Number(weather.hourly.precipitation_probability[peak.index])
        ? peak
        : hour,
    nextTwelveHours[0] ?? { time: "", index: 0 },
  );
  const peakRainChance = weather
    ? Math.round(Number(weather.hourly.precipitation_probability[peakRainHour.index] ?? 0))
    : 0;
  const primaryHigh = nwsDaily[0]?.high ?? Number(weather?.daily.temperature_2m_max[0] ?? 0);
  const primaryLow = nwsDaily[0]?.low ?? Number(weather?.daily.temperature_2m_min[0] ?? 0);
  const openMeteoHigh = Number(weather?.daily.temperature_2m_max[0] ?? primaryHigh);
  const forecastSpread = Math.abs(primaryHigh - openMeteoHigh);
  const confidence = forecastSpread <= 2 ? "High" : forecastSpread <= 5 ? "Medium" : "Low";
  const pressureNow = Number(weather?.hourly.pressure_msl[currentHourIndex] ?? 0);
  const pressureLater = Number(weather?.hourly.pressure_msl[currentHourIndex + 3] ?? pressureNow);
  const pressureChange = (pressureLater - pressureNow) * 0.02953;
  const isNightHour = (time: string) => {
    if (!weather) return false;
    const dayIndex = (weather.daily.time as string[]).findIndex((day) => day === time.slice(0, 10));
    if (dayIndex < 0) return false;
    const sunrise = String(weather.daily.sunrise[dayIndex]);
    const sunset = String(weather.daily.sunset[dayIndex]);
    return time < sunrise || time >= sunset;
  };
  const todaySummary = weather
    ? `${typeof nws?.observation?.textDescription === "string" ? nws.observation.textDescription : currentInfo.label} now. High near ${Math.round(primaryHigh)}°. ${
        peakRainChance >= 20
          ? `Rain chances peak near ${peakRainChance}% around ${formatHour(peakRainHour.time)}.`
          : "Little precipitation is expected through the next 12 hours."
      } Winds may gust to ${Math.round(currentGust)} mph.`
    : "";
  const yesterdayHistory = history?.days.at(-1);
  const monthRain = history
    ? history.days.reduce((sum, day) => sum + day.precipitation, 0)
    : 0;
  const radarUrl =
    "https://radar.weather.gov/?settings=v1_eyJhZ2VuZGEiOnsiaWQiOiJsb2NhbCIsImNlbnRlciI6Wy05My43MjI4LDQxLjczMTFdLCJ6b29tIjo3LCJmaWx0ZXIiOiJXU1ItODhEIiwibGF5ZXIiOiJzcl9icmVmIiwic3RhdGlvbiI6IktETVgiLCJ0cmFuc3BhcmVudCI6dHJ1ZSwiYWxlcnRzT3ZlcmxheSI6dHJ1ZSwic3RhdGlvbkljb25zT3ZlcmxheSI6dHJ1ZX0sImFuaW1hdGluZyI6ZmFsc2UsImJhc2UiOiJzdGFuZGFyZCIsImNvdW50eSI6ZmFsc2UsImN3YSI6ZmFsc2UsInN0YXRlIjpmYWxzZSwibWVudSI6dHJ1ZSwic2hvcnRGdXNlZE9ubHkiOnRydWUsIm9wYWNpdHkiOnsiYWxlcnRzIjowLjgsImxvY2FsIjowLjYsImxvY2FsU3RhdGlvbnMiOjAuOCwibmF0aW9uYWwiOjAuNn19";
  const satelliteUrl =
    "https://www.star.nesdis.noaa.gov/GOES/sector_band.php?band=GEOCOLOR&length=24&sat=G19&sector=umv";
  const stationUrl = "https://tempestwx.com/station/38425/grid";

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Heartland WeatherOps home">
          <span className="brand-mark">H</span>
          <span className="brand-copy">
            <strong>Heartland WeatherOps</strong>
          </span>
        </a>
        <form className="search" onSubmit={search} role="search">
          <span className="search-icon" aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search city or ZIP code"
            aria-label="Search city or ZIP code"
          />
          <button type="submit" disabled={searching}>
            {searching ? "Searching…" : "Search"}
          </button>
          {results.length > 0 && (
            <div className="search-results">
              {results.map((result) => (
                <button
                  type="button"
                  key={`${result.latitude}-${result.longitude}`}
                  onClick={() => choosePlace(result)}
                >
                  <strong>{result.name}</strong>
                  <span>{[result.admin1, result.country].filter(Boolean).join(", ")}</span>
                </button>
              ))}
            </div>
          )}
        </form>
        <div className="header-actions">
          <button
            type="button"
            className="location-button"
            onClick={useMyLocation}
            disabled={locating}
          >
            <span aria-hidden="true">◎</span>
            {locating ? "Finding you…" : "Use my location"}
          </button>
          <span className="data-source">Current: NWS · Detail: Open‑Meteo</span>
        </div>
      </header>

      <section className="brand-hero" aria-label="Des Moines skyline">
        <img
          src="./og.png"
          alt="Des Moines skyline at sunset"
        />
      </section>

      <div className="dashboard" id="top">
        {error && (
          <div className="notice notice--error" role="alert">
            <span>{error}</span>
            <button onClick={() => setPlace({ ...place })}>Try again</button>
          </div>
        )}

        <section className="location-bar">
          <div>
            <p className="eyebrow">Your local forecast</p>
            <h1>{place.name}, {place.admin1 ?? place.country}</h1>
          </div>
          <p className="updated">{updated ? `Updated ${updated}` : "Updating now"}<span> · Local time</span></p>
        </section>

        <nav className="view-switcher" aria-label="Dashboard view">
          <a className={!enthusiastView ? "active" : ""} href="?view=standard">Standard dashboard</a>
          <a className={enthusiastView ? "active" : ""} href="?view=enthusiast">Enthusiast dashboard</a>
        </nav>

        {enthusiastView && loading && !weather && (
          <section className="loading-card" aria-live="polite">
            <div className="spinner" />
            <h2>Building the weather picture…</h2>
            <p>Combining observations, forecasts, and hazard guidance for {place.name}.</p>
          </section>
        )}

        {enthusiastView && weather && (
          <div className="enthusiast-dashboard">
            <section className="enthusiast-heading">
              <div>
                <p className="eyebrow">Operational view · experimental</p>
                <h2>Weather situation dashboard</h2>
                <p>Observations, forecast evolution, hazards, and source agreement on one timeline.</p>
              </div>
              <span className={`confidence confidence--${confidence.toLowerCase()}`}>{confidence} forecast confidence</span>
            </section>

            <section className={alerts.length ? "hazard-ribbon hazard-ribbon--active" : "hazard-ribbon"} aria-label="Hazard status">
              <article className={alerts.length ? "hazard-item hazard-item--active hazard-alert-list" : "hazard-item"}>
                <span>NWS alerts</span>
                {alerts.length ? (
                  <div className="hazard-alert-items">
                    {alerts.slice(0, 3).map((alert) => (
                      <button type="button" onClick={() => setSelectedAlert(alert)} key={alert.id}>
                        <i aria-hidden="true">{alertIcon(alert.properties.event)}</i>
                        <span>
                          <strong>{alert.properties.event}</strong>
                          <small>{alert.properties.headline ?? "Read the official National Weather Service alert text"}</small>
                        </span>
                        <b aria-hidden="true">Read</b>
                      </button>
                    ))}
                  </div>
                ) : <strong>None active</strong>}
              </article>
              <article className="hazard-item" style={{ borderTopColor: spcOutlook?.color }}>
                <span>SPC Day 1</span><strong>{spcOutlook?.label ?? "Checking"}</strong>
              </article>
              <a className="hazard-item" href="https://www.wpc.ncep.noaa.gov/qpf/excessive_rainfall_outlook_ero.php" target="_blank" rel="noreferrer">
                <span>Excessive rain</span><strong>WPC outlook ↗</strong>
              </a>
              <a className="hazard-item" href={radarUrl} target="_blank" rel="noreferrer">
                <span>KDMX radar</span><strong>Live view ↗</strong>
              </a>
            </section>

            {selectedAlert && (
              <div className="alert-modal-backdrop" role="presentation" onMouseDown={() => setSelectedAlert(null)}>
                <section className="alert-modal" role="dialog" aria-modal="true" aria-labelledby="alert-modal-title" onMouseDown={(event) => event.stopPropagation()}>
                  <button className="alert-modal__close" type="button" onClick={() => setSelectedAlert(null)} aria-label="Close alert text">×</button>
                  <div className="alert-modal__title">
                    <span aria-hidden="true">{alertIcon(selectedAlert.properties.event)}</span>
                    <div>
                      <p>National Weather Service alert</p>
                      <h2 id="alert-modal-title">{selectedAlert.properties.event}</h2>
                    </div>
                  </div>
                  {selectedAlert.properties.headline && <p className="alert-modal__headline">{selectedAlert.properties.headline}</p>}
                  <dl className="alert-modal__facts">
                    {selectedAlert.properties.areaDesc && <div><dt>Affected area</dt><dd>{selectedAlert.properties.areaDesc}</dd></div>}
                    {selectedAlert.properties.expires && <div><dt>Expires</dt><dd>{new Date(selectedAlert.properties.expires).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</dd></div>}
                  </dl>
                  {selectedAlert.properties.description && <div className="alert-modal__text"><h3>Alert details</h3><p>{selectedAlert.properties.description}</p></div>}
                  {selectedAlert.properties.instruction && <div className="alert-modal__instructions"><h3>Recommended action</h3><p>{selectedAlert.properties.instruction}</p></div>}
                  <div className="alert-modal__actions">
                    <button type="button" onClick={() => setSelectedAlert(null)}>Close</button>
                    <a href={selectedAlert.id} target="_blank" rel="noreferrer">Open this alert’s NWS record ↗</a>
                  </div>
                </section>
              </div>
            )}

            <section className="enthusiast-top-grid">
              <article className="ops-panel atmosphere-panel">
                <div className="ops-panel__heading">
                  <div><p className="eyebrow">Current atmosphere</p><h3>{nws?.stationName ?? "Local estimate"}</h3></div>
                  <span>{observationAge === null ? "Open‑Meteo fallback" : `${observationAge} min old`}</span>
                </div>
                <div className="atmosphere-main">
                  <strong>{Math.round(currentTemperature)}°</strong>
                  <div><span>{typeof nws?.observation?.textDescription === "string" ? nws.observation.textDescription : currentInfo.label}</span><small>Feels like {Math.round(currentFeelsLike)}°</small></div>
                </div>
                <div className="atmosphere-grid">
                  <div><span>Dew point</span><strong>{Math.round(currentDewPoint)}°</strong></div>
                  <div><span>Humidity</span><strong>{Math.round(currentHumidity)}%</strong></div>
                  <div><span>Wind</span><strong>{windDirection(currentWindDirection)} {Math.round(currentWind)}</strong><small>Gust {Math.round(currentGust)} mph</small></div>
                  <div><span>Pressure</span><strong>{currentPressure.toFixed(2)}</strong><small>{pressureChange > .01 ? "Rising" : pressureChange < -.01 ? "Falling" : "Steady"} {Math.abs(pressureChange).toFixed(2)} in/3h</small></div>
                  <div><span>Visibility</span><strong>{currentVisibility.toFixed(1)} mi</strong></div>
                  <div><span>UV index</span><strong>{Math.round(Number(weather.hourly.uv_index[currentHourIndex]))}</strong></div>
                </div>
              </article>

              <article className="ops-panel confidence-panel">
                <div className="ops-panel__heading"><div><p className="eyebrow">Source agreement</p><h3>Today’s high</h3></div></div>
                <div className="model-row"><span>NWS forecast</span><strong>{Math.round(primaryHigh)}°</strong></div>
                <div className="model-row"><span>Open‑Meteo</span><strong>{Math.round(openMeteoHigh)}°</strong></div>
                <div className="spread-meter"><span style={{ width: `${Math.min(100, Math.max(8, forecastSpread * 15))}%` }} /></div>
                <p>The two sources differ by {forecastSpread.toFixed(1)}°. {confidence === "High" ? "Guidance is closely aligned." : "Watch future updates for changing guidance."}</p>
                <a href="https://forecast.weather.gov/product.php?issuedby=DMX&product=AFD&site=DMX" target="_blank" rel="noreferrer">Read NWS forecaster reasoning ↗</a>
              </article>
            </section>

            <section className="ops-panel meteogram-panel">
              <div className="ops-panel__heading">
                <div><p className="eyebrow">Unified meteogram</p><h3>Next 12 hours</h3></div>
                <span>Open‑Meteo detail · NWS observations</span>
              </div>
              <div className="meteogram-scroll">
                <div className="meteogram-grid">
                  {nextTwelveHours.map(({ time, index }, displayIndex) => {
                    const temperature = Number(weather.hourly.temperature_2m[index]);
                    const dewPoint = Number(weather.hourly.dew_point_2m[index]);
                    const rainChance = Number(weather.hourly.precipitation_probability[index]);
                    const wind = Number(weather.hourly.wind_speed_10m[index]);
                    const gust = Number(weather.hourly.wind_gusts_10m[index]);
                    const windDegrees = Number(weather.hourly.wind_direction_10m[index]);
                    const code = Number(weather.hourly.weather_code[index]);
                    const showMoon = isNightHour(time) && code <= 2;
                    return (
                      <article className="meteogram-hour" key={time}>
                        <strong className="met-time">{displayIndex === 0 ? "Now" : formatHour(time)}</strong>
                        {showMoon ? <span className="weather-mark night-mark" aria-label="Clear night">☾</span> : <WeatherMark code={code} />}
                        <div className="met-temp"><strong>{Math.round(temperature)}°</strong><span>DP {Math.round(dewPoint)}°</span></div>
                        <div className="met-rain-track"><span style={{ height: `${Math.max(3, rainChance)}%` }} /></div>
                        <span className="met-rain">{Math.round(rainChance)}%</span>
                        <span className="met-wind" title={`Wind from ${windDirection(windDegrees)}`}>
                          <i className="wind-arrow" style={{ transform: `rotate(${windDegrees}deg)` }} aria-hidden="true">↑</i>
                          <strong>{Math.round(wind)}</strong>
                          <small>G{Math.round(gust)}</small>
                        </span>
                      </article>
                    );
                  })}
                </div>
              </div>
              <div className="meteogram-legend"><span>Temperature / dew point</span><span>Blue bar: rain probability</span><span>Wind: direction, sustained, gust</span></div>
            </section>

            <section className="enthusiast-bottom-grid">
              <article className="ops-panel technical-panel">
                <div className="ops-panel__heading"><div><p className="eyebrow">Forecast evolution</p><h3>Seven-day technical outlook</h3></div></div>
                {nwsDaily.map((day, index) => (
                  <div className="technical-day" key={day.date}>
                    <strong>{index === 0 ? "Today" : day.name}</strong>
                    <span>{day.forecast}</span>
                    <span>PoP {Math.round(day.rain)}%</span>
                    <b>{day.high === undefined ? "—" : `${Math.round(day.high)}°`} / {day.low === undefined ? "—" : `${Math.round(day.low)}°`}</b>
                  </div>
                ))}
              </article>
              <aside className="ops-links">
                <a href={radarUrl} target="_blank" rel="noreferrer"><span>Radar</span><strong>KDMX base reflectivity ↗</strong></a>
                <a href="https://www.spc.noaa.gov/products/outlook/" target="_blank" rel="noreferrer"><span>Severe weather</span><strong>SPC outlooks ↗</strong></a>
                <a href="https://www.wpc.ncep.noaa.gov/" target="_blank" rel="noreferrer"><span>Precipitation & winter</span><strong>WPC guidance ↗</strong></a>
                <a href={satelliteUrl} target="_blank" rel="noreferrer"><span>Satellite</span><strong>GOES-East loop ↗</strong></a>
                <a href={stationUrl} target="_blank" rel="noreferrer"><span>Hyperlocal</span><strong>Tempest station ↗</strong></a>
              </aside>
            </section>
          </div>
        )}

        {!enthusiastView && (loading && !weather ? (
          <section className="loading-card" aria-live="polite">
            <div className="spinner" />
            <h2>Reading the sky…</h2>
            <p>Gathering the latest conditions for {place.name}.</p>
          </section>
        ) : weather ? (
          <>
            <section className="briefing-card">
              <div>
                <p className="eyebrow">Today at a glance</p>
                <h2>{todaySummary}</h2>
              </div>
              <span className="briefing-badge">{currentInfo.icon} Local briefing</span>
            </section>

            <section className="hero-grid">
              <article className="current-card">
                <div className="current-main">
                  <WeatherMark code={currentCode} large />
                  <div>
                    <div className="temperature">{Math.round(currentTemperature)}°</div>
                    <h2>{typeof nws?.observation?.textDescription === "string" ? nws.observation.textDescription : currentInfo.label}</h2>
                    <p>Feels like {Math.round(currentFeelsLike)}°</p>
                  </div>
                </div>
                <div className="high-low">
                  <span>High <strong>{Math.round(primaryHigh)}°</strong></span>
                  <span className="divider" />
                  <span>Low <strong>{Math.round(primaryLow)}°</strong></span>
                </div>
              </article>

              <div className="metrics-grid">
                <article className="metric-card">
                  <span className="metric-icon">💧</span>
                  <p>Humidity</p>
                  <strong>{Math.round(currentHumidity)}%</strong>
                  <small>{nws?.stationName ? `Observed at ${nws.stationName}` : "Open‑Meteo estimate"}</small>
                </article>
                <article className="metric-card">
                  <span className="metric-icon">↗</span>
                  <p>Wind</p>
                  <strong>{Math.round(currentWind)} <em>mph</em></strong>
                  <small>{windDirection(currentWindDirection)} · Gusts {Math.round(currentGust)} mph</small>
                </article>
                <article className="metric-card">
                  <span className="metric-icon">◔</span>
                  <p>Pressure</p>
                  <strong>{currentPressure.toFixed(2)} <em>inHg</em></strong>
                  <small>{observedPressure === null ? "Open‑Meteo surface pressure" : "NWS station pressure"}</small>
                </article>
                <article className="metric-card">
                  <span className="metric-icon">☼</span>
                  <p>UV index</p>
                  <strong>{Math.round(Number(weather.hourly.uv_index[currentHourIndex]))}</strong>
                  <small>Peak today {Math.round(Number(weather.daily.uv_index_max[0]))}</small>
                </article>
              </div>
            </section>

            <section className="insight-grid">
              <article className="panel discussion-panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">NWS Des Moines</p>
                    <h2>Forecaster key messages</h2>
                  </div>
                  {discussion?.issued && (
                    <span>Issued {new Date(discussion.issued).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                  )}
                </div>
                {discussion?.messages.length ? (
                  <ul>
                    {discussion.messages.map((message) => <li key={message}>{message}</li>)}
                  </ul>
                ) : (
                  <p className="muted-copy">The latest discussion is temporarily unavailable. Open the official report below.</p>
                )}
                <a className="text-link" href="https://forecast.weather.gov/product.php?issuedby=DMX&product=AFD&site=DMX" target="_blank" rel="noreferrer">
                  Read the full forecast discussion <span>↗</span>
                </a>
              </article>

              <article className="panel sun-panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Daylight</p>
                    <h2>Sunrise & sunset</h2>
                  </div>
                </div>
                <div className="sun-arc">
                  <span className="sun-dot">☀</span>
                </div>
                <div className="sun-times">
                  <div><span>Sunrise</span><strong>{formatClock(String(weather.daily.sunrise[0]))}</strong></div>
                  <div><span>Sunset</span><strong>{formatClock(String(weather.daily.sunset[0]))}</strong></div>
                </div>
              </article>
            </section>

            <section className="panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Next 24 hours</p>
                  <h2>Hourly forecast</h2>
                </div>
                <span>Scroll to explore →</span>
              </div>
              <div className="temperature-trend">
                <div className="temperature-trend__scale">
                  <strong>{Math.round(trendMaximum)}°</strong>
                  <span>{Math.round(trendMinimum)}°</span>
                </div>
                <svg
                  viewBox="0 0 1100 150"
                  preserveAspectRatio="none"
                  role="img"
                  aria-label={`Temperature trend from ${Math.round(trendMinimum)} to ${Math.round(trendMaximum)} degrees over the next 12 hours`}
                >
                  <polyline points={trendPoints} />
                  {trendTemperatures.map((temperature, index) => {
                    const [x, y] = trendPoints.split(" ")[index].split(",");
                    return <circle key={`${nextTwelveHours[index].time}-${temperature}`} cx={x} cy={y} r="5" />;
                  })}
                </svg>
                <div className="temperature-trend__labels">
                  {nextTwelveHours.map(({ time }, index) => (
                    <span key={time}>{index === 0 ? "Now" : formatHour(time)}</span>
                  ))}
                </div>
              </div>
              <div className="hourly-list">
                {hourly.map(({ time, index }, displayIndex) => (
                  <article className="hour-card" key={time}>
                    <p>{displayIndex === 0 ? "Now" : formatHour(time)}</p>
                    <WeatherMark code={Number(weather.hourly.weather_code[index])} />
                    <strong>{Math.round(Number(weather.hourly.temperature_2m[index]))}°</strong>
                    <span className="rain">💧 {Math.round(Number(weather.hourly.precipitation_probability[index]))}%</span>
                  </article>
                ))}
              </div>
            </section>

            <section className="panel humidity-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Moisture through the day</p>
                  <h2>12-hour relative humidity</h2>
                </div>
                <span>Percent relative humidity</span>
              </div>
              <div className="humidity-chart">
                {nextTwelveHours.map(({ time, index }, displayIndex) => {
                  const humidity = Math.round(Number(weather.hourly.relative_humidity_2m[index]));
                  return (
                    <div className="humidity-column" key={time}>
                      <span className="humidity-value">{humidity}%</span>
                      <div className="humidity-track">
                        <span style={{ height: `${humidity}%` }} />
                      </div>
                      <strong>{displayIndex === 0 ? "Now" : formatHour(time)}</strong>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="panel wind-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Breeze through the day</p>
                  <h2>12-hour wind forecast</h2>
                </div>
                <span>Sustained wind · mph</span>
              </div>
              <div className="wind-chart">
                {nextTwelveHours.map(({ time, index }, displayIndex) => {
                  const speed = Math.round(Number(weather.hourly.wind_speed_10m[index]));
                  const direction = windDirection(Number(weather.hourly.wind_direction_10m[index]));
                  return (
                    <div className="wind-column" key={time}>
                      <span className="wind-speed">{speed} mph</span>
                      <div className="wind-track">
                        <span style={{ height: `${Math.max(6, (speed / maximumHourlyWind) * 100)}%` }} />
                      </div>
                      <strong>{displayIndex === 0 ? "Now" : formatHour(time)}</strong>
                      <small>{direction}</small>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="content-grid">
              <article className="panel forecast-panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">The week ahead</p>
                    <h2>7-day forecast</h2>
                  </div>
                </div>
                <div className="daily-list">
                  {(nwsDaily.length ? nwsDaily : (weather.daily.time as string[]).map((day, index) => ({
                    date: day,
                    name: formatDay(day, index),
                    forecast: weatherInfo(Number(weather.daily.weather_code[index])).label,
                    detail: "Open-Meteo forecast",
                    high: Number(weather.daily.temperature_2m_max[index]),
                    low: Number(weather.daily.temperature_2m_min[index]),
                    rain: Number(weather.daily.precipitation_probability_max[index]),
                  }))).map((day, index) => {
                    const code = Number(weather.daily.weather_code[index]);
                    return (
                      <div className="day-row" key={day.date} title={day.detail}>
                        <strong>{index === 0 ? "Today" : day.name}</strong>
                        <div className="condition">
                          <WeatherMark code={code} />
                          <span>{day.forecast}</span>
                        </div>
                        <span className="daily-rain">💧 {Math.round(day.rain)}%</span>
                        <span className="temps">
                          <strong>{day.high === undefined ? "—" : `${Math.round(day.high)}°`}</strong>
                          <span>{day.low === undefined ? "—" : `${Math.round(day.low)}°`}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="forecast-source">Primary forecast: {nwsDaily.length ? "National Weather Service" : "Open‑Meteo fallback"} · Hourly detail: Open‑Meteo</p>

                <div className="history-strip">
                  <div>
                    <p className="eyebrow">Recent history</p>
                    <h2>Yesterday & this month</h2>
                  </div>
                  {history && yesterdayHistory ? (
                    <div className="history-stats">
                      <span><small>Yesterday</small><strong>{Math.round(yesterdayHistory.maxTemp)}° / {Math.round(yesterdayHistory.minTemp)}°</strong></span>
                      <span><small>Yesterday’s rain</small><strong>{yesterdayHistory.precipitation.toFixed(2)}″</strong></span>
                      <span><small>Month to date</small><strong>{monthRain.toFixed(2)}″ rain</strong></span>
                      <span className="history-source">
                        <small>Observed precipitation source</small>
                        <strong>
                          <a href="https://mesonet.agron.iastate.edu/iemre/" target="_blank" rel="noreferrer">
                            {history.sourceLabel}
                          </a>
                        </strong>
                      </span>
                    </div>
                  ) : (
                    <p className="muted-copy">Recent history is temporarily unavailable.</p>
                  )}
                </div>
              </article>

              <aside className="side-stack">
                <article className={`panel alerts-panel ${alerts.length ? "alerts-panel--active" : ""}`}>
                  <div className="alert-title">
                    <span className="alert-icon">{alerts.length ? "!" : "✓"}</span>
                    <div>
                      <p className="eyebrow">National Weather Service</p>
                      <h2>{alerts.length ? `${alerts.length} active alert${alerts.length > 1 ? "s" : ""}` : "No active alerts"}</h2>
                    </div>
                  </div>
                  {alerts.length ? (
                    <div className="alert-items">
                      {alerts.slice(0, 3).map((alert) => (
                        <a href={alert.properties.web} target="_blank" rel="noreferrer" key={alert.id}>
                          <strong>{alert.properties.event}</strong>
                          <span>{alert.properties.headline ?? "View details from the National Weather Service"}</span>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p>There are no watches, warnings, or advisories for this location right now.</p>
                  )}
                  <div className="spc-update">
                    <div className="spc-update__heading">
                      <span
                        className="spc-risk-dot"
                        style={{ background: spcOutlook?.color ?? "#dfe9e4" }}
                      />
                      <div>
                        <span>SPC Day 1 outlook for {place.name}</span>
                        <strong>{spcOutlook?.label ?? "Checking the latest outlook…"}</strong>
                      </div>
                    </div>
                    <p>
                      {spcOutlook?.issued
                        ? `Issued ${new Date(spcOutlook.issued).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })}.`
                        : "No organized thunderstorm area currently includes this location."}
                    </p>
                    <a
                      href="https://www.spc.noaa.gov/products/outlook/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      View Storm Prediction Center outlooks <span>↗</span>
                    </a>
                  </div>
                </article>

                <article className="radar-card">
                  <div className="radar-copy">
                    <p className="eyebrow">Live precipitation</p>
                    <h2>See what’s moving in</h2>
                    <p>Open the enhanced KDMX base reflectivity view, centered on Johnston and central Iowa.</p>
                    <a href={radarUrl} target="_blank" rel="noreferrer">Open high-resolution radar <span>↗</span></a>
                  </div>
                  <div className="radar-visual" aria-hidden="true">
                    <span className="radar-center" />
                    <span className="radar-ring radar-ring--one" />
                    <span className="radar-ring radar-ring--two" />
                    <span className="radar-sweep" />
                  </div>
                </article>

                <article className="satellite-card">
                  <div className="satellite-copy">
                    <p className="eyebrow">GOES-East satellite</p>
                    <h2>Upper Mississippi Valley</h2>
                    <p>Watch NOAA’s latest GeoColor satellite images in a two-hour animation loop.</p>
                    <a href={satelliteUrl} target="_blank" rel="noreferrer">
                      Open animation loop <span>↗</span>
                    </a>
                  </div>
                  <div className="satellite-visual" aria-hidden="true">
                    <span className="satellite-orbit" />
                    <span className="satellite-cloud satellite-cloud--one" />
                    <span className="satellite-cloud satellite-cloud--two" />
                    <span className="satellite-cloud satellite-cloud--three" />
                  </div>
                </article>

                <article className="station-card">
                  <div>
                    <p className="eyebrow">Personal weather station</p>
                    <h2>Johnston observations</h2>
                    <p>See detailed, hyperlocal temperature, wind, rainfall, pressure, and lightning readings from your Tempest station.</p>
                  </div>
                  <a href={stationUrl} target="_blank" rel="noreferrer">
                    View station data <span>↗</span>
                  </a>
                </article>
              </aside>
            </section>
          </>
        ) : null)}
      </div>

      <footer>
        <p>Heartland WeatherOps · A personal Des Moines weather dashboard by Justin Cody</p>
        <p>Weather conditions can change quickly. Always follow official guidance during severe weather.</p>
      </footer>
    </main>
  );
}
