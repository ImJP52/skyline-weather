# Cody Sky

Justin Cody’s responsive personal Des Moines weather dashboard. It starts in Johnston, Iowa and works for locations worldwide.

## Features

- Current conditions and “feels like” temperature
- Humidity, wind and gusts, pressure, and UV index
- Next 24 hours and 7-day forecast
- Sunrise and sunset
- Location search by city or ZIP code
- Active U.S. weather alerts from the National Weather Service
- A location-aware link to the official NWS radar
- Responsive layout for phones, tablets, and desktops

Forecasts and location search use the free [Open-Meteo API](https://open-meteo.com/). No API key is needed. U.S. alerts and radar are provided by the [National Weather Service](https://www.weather.gov/).

## Run locally

You need Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open the local address shown in the terminal. To confirm the production build:

```bash
npm run build
```

## Publish with GitHub Pages

The repository includes a GitHub Actions workflow that builds and publishes the static site automatically.

1. Push the project to the `main` branch of `ImJP52/skyline-weather`.
2. In GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, choose **GitHub Actions** as the source.
4. Open the **Actions** tab to watch the “Publish Skyline Weather” workflow.

After the first successful run, the site is available at:

`https://imjp52.github.io/skyline-weather/`

Future changes pushed to `main` are published automatically. No secrets or weather API keys are required.

## Notes

- NWS alerts are available only for locations served by the U.S. National Weather Service.
- Weather data can be delayed or unavailable during service interruptions.
- The radar button opens the official NWS radar centered on the selected location. A future version could embed a radar provider directly in the dashboard.
