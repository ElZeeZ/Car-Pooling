import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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

const GoogleMapView = ({
  location,
  drivers,
  selectedDriver,
  onSelectDriver,
  destination,
  routePath,
  pickupRoutePath = [],
  passengerRequests = [],
  onAcceptPassengerRequest,
  onRejectPassengerRequest,
  manualMarkerMode,
  onMapClick,
  driverTripActive,
  driverHeading = 0,
  focusOnDriver = false,
  recenterSignal = 0
}) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerLayerRef = useRef(null);
  const routeLayerRef = useRef(null);
  const lastRecenterSignalRef = useRef(0);
  const lastFittedRouteKeyRef = useRef('');
  const callbacksRef = useRef({
    onAcceptPassengerRequest,
    onRejectPassengerRequest,
    onSelectDriver
  });

  useEffect(() => {
    callbacksRef.current = {
      onAcceptPassengerRequest,
      onRejectPassengerRequest,
      onSelectDriver
    };
  }, [onAcceptPassengerRequest, onRejectPassengerRequest, onSelectDriver]);

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
        title: 'Your car'
      })
        .bindPopup('Your car is on the active trip route')
        .addTo(markerLayer);
    } else {
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
        ${driver.eta} away, ${driver.seats} ${driver.seats === 1 ? 'seat' : 'seats'}
      `);
      marker.bindTooltip(
        `<strong>${driver.name}</strong><br />${driver.route}<br />${driver.eta} away, ${driver.seats} ${driver.seats === 1 ? 'seat' : 'seats'}`,
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
        title: request.pickup
      })
        .bindPopup(`
          <div class="map-request-popup">
            <strong>${request.passenger}</strong>
            <span>${request.pickup} to ${request.dropoff}</span>
            <small>${request.seats} ${request.seats === 1 ? 'seat' : 'seats'} requested</small>
            ${
              request.selected
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
      marker.addTo(markerLayer);
    });

    if (destination) {
      L.marker([destination.lat, destination.lng], {
        icon: destinationIcon,
        title: destination.label
      })
        .bindPopup(`<strong>Destination</strong><br />${destination.label}`)
        .addTo(markerLayer);
    }
  }, [
    destination,
    driverHeading,
    driverTripActive,
    drivers,
    location,
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

    if (!routePath?.length && !pickupRoutePath?.length) {
      lastFittedRouteKeyRef.current = '';
      return;
    }

    let primaryRoute = null;
    let primaryRouteKey = '';

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

    if (primaryRoute && primaryRouteKey !== lastFittedRouteKeyRef.current) {
      lastFittedRouteKeyRef.current = primaryRouteKey;
      map.fitBounds(primaryRoute.getBounds(), {
        paddingTopLeft: [40, 90],
        paddingBottomRight: [430, 70],
        maxZoom: 15
      });
    }
  }, [pickupRoutePath, routePath]);

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
