import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const formatMapCoordinates = (point) =>
  Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng))
    ? `Lat ${Number(point.lat).toFixed(5)}, Lng ${Number(point.lng).toFixed(5)}`
    : 'Lat/Lng unavailable';

const createCarIcon = (selected = false) =>
  L.divIcon({
    className: selected ? 'leaflet-car-marker selected' : 'leaflet-car-marker',
    html: `
      <span class="car-roof"></span>
      <span class="car-body"></span>
      <span class="car-wheel left"></span>
      <span class="car-wheel right"></span>
    `,
    iconSize: [76, 50],
    iconAnchor: [38, 25],
    popupAnchor: [0, -24]
  });

const createDriverCarIcon = (heading = 0) =>
  L.divIcon({
    className: 'leaflet-driver-marker',
    html: `
      <span class="driver-heading" style="transform: rotate(${heading}deg)">
        <span class="driver-car-hood"></span>
        <span class="driver-car-body"></span>
        <span class="driver-car-window"></span>
      </span>
    `,
    iconSize: [76, 76],
    iconAnchor: [38, 38],
    popupAnchor: [0, -36]
  });

const currentLocationIcon = L.divIcon({
  className: 'leaflet-current-marker',
  html: '<span></span>',
  iconSize: [26, 26],
  iconAnchor: [13, 13]
});

const createPassengerRequestIcon = (selected = false) =>
  L.divIcon({
    className: selected ? 'leaflet-passenger-marker selected' : 'leaflet-passenger-marker',
    html: `
      <span class="passenger-head"></span>
      <span class="passenger-body"></span>
    `,
    iconSize: [58, 72],
    iconAnchor: [29, 66],
    popupAnchor: [0, -62]
  });

const destinationIcon = L.divIcon({
  className: 'leaflet-destination-marker',
  html: '<span></span>',
  iconSize: [52, 64],
  iconAnchor: [26, 64],
  popupAnchor: [0, -62]
});

const passengerDropoffIcon = L.divIcon({
  className: 'leaflet-passenger-dropoff-marker',
  html: '<span></span>',
  iconSize: [52, 64],
  iconAnchor: [26, 64],
  popupAnchor: [0, -62]
});

