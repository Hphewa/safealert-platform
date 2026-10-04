import {
  LEAFLET_CSS_URL,
  LEAFLET_JS_URL,
  MAP_DEFAULT_ZOOM,
  MAP_HTML_ATTRIBUTION,
  MAP_MAX_ZOOM,
  MAP_MIN_ZOOM,
  MAP_TILE_URL
} from './mapConfig';
import type { MapCoordinates } from './types';

type LeafletHtmlOptions = {
  coordinates: MapCoordinates;
  editable: boolean;
};

export function createLeafletMapHtml({ coordinates, editable }: LeafletHtmlOptions) {
  const config = JSON.stringify({
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    editable,
    tileUrl: MAP_TILE_URL,
    attribution: MAP_HTML_ATTRIBUTION,
    defaultZoom: MAP_DEFAULT_ZOOM,
    minZoom: MAP_MIN_ZOOM,
    maxZoom: MAP_MAX_ZOOM
  });

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="${LEAFLET_CSS_URL}" />
  <style>
    html, body, #map {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: #eef2f7;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .safealert-marker {
      width: 28px;
      height: 28px;
      border-radius: 999px;
      background: #2563eb;
      border: 4px solid #ffffff;
      box-shadow: 0 8px 18px rgba(15, 23, 42, 0.32);
      box-sizing: border-box;
    }
    .safealert-marker::after {
      content: "";
      position: absolute;
      left: 50%;
      bottom: -8px;
      width: 10px;
      height: 10px;
      transform: translateX(-50%) rotate(45deg);
      background: #2563eb;
      border-right: 3px solid #ffffff;
      border-bottom: 3px solid #ffffff;
      box-sizing: border-box;
    }
    .leaflet-control-attribution {
      font-size: 10px;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="${LEAFLET_JS_URL}"></script>
  <script>
    (function () {
      var config = ${config};
      var map;
      var marker;
      var tileErrorCount = 0;

      function post(message) {
        try {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify(message));
          }
        } catch (_error) {}
      }

      function valid(latitude, longitude) {
        return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
          Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
      }

      function emitLocation(latitude, longitude) {
        if (!valid(latitude, longitude)) {
          return;
        }

        post({
          type: 'location_changed',
          latitude: latitude,
          longitude: longitude
        });
      }

      function setLocation(latitude, longitude, options) {
        if (!valid(latitude, longitude) || !map || !marker) {
          return;
        }

        var next = [latitude, longitude];
        marker.setLatLng(next);

        if (options && options.recenter) {
          map.setView(next, Math.max(map.getZoom(), config.defaultZoom), { animate: true });
        }

        if (options && options.emit) {
          emitLocation(latitude, longitude);
        }
      }

      function receive(command) {
        if (!command || command.type !== 'set_location') {
          return;
        }

        setLocation(Number(command.latitude), Number(command.longitude), {
          recenter: command.recenter !== false,
          emit: false
        });
      }

      window.SafeAlertMap = { receive: receive };

      try {
        if (!window.L) {
          post({ type: 'map_error', message: 'Map library could not be loaded.' });
          return;
        }

        var start = [config.latitude, config.longitude];
        map = L.map('map', {
          zoomControl: true,
          attributionControl: true
        }).setView(start, config.defaultZoom);

        L.tileLayer(config.tileUrl, {
          minZoom: config.minZoom,
          maxZoom: config.maxZoom,
          attribution: config.attribution
        })
          .on('tileerror', function () {
            tileErrorCount += 1;
            if (tileErrorCount === 1 || tileErrorCount % 8 === 0) {
              post({ type: 'tile_error', message: 'Map tiles could not be loaded.' });
            }
          })
          .addTo(map);

        var hazardIcon = L.divIcon({
          className: '',
          html: '<div class="safealert-marker" aria-label="Hazard location"></div>',
          iconSize: [28, 36],
          iconAnchor: [14, 34]
        });

        marker = L.marker(start, {
          draggable: Boolean(config.editable),
          icon: hazardIcon,
          title: 'Hazard location'
        }).addTo(map);

        if (config.editable) {
          map.on('click', function (event) {
            setLocation(event.latlng.lat, event.latlng.lng, { recenter: false, emit: true });
          });

          marker.on('dragend', function () {
            var current = marker.getLatLng();
            emitLocation(current.lat, current.lng);
          });
        }

        setTimeout(function () {
          map.invalidateSize(false);
          post({ type: 'map_ready' });
        }, 80);
      } catch (error) {
        post({ type: 'map_error', message: 'Map could not be loaded.' });
      }
    })();
  </script>
</body>
</html>`;
}
