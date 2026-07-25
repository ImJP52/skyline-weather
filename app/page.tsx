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

type HistoryData = {
  daily: Record<string, (number | string)[]>;
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
    expires?: string;
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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState("");

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
          "temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,uv_index",
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
        const historyParams = new URLSearchParams({
          latitude: String(place.latitude),
          longitude: String(place.longitude),
          start_date: dateString(monthStart),
          end_date: dateString(yesterday),
          daily: "temperature_2m_max,temperature_2m_min,precipitation_sum",
          temperature_unit: "fahrenheit",
          precipitation_unit: "inch",
          timezone: "auto",
        });
        const historyRequest = fetch(
          `https://historical-forecast-api.open-meteo.com/v1/forecast?${historyParams}`,
          { signal: controller.signal },
        )
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null);

        const [weatherResponse, alertResponse, spcResponse, discussionResponse, historyResponse] = await Promise.all([
          weatherRequest,
          alertRequest,
          spcRequest,
          discussionRequest,
          historyRequest,
        ]);
        setWeather(weatherResponse);
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
  const nextTwelveHours = hourly.slice(0, 12);
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
  const todaySummary = weather
    ? `${currentInfo.label} now. High near ${Math.round(Number(weather.daily.temperature_2m_max[0]))}°. ${
        peakRainChance >= 20
          ? `Rain chances peak near ${peakRainChance}% around ${formatHour(peakRainHour.time)}.`
          : "Little precipitation is expected through the next 12 hours."
      } Winds may gust to ${Math.round(Number(weather.current.wind_gusts_10m))} mph.`
    : "";
  const historyLength = history?.daily.time?.length ?? 0;
  const yesterdayIndex = Math.max(0, historyLength - 1);
  const monthRain = history
    ? (history.daily.precipitation_sum as (number | string)[]).reduce(
        (sum, value) => sum + Number(value || 0),
        0,
      )
    : 0;
  const radarUrl = "https://radar.weather.gov/";
  const satelliteUrl =
    "https://www.star.nesdis.noaa.gov/GOES/sector_band.php?band=GEOCOLOR&length=24&sat=G19&sector=umv";
  const stationUrl = "https://tempestwx.com/station/38425/grid";

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Skyline Weather home">
          <span className="brand-mark">S</span>
          <span>Skyline Weather</span>
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
        <span className="data-source">Live data · Open‑Meteo</span>
      </header>

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

        {loading && !weather ? (
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
                    <div className="temperature">{Math.round(weather.current.temperature_2m)}°</div>
                    <h2>{currentInfo.label}</h2>
                    <p>Feels like {Math.round(weather.current.apparent_temperature)}°</p>
                  </div>
                </div>
                <div className="high-low">
                  <span>High <strong>{Math.round(Number(weather.daily.temperature_2m_max[0]))}°</strong></span>
                  <span className="divider" />
                  <span>Low <strong>{Math.round(Number(weather.daily.temperature_2m_min[0]))}°</strong></span>
                </div>
              </article>

              <div className="metrics-grid">
                <article className="metric-card">
                  <span className="metric-icon">💧</span>
                  <p>Humidity</p>
                  <strong>{Math.round(weather.current.relative_humidity_2m)}%</strong>
                  <small>Current relative humidity</small>
                </article>
                <article className="metric-card">
                  <span className="metric-icon">↗</span>
                  <p>Wind</p>
                  <strong>{Math.round(weather.current.wind_speed_10m)} <em>mph</em></strong>
                  <small>{windDirection(weather.current.wind_direction_10m)} · Gusts {Math.round(weather.current.wind_gusts_10m)} mph</small>
                </article>
                <article className="metric-card">
                  <span className="metric-icon">◔</span>
                  <p>Pressure</p>
                  <strong>{(weather.current.surface_pressure * 0.02953).toFixed(2)} <em>inHg</em></strong>
                  <small>Surface pressure</small>
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

            <section className="panel precip-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Planning ahead</p>
                  <h2>12-hour precipitation timeline</h2>
                </div>
                <span>Chance · expected amount</span>
              </div>
              <div className="precip-chart">
                {nextTwelveHours.map(({ time, index }, displayIndex) => {
                  const chance = Math.round(Number(weather.hourly.precipitation_probability[index]));
                  const amount = Number(weather.hourly.precipitation[index]);
                  return (
                    <div className="precip-column" key={time}>
                      <span className="precip-chance">{chance}%</span>
                      <div className="precip-track">
                        <span style={{ height: `${Math.max(4, chance)}%` }} />
                      </div>
                      <strong>{displayIndex === 0 ? "Now" : formatHour(time)}</strong>
                      <small>{amount > 0 ? `${amount.toFixed(2)}″` : "—"}</small>
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
                  {(weather.daily.time as string[]).map((day, index) => {
                    const code = Number(weather.daily.weather_code[index]);
                    return (
                      <div className="day-row" key={day}>
                        <strong>{formatDay(day, index)}</strong>
                        <div className="condition">
                          <WeatherMark code={code} />
                          <span>{weatherInfo(code).label}</span>
                        </div>
                        <span className="daily-rain">💧 {Math.round(Number(weather.daily.precipitation_probability_max[index]))}%</span>
                        <span className="temps">
                          <strong>{Math.round(Number(weather.daily.temperature_2m_max[index]))}°</strong>
                          <span>{Math.round(Number(weather.daily.temperature_2m_min[index]))}°</span>
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="history-strip">
                  <div>
                    <p className="eyebrow">Recent history</p>
                    <h2>Yesterday & this month</h2>
                  </div>
                  {history ? (
                    <div className="history-stats">
                      <span><small>Yesterday</small><strong>{Math.round(Number(history.daily.temperature_2m_max[yesterdayIndex]))}° / {Math.round(Number(history.daily.temperature_2m_min[yesterdayIndex]))}°</strong></span>
                      <span><small>Yesterday’s rain</small><strong>{Number(history.daily.precipitation_sum[yesterdayIndex]).toFixed(2)}″</strong></span>
                      <span><small>Month to date</small><strong>{monthRain.toFixed(2)}″ rain</strong></span>
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
                    <p>Open the official National Weather Service radar and choose your local view.</p>
                    <a href={radarUrl} target="_blank" rel="noreferrer">Open live radar <span>↗</span></a>
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
        ) : null}
      </div>

      <footer>
        <p>Forecast data from Open‑Meteo · Alerts and radar from the National Weather Service · Satellite imagery from NOAA</p>
        <p>Weather conditions can change quickly. Always follow official guidance during severe weather.</p>
      </footer>
    </main>
  );
}
