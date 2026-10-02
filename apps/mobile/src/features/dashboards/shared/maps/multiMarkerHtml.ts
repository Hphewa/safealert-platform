import { LEAFLET_CSS_URL, LEAFLET_JS_URL, MAP_DEFAULT_ZOOM, MAP_HTML_ATTRIBUTION, MAP_MAX_ZOOM, MAP_MIN_ZOOM, MAP_TILE_URL } from './mapConfig';
import { isValidMapCoordinates, type MapCoordinates } from './types';

export type MultiMarkerLocation = MapCoordinates & { id: string; label?: string; color?: string };
export type MultiMarkerLocationPreviewProps = {
  locations: MultiMarkerLocation[]; height?: number; onMarkerSelect?: (id: string) => void;
  fitRequest?: number; accessibilityLabel?: string;
};
export function safeMapJson(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
export function createMultiMarkerHtml(locations: MultiMarkerLocation[]): string {
  const config = safeMapJson({
    locations: locations.filter(isValidMapCoordinates).map((item) => ({
      id: item.id, latitude: item.latitude, longitude: item.longitude, label: item.label ?? 'Report location',
      color: item.color && /^#[a-f\d]{6}$/i.test(item.color) ? item.color : '#2563eb'
    })), tileUrl: MAP_TILE_URL, attribution: MAP_HTML_ATTRIBUTION, defaultZoom: MAP_DEFAULT_ZOOM, minZoom: MAP_MIN_ZOOM, maxZoom: MAP_MAX_ZOOM
  });
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<link rel="stylesheet" href="${LEAFLET_CSS_URL}"/><style>html,body,#map{width:100%;height:100%;margin:0;background:#eef2f7}.safealert-marker{width:26px;height:26px;border:4px solid white;border-radius:50%;box-shadow:0 3px 8px #334155;box-sizing:border-box}.leaflet-control-attribution{font-size:10px}</style></head>
<body><div id="map"></div><script src="${LEAFLET_JS_URL}"></script><script>(function(){
var send=function(value){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(value));};
try{var config=${config};if(!window.L||!config.locations.length){send({type:'MAP_ERROR'});return;}
var points=config.locations.map(function(item){return [item.latitude,item.longitude];});
var map=L.map('map',{zoomControl:true,attributionControl:true}).setView(points[0],config.defaultZoom);
var tiles=L.tileLayer(config.tileUrl,{minZoom:config.minZoom,maxZoom:config.maxZoom,attribution:config.attribution});
tiles.on('tileerror',function(){send({type:'TILE_ERROR'});});tiles.addTo(map);
config.locations.forEach(function(item){var element=document.createElement('div');element.className='safealert-marker';element.style.backgroundColor=item.color;
var icon=L.divIcon({className:'',html:element,iconSize:[26,26],iconAnchor:[13,13]});
L.marker([item.latitude,item.longitude],{icon:icon,title:item.label,alt:item.label}).addTo(map).on('click',function(){send({type:'MARKER_SELECTED',id:item.id});});});
window.safealertFitMarkers=function(){map.invalidateSize(false);if(points.length===1)map.setView(points[0],config.defaultZoom);else map.fitBounds(points,{padding:[28,28],maxZoom:config.defaultZoom});};
window.safealertFitMarkers();setTimeout(window.safealertFitMarkers,80);send({type:'MAP_READY'});
}catch(error){send({type:'MAP_ERROR'});}})();</script></body></html>`;
}
