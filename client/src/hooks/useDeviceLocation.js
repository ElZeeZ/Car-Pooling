import { useCallback, useEffect, useRef, useState } from 'react';

const FALLBACK_LOCATION = {
  lat: 33.8938,
  lng: 35.5018
};

const MIN_LOCATION_UPDATE_MS = 3000;
const MIN_LOCATION_MOVE_METERS = 8;

const distanceBetweenMeters = (origin, destination) => {
  if (!origin || !destination) {
    return Number.POSITIVE_INFINITY;
  }

  const earthRadiusMeters = 6371000;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(destination.lat - origin.lat);
  const deltaLng = toRadians(destination.lng - origin.lng);
  const lat1 = toRadians(origin.lat);
  const lat2 = toRadians(destination.lat);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
};

export const useDeviceLocation = () => {
  const [location, setLocation] = useState(FALLBACK_LOCATION);
  const [status, setStatus] = useState('locating');
  const [error, setError] = useState('');
  const watchIdRef = useRef(null);
  const lastAcceptedLocationRef = useRef({
    location: FALLBACK_LOCATION,
    at: 0
  });

  const acceptLocation = useCallback((nextLocation, { force = false } = {}) => {
    const now = Date.now();
    const lastAccepted = lastAcceptedLocationRef.current;
    const movedEnough = distanceBetweenMeters(lastAccepted.location, nextLocation) >= MIN_LOCATION_MOVE_METERS;
    const timeElapsed = now - lastAccepted.at >= MIN_LOCATION_UPDATE_MS;

    if (force || !lastAccepted.at || movedEnough || timeElapsed) {
      lastAcceptedLocationRef.current = {
        location: nextLocation,
        at: now
      };
      setLocation(nextLocation);
      return nextLocation;
    }

    return lastAccepted.location;
  }, []);

  const setFallbackLocation = useCallback((message) => {
    lastAcceptedLocationRef.current = {
      location: FALLBACK_LOCATION,
      at: Date.now()
    };
    setLocation(FALLBACK_LOCATION);
    setStatus('fallback');
    setError(message);
    return FALLBACK_LOCATION;
  }, []);

  const keepLastKnownLocation = useCallback((message) => {
    const lastLocation = lastAcceptedLocationRef.current.location;

    if (lastAcceptedLocationRef.current.at) {
      setStatus('ready');
      setError(message);
      return lastLocation;
    }

    return setFallbackLocation('Location permission was not granted. Showing Beirut as the default map area.');
  }, [setFallbackLocation]);

  const requestLocation = useCallback(() => new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(setFallbackLocation('Device location is not supported in this browser.'));
      return;
    }

    setStatus('locating');
    setError('');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        const acceptedLocation = acceptLocation(nextLocation, { force: true });
        setStatus('ready');
        resolve(acceptedLocation);
      },
      () => {
        resolve(keepLastKnownLocation('Location update is delayed. Keeping your last known device position.'));
      },
      {
        enableHighAccuracy: true,
        timeout: 7000,
        maximumAge: 5000
      }
    );
  }), [acceptLocation, keepLastKnownLocation, setFallbackLocation]);

  useEffect(() => {
    if (!navigator.geolocation) {
      requestLocation();
      return undefined;
    }

    setStatus('locating');
    setError('');

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        acceptLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        setStatus('ready');
      },
      () => {
        keepLastKnownLocation('Location update is delayed. Keeping your last known device position.');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 3000
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [acceptLocation, keepLastKnownLocation, requestLocation]);

  return {
    location,
    status,
    error,
    refreshLocation: requestLocation
  };
};