const GoogleMapView = ({
  location,
  drivers,
  selectedDriver,
  onSelectDriver,
  destination,
  passengerDropoffMarkers = [],
  routePath,
  pickupRoutePath = [],
  requestPreviewRoutePath = [],
  passengerRequests = [],
  onAcceptPassengerRequest,
  onRejectPassengerRequest,
  onSelectPassengerRequest,
  manualMarkerMode,
  onMapClick,
  driverTripActive,
  driverHeading = 0,
  hideCurrentLocationMarker = false,
  focusOnDriver = false,
  recenterSignal = 0
}) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerLayerRef = useRef(null);
  const routeLayerRef = useRef(null);
  const lastRecenterSignalRef = useRef(0);
  const lastFittedRouteKeyRef = useRef('');
  const lastFittedPreviewRouteKeyRef = useRef('');
  const callbacksRef = useRef({
    onAcceptPassengerRequest,
    onRejectPassengerRequest,
    onSelectPassengerRequest,
    onSelectDriver
  });

  useEffect(() => {
    callbacksRef.current = {
      onAcceptPassengerRequest,
      onRejectPassengerRequest,
      onSelectPassengerRequest,
      onSelectDriver
    };
  }, [onAcceptPassengerRequest, onRejectPassengerRequest, onSelectDriver, onSelectPassengerRequest]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return undefined;
    }

    const map = L.map(containerRef.current, {
      center: [location.lat, location.lng],
      zoom: 14,
      zoomControl: false,
      attributionControl: true
    });

    L.control.zoom({ position: 'bottomleft' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    markerLayerRef.current = L.layerGroup().addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    window.setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      routeLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || recenterSignal === 0 || lastRecenterSignalRef.current === recenterSignal) {
      return;
    }

    lastRecenterSignalRef.current = recenterSignal;
    map.flyTo([location.lat, location.lng], Math.max(map.getZoom(), 16), {
      animate: true,
      duration: 0.7
    });
  }, [location.lat, location.lng, recenterSignal]);

  useEffect(() => {
    const map = mapRef.current;
    const markerLayer = markerLayerRef.current;

    if (!map || !markerLayer) {
      return;
    }

    markerLayer.clearLayers();

    if (driverTripActive) {
      L.marker([location.lat, location.lng], {
        icon: createDriverCarIcon(driverHeading),
        keyboard: false,
        title: 'Your car',
        zIndexOffset: 700
      })
        .bindPopup(`Your car is on the active trip route<br /><small>${formatMapCoordinates(location)}</small>`)
        .addTo(markerLayer);
    } else if (!hideCurrentLocationMarker) {
      L.marker([location.lat, location.lng], {
        icon: currentLocationIcon,
        keyboard: false,
        title: 'Your current location'
      })
        .bindPopup('Your current location')
        .addTo(markerLayer);
    }

    drivers.forEach((driver) => {
      const markerLat = driver.lat ?? location.lat + driver.offset.lat;
      const markerLng = driver.lng ?? location.lng + driver.offset.lng;
      const marker = L.marker([markerLat, markerLng], {
        icon: createCarIcon(selectedDriver?.id === driver.id),
        title: driver.name
      });

      marker.bindPopup(`
        <strong>${driver.name}</strong><br />
        ${driver.route}<br />
        ${driver.eta} away, ${driver.seats} ${driver.seats === 1 ? 'seat' : 'seats'}<br />
        Rating: ${driver.rating ? Number(driver.rating).toFixed(1) : 'N/A'}
      `);
      marker.bindTooltip(
        `<strong>${driver.name}</strong><br />${driver.route}<br />${driver.eta} away, ${driver.seats} ${driver.seats === 1 ? 'seat' : 'seats'}<br />Rating: ${driver.rating ? Number(driver.rating).toFixed(1) : 'N/A'}`,
        {
          direction: 'top',
          offset: [0, -24],
          opacity: 0.96
        }
      );
      marker.on('click', () => callbacksRef.current.onSelectDriver?.(driver));
      marker.addTo(markerLayer);
    });

    passengerRequests.forEach((request) => {
      const marker = L.marker([request.lat, request.lng], {
        icon: createPassengerRequestIcon(request.selected),
        keyboard: false,
        title: request.pickup,
        zIndexOffset: request.selected ? 1000 : 500
      })
        .bindPopup(`
          <div class="map-request-popup">
            <strong>${request.passenger}</strong>
            <span>${request.pickup} to ${request.dropoff}</span>
            <small>${request.seats} ${request.seats === 1 ? 'seat' : 'seats'} requested</small>
            <small>${request.markerNote ?? formatMapCoordinates(request)}</small>
            ${
              request.accepted
                ? ''
                : `<div class="map-popup-actions">
                    <button type="button" data-action="accept">Accept</button>
                    <button type="button" data-action="reject">Reject</button>
                  </div>`
            }
          </div>
        `);

      marker.on('popupopen', (event) => {
        const popupNode = event.popup.getElement();
        popupNode?.querySelector('[data-action="accept"]')?.addEventListener('click', () => {
          callbacksRef.current.onAcceptPassengerRequest?.(request);
          marker.closePopup();
        });
        popupNode?.querySelector('[data-action="reject"]')?.addEventListener('click', () => {
          callbacksRef.current.onRejectPassengerRequest?.(request.id);
          marker.closePopup();
        });
      });
      marker.on('click', () => callbacksRef.current.onSelectPassengerRequest?.(request));
      marker.addTo(markerLayer);
    });

    passengerDropoffMarkers.forEach((dropoff) => {
      if (!Number.isFinite(Number(dropoff.lat)) || !Number.isFinite(Number(dropoff.lng))) {
        return;
      }

      L.marker([dropoff.lat, dropoff.lng], {
        icon: passengerDropoffIcon,
        keyboard: false,
        title: dropoff.label,
        zIndexOffset: 650
      })
        .bindPopup(`
          <div class="map-request-popup">
            <strong>${dropoff.passenger}</strong>
            <span>Passenger drop-off</span>
            <small>${dropoff.label}</small>
            <small>${formatMapCoordinates(dropoff)}</small>
          </div>
        `)
        .addTo(markerLayer);
    });

    if (destination) {
      L.marker([destination.lat, destination.lng], {
        icon: destinationIcon,
        title: destination.label
      })
        .bindPopup(`<strong>Destination</strong><br />${destination.label}<br /><small>${formatMapCoordinates(destination)}</small>`)
        .addTo(markerLayer);
    }
  }, [
    destination,
    driverHeading,
    driverTripActive,
    drivers,
    hideCurrentLocationMarker,
    location,
    passengerDropoffMarkers,
    passengerRequests,
    selectedDriver
  ]);

  useEffect(() => {
    const map = mapRef.current;
    const routeLayer = routeLayerRef.current;

    if (!map || !routeLayer) {
      return;
    }

    routeLayer.clearLayers();

    if (!routePath?.length && !pickupRoutePath?.length && !requestPreviewRoutePath?.length) {
      lastFittedRouteKeyRef.current = '';
      lastFittedPreviewRouteKeyRef.current = '';
      return;
    }

    let primaryRoute = null;
    let primaryRouteKey = '';
    let previewRoute = null;
    let previewRouteKey = '';

    if (!requestPreviewRoutePath?.length) {
      lastFittedPreviewRouteKeyRef.current = '';
    }

    if (routePath?.length) {
      const points = routePath.map((point) => [point.lat, point.lng]);
      const firstPoint = routePath[0];
      const lastPoint = routePath[routePath.length - 1];
      primaryRouteKey = `${routePath.length}:${firstPoint.lat.toFixed(5)},${firstPoint.lng.toFixed(5)}:${lastPoint.lat.toFixed(5)},${lastPoint.lng.toFixed(5)}`;
      primaryRoute = L.polyline(points, {
        color: '#27667b',
        weight: 6,
        opacity: 0.86,
        lineJoin: 'round'
      }).addTo(routeLayer);
    }

    if (pickupRoutePath?.length) {
      const pickupPoints = pickupRoutePath.map((point) => [point.lat, point.lng]);
      L.polyline(pickupPoints, {
        color: '#c9342b',
        weight: 5,
        opacity: 0.9,
        dashArray: '8 8',
        lineJoin: 'round'
      }).addTo(routeLayer);
    }

    if (requestPreviewRoutePath?.length) {
      const previewPoints = requestPreviewRoutePath.map((point) => [point.lat, point.lng]);
      const firstPoint = requestPreviewRoutePath[0];
      const lastPoint = requestPreviewRoutePath[requestPreviewRoutePath.length - 1];
      previewRouteKey = `${requestPreviewRoutePath.length}:${firstPoint.lat.toFixed(5)},${firstPoint.lng.toFixed(5)}:${lastPoint.lat.toFixed(5)},${lastPoint.lng.toFixed(5)}`;
      previewRoute = L.polyline(previewPoints, {
        color: '#1d7ed0',
        weight: 5,
        opacity: 0.92,
        dashArray: '4 10',
        lineJoin: 'round'
      }).addTo(routeLayer);
    }

    if (previewRoute && previewRouteKey !== lastFittedPreviewRouteKeyRef.current) {
      lastFittedPreviewRouteKeyRef.current = previewRouteKey;
      map.fitBounds(previewRoute.getBounds(), {
        paddingTopLeft: [40, 90],
        paddingBottomRight: [430, 70],
        maxZoom: 15
      });
      return;
    }

    if (primaryRoute && primaryRouteKey !== lastFittedRouteKeyRef.current) {
      lastFittedRouteKeyRef.current = primaryRouteKey;
      map.fitBounds(primaryRoute.getBounds(), {
        paddingTopLeft: [40, 90],
        paddingBottomRight: [430, 70],
        maxZoom: 15
      });
    }
  }, [pickupRoutePath, requestPreviewRoutePath, routePath]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return undefined;
    }

    const handleClick = (event) => {
      if (manualMarkerMode) {
        onMapClick({
          lat: event.latlng.lat,
          lng: event.latlng.lng
        });
      }
    };

    map.on('click', handleClick);

    if (manualMarkerMode) {
      map.getContainer().classList.add('placing-marker');
    } else {
      map.getContainer().classList.remove('placing-marker');
    }

    return () => {
      map.off('click', handleClick);
      map.getContainer().classList.remove('placing-marker');
    };
  }, [manualMarkerMode, onMapClick]);

  return (
    <div className="map-viewport">
      <div ref={containerRef} className="leaflet-map" aria-label="Interactive ride map" />
    </div>
  );
};

export default GoogleMapView;
