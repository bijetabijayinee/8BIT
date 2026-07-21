import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Loader2,
  MapPin,
  Moon,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { getWeather } from '../../api/client';

interface WeatherState {
  temperature: number;
  code: number;
  isDay: boolean;
  location: string;
}

// Fallback when geolocation is denied/unavailable. New Delhi keeps the widget useful
// out of the box; a granted location request replaces it with the user's local weather.
const FALLBACK = { latitude: 28.6139, longitude: 77.209, label: 'New Delhi' };

interface WmoDescriptor {
  label: string;
  day: LucideIcon;
  night: LucideIcon;
}

// Condensed WMO weather-code map (open-meteo `current.weather_code`).
function describeWeather(code: number): WmoDescriptor {
  if (code === 0) return { label: 'Clear', day: Sun, night: Moon };
  if (code <= 2) return { label: 'Partly cloudy', day: CloudSun, night: CloudMoon };
  if (code === 3) return { label: 'Overcast', day: Cloud, night: Cloud };
  if (code <= 48) return { label: 'Fog', day: CloudFog, night: CloudFog };
  if (code <= 57) return { label: 'Drizzle', day: CloudDrizzle, night: CloudDrizzle };
  if (code <= 67) return { label: 'Rain', day: CloudRain, night: CloudRain };
  if (code <= 77) return { label: 'Snow', day: CloudSnow, night: CloudSnow };
  if (code <= 82) return { label: 'Rain showers', day: CloudRain, night: CloudRain };
  if (code <= 86) return { label: 'Snow showers', day: CloudSnow, night: CloudSnow };
  return { label: 'Storms', day: CloudLightning, night: CloudLightning };
}

// Fetched through our own backend (see api/client.ts -> /api/weather), not directly
// from the browser. Open-Meteo is called server-side so the app's entire client-visible
// network footprint stays on a single origin - friendlier to corporate network policies
// that flag pages contacting unrecognized third-party domains.
async function fetchWeather(latitude: number, longitude: number, location: string): Promise<WeatherState> {
  const current = await getWeather(latitude, longitude);
  return {
    temperature: current.temperature,
    code: current.weatherCode,
    isDay: current.isDay,
    location,
  };
}

/**
 * A slim always-on clock + live weather pill for the top bar, sitting just before the
 * patient marquee. Weather comes from our backend's Open-Meteo proxy using the browser's
 * location, falling back to a default city when permission is denied.
 */
export function ClockWeatherWidget() {
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<WeatherState | null>(null);
  const [weatherError, setWeatherError] = useState(false);

  // Tick the clock every second.
  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  // Resolve location once, then refresh weather every 15 minutes.
  useEffect(() => {
    let mounted = true;
    let intervalId = 0;

    const start = (latitude: number, longitude: number, label: string) => {
      const refresh = async () => {
        try {
          const next = await fetchWeather(latitude, longitude, label);
          if (mounted) {
            setWeather(next);
            setWeatherError(false);
          }
        } catch {
          if (mounted && !weather) {
            setWeatherError(true);
          }
        }
      };
      void refresh();
      intervalId = window.setInterval(refresh, 15 * 60 * 1000);
    };

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (mounted) {
            start(position.coords.latitude, position.coords.longitude, 'Local weather');
          }
        },
        () => {
          if (mounted) {
            start(FALLBACK.latitude, FALLBACK.longitude, FALLBACK.label);
          }
        },
        { timeout: 8000, maximumAge: 10 * 60 * 1000 },
      );
    } else {
      start(FALLBACK.latitude, FALLBACK.longitude, FALLBACK.label);
    }

    return () => {
      mounted = false;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

  const descriptor = weather ? describeWeather(weather.code) : null;
  const WeatherIcon = descriptor ? (weather!.isDay ? descriptor.day : descriptor.night) : null;

  return (
    <div className="hidden shrink-0 items-center gap-2.5 rounded-full bg-white/5 px-3 py-1 text-white ring-1 ring-inset ring-white/10 md:flex">
      {/* clock */}
      <div className="flex items-baseline gap-1.5 leading-tight">
        <span className="font-mono text-xs font-semibold tabular-nums tracking-tight">{time}</span>
        <span className="text-[10px] text-slate-400">{date}</span>
      </div>

      <span className="h-4 w-px bg-white/10" aria-hidden="true" />

      {/* weather */}
      {descriptor && WeatherIcon ? (
        <div className="flex items-center gap-1.5" title={descriptor.label}>
          <WeatherIcon size={14} className="text-sky-300" aria-hidden="true" />
          <span className="text-xs font-semibold tabular-nums">{weather!.temperature}&deg;C</span>
          <span className="hidden items-center gap-0.5 text-[10px] text-slate-400 lg:inline-flex">
            <MapPin size={9} aria-hidden="true" />
            {descriptor.label}
          </span>
        </div>
      ) : weatherError ? (
        <span className="text-[10px] text-slate-400">Weather offline</span>
      ) : (
        <Loader2 size={13} className="animate-spin text-slate-400" aria-hidden="true" />
      )}
    </div>
  );
}
