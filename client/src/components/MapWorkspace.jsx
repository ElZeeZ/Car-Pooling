import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/http.js';
import { useAuth } from '../context/AuthContext.jsx';
import { incomingRequests, nearbyDrivers } from '../data/mapDemoData.js';
import { useDeviceLocation } from '../hooks/useDeviceLocation.js';
import GoogleMapView from './GoogleMapView.jsx';

const toolbarLinks = [
  { label: 'Trips', path: '/trips' },
  { label: 'Bookings', path: '/bookings' },
  { label: 'Messages', path: '/messages' },
  { label: 'Wallet', path: '/wallet' },
  { label: 'Reports', path: '/reports' }
];

const LEBANON_SEARCH_VIEWBOX = '35.09,34.70,36.70,33.00';
const PICKUP_UNLOCK_METERS = 140;
const DROPOFF_UNLOCK_METERS = 160;
const DESTINATION_ARRIVAL_METERS = 50;
const MAX_PASSENGER_SEATS = 8;
const REMOTE_SYNC_INTERVAL_MS = 4000;
const DRIVER_LOCATION_PUSH_INTERVAL_MS = 4000;
const DRIVER_LOCATION_HEARTBEAT_MS = 15000;
const DRIVER_LOCATION_MIN_MOVE_METERS = 8;
const DRIVER_ROUTE_REFRESH_INTERVAL_MS = 7000;
const DRIVER_ROUTE_REFRESH_MIN_MOVE_METERS = 18;
const DRIVER_WORKSPACE_STORAGE_KEY = 'carpooling_driver_workspace';
const PASSENGER_WORKSPACE_STORAGE_KEY = 'carpooling_passenger_workspace';
const ACTIVE_BOOKING_STATUSES = ['accepted', 'picked_up', 'payment_due'];
const LIVE_BOOKING_STATUSES = ['pending', ...ACTIVE_BOOKING_STATUSES];
const passengerSeatOptions = Array.from({ length: MAX_PASSENGER_SEATS }, (_, index) => index + 1);

const workspaceStorageKey = (baseKey, userId) => `${baseKey}:${userId ?? 'guest'}`;

const sanitizeDriverWorkspace = (workspace) => {
  if (!workspace || ['arrived', 'routing'].includes(workspace.tripStatus)) {
    return null;
  }

  return workspace;
};

const readStoredDriverWorkspace = (userId) => {
  try {
    localStorage.removeItem(DRIVER_WORKSPACE_STORAGE_KEY);
    const storedWorkspace = localStorage.getItem(workspaceStorageKey(DRIVER_WORKSPACE_STORAGE_KEY, userId));
    return storedWorkspace ? sanitizeDriverWorkspace(JSON.parse(storedWorkspace)) : null;
  } catch {
    return null;
  }
};

const readStoredPassengerWorkspace = (userId) => {
  try {
    localStorage.removeItem(PASSENGER_WORKSPACE_STORAGE_KEY);
    const storedWorkspace = localStorage.getItem(workspaceStorageKey(PASSENGER_WORKSPACE_STORAGE_KEY, userId));
    return storedWorkspace ? JSON.parse(storedWorkspace) : null;
  } catch {
    return null;
  }
};

const prepareSoundSequence = (notes, volume = 0.08) => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;

    if (!AudioContext) {
      return () => {};
    }

    const context = new AudioContext();

    return async () => {
      if (context.state === 'suspended') {
        await context.resume();
      }

      const now = context.currentTime;
      const gain = context.createGain();
      gain.connect(context.destination);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);

      notes.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        oscillator.type = index === 0 ? 'sine' : 'triangle';
        oscillator.frequency.setValueAtTime(frequency, now + index * 0.11);
        oscillator.connect(gain);
        oscillator.start(now + index * 0.11);
        oscillator.stop(now + index * 0.11 + 0.28);
      });

      window.setTimeout(() => context.close(), 900);
    };
  } catch {
    return () => {};
  }
};

const prepareTripBeginSound = () => prepareSoundSequence([392, 523.25, 659.25], 0.08);
const prepareDestinationReachedSound = () => prepareSoundSequence([659.25, 587.33, 783.99], 0.07);
const prepareRequestSound = () => prepareSoundSequence([523.25, 659.25], 0.06);
const prepareIncomingRequestSound = () => prepareSoundSequence([349.23, 523.25, 698.46], 0.07);
const preparePickupSound = () => prepareSoundSequence([440, 554.37, 880], 0.07);
const prepareDropoffSound = () => prepareSoundSequence([880, 739.99, 587.33], 0.07);
const preparePaymentSound = () => prepareSoundSequence([659.25, 783.99, 1046.5], 0.07);
const preparePingSound = () => prepareSoundSequence([783.99, 659.25], 0.06);
const prepareMessageSound = () => prepareSoundSequence([587.33, 783.99], 0.05);
const prepareMapSound = () => prepareSoundSequence([329.63, 392], 0.04);
const prepareCancelSound = () => prepareSoundSequence([392, 311.13, 246.94], 0.07);

const formatSeatCount = (count) => `${count} ${Number(count) === 1 ? 'seat' : 'seats'}`;

const clampSeatValue = (value, maxSeats = MAX_PASSENGER_SEATS) => {
  const parsedValue = Number(value);
  const parsedMax = Number(maxSeats);
  const seatLimit = Number.isFinite(parsedMax) && parsedMax > 0 ? Math.floor(parsedMax) : MAX_PASSENGER_SEATS;
  const seats = Number.isFinite(parsedValue) && parsedValue > 0 ? Math.floor(parsedValue) : 1;

  return String(Math.min(Math.max(seats, 1), seatLimit));
};

const numberOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const hasPointCoordinates = (point) =>
  Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng));

const formatPointCoordinates = (point) =>
  hasPointCoordinates(point) ? `Lat ${Number(point.lat).toFixed(5)}, Lng ${Number(point.lng).toFixed(5)}` : 'Lat/Lng unavailable';

const pointKey = (point) =>
  hasPointCoordinates(point) ? `${Number(point.lat).toFixed(5)},${Number(point.lng).toFixed(5)}` : 'none';

const extractCoordinates = (value) => {
  const match = String(value ?? '').match(/(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/);

  if (!match) {
    return null;
  }

  return {
    lat: Number(match[1]),
    lng: Number(match[2])
  };
};

const tripToPassengerDriver = (trip, fallbackLocation) => {
  const driverLat = numberOrNull(trip.driver_current_lat) ?? numberOrNull(trip.origin_lat);
  const driverLng = numberOrNull(trip.driver_current_lng) ?? numberOrNull(trip.origin_lng);
  const parsedOrigin = extractCoordinates(trip.origin);
  const parsedDestination = extractCoordinates(trip.destination);
  const lat = driverLat ?? parsedOrigin?.lat ?? fallbackLocation.lat;
  const lng = driverLng ?? parsedOrigin?.lng ?? fallbackLocation.lng;
  const destinationLat = numberOrNull(trip.destination_lat) ?? parsedDestination?.lat ?? null;
  const destinationLng = numberOrNull(trip.destination_lng) ?? parsedDestination?.lng ?? null;
  const seats = Number(trip.remaining_seats ?? trip.available_seats ?? 0);
  const ratingAverage = Number(trip.rating_average ?? 4.8);

  return {
    id: `trip-${trip.trip_id}`,
    tripId: trip.trip_id,
    driverId: trip.driver_id,
    name: trip.driver_name,
    rating: Number.isFinite(ratingAverage) ? ratingAverage.toFixed(1) : '4.8',
    seats,
    vehicle: trip.vehicle_info ?? 'Registered vehicle',
    route: `${trip.origin} to ${trip.destination}`,
    eta: 'Live',
    lat,
    lng,
    destinationLat,
    destinationLng,
    destinationLabel: trip.destination,
    offset: {
      lat: lat - fallbackLocation.lat,
      lng: lng - fallbackLocation.lng
    }
  };
};

const bookingToDriverRequest = (booking, fallbackLocation) => {
  const pickupLat = numberOrNull(booking.pickup_lat);
  const pickupLng = numberOrNull(booking.pickup_lng);
  const parsedPickup = extractCoordinates(booking.pickup_location);
  const requestPoint = {
    lat: pickupLat ?? parsedPickup?.lat ?? fallbackLocation.lat,
    lng: pickupLng ?? parsedPickup?.lng ?? fallbackLocation.lng
  };
  const parsedDropoff = extractCoordinates(booking.dropoff_location);
  const distanceKm = distanceBetweenMeters(fallbackLocation, requestPoint) / 1000;

  return {
    id: `booking-${booking.booking_id}`,
    bookingId: booking.booking_id,
    passengerId: booking.passenger_id,
    passenger: booking.passenger_name,
    passengerEmail: booking.passenger_email,
    pickup: booking.pickup_location,
    dropoff: booking.dropoff_location,
    seats: Number(booking.seats_requested ?? 1),
    distance: `${Math.max(0.1, distanceKm).toFixed(1)} km`,
    lat: requestPoint.lat,
    lng: requestPoint.lng,
    source: 'database',
    status: booking.booking_status,
    dropoffLat: numberOrNull(booking.dropoff_lat) ?? parsedDropoff?.lat ?? null,
    dropoffLng: numberOrNull(booking.dropoff_lng) ?? parsedDropoff?.lng ?? null,
    paymentAmount: Number(booking.payment_amount ?? 0).toFixed(2),
    paymentMethod: booking.payment_method ?? 'cash',
    paymentStatus: booking.payment_status ?? 'pending',
    passengerTripKm: Number(booking.passenger_trip_km ?? 0),
    pickupDetourKm: Number(booking.pickup_detour_km ?? 0),
    paymentBaseAmount: Number(booking.payment_base_amount ?? 0),
    paymentDetourAmount: Number(booking.payment_detour_amount ?? 0)
  };
};

const bookingToPassengerRequest = (booking) => {
  const driverLat = numberOrNull(booking.driver_current_lat);
  const driverLng = numberOrNull(booking.driver_current_lng);
  const ratingAverage = Number(booking.rating_average ?? 4.8);

  return {
    localId: `booking-${booking.booking_id}`,
    bookingId: booking.booking_id,
    tripId: booking.trip_id,
    driverId: `trip-${booking.trip_id}`,
    driverName: booking.driver_name,
    route: `${booking.origin} to ${booking.destination}`,
    dropoff: booking.dropoff_location,
    dropoffLat: numberOrNull(booking.dropoff_lat),
    dropoffLng: numberOrNull(booking.dropoff_lng),
    pickupLat: numberOrNull(booking.pickup_lat),
    pickupLng: numberOrNull(booking.pickup_lng),
    seats: Number(booking.seats_requested ?? 1),
    status: booking.booking_status,
    paymentAmount: Number(booking.payment_amount ?? 0).toFixed(2),
    paymentMethod: booking.payment_method ?? 'cash',
    paymentStatus: booking.payment_status ?? 'pending',
    passengerTripKm: Number(booking.passenger_trip_km ?? 0),
    pickupDetourKm: Number(booking.pickup_detour_km ?? 0),
    paymentBaseAmount: Number(booking.payment_base_amount ?? 0),
    paymentDetourAmount: Number(booking.payment_detour_amount ?? 0),
    driver: {
      id: `trip-${booking.trip_id}`,
      tripId: booking.trip_id,
      name: booking.driver_name,
      rating: Number.isFinite(ratingAverage) ? ratingAverage.toFixed(1) : '4.8',
      seats: Number(booking.seats_requested ?? 1),
      vehicle: booking.vehicle_info ?? 'Registered vehicle',
      route: `${booking.origin} to ${booking.destination}`,
      eta: 'Live',
      lat: driverLat,
      lng: driverLng,
      destinationLat: numberOrNull(booking.destination_lat),
      destinationLng: numberOrNull(booking.destination_lng),
      destinationLabel: booking.destination,
      offset: { lat: 0, lng: 0 }
    }
  };
};

const bookingStatusToDriverPhase = (status) => {
  if (status === 'picked_up') {
    return 'riding';
  }

  if (status === 'payment_due') {
    return 'payment';
  }

  return 'pickup';
};

const calculateBearing = (origin, destination) => {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const toDegrees = (radians) => (radians * 180) / Math.PI;
  const lat1 = toRadians(origin.lat);
  const lat2 = toRadians(destination.lat);
  const deltaLng = toRadians(destination.lng - origin.lng);
  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);

  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
};

const PassengerPanel = ({
  destinationQuery,
  onDestinationQueryChange,
  destinationSuggestions,
  suggestionStatus,
  selectedDestination,
  onSuggestionSelect,
  manualMarkerMode,
  onManualMarkerToggle,
  onClearDestination,
  destinationConfirmed,
  onConfirmDestination,
  requestedSeats,
  onRequestedSeatsChange,
  drivers,
  selectedDriver,
  onSelectDriver,
  onRequestBooking,
  hasPendingRequest,
  activeBooking,
  paymentMethod,
  onPaymentMethodChange,
  driverRating,
  onDriverRatingChange,
  onPayBooking,
  paymentSubmitting,
  requestStatus
}) => (
  <aside className="map-side-panel">
    <div>
      <p className="eyebrow">Passenger Tools</p>
      <h2>Find a ride</h2>
    </div>

    <form className="compact-form" onSubmit={(event) => event.preventDefault()}>
      <label className="autocomplete-field">
        Destination
        <input
          value={destinationQuery}
          onChange={(event) => onDestinationQueryChange(event.target.value)}
          placeholder="Where are you going?"
          autoComplete="off"
          disabled={Boolean(activeBooking)}
        />
        {!activeBooking && destinationQuery.length >= 3 && (suggestionStatus !== 'idle' || destinationSuggestions.length > 0) ? (
          <div className="suggestion-menu">
            {suggestionStatus === 'loading' ? (
              <span className="suggestion-note">Searching nearby places...</span>
            ) : null}

            {destinationSuggestions.map((suggestion) => (
              <button
                type="button"
                key={suggestion.id}
                className="suggestion-item"
                onClick={() => onSuggestionSelect(suggestion)}
              >
                <strong>{suggestion.name}</strong>
                <span>{suggestion.address}</span>
                <small>{formatPointCoordinates(suggestion)}</small>
              </button>
            ))}

            {suggestionStatus === 'empty' ? (
              <span className="suggestion-note">No matching places in Lebanon found.</span>
            ) : null}
          </div>
        ) : null}
      </label>
      <div className="marker-action-row">
        <button
          type="button"
          className={manualMarkerMode ? 'ghost-button marker-mode active' : 'ghost-button marker-mode'}
          onClick={onManualMarkerToggle}
          disabled={Boolean(activeBooking)}
        >
          {manualMarkerMode ? 'Click map to set drop-off' : 'Place marker manually'}
        </button>
        <button
          type="button"
          className="ghost-button small-button danger-outline marker-clear-button"
          onClick={onClearDestination}
          disabled={Boolean(activeBooking) || !selectedDestination}
        >
          Remove
        </button>
      </div>
      {selectedDestination ? (
        <div className="selected-place">
          <strong>{destinationConfirmed ? 'Destination confirmed' : 'Destination selected'}</strong>
          <span>{selectedDestination.label}</span>
          <small>{formatPointCoordinates(selectedDestination)}</small>
        </div>
      ) : null}
      <label>
        Seats
        <select
          value={requestedSeats}
          onChange={(event) => onRequestedSeatsChange(event.target.value)}
          disabled={Boolean(activeBooking)}
        >
          {passengerSeatOptions.map((seatCount) => (
            <option value={seatCount} key={seatCount}>
              {seatCount} {seatCount === 1 ? 'passenger' : 'passengers'}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="primary-button"
        onClick={onConfirmDestination}
        disabled={Boolean(activeBooking) || !selectedDestination || destinationConfirmed}
      >
        {destinationConfirmed ? 'Destination confirmed' : 'Confirm destination'}
      </button>
    </form>

    {activeBooking ? (
      <div className="panel-block emphasis active-trip-card">
        <p className="eyebrow">Accepted trip</p>
        <h3>{activeBooking.driverName}</h3>
        <p>{activeBooking.dropoff}</p>
        <small>
          Booking #{activeBooking.bookingId} - {activeBooking.status === 'payment_due' ? 'payment due' : activeBooking.status}
        </small>

        {activeBooking.status === 'payment_due' ? (
          <div className="payment-choice">
            <strong>Payment due: ${activeBooking.paymentAmount}</strong>
            <label>
              Driver rating (optional)
              <select
                value={driverRating}
                onChange={(event) => onDriverRatingChange(event.target.value)}
                disabled={paymentSubmitting || activeBooking.paymentStatus === 'cash_pending'}
              >
                <option value="">No rating</option>
                {[1, 2, 3, 4, 5].map((rating) => (
                  <option value={rating} key={rating}>
                    {rating} {rating === 1 ? 'star' : 'stars'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Payment method
              <select
                value={paymentMethod}
                onChange={(event) => onPaymentMethodChange(event.target.value)}
                disabled={paymentSubmitting || activeBooking.paymentStatus === 'cash_pending'}
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
              </select>
            </label>
            <button
              type="button"
              className="primary-button"
              onClick={() => onPayBooking(activeBooking)}
              disabled={paymentSubmitting || activeBooking.paymentStatus === 'cash_pending'}
            >
              {activeBooking.paymentStatus === 'cash_pending'
                ? 'Awaiting driver confirmation'
                : paymentSubmitting
                  ? 'Processing payment...'
                  : 'Confirm payment'}
            </button>
            {requestStatus ? <small className="action-hint payment-status-text">{requestStatus}</small> : null}
          </div>
        ) : (
          <p className="action-hint">
            {requestStatus || 'Your booking is locked in. Stay on this trip until the driver cancels or the ride is completed.'}
          </p>
        )}
      </div>
    ) : (
      <>
    <div className="panel-block">
      <h3>Available nearby drivers</h3>
      <div className="driver-list">
        {drivers.length > 0 ? drivers.map((driver) => (
          <button
            type="button"
            key={driver.id}
            className={`driver-card ${selectedDriver?.id === driver.id ? 'selected' : ''}`}
            onClick={() => onSelectDriver(driver)}
          >
            <strong>{driver.name}</strong>
            <span>{driver.route}</span>
            <small>{driver.eta} away, {formatSeatCount(driver.seats)}, {driver.rating} rating</small>
          </button>
        )) : (
          <p className="empty-state compact">No nearby drivers have enough available seats.</p>
        )}
      </div>
    </div>

    <div className="panel-block emphasis">
      <h3>{selectedDriver ? selectedDriver.name : 'Select a driver'}</h3>
      <p>
        {selectedDriver
          ? `${selectedDriver.vehicle}. Request pickup and drop-off after confirming the route.`
          : 'Purple cars on the map represent active verified drivers in your vicinity.'}
      </p>
      <button
        type="button"
        className="primary-button"
        disabled={
          !selectedDriver ||
          !destinationConfirmed ||
          hasPendingRequest ||
          Number(requestedSeats) > Number(selectedDriver?.seats ?? 0)
        }
        onClick={onRequestBooking}
      >
        {hasPendingRequest ? 'Request sent' : 'Request booking'}
      </button>
      {requestStatus ? <small className="action-hint">{requestStatus}</small> : null}
    </div>
      </>
    )}
  </aside>
);

const DriverPanel = ({
  destinationQuery,
  onDestinationQueryChange,
  destinationSuggestions,
  suggestionStatus,
  selectedDestination,
  manualMarkerMode,
  onSuggestionSelect,
  onManualMarkerToggle,
  onClearDestination,
  seats,
  onSeatsChange,
  maxSeats,
  onActivateTrip,
  onPingPassenger,
  tripStatus,
  routeSummary,
  routeError,
  pendingRequests,
  acceptedRequest,
  passengerPingStatus,
  pickupRouteSummary,
  pickupRouteStatus,
  pickupRouteError,
  onAcceptRequest,
  onRejectRequest,
  onCancelBooking,
  onPickupPassenger,
  onPassengerDropoff,
  onConfirmPayment,
  tripDetails,
  bookingPhase,
  availableSeats,
  canPickupPassenger,
  canDropoffPassenger,
  pickupActionHint,
  dropoffActionHint,
  rideElapsed,
  pingCooldownSeconds
}) => (
  <aside className="map-side-panel">
    <div>
      <p className="eyebrow">Driver Tools</p>
      <h2>Manage ride</h2>
    </div>

    {tripStatus === 'active' || tripStatus === 'arrived' ? (
      <div className="compact-form trip-details-panel">
        <div>
          <p className="eyebrow">Trip details</p>
          <h3>{selectedDestination?.name ?? 'Active route'}</h3>
          <span>{selectedDestination?.label}</span>
          {selectedDestination ? <small className="action-hint">{formatPointCoordinates(selectedDestination)}</small> : null}
          <small className="action-hint">Available seats: {availableSeats}</small>
        </div>
        <div className="metric-grid">
          <div>
            <strong>{tripDetails.elapsed}</strong>
            <span>Trip time</span>
          </div>
          <div>
            <strong>{tripDetails.totalDistance}</strong>
            <span>Total route</span>
          </div>
          <div>
            <strong>{tripDetails.remainingDistance}</strong>
            <span>Remaining</span>
          </div>
          <div>
            <strong>{tripDetails.destinationEta}</strong>
            <span>Destination ETA</span>
          </div>
          <div>
            <strong>{tripDetails.passengerEta}</strong>
            <span>Passenger ETA</span>
          </div>
          <div>
            <strong>{tripDetails.distanceMoved}</strong>
            <span>Moved</span>
          </div>
        </div>
        <button
          type="button"
          className="primary-button trip-action-button cancel"
          onClick={onActivateTrip}
          disabled={tripStatus === 'arrived'}
        >
          {tripStatus === 'arrived' ? 'Destination arrived' : 'Cancel trip'}
        </button>
        {routeError ? <p className="inline-error">{routeError}</p> : null}
        {tripStatus === 'arrived' ? (
          <div className="route-summary arrived">
            <strong>Destination arrived</strong>
            <span>Trip closed. Returning to setup...</span>
          </div>
        ) : routeSummary ? (
          <div className="route-summary">
            <strong>Trip active</strong>
            <span>{routeSummary.distance} km, about {routeSummary.duration} min</span>
          </div>
        ) : null}
      </div>
    ) : (
      <form className="compact-form" onSubmit={onActivateTrip}>
        <label className="autocomplete-field">
          Destination
          <input
            value={destinationQuery}
            onChange={(event) => onDestinationQueryChange(event.target.value)}
            placeholder="Search destination"
            autoComplete="off"
          />
          {destinationQuery.length >= 3 && (suggestionStatus !== 'idle' || destinationSuggestions.length > 0) ? (
            <div className="suggestion-menu">
              {suggestionStatus === 'loading' ? (
                <span className="suggestion-note">Searching nearby places...</span>
              ) : null}

              {destinationSuggestions.map((suggestion) => (
                <button
                  type="button"
                  key={suggestion.id}
                  className="suggestion-item"
                  onClick={() => onSuggestionSelect(suggestion)}
                >
                  <strong>{suggestion.name}</strong>
                  <span>{suggestion.address}</span>
                  <small>{formatPointCoordinates(suggestion)}</small>
                </button>
              ))}

              {suggestionStatus === 'empty' ? (
                <span className="suggestion-note">No matching places in Lebanon found.</span>
              ) : null}
            </div>
          ) : null}
        </label>

        <div className="marker-action-row">
          <button
            type="button"
            className={manualMarkerMode ? 'ghost-button marker-mode active' : 'ghost-button marker-mode'}
            onClick={onManualMarkerToggle}
          >
            {manualMarkerMode ? 'Click map to place marker' : 'Place marker manually'}
          </button>
          <button
            type="button"
            className="ghost-button small-button danger-outline marker-clear-button"
            onClick={onClearDestination}
            disabled={!selectedDestination}
          >
            Remove
          </button>
        </div>

        {selectedDestination ? (
          <div className="selected-place">
            <strong>Destination selected</strong>
            <span>{selectedDestination.label}</span>
            <small>{formatPointCoordinates(selectedDestination)}</small>
          </div>
        ) : null}

        <label>
          Available seats
          <input
            type="number"
            min="1"
            max={maxSeats}
            value={seats}
            onChange={(event) => onSeatsChange(event.target.value)}
          />
          <small className="action-hint">Your registered vehicle allows up to {formatSeatCount(maxSeats)}.</small>
        </label>
        <button
          type="submit"
          className="primary-button trip-action-button"
          disabled={!selectedDestination || tripStatus === 'routing'}
        >
          {tripStatus === 'routing' ? 'Building route...' : 'Begin trip'}
        </button>

        {routeError ? <p className="inline-error">{routeError}</p> : null}
      </form>
    )}

    <div className="panel-block requests-panel">
      <h3>{acceptedRequest ? 'Accepted pickup' : 'Incoming requests'}</h3>
      {acceptedRequest ? (
        <article className="request-card accepted">
          <div>
            <strong>
              {acceptedRequest.passenger}
              {acceptedRequest.bookingId ? <span className="booking-reference">Booking #{acceptedRequest.bookingId}</span> : null}
            </strong>
            <span>{acceptedRequest.pickup} to {acceptedRequest.dropoff}</span>
            <small>
              {bookingPhase === 'payment'
                ? `Payment due: $${acceptedRequest.paymentAmount}`
                : pickupRouteStatus === 'routing'
                ? 'Loading pickup route...'
                : pickupRouteSummary
                  ? `${pickupRouteSummary.distance} km to pickup, about ${pickupRouteSummary.duration} min`
                  : `${acceptedRequest.distance}, ${formatSeatCount(acceptedRequest.seats)} requested`}
            </small>
            {bookingPhase === 'riding' || bookingPhase === 'payment' ? (
              <small>Ride time: {rideElapsed}</small>
            ) : null}
          </div>
          {pickupRouteError ? <p className="inline-error">{pickupRouteError}</p> : null}
          {bookingPhase === 'payment' ? (
            <div className="payment-choice">
              <strong>Payment due: ${acceptedRequest.paymentAmount}</strong>
              <small>
                {acceptedRequest.paymentStatus === 'cash_pending'
                  ? 'Passenger chose cash. Confirm once you collect it.'
                  : 'Passenger must choose cash or card on their account.'}
              </small>
              <button
                type="button"
                className="ghost-button small-button"
                onClick={() => onConfirmPayment('cash')}
                disabled={acceptedRequest.paymentStatus !== 'cash_pending'}
              >
                Confirm cash payment
              </button>
            </div>
          ) : (
            <div className="button-row vertical">
              <button
                type="button"
                className="ghost-button small-button"
                onClick={bookingPhase === 'pickup' ? onPickupPassenger : onPassengerDropoff}
                disabled={bookingPhase === 'pickup' ? !canPickupPassenger : !canDropoffPassenger}
              >
                {bookingPhase === 'pickup' ? 'Passenger picked up' : 'Passenger drop-off reached'}
              </button>
              {bookingPhase !== 'pickup' && dropoffActionHint ? (
                <small className="action-hint">{dropoffActionHint}</small>
              ) : null}
              <button type="button" className="ghost-button small-button danger-outline" onClick={onCancelBooking}>
                Cancel booking
              </button>
            </div>
          )}
        </article>
      ) : (
        <div className="request-list">
          {pendingRequests.length > 0 ? (
            pendingRequests.map((request) => (
              <article className="request-card" key={request.id}>
                <div>
                  <strong>{request.passenger}</strong>
                  <span>{request.pickup} to {request.dropoff}</span>
                  <small>{request.distance}, {formatSeatCount(request.seats)} requested</small>
                </div>
                <div className="button-row">
                  <button
                    type="button"
                    className="primary-button small-button"
                    onClick={() => onAcceptRequest(request)}
                    disabled={tripStatus !== 'active' || Number(request.seats) > Number(availableSeats)}
                  >
                    Accept
                  </button>
                  <button type="button" className="ghost-button small-button" onClick={() => onRejectRequest(request.id)}>
                    Reject
                  </button>
                </div>
              </article>
            ))
          ) : (
            <p className="empty-state compact">No pending passenger requests.</p>
          )}
        </div>
      )}
    </div>

    <div className="panel-block emphasis">
      <h3>Current ride status</h3>
      <p>
        {passengerPingStatus
          ? passengerPingStatus
          : acceptedRequest
          ? `Pickup route ready for ${acceptedRequest.passenger}.`
          : tripStatus === 'active'
            ? 'Trip is active. Accept a passenger request before sending a ping.'
            : 'Begin a trip to respond to passenger requests.'}
      </p>
      <button
        type="button"
        className="ghost-button"
        onClick={onPingPassenger}
        disabled={tripStatus !== 'active' || !acceptedRequest || bookingPhase !== 'pickup' || pingCooldownSeconds > 0}
      >
        {bookingPhase !== 'pickup' && acceptedRequest
          ? 'Passenger is on board'
          : pingCooldownSeconds > 0
            ? `Ping cooldown ${pingCooldownSeconds}s`
            : 'Ping passenger'}
      </button>
    </div>
  </aside>
);

const QuickMessageBox = ({
  passengerName,
  bookingId,
  messages,
  value,
  minimized,
  onChange,
  onSend,
  onToggle,
  onClose,
  onOpenMessages,
  unreadCount = 0
}) => (
  <section className={minimized ? 'quick-message-box minimized' : 'quick-message-box'}>
    {unreadCount > 0 ? <span className="unread-badge">{unreadCount}</span> : null}
    <div className="quick-message-header">
      <button type="button" className="quick-message-name" onClick={onOpenMessages}>
        {passengerName}
      </button>
      <span>{bookingId ? `Booking #${bookingId}` : 'Current booking'}</span>
      <button type="button" className="quick-message-toggle" onClick={onToggle}>
        {minimized ? 'Open' : 'Hide'}
      </button>
    </div>
    {!minimized ? (
      <>
        <div className="quick-message-list">
          {messages.length > 0 ? messages.map((message) => (
            <p className={message.sender === 'driver' ? 'message outgoing' : 'message incoming'} key={message.id}>
              {message.text}
            </p>
          )) : (
            <p className="empty-state compact">Quick messages for this pickup.</p>
          )}
        </div>
        <form className="quick-message-form" onSubmit={onSend}>
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Message passenger"
          />
          <button type="submit" className="primary-button small-button">
            Send
          </button>
        </form>
        <button type="button" className="ghost-button small-button" onClick={onClose}>
          Minimize
        </button>
      </>
    ) : null}
  </section>
);

const PassengerRequestsDock = ({ requests, onCancelRequest, onOpenMessages, unreadCount = 0 }) => {
  const acceptedTrip = requests.find((request) => ACTIVE_BOOKING_STATUSES.includes(request.status));

  return (
  <section className="passenger-activity-dock">
    {unreadCount > 0 ? <span className="unread-badge">{unreadCount}</span> : null}
    <div className="quick-message-header">
      <strong>{acceptedTrip ? 'Accepted trip' : 'Sent requests'}</strong>
      <span>{acceptedTrip ? `Booking #${acceptedTrip.bookingId}` : `${requests.length} active`}</span>
    </div>
    <div className="sent-request-list">
      {requests.map((request) => (
        <article className="sent-request-card" key={request.localId}>
          <div>
            <strong>{request.driverName}</strong>
            <span>{request.dropoff}</span>
            <small>
              {request.bookingId ? `Booking #${request.bookingId}` : 'Pending request'} -{' '}
              {request.status === 'payment_due' ? 'payment due' : request.status}
            </small>
          </div>
          {request.status === 'pending' ? (
            <button
              type="button"
              className="ghost-button small-button danger-outline"
              onClick={() => onCancelRequest(request)}
            >
              Cancel request
            </button>
          ) : null}
          {ACTIVE_BOOKING_STATUSES.includes(request.status) ? (
            <button type="button" className="ghost-button small-button" onClick={onOpenMessages}>
              Message driver
            </button>
          ) : null}
        </article>
      ))}
    </div>
  </section>
  );
};

const formatSuggestion = (item) => {
  const addressParts = [item.address?.road, item.address?.suburb, item.address?.city, item.address?.town, item.address?.country]
    .filter(Boolean)
    .filter((part, index, parts) => parts.indexOf(part) === index);

  return {
    id: item.place_id,
    name: item.name || item.display_name.split(',')[0],
    address: addressParts.length > 0 ? addressParts.join(', ') : item.display_name,
    label: item.display_name,
    lat: Number(item.lat),
    lng: Number(item.lon)
  };
};

const searchLebanonPlaces = async (query, signal) => {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    addressdetails: '1',
    limit: '6',
    extratags: '1',
    namedetails: '1',
    countrycodes: 'lb',
    viewbox: LEBANON_SEARCH_VIEWBOX,
    bounded: '1'
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    signal,
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error('Place search failed.');
  }

  return (await response.json()).map(formatSuggestion);
};

const createStraightFallbackRoute = (origin, destination) => [
  origin,
  {
    lat: (origin.lat + destination.lat) / 2,
    lng: (origin.lng + destination.lng) / 2
  },
  destination
];

const metersToKm = (meters) => (meters / 1000).toFixed(1);
const secondsToMinutes = (seconds) => Math.max(1, Math.round(seconds / 60));
const formatElapsed = (seconds) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
};

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

const formatDistanceText = (meters) => {
  if (!Number.isFinite(meters)) {
    return 'distance unavailable';
  }

  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km away` : `${Math.round(meters)} m away`;
};

const buildEligibleRequests = (origin, availableSeats) =>
  incomingRequests
    .filter((request) => Number(request.seats) <= Number(availableSeats))
    .map((request) => ({
      ...request,
      lat: origin.lat + request.pickupOffset.lat,
      lng: origin.lng + request.pickupOffset.lng
    }));

const getRequestPoint = (origin, request) => ({
  lat: request.lat ?? origin.lat + (request.pickupOffset?.lat ?? 0),
  lng: request.lng ?? origin.lng + (request.pickupOffset?.lng ?? 0)
});

const createDemoDriverRoute = (origin, driver) => {
  const carPoint = {
    lat: origin.lat + driver.offset.lat,
    lng: origin.lng + driver.offset.lng
  };
  const routeEnd = {
    lat: origin.lat + driver.offset.lat * 1.35,
    lng: origin.lng + driver.offset.lng * 1.35
  };

  return [
    carPoint,
    {
      lat: (origin.lat + carPoint.lat) / 2 + 0.0012,
      lng: (origin.lng + carPoint.lng) / 2 - 0.001
    },
    origin,
    {
      lat: (origin.lat + routeEnd.lat) / 2,
      lng: (origin.lng + routeEnd.lng) / 2
    },
    routeEnd
  ];
};

const parseKm = (value, fallback = 0) => {
  const parsedValue = Number(String(value ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
};

const calculatePaymentBreakdown = ({ passengerTripKm, seatsRequested = 1 }) => {
  const tripKm = Math.max(0, Number(passengerTripKm) || 0);
  const seats = Math.max(1, Math.floor(Number(seatsRequested) || 1));
  const baseFare = 0.5;
  const subtotal = baseFare + tripKm;
  const passengerMultiplier = 1 + (seats - 1) * 0.5;
  const amount = subtotal * passengerMultiplier;

  return {
    passengerTripKm: Number(tripKm.toFixed(2)),
    pickupDetourKm: 0,
    baseAmount: Number((baseFare + tripKm).toFixed(2)),
    detourAmount: 0,
    total: amount.toFixed(2)
  };
};

const logPaymentCalculation = ({ booking, surface = 'payment option', loggedKeys }) => {
  if (!booking?.bookingId) {
    return;
  }

  const key = `${surface}:${booking.bookingId}`;

  if (loggedKeys?.has(key)) {
    return;
  }

  loggedKeys?.add(key);

  const passengerDistanceKm = Math.max(0, Number(booking.passengerTripKm) || 0);
  const seats = Math.max(1, Math.floor(Number(booking.seats) || 1));
  const basePrice = 0.5;
  const subtotal = basePrice + passengerDistanceKm;
  const extraPassengerMultiplier = 1 + (seats - 1) * 0.5;
  const calculatedTotal = subtotal * extraPassengerMultiplier;
  const chargedAmount = Number(booking.paymentAmount ?? calculatedTotal);

  console.info(`[Payment calculation] ${surface} appeared for booking #${booking.bookingId}`);
  console.info(
    `[Payment calculation] 0.50 base + ${passengerDistanceKm.toFixed(2)} passenger km = ${subtotal.toFixed(2)}`
  );

  if (seats > 1) {
    console.info(
      `[Payment calculation] ${seats} passengers: ${subtotal.toFixed(2)} x ${extraPassengerMultiplier.toFixed(
        2
      )} = ${calculatedTotal.toFixed(2)}`
    );
  }

  console.info('[Payment calculation] Breakdown', {
    bookingId: booking.bookingId,
    basePrice,
    passengerDistanceKm,
    driverDeviationKm: 0,
    subtotal: Number(subtotal.toFixed(2)),
    seats,
    extraPassengerMultiplier,
    calculatedTotal: Number(calculatedTotal.toFixed(2)),
    chargedAmount: Number.isFinite(chargedAmount) ? Number(chargedAmount.toFixed(2)) : booking.paymentAmount
  });
};

const estimatePaymentAmount = (routeSummary, seatsRequested = 1) =>
  calculatePaymentBreakdown({
    passengerTripKm: parseKm(routeSummary?.distance, 2),
    seatsRequested
  }).total;

const toDatabaseDateTime = (date = new Date()) => date.toISOString().slice(0, 19).replace('T', ' ');

const fetchDrivingRoute = async (origin, destination) => {
  const endpoint = [
    'https://router.project-osrm.org/route/v1/driving',
    `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`
  ].join('/');
  const params = new URLSearchParams({
    overview: 'full',
    geometries: 'geojson',
    steps: 'false'
  });
  const response = await fetch(`${endpoint}?${params}`);

  if (!response.ok) {
    throw new Error('Routing service unavailable.');
  }

  const data = await response.json();
  const route = data.routes?.[0];

  if (!route) {
    throw new Error('No route found.');
  }

  return {
    path: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
    distanceMeters: route.distance,
    summary: {
      distance: metersToKm(route.distance),
      duration: secondsToMinutes(route.duration)
    }
  };
};

const estimateRouteDistanceKm = async (origin, destination, fallbackKm = 0) => {
  if (!hasPointCoordinates(origin) || !hasPointCoordinates(destination)) {
    return fallbackKm;
  }

  try {
    const route = await fetchDrivingRoute(origin, destination);
    return Number((route.distanceMeters / 1000).toFixed(2));
  } catch {
    const directDistanceKm = distanceBetweenMeters(origin, destination) / 1000;
    return Number((Number.isFinite(directDistanceKm) ? directDistanceKm : fallbackKm).toFixed(2));
  }
};

const MapWorkspace = ({ role }) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { location, status, error, refreshLocation } = useDeviceLocation();
  const latestLocationRef = useRef(location);
  const lastDriverLocationPushRef = useRef({
    tripId: null,
    location: null,
    at: 0
  });
  const lastDriverRouteRefreshRef = useRef({
    location: null,
    targetKey: '',
    pickupKey: '',
    phase: ''
  });
  const lastPassengerRouteRefreshRef = useRef({
    location: null,
    targetKey: '',
    pickupKey: '',
    status: '',
    bookingId: null
  });
  const loggedPaymentOptionsRef = useRef(new Set());
  const workspaceUserId = user?.id ?? user?.email ?? 'guest';
  const driverWorkspaceStorageKey = workspaceStorageKey(DRIVER_WORKSPACE_STORAGE_KEY, workspaceUserId);
  const passengerWorkspaceStorageKey = workspaceStorageKey(PASSENGER_WORKSPACE_STORAGE_KEY, workspaceUserId);
  const initialDriverWorkspace = useMemo(
    () => (role === 'driver' ? readStoredDriverWorkspace(workspaceUserId) : null),
    [role, workspaceUserId]
  );
  const initialPassengerWorkspace = useMemo(
    () => (role === 'passenger' ? readStoredPassengerWorkspace(workspaceUserId) : null),
    [role, workspaceUserId]
  );
  const [selectedDriver, setSelectedDriver] = useState(
    () => (role === 'passenger' ? initialPassengerWorkspace?.selectedDriver ?? null : null)
  );
  const [passengerDestinationQuery, setPassengerDestinationQuery] = useState(
    () => initialPassengerWorkspace?.passengerDestinationQuery ?? ''
  );
  const [passengerDestinationSuggestions, setPassengerDestinationSuggestions] = useState([]);
  const [passengerSuggestionStatus, setPassengerSuggestionStatus] = useState('idle');
  const [selectedPassengerDestination, setSelectedPassengerDestination] = useState(
    () => initialPassengerWorkspace?.selectedPassengerDestination ?? null
  );
  const [passengerManualMarkerMode, setPassengerManualMarkerMode] = useState(
    () => initialPassengerWorkspace?.passengerManualMarkerMode ?? false
  );
  const [passengerDestinationConfirmed, setPassengerDestinationConfirmed] = useState(
    () => initialPassengerWorkspace?.passengerDestinationConfirmed ?? false
  );
  const [requestedSeats, setRequestedSeats] = useState(() => initialPassengerWorkspace?.requestedSeats ?? '1');
  const [passengerRequestStatus, setPassengerRequestStatus] = useState(
    () => initialPassengerWorkspace?.passengerRequestStatus ?? ''
  );
  const [sentPassengerRequests, setSentPassengerRequests] = useState(
    () => initialPassengerWorkspace?.sentPassengerRequests ?? []
  );
  const sentPassengerRequestsRef = useRef(sentPassengerRequests);
  const previousPassengerActiveBookingRef = useRef(
    sentPassengerRequests.find((request) => ACTIVE_BOOKING_STATUSES.includes(request.status))?.bookingId ?? null
  );
  const driverRestoredRef = useRef(false);
  const [activeDriverTrips, setActiveDriverTrips] = useState([]);
  const [passengerPaymentMethod, setPassengerPaymentMethod] = useState(
    () => initialPassengerWorkspace?.passengerPaymentMethod ?? 'cash'
  );
  const [passengerDriverRating, setPassengerDriverRating] = useState(
    () => initialPassengerWorkspace?.passengerDriverRating ?? ''
  );
  const [passengerPaymentSubmitting, setPassengerPaymentSubmitting] = useState(false);
  const [recenterSignal, setRecenterSignal] = useState(0);
  const hasAutoRelocatedRef = useRef(false);
  const [destinationQuery, setDestinationQuery] = useState(() => initialDriverWorkspace?.destinationQuery ?? '');
  const [destinationSuggestions, setDestinationSuggestions] = useState([]);
  const [suggestionStatus, setSuggestionStatus] = useState('idle');
  const [selectedDestination, setSelectedDestination] = useState(() => initialDriverWorkspace?.selectedDestination ?? null);
  const [manualMarkerMode, setManualMarkerMode] = useState(() => initialDriverWorkspace?.manualMarkerMode ?? false);
  const [seats, setSeats] = useState(() => initialDriverWorkspace?.seats ?? '3');
  const [activeTripId, setActiveTripId] = useState(() => initialDriverWorkspace?.activeTripId ?? null);
  const [tripStartedAt, setTripStartedAt] = useState(() => initialDriverWorkspace?.tripStartedAt ?? null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [routePath, setRoutePath] = useState(() =>
    role === 'driver' ? initialDriverWorkspace?.routePath ?? [] : initialPassengerWorkspace?.routePath ?? []
  );
  const routePathRef = useRef(routePath);
  const [routeSummary, setRouteSummary] = useState(() => initialDriverWorkspace?.routeSummary ?? null);
  const [tripStatus, setTripStatus] = useState(() => initialDriverWorkspace?.tripStatus ?? 'idle');
  const [routeError, setRouteError] = useState(() => initialDriverWorkspace?.routeError ?? '');
  const [driverHeading, setDriverHeading] = useState(() => initialDriverWorkspace?.driverHeading ?? 0);
  const [driverRouteLeg, setDriverRouteLeg] = useState({ phase: '', targetKey: '' });
  const [pendingRequests, setPendingRequests] = useState(() => initialDriverWorkspace?.pendingRequests ?? []);
  const pendingRequestsRef = useRef(pendingRequests);
  const [acceptedRequest, setAcceptedRequest] = useState(() => initialDriverWorkspace?.acceptedRequest ?? null);
  const [bookingPhase, setBookingPhase] = useState(() => initialDriverWorkspace?.bookingPhase ?? 'idle');
  const [passengerPingStatus, setPassengerPingStatus] = useState(() => initialDriverWorkspace?.passengerPingStatus ?? '');
  const [pickupRoutePath, setPickupRoutePath] = useState(() =>
    role === 'driver' ? initialDriverWorkspace?.pickupRoutePath ?? [] : initialPassengerWorkspace?.pickupRoutePath ?? []
  );
  const pickupRoutePathRef = useRef(pickupRoutePath);
  const [pickupRouteSummary, setPickupRouteSummary] = useState(() => initialDriverWorkspace?.pickupRouteSummary ?? null);
  const [pickupRouteStatus, setPickupRouteStatus] = useState(() => initialDriverWorkspace?.pickupRouteStatus ?? 'idle');
  const [pickupRouteError, setPickupRouteError] = useState(() => initialDriverWorkspace?.pickupRouteError ?? '');
  const [quickChatOpen, setQuickChatOpen] = useState(false);
  const [quickChatMinimized, setQuickChatMinimized] = useState(false);
  const [quickChatText, setQuickChatText] = useState('');
  const [quickChatMessages, setQuickChatMessages] = useState([]);
  const [driverUnreadMessages, setDriverUnreadMessages] = useState(0);
  const [passengerUnreadMessages, setPassengerUnreadMessages] = useState(0);
  const [pingCooldownUntil, setPingCooldownUntil] = useState(0);
  const [cooldownTick, setCooldownTick] = useState(0);
  const [passengerPickedUpAt, setPassengerPickedUpAt] = useState(() => initialDriverWorkspace?.passengerPickedUpAt ?? null);

  useEffect(() => {
    latestLocationRef.current = location;
  }, [location.lat, location.lng]);

  useEffect(() => {
    if (status !== 'ready' || hasAutoRelocatedRef.current) {
      return undefined;
    }

    hasAutoRelocatedRef.current = true;
    const timer = window.setTimeout(() => {
      setRecenterSignal((signal) => signal + 1);
    }, 150);

    return () => {
      window.clearTimeout(timer);
    };
  }, [status]);

  useEffect(() => {
    sentPassengerRequestsRef.current = sentPassengerRequests;
  }, [sentPassengerRequests]);

  useEffect(() => {
    routePathRef.current = routePath;
  }, [routePath]);

  useEffect(() => {
    pendingRequestsRef.current = pendingRequests;
  }, [pendingRequests]);

  useEffect(() => {
    pickupRoutePathRef.current = pickupRoutePath;
  }, [pickupRoutePath]);

  const title = role === 'driver' ? 'Driver map' : 'Passenger map';
  const welcomeName = user?.full_name ?? user?.email ?? 'user';
  const maxDriverSeats = Math.max(
    1,
    Math.min(MAX_PASSENGER_SEATS, Number(user?.available_seats ?? MAX_PASSENGER_SEATS) || MAX_PASSENGER_SEATS)
  );

  useEffect(() => {
    if (role === 'driver') {
      setSeats((currentSeats) => clampSeatValue(currentSeats, maxDriverSeats));
    }
  }, [maxDriverSeats, role]);

  const handleDriverSeatsChange = useCallback(
    (value) => {
      setSeats(clampSeatValue(value, maxDriverSeats));
    },
    [maxDriverSeats]
  );

  const handlePassengerRequestedSeatsChange = useCallback((value) => {
    setRequestedSeats(clampSeatValue(value, MAX_PASSENGER_SEATS));
  }, []);

  const passengerDrivers = useMemo(
    () =>
      activeDriverTrips
        .map((trip) => tripToPassengerDriver(trip, location))
        .filter((driver) => Number(driver.seats) >= Number(requestedSeats)),
    [activeDriverTrips, location, requestedSeats]
  );
  const selectedDriverPendingRequest = useMemo(
    () =>
      sentPassengerRequests.find(
        (request) => request.driverId === selectedDriver?.id && request.status === 'pending'
      ),
    [selectedDriver?.id, sentPassengerRequests]
  );
  const activePassengerBooking = useMemo(
    () => sentPassengerRequests.find((request) => ACTIVE_BOOKING_STATUSES.includes(request.status)) ?? null,
    [sentPassengerRequests]
  );
  const passengerBookingLocked = Boolean(activePassengerBooking);
  const passengerOnBoard =
    role === 'passenger' && ['picked_up', 'payment_due'].includes(activePassengerBooking?.status);
  const activePassengerDriverPoint = useMemo(() => {
    if (!activePassengerBooking?.driver) {
      return location;
    }

    return hasPointCoordinates(activePassengerBooking.driver)
      ? {
          lat: Number(activePassengerBooking.driver.lat),
          lng: Number(activePassengerBooking.driver.lng)
        }
      : location;
  }, [activePassengerBooking, location]);
  const mapLocation = passengerOnBoard ? activePassengerDriverPoint : location;
  const mapDrivers = useMemo(
    () => (role === 'passenger' ? (activePassengerBooking && selectedDriver ? [selectedDriver] : passengerDrivers) : []),
    [activePassengerBooking, passengerDrivers, role, selectedDriver]
  );
  const passengerRequestMarkers = useMemo(() => {
    if (role !== 'driver') {
      return [];
    }

    const sourceRequests = acceptedRequest ? (bookingPhase === 'pickup' ? [acceptedRequest] : []) : pendingRequests;

    return sourceRequests.map((request) => ({
      ...request,
      ...getRequestPoint(location, request),
      selected: acceptedRequest?.id === request.id
    }));
  }, [acceptedRequest, bookingPhase, location.lat, location.lng, pendingRequests, role]);
  const passengerDropoffMarkers = useMemo(() => {
    if (role !== 'driver') {
      return [];
    }

    const sourceRequests = acceptedRequest ? [acceptedRequest] : pendingRequests;

    return sourceRequests
      .map((request) => {
        const parsedDropoff = extractCoordinates(request.dropoff);
        const dropoffPoint =
          hasPointCoordinates({ lat: request.dropoffLat, lng: request.dropoffLng })
            ? {
                lat: Number(request.dropoffLat),
                lng: Number(request.dropoffLng)
              }
            : parsedDropoff;

        if (!dropoffPoint) {
          return null;
        }

        return {
          id: `${request.id}-dropoff`,
          passenger: request.passenger,
          label: request.dropoff,
          lat: dropoffPoint.lat,
          lng: dropoffPoint.lng
        };
      })
      .filter(Boolean);
  }, [acceptedRequest, pendingRequests, role]);
  const acceptedPickupPoint = useMemo(
    () => (acceptedRequest ? getRequestPoint(location, acceptedRequest) : null),
    [acceptedRequest, location]
  );
  const acceptedDropoffPoint = useMemo(
    () =>
      acceptedRequest?.dropoffLat && acceptedRequest?.dropoffLng
        ? {
            lat: acceptedRequest.dropoffLat,
            lng: acceptedRequest.dropoffLng
          }
        : selectedDestination,
    [acceptedRequest, selectedDestination]
  );
  const pickupDistanceMeters = useMemo(
    () => distanceBetweenMeters(location, acceptedPickupPoint),
    [acceptedPickupPoint, location]
  );
  const dropoffDistanceMeters = useMemo(
    () => distanceBetweenMeters(location, acceptedDropoffPoint),
    [acceptedDropoffPoint, location]
  );
  const destinationDistanceMeters = useMemo(
    () => distanceBetweenMeters(location, selectedDestination),
    [location, selectedDestination]
  );
  const mainDestinationLegReady =
    bookingPhase === 'idle' &&
    driverRouteLeg.phase === 'idle' &&
    driverRouteLeg.targetKey === pointKey(selectedDestination);
  const canPickupPassenger = bookingPhase === 'pickup' && pickupDistanceMeters <= PICKUP_UNLOCK_METERS;
  const canDropoffPassenger = bookingPhase === 'riding' && dropoffDistanceMeters <= DROPOFF_UNLOCK_METERS;
  const pickupActionHint = canPickupPassenger ? 'Pickup area reached.' : '';
  const dropoffActionHint = canDropoffPassenger ? 'Drop-off area reached.' : '';
  const pingCooldownSeconds = Math.max(0, Math.ceil((pingCooldownUntil - Date.now()) / 1000));
  const rideElapsed = passengerPickedUpAt
    ? formatElapsed(Math.max(0, Math.floor((Date.now() - passengerPickedUpAt + cooldownTick * 0) / 1000)))
    : '00:00';
  const tripDetails = useMemo(() => {
    const totalDistance = routeSummary?.distance ? `${routeSummary.distance} km` : '0.0 km';
    const destinationEta = routeSummary?.duration ? `${routeSummary.duration} min` : 'N/A';
    const passengerEta = pickupRouteSummary?.duration ? `${pickupRouteSummary.duration} min` : 'N/A';
    const remainingDistance = routeSummary?.distance ? `${routeSummary.distance} km` : 'N/A';

    return {
      elapsed: formatElapsed(elapsedSeconds),
      totalDistance,
      remainingDistance,
      destinationEta,
      passengerEta,
      distanceMoved: '0.0 km'
    };
  }, [elapsedSeconds, pickupRouteSummary, routeSummary]);

  useEffect(() => {
    if (role !== 'driver') {
      return;
    }

    const workspaceSnapshot = {
      destinationQuery,
      selectedDestination,
      manualMarkerMode,
      seats,
      activeTripId,
      tripStartedAt,
      routePath,
      routeSummary,
      tripStatus,
      routeError,
      driverHeading,
      pendingRequests,
      acceptedRequest,
      bookingPhase,
      passengerPickedUpAt,
      passengerPingStatus,
      pickupRoutePath,
      pickupRouteSummary,
      pickupRouteStatus,
      pickupRouteError
    };

    localStorage.setItem(driverWorkspaceStorageKey, JSON.stringify(workspaceSnapshot));
  }, [
    acceptedRequest,
    activeTripId,
    bookingPhase,
    destinationQuery,
    driverHeading,
    manualMarkerMode,
    passengerPingStatus,
    passengerPickedUpAt,
    pendingRequests,
    pickupRouteError,
    pickupRoutePath,
    pickupRouteStatus,
    pickupRouteSummary,
    role,
    routeError,
    routePath,
    routeSummary,
    seats,
    selectedDestination,
    tripStartedAt,
    tripStatus,
    driverWorkspaceStorageKey
  ]);

  useEffect(() => {
    if (role !== 'passenger') {
      return;
    }

    const workspaceSnapshot = {
      passengerDestinationQuery,
      selectedPassengerDestination,
      passengerManualMarkerMode,
      passengerDestinationConfirmed,
      selectedDriver,
      routePath,
      pickupRoutePath,
      requestedSeats,
      passengerRequestStatus,
      passengerPaymentMethod,
      passengerDriverRating,
      sentPassengerRequests
    };

    localStorage.setItem(passengerWorkspaceStorageKey, JSON.stringify(workspaceSnapshot));
  }, [
    passengerDestinationConfirmed,
    passengerDestinationQuery,
    passengerManualMarkerMode,
    passengerPaymentMethod,
    passengerDriverRating,
    passengerRequestStatus,
    pickupRoutePath,
    requestedSeats,
    routePath,
    role,
    selectedDriver,
    selectedPassengerDestination,
    sentPassengerRequests,
    passengerWorkspaceStorageKey
  ]);

  useEffect(() => {
    if (role !== 'passenger') {
      return undefined;
    }

    let isMounted = true;

    const loadActiveDriverTrips = async () => {
      try {
        const payload = await api.get(`/trips/active?minSeats=${requestedSeats}`);

        if (isMounted) {
          setActiveDriverTrips(payload.trips ?? []);
        }
      } catch {
        if (isMounted) {
          setActiveDriverTrips([]);
        }
      }
    };

    loadActiveDriverTrips();
    const timer = window.setInterval(loadActiveDriverTrips, REMOTE_SYNC_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, [requestedSeats, role]);

  useEffect(() => {
    if (role !== 'passenger') {
      return undefined;
    }

    let isMounted = true;

    const loadPassengerBookings = async () => {
      try {
        const currentLocation = latestLocationRef.current;
        const payload = await api.get('/bookings');
        const allBookings = payload.bookings ?? [];
        const bookingsById = new Map(allBookings.map((booking) => [Number(booking.booking_id), booking]));
        const activeBookings = allBookings
          .filter((booking) => LIVE_BOOKING_STATUSES.includes(booking.booking_status))
          .map(bookingToPassengerRequest);

        if (!isMounted) {
          return;
        }

        const liveIds = new Set(activeBookings.map((request) => Number(request.bookingId)));
        const removedByCancel = sentPassengerRequestsRef.current.some(
          (request) => {
            if (!request.bookingId || liveIds.has(Number(request.bookingId))) {
              return false;
            }

            const latestBooking = bookingsById.get(Number(request.bookingId));
            return latestBooking ? ['cancelled', 'rejected'].includes(latestBooking.booking_status) : false;
          }
        );
        const newlyAcceptedBooking = activeBookings.find(
          (request) =>
            ACTIVE_BOOKING_STATUSES.includes(request.status) &&
            previousPassengerActiveBookingRef.current !== Number(request.bookingId)
        );

        setSentPassengerRequests(activeBookings);

        const activeBooking = activeBookings.find((request) => ACTIVE_BOOKING_STATUSES.includes(request.status));

        if (activeBooking) {
          previousPassengerActiveBookingRef.current = Number(activeBooking.bookingId);
          const dropoffPoint =
            hasPointCoordinates({ lat: activeBooking.dropoffLat, lng: activeBooking.dropoffLng })
              ? {
                  lat: Number(activeBooking.dropoffLat),
                  lng: Number(activeBooking.dropoffLng)
                }
              : currentLocation;
          setSelectedDriver(activeBooking.driver);
          setSelectedPassengerDestination({
            id: `booking-dropoff-${activeBooking.bookingId}`,
            name: 'Booking drop-off',
            label: activeBooking.dropoff,
            address: activeBooking.dropoff,
            lat: dropoffPoint.lat,
            lng: dropoffPoint.lng
          });
          setPassengerDestinationQuery(activeBooking.dropoff);
          setPassengerManualMarkerMode(false);
          setPassengerDestinationConfirmed(true);
          setRequestedSeats(String(activeBooking.seats));
          const driverPoint =
            hasPointCoordinates(activeBooking.driver)
              ? {
                  lat: Number(activeBooking.driver.lat),
                  lng: Number(activeBooking.driver.lng)
                }
              : currentLocation;
          const pickupPoint =
            hasPointCoordinates({ lat: activeBooking.pickupLat, lng: activeBooking.pickupLng })
              ? {
                  lat: Number(activeBooking.pickupLat),
                  lng: Number(activeBooking.pickupLng)
                }
              : currentLocation;
          const driverPickupDistance = distanceBetweenMeters(driverPoint, pickupPoint);

          if (activeBooking.paymentStatus === 'cash_pending') {
            setPassengerRequestStatus('Cash selected. Wait for the driver to confirm that payment was collected.');
          } else if (activeBooking.status === 'payment_due') {
            logPaymentCalculation({
              booking: activeBooking,
              surface: 'passenger payment option',
              loggedKeys: loggedPaymentOptionsRef.current
            });
            setPassengerRequestStatus('Ride complete. Choose cash or card to finish payment.');
          } else if (activeBooking.status === 'picked_up') {
            setPassengerRequestStatus(`You have been picked up by ${activeBooking.driverName}. Wait until the driver reaches your destination.`);
          } else if (driverPickupDistance <= PICKUP_UNLOCK_METERS) {
            setPassengerRequestStatus('Driver arrived at your pickup area. Wait for pickup confirmation.');
          } else {
            setPassengerRequestStatus('Driver accepted your booking. You are locked into this trip.');
          }

          if (newlyAcceptedBooking) {
            const playRequestSound = prepareRequestSound();
            playRequestSound();
          }

          const driverDestination =
            hasPointCoordinates({
              lat: activeBooking.driver.destinationLat,
              lng: activeBooking.driver.destinationLng
            })
              ? {
                  lat: Number(activeBooking.driver.destinationLat),
                  lng: Number(activeBooking.driver.destinationLng)
                }
              : dropoffPoint;
          const passengerOnRide = ['picked_up', 'payment_due'].includes(activeBooking.status);
          const routeTarget = passengerOnRide ? dropoffPoint : driverDestination;
          const pickupTarget = passengerOnRide ? null : pickupPoint;
          const lastRefresh = lastPassengerRouteRefreshRef.current;
          const movedEnough =
            !lastRefresh.location ||
            distanceBetweenMeters(lastRefresh.location, driverPoint) >= DRIVER_ROUTE_REFRESH_MIN_MOVE_METERS;
          const targetKey = pointKey(routeTarget);
          const pickupKey = pointKey(pickupTarget);

          const shouldRefreshRoutes =
            Boolean(newlyAcceptedBooking) ||
            routePathRef.current.length === 0 ||
            (!passengerOnRide && pickupRoutePathRef.current.length === 0) ||
            movedEnough ||
            lastRefresh.bookingId !== Number(activeBooking.bookingId) ||
            lastRefresh.status !== activeBooking.status ||
            lastRefresh.targetKey !== targetKey ||
            lastRefresh.pickupKey !== pickupKey;

          if (shouldRefreshRoutes) {
            lastPassengerRouteRefreshRef.current = {
              location: driverPoint,
              targetKey,
              pickupKey,
              status: activeBooking.status,
              bookingId: Number(activeBooking.bookingId)
            };

            try {
              const driverRoute = await fetchDrivingRoute(driverPoint, routeTarget);
              if (isMounted) {
                setRoutePath(driverRoute.path);
              }
            } catch {
              if (isMounted) {
                setRoutePath(createStraightFallbackRoute(driverPoint, routeTarget));
              }
            }

            if (pickupTarget) {
              try {
                const pickupRoute = await fetchDrivingRoute(driverPoint, pickupTarget);
                if (isMounted) {
                  setPickupRoutePath(pickupRoute.path);
                }
              } catch {
                if (isMounted) {
                  setPickupRoutePath(createStraightFallbackRoute(driverPoint, pickupTarget));
                }
              }
            } else if (isMounted) {
              setPickupRoutePath([]);
            }
          }
        } else {
          previousPassengerActiveBookingRef.current = null;
          lastPassengerRouteRefreshRef.current = {
            location: null,
            targetKey: '',
            pickupKey: '',
            status: '',
            bookingId: null
          };

          if (activeBookings.length === 0 && sentPassengerRequestsRef.current.length > 0) {
            setSelectedDriver(null);
            setRoutePath([]);
            setPickupRoutePath([]);
            setPassengerDestinationConfirmed(false);
            setPassengerRequestStatus('');
          }
        }

        if (removedByCancel) {
          const playCancelSound = prepareCancelSound();
          playCancelSound();
        } else {
          const completedBooking = sentPassengerRequestsRef.current.find((request) => {
            if (!request.bookingId || liveIds.has(Number(request.bookingId))) {
              return false;
            }

            const latestBooking = bookingsById.get(Number(request.bookingId));
            return latestBooking?.booking_status === 'completed';
          });

          if (completedBooking) {
            const playPaymentSound = preparePaymentSound();
            playPaymentSound();
            setPassengerRequestStatus('Payment completed. Trip finished.');
          }
        }
      } catch {
        // Keep the local request dock visible if polling fails briefly.
      }
    };

    loadPassengerBookings();
    const timer = window.setInterval(loadPassengerBookings, REMOTE_SYNC_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, [role]);

  useEffect(() => {
    if (role !== 'driver' || driverRestoredRef.current) {
      return undefined;
    }

    let isMounted = true;
    driverRestoredRef.current = true;

    const restoreDriverRide = async () => {
      try {
        const [tripsPayload, bookingsPayload] = await Promise.all([api.get('/trips'), api.get('/bookings')]);
        const activeTrip = (tripsPayload.trips ?? []).find((trip) => trip.trip_status === 'active');

        if (!isMounted || !activeTrip) {
          if (isMounted && (tripStatus !== 'idle' || activeTripId)) {
            setTripStatus('idle');
            setActiveTripId(null);
            setTripStartedAt(null);
            setSelectedDestination(null);
            setDestinationQuery('');
            setManualMarkerMode(false);
            setAcceptedRequest(null);
            setPendingRequests([]);
            setBookingPhase('idle');
            setRoutePath([]);
            setRouteSummary(null);
            setRouteError('');
            setPickupRoutePath([]);
            setPickupRouteSummary(null);
            setPickupRouteStatus('idle');
            setPickupRouteError('');
            setPassengerPickedUpAt(null);
            setPassengerPingStatus('');
          }

          return;
        }

        const destinationPoint = {
          id: `trip-destination-${activeTrip.trip_id}`,
          name: 'Trip destination',
          label: activeTrip.destination,
          address: activeTrip.destination,
          lat: numberOrNull(activeTrip.destination_lat) ?? location.lat,
          lng: numberOrNull(activeTrip.destination_lng) ?? location.lng
        };
        const driverPoint = {
          lat: numberOrNull(activeTrip.driver_current_lat) ?? numberOrNull(activeTrip.origin_lat) ?? location.lat,
          lng: numberOrNull(activeTrip.driver_current_lng) ?? numberOrNull(activeTrip.origin_lng) ?? location.lng
        };
        const activeBooking = (bookingsPayload.bookings ?? []).find(
          (booking) =>
            Number(booking.trip_id) === Number(activeTrip.trip_id) &&
            ACTIVE_BOOKING_STATUSES.includes(booking.booking_status)
        );
        const pending = (bookingsPayload.bookings ?? [])
          .filter(
            (booking) =>
              Number(booking.trip_id) === Number(activeTrip.trip_id) &&
              booking.booking_status === 'pending' &&
              Number(booking.seats_requested ?? 1) <= Number(activeTrip.available_seats)
          )
          .map((booking) => bookingToDriverRequest(booking, driverPoint));

        setSelectedDestination(destinationPoint);
        setDestinationQuery(activeTrip.destination);
        setSeats(clampSeatValue(activeTrip.available_seats ?? 1, maxDriverSeats));
        setActiveTripId(activeTrip.trip_id);
        setTripStartedAt(Date.parse(activeTrip.trip_time) || Date.now());
        setTripStatus('active');
        setRouteError('');

        try {
          const restoredRoute = await fetchDrivingRoute(driverPoint, destinationPoint);
          if (isMounted) {
            setRoutePath(restoredRoute.path);
            setRouteSummary(restoredRoute.summary);
          }
        } catch {
          if (isMounted) {
            setRoutePath(createStraightFallbackRoute(driverPoint, destinationPoint));
            setRouteSummary(null);
          }
        }

        if (activeBooking) {
          const restoredRequest = bookingToDriverRequest(activeBooking, driverPoint);
          const pickupPoint = getRequestPoint(driverPoint, restoredRequest);
          setAcceptedRequest(restoredRequest);
          setBookingPhase(bookingStatusToDriverPhase(activeBooking.booking_status));
          setPendingRequests([]);

          try {
            const restoredPickupRoute = await fetchDrivingRoute(driverPoint, pickupPoint);
            if (isMounted) {
              setPickupRoutePath(restoredPickupRoute.path);
              setPickupRouteSummary(restoredPickupRoute.summary);
              setPickupRouteStatus('ready');
            }
          } catch {
            if (isMounted) {
              setPickupRoutePath(createStraightFallbackRoute(driverPoint, pickupPoint));
              setPickupRouteSummary(null);
              setPickupRouteStatus('ready');
            }
          }
        } else {
          setAcceptedRequest(null);
          setBookingPhase('idle');
          setPendingRequests(pending);
        }
      } catch {
        // Live polling continues to handle transient API gaps.
      }
    };

    restoreDriverRide();

    return () => {
      isMounted = false;
    };
  }, [activeTripId, location.lat, location.lng, maxDriverSeats, role, tripStatus]);

  useEffect(() => {
    if (role !== 'driver' || tripStatus !== 'active' || !activeTripId || acceptedRequest) {
      return undefined;
    }

    let isMounted = true;

    const loadPendingBookings = async () => {
      try {
        const currentLocation = latestLocationRef.current;
        const payload = await api.get('/bookings');
        const nextRequests = (payload.bookings ?? [])
          .filter(
            (booking) =>
              Number(booking.trip_id) === Number(activeTripId) &&
              booking.booking_status === 'pending' &&
              Number(booking.seats_requested ?? 1) <= Number(seats)
          )
          .map((booking) => bookingToDriverRequest(booking, currentLocation));

        if (isMounted) {
          const existingRequestIds = new Set(pendingRequestsRef.current.map((request) => request.id));
          const hasNewRequest = nextRequests.some((request) => !existingRequestIds.has(request.id));

          if (hasNewRequest) {
            const playIncomingRequestSound = prepareIncomingRequestSound();
            playIncomingRequestSound();
          }

          setPendingRequests(nextRequests);
        }
      } catch {
        if (isMounted) {
          setPendingRequests([]);
        }
      }
    };

    loadPendingBookings();
    const timer = window.setInterval(loadPendingBookings, REMOTE_SYNC_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, [acceptedRequest, activeTripId, role, seats, tripStatus]);

  useEffect(() => {
    if (role !== 'driver' || !acceptedRequest?.bookingId) {
      return undefined;
    }

    let isMounted = true;

    const syncAcceptedBooking = async () => {
      try {
        const payload = await api.get('/bookings');
        const booking = (payload.bookings ?? []).find(
          (item) => Number(item.booking_id) === Number(acceptedRequest.bookingId)
        );

        if (!isMounted || !booking) {
          return;
        }

        if (booking.booking_status === 'completed') {
          const playPaymentSound = preparePaymentSound();
          playPaymentSound();
          setPickupRoutePath([]);
          setPickupRouteSummary(null);
          setPickupRouteStatus('idle');
          setPickupRouteError('');
          setAcceptedRequest(null);
          setBookingPhase('idle');
          setPassengerPingStatus(`Booking #${acceptedRequest.bookingId} completed. Continue to your destination.`);
          setQuickChatOpen(false);
          setQuickChatMinimized(false);
          setQuickChatMessages([]);
          setQuickChatText('');
          setPassengerPickedUpAt(null);
          setPingCooldownUntil(0);
          return;
        }

        if (['cancelled', 'rejected'].includes(booking.booking_status)) {
          setAcceptedRequest(null);
          setBookingPhase('idle');
          setPickupRoutePath([]);
          setPickupRouteSummary(null);
          setPickupRouteStatus('idle');
          setPickupRouteError('');
          return;
        }

        if (ACTIVE_BOOKING_STATUSES.includes(booking.booking_status)) {
          setAcceptedRequest((currentRequest) =>
            currentRequest
              ? {
                  ...currentRequest,
                  status: booking.booking_status,
                  paymentAmount: Number(booking.payment_amount ?? currentRequest.paymentAmount ?? 0).toFixed(2),
                  paymentMethod: booking.payment_method ?? currentRequest.paymentMethod ?? 'cash',
                  paymentStatus: booking.payment_status ?? currentRequest.paymentStatus ?? 'pending',
                  passengerTripKm: Number(booking.passenger_trip_km ?? currentRequest.passengerTripKm ?? 0),
                  pickupDetourKm: Number(booking.pickup_detour_km ?? currentRequest.pickupDetourKm ?? 0),
                  paymentBaseAmount: Number(booking.payment_base_amount ?? currentRequest.paymentBaseAmount ?? 0),
                  paymentDetourAmount: Number(booking.payment_detour_amount ?? currentRequest.paymentDetourAmount ?? 0)
                }
              : currentRequest
          );
          if (booking.booking_status === 'payment_due') {
            logPaymentCalculation({
              booking: {
                bookingId: booking.booking_id,
                seats: booking.seats_requested,
                passengerTripKm: booking.passenger_trip_km,
                pickupDetourKm: booking.pickup_detour_km,
                paymentAmount: booking.payment_amount
              },
              surface: 'driver payment option',
              loggedKeys: loggedPaymentOptionsRef.current
            });
          }
          setBookingPhase(bookingStatusToDriverPhase(booking.booking_status));
        }
      } catch {
        // Keep the local accepted state during short API interruptions.
      }
    };

    syncAcceptedBooking();
    const timer = window.setInterval(syncAcceptedBooking, REMOTE_SYNC_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, [acceptedRequest?.bookingId, role]);

  useEffect(() => {
    if (role !== 'driver' || !acceptedRequest?.bookingId || bookingPhase !== 'pickup') {
      setDriverUnreadMessages(0);
      setQuickChatOpen(false);
      setQuickChatMinimized(false);
      return undefined;
    }

    let isMounted = true;
    let hasLoadedMessages = false;
    let lastSeenMessageId = 0;

    const loadQuickMessages = async () => {
      try {
        const payload = await api.get(`/messages/booking/${acceptedRequest.bookingId}`);
        const mappedMessages = (payload.messages ?? []).map((message) => ({
          id: message.message_id,
          sender: message.sender_type,
          text: message.message_text
        }));
        const maxMessageId = Math.max(0, ...mappedMessages.map((message) => Number(message.id) || 0));

        if (hasLoadedMessages) {
          const incomingMessages = mappedMessages.filter(
            (message) => (Number(message.id) || 0) > lastSeenMessageId && message.sender !== 'driver'
          );

          if (incomingMessages.length > 0 && isMounted) {
            setDriverUnreadMessages((currentCount) => currentCount + incomingMessages.length);
            setQuickChatOpen(true);
            setQuickChatMinimized(false);
            const playMessageSound = prepareMessageSound();
            playMessageSound();
          }
        } else {
          hasLoadedMessages = true;
        }

        lastSeenMessageId = Math.max(lastSeenMessageId, maxMessageId);

        if (isMounted) {
          setQuickChatMessages(mappedMessages);
        }
      } catch {
        // The full messages page will surface any connection issue.
      }
    };

    loadQuickMessages();
    const timer = window.setInterval(loadQuickMessages, 1500);

    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, [acceptedRequest?.bookingId, bookingPhase, role]);

  useEffect(() => {
    if (role !== 'passenger' || !activePassengerBooking?.bookingId) {
      setPassengerUnreadMessages(0);
      return undefined;
    }

    let isMounted = true;
    let hasLoadedMessages = false;
    let lastSeenMessageId = 0;

    const loadPassengerMessages = async () => {
      try {
        const payload = await api.get(`/messages/booking/${activePassengerBooking.bookingId}`);
        const messages = payload.messages ?? [];
        const maxMessageId = Math.max(0, ...messages.map((message) => Number(message.message_id) || 0));

        if (hasLoadedMessages) {
          const incomingMessages = messages.filter(
            (message) => (Number(message.message_id) || 0) > lastSeenMessageId && message.sender_type !== 'passenger'
          );

          if (incomingMessages.length > 0 && isMounted) {
            setPassengerUnreadMessages((currentCount) => currentCount + incomingMessages.length);
            const playMessageSound = prepareMessageSound();
            playMessageSound();
          }
        } else {
          hasLoadedMessages = true;
        }

        lastSeenMessageId = Math.max(lastSeenMessageId, maxMessageId);
      } catch {
        // Keep the live booking dock available during brief message polling gaps.
      }
    };

    loadPassengerMessages();
    const timer = window.setInterval(loadPassengerMessages, 1500);

    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, [activePassengerBooking?.bookingId, role]);

  useEffect(() => {
    if (role !== 'passenger' || !selectedDriver) {
      return;
    }

    if (Number(selectedDriver.seats) < Number(requestedSeats)) {
      setSelectedDriver(null);
      setRoutePath([]);
      setPickupRoutePath([]);
      setPassengerRequestStatus('');
    }
  }, [requestedSeats, role, selectedDriver]);

  useEffect(() => {
    if (tripStatus !== 'active' || !tripStartedAt) {
      setElapsedSeconds(0);
      return undefined;
    }

    const updateElapsed = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - tripStartedAt) / 1000)));
    };
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [tripStartedAt, tripStatus]);

  useEffect(() => {
    if (role !== 'driver' || tripStatus !== 'active' || !activeTripId || status !== 'ready') {
      return undefined;
    }

    let isMounted = true;
    lastDriverLocationPushRef.current = {
      tripId: activeTripId,
      location: null,
      at: 0
    };

    const pushDriverLocation = async () => {
      if (!isMounted) {
        return;
      }

      const currentLocation = latestLocationRef.current;
      const lastPush = lastDriverLocationPushRef.current;
      const now = Date.now();
      const movedEnough =
        !lastPush.location ||
        lastPush.tripId !== activeTripId ||
        distanceBetweenMeters(lastPush.location, currentLocation) >= DRIVER_LOCATION_MIN_MOVE_METERS;
      const heartbeatDue = now - lastPush.at >= DRIVER_LOCATION_HEARTBEAT_MS;

      if (!movedEnough && !heartbeatDue) {
        return;
      }

      lastDriverLocationPushRef.current = {
        tripId: activeTripId,
        location: currentLocation,
        at: now
      };

      await api.patch(`/trips/${activeTripId}/location`, {
        lat: currentLocation.lat,
        lng: currentLocation.lng
      }).catch(() => {});
    };

    pushDriverLocation();
    const timer = window.setInterval(pushDriverLocation, DRIVER_LOCATION_PUSH_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, [activeTripId, role, status, tripStatus]);

  useEffect(() => {
    if (role !== 'driver' || tripStatus !== 'active' || !selectedDestination) {
      return undefined;
    }

    let isMounted = true;
    let inFlight = false;

    const refreshDriverRoutes = async ({ force = false } = {}) => {
      if (!isMounted || inFlight) {
        return;
      }

      const currentLocation = latestLocationRef.current;
      const routeTarget =
        bookingPhase === 'riding' && acceptedDropoffPoint ? acceptedDropoffPoint : selectedDestination;
      const pickupTarget =
        acceptedRequest && bookingPhase === 'pickup' ? getRequestPoint(currentLocation, acceptedRequest) : null;

      if (!hasPointCoordinates(currentLocation) || !hasPointCoordinates(routeTarget)) {
        return;
      }

      const targetKey = pointKey(routeTarget);
      const pickupKey = pointKey(pickupTarget);
      const lastRefresh = lastDriverRouteRefreshRef.current;
      const movedEnough =
        !lastRefresh.location ||
        distanceBetweenMeters(lastRefresh.location, currentLocation) >= DRIVER_ROUTE_REFRESH_MIN_MOVE_METERS;
      const routeChanged =
        lastRefresh.targetKey !== targetKey ||
        lastRefresh.pickupKey !== pickupKey ||
        lastRefresh.phase !== bookingPhase;

      if (!force && !movedEnough && !routeChanged) {
        return;
      }

      lastDriverRouteRefreshRef.current = {
        location: currentLocation,
        targetKey,
        pickupKey,
        phase: bookingPhase
      };
      setDriverRouteLeg({ phase: bookingPhase, targetKey });
      inFlight = true;

      try {
        const refreshedRoute = await fetchDrivingRoute(currentLocation, routeTarget);

        if (isMounted) {
          setRoutePath(refreshedRoute.path);
          setRouteSummary(refreshedRoute.summary);
          setDriverHeading(calculateBearing(currentLocation, refreshedRoute.path[1] ?? routeTarget));
        }
      } catch {
        if (isMounted) {
          setRoutePath(createStraightFallbackRoute(currentLocation, routeTarget));
          setRouteSummary(null);
          setDriverHeading(calculateBearing(currentLocation, routeTarget));
        }
      }

      if (pickupTarget) {
        try {
          const refreshedPickupRoute = await fetchDrivingRoute(currentLocation, pickupTarget);

          if (isMounted) {
            setPickupRoutePath(refreshedPickupRoute.path);
            setPickupRouteSummary(refreshedPickupRoute.summary);
            setPickupRouteStatus('ready');
          }
        } catch {
          if (isMounted) {
            setPickupRoutePath(createStraightFallbackRoute(currentLocation, pickupTarget));
            setPickupRouteSummary(null);
            setPickupRouteStatus('ready');
          }
        }
      } else if (isMounted && pickupRoutePathRef.current.length > 0) {
        setPickupRoutePath([]);
        setPickupRouteSummary(null);
        setPickupRouteStatus('idle');
      }

      inFlight = false;
    };

    refreshDriverRoutes({ force: true });
    const timer = window.setInterval(refreshDriverRoutes, DRIVER_ROUTE_REFRESH_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, [
    acceptedDropoffPoint,
    acceptedRequest,
    bookingPhase,
    role,
    selectedDestination,
    tripStatus
  ]);

  useEffect(() => {
    if (!passengerPickedUpAt && pingCooldownSeconds <= 0) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setCooldownTick((currentTick) => currentTick + 1);
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [passengerPickedUpAt, pingCooldownSeconds]);

  useEffect(() => {
    if (role !== 'driver') {
      return undefined;
    }

    const query = destinationQuery.trim();

    if (query.length < 3 || selectedDestination?.label === destinationQuery) {
      setDestinationSuggestions([]);
      setSuggestionStatus('idle');
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSuggestionStatus('loading');

      try {
        const suggestions = await searchLebanonPlaces(query, controller.signal);
        setDestinationSuggestions(suggestions);
        setSuggestionStatus(suggestions.length > 0 ? 'ready' : 'empty');
      } catch (searchError) {
        if (searchError.name !== 'AbortError') {
          setDestinationSuggestions([]);
          setSuggestionStatus('empty');
        }
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [destinationQuery, location, role, selectedDestination]);

  useEffect(() => {
    if (role !== 'passenger') {
      return undefined;
    }

    const query = passengerDestinationQuery.trim();

    if (query.length < 3 || selectedPassengerDestination?.label === passengerDestinationQuery) {
      setPassengerDestinationSuggestions([]);
      setPassengerSuggestionStatus('idle');
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPassengerSuggestionStatus('loading');

      try {
        const suggestions = await searchLebanonPlaces(query, controller.signal);
        setPassengerDestinationSuggestions(suggestions);
        setPassengerSuggestionStatus(suggestions.length > 0 ? 'ready' : 'empty');
      } catch (searchError) {
        if (searchError.name !== 'AbortError') {
          setPassengerDestinationSuggestions([]);
          setPassengerSuggestionStatus('empty');
        }
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [passengerDestinationQuery, role, selectedPassengerDestination]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleRelocate = async () => {
    const playMapSound = prepareMapSound();
    playMapSound();
    await refreshLocation();
    setRecenterSignal((signal) => signal + 1);
  };

  const handlePassengerDestinationQueryChange = (value) => {
    if (activePassengerBooking) {
      return;
    }

    setPassengerDestinationQuery(value);
    setSelectedPassengerDestination(null);
    setPassengerManualMarkerMode(false);
    setPassengerDestinationConfirmed(false);
    setPassengerRequestStatus('');
    setRoutePath([]);
    setPickupRoutePath([]);
  };

  const handlePassengerSuggestionSelect = (suggestion) => {
    if (activePassengerBooking) {
      return;
    }

    setSelectedPassengerDestination(suggestion);
    setPassengerDestinationQuery(suggestion.label);
    setPassengerDestinationSuggestions([]);
    setPassengerSuggestionStatus('idle');
    setPassengerManualMarkerMode(false);
    setPassengerDestinationConfirmed(false);
    setPassengerRequestStatus('');
    setRoutePath([]);
    setPickupRoutePath([]);
  };

  const handlePassengerManualMarkerToggle = () => {
    if (activePassengerBooking) {
      return;
    }

    setPassengerManualMarkerMode((current) => !current);
  };

  const handlePassengerClearDestination = () => {
    if (activePassengerBooking) {
      return;
    }

    setPassengerDestinationQuery('');
    setSelectedPassengerDestination(null);
    setPassengerDestinationSuggestions([]);
    setPassengerSuggestionStatus('idle');
    setPassengerManualMarkerMode(false);
    setPassengerDestinationConfirmed(false);
    setPassengerRequestStatus('');
    setSelectedDriver(null);
    setRoutePath([]);
    setPickupRoutePath([]);
    const playMapSound = prepareMapSound();
    playMapSound();
  };

  const handlePassengerConfirmDestination = () => {
    if (activePassengerBooking) {
      return;
    }

    if (!selectedPassengerDestination) {
      setPassengerRequestStatus('Select a destination or place a marker first.');
      return;
    }

    setPassengerManualMarkerMode(false);
    setPassengerDestinationConfirmed(true);
    setPassengerRequestStatus('Destination confirmed. Select a driver and request booking.');
    const playMapSound = prepareMapSound();
    playMapSound();
  };

  const handlePassengerDriverSelect = useCallback(
    async (driver) => {
      if (activePassengerBooking) {
        return;
      }

      if (selectedDriver?.id === driver.id) {
        setSelectedDriver(null);
        setRoutePath([]);
        setPickupRoutePath([]);
        setPassengerRequestStatus(
          passengerDestinationConfirmed
            ? 'Destination confirmed. Select a driver when ready.'
            : 'Confirm your destination before requesting a driver.'
        );
        const playMapSound = prepareMapSound();
        playMapSound();
        return;
      }

      setSelectedDriver(driver);
      setPassengerRequestStatus(
        passengerDestinationConfirmed
          ? 'Destination confirmed. Request this driver when ready.'
          : 'Confirm your destination before requesting this driver.'
      );

      const driverPoint = {
        lat: driver.lat ?? location.lat + driver.offset.lat,
        lng: driver.lng ?? location.lng + driver.offset.lng
      };
      const driverRouteEnd =
        driver.destinationLat && driver.destinationLng
          ? {
              lat: driver.destinationLat,
              lng: driver.destinationLng
            }
          : {
              lat: driverPoint.lat + driver.offset.lat * 1.45,
              lng: driverPoint.lng + driver.offset.lng * 1.45
            };

      try {
        const driverRoute = await fetchDrivingRoute(driverPoint, driverRouteEnd);
        setRoutePath(driverRoute.path);
      } catch {
        setRoutePath(createDemoDriverRoute(location, driver));
      }

      try {
        const passengerPickupRoute = await fetchDrivingRoute(driverPoint, location);
        setPickupRoutePath(passengerPickupRoute.path);
      } catch {
        setPickupRoutePath(createStraightFallbackRoute(driverPoint, location));
      }

      const playMapSound = prepareMapSound();
      playMapSound();
    },
    [activePassengerBooking, location, passengerDestinationConfirmed, selectedDriver?.id]
  );

  const handlePassengerRequestBooking = async () => {
    if (activePassengerBooking) {
      setPassengerRequestStatus('You already have an accepted trip. Finish or cancel it before requesting another one.');
      return;
    }

    if (!selectedDriver || Number(requestedSeats) > Number(selectedDriver.seats)) {
      setPassengerRequestStatus('Select a driver with enough available seats first.');
      return;
    }

    if (!passengerDestinationConfirmed || !selectedPassengerDestination) {
      setPassengerRequestStatus('Confirm your drop-off destination before requesting a booking.');
      return;
    }

    if (selectedDriverPendingRequest) {
      setPassengerRequestStatus('This driver already has your pending request.');
      return;
    }

    try {
      const passengerTripKm = await estimateRouteDistanceKm(
        location,
        selectedPassengerDestination,
        distanceBetweenMeters(location, selectedPassengerDestination) / 1000
      );
      const paymentBreakdown = calculatePaymentBreakdown({
        passengerTripKm,
        seatsRequested: requestedSeats
      });
      let bookingId = null;

      if (selectedDriver.tripId) {
        const bookingPayload = await api.post('/bookings', {
          tripId: selectedDriver.tripId,
          pickupLocation: `Current location (${location.lat.toFixed(5)}, ${location.lng.toFixed(5)})`,
          pickupLat: location.lat,
          pickupLng: location.lng,
          dropoffLocation: selectedPassengerDestination.label,
          dropoffLat: selectedPassengerDestination.lat,
          dropoffLng: selectedPassengerDestination.lng,
          paymentAmount: paymentBreakdown.total,
          passengerTripKm: paymentBreakdown.passengerTripKm,
          pickupDetourKm: paymentBreakdown.pickupDetourKm,
          paymentBaseAmount: paymentBreakdown.baseAmount.toFixed(2),
          paymentDetourAmount: paymentBreakdown.detourAmount.toFixed(2),
          paymentMethod: 'cash',
          seatsRequested: Number(requestedSeats)
        });
        bookingId = bookingPayload.bookingId;
      }

      const playRequestSound = prepareRequestSound();
      playRequestSound();
      setSentPassengerRequests((currentRequests) => [
        {
          localId: `request-${selectedDriver.id}-${Date.now()}`,
          bookingId,
          driverId: selectedDriver.id,
          driverName: selectedDriver.name,
          route: selectedDriver.route,
          dropoff: selectedPassengerDestination.label,
          seats: Number(requestedSeats),
          status: 'pending',
          paymentAmount: paymentBreakdown.total,
          passengerTripKm: paymentBreakdown.passengerTripKm,
          pickupDetourKm: paymentBreakdown.pickupDetourKm,
          paymentBaseAmount: paymentBreakdown.baseAmount,
          paymentDetourAmount: paymentBreakdown.detourAmount,
          createdAt: new Date().toISOString()
        },
        ...currentRequests
      ]);
      setPassengerRequestStatus('Request sent. It will remain visible here while pending.');
    } catch (requestError) {
      setPassengerRequestStatus(requestError.message || 'Could not send booking request.');
    }
  };

  const handleCancelPassengerRequest = async (request) => {
    const playCancelSound = prepareCancelSound();
    playCancelSound();

    if (request.bookingId) {
      await api.patch(`/bookings/${request.bookingId}/status`, { bookingStatus: 'cancelled' }).catch(() => {});
    }

    setSentPassengerRequests((currentRequests) =>
      currentRequests.filter((currentRequest) => currentRequest.localId !== request.localId)
    );

    if (selectedDriver?.id === request.driverId) {
      setPassengerRequestStatus('Request cancelled.');
    }
  };

  const handlePassengerPayBooking = async (booking) => {
    if (!booking?.bookingId || passengerPaymentSubmitting) {
      return;
    }

    setPassengerPaymentSubmitting(true);

    try {
      const nextPaymentStatus = passengerPaymentMethod === 'card' ? 'paid' : 'cash_pending';
      await api.patch(`/bookings/${booking.bookingId}/payment`, {
        paymentStatus: nextPaymentStatus,
        paymentMethod: passengerPaymentMethod,
        driverRating: passengerDriverRating ? Number(passengerDriverRating) : null
      });

      if (passengerPaymentMethod === 'cash') {
        setPassengerRequestStatus('Cash selected. Wait for the driver to confirm that payment was collected.');
        setSentPassengerRequests((currentRequests) =>
          currentRequests.map((request) =>
            Number(request.bookingId) === Number(booking.bookingId)
              ? { ...request, paymentMethod: 'cash', paymentStatus: 'cash_pending' }
              : request
          )
        );
        return;
      }

      const playPaymentSound = preparePaymentSound();
      playPaymentSound();
      setPassengerRequestStatus('Card payment completed. Trip finished.');
      setPassengerDriverRating('');
      setSentPassengerRequests((currentRequests) =>
        currentRequests.filter((request) => Number(request.bookingId) !== Number(booking.bookingId))
      );
      setSelectedDriver(null);
      setRoutePath([]);
      setPickupRoutePath([]);
      setPassengerDestinationConfirmed(false);
    } catch (paymentError) {
      const message = paymentError.message || 'Could not complete payment.';
      setPassengerRequestStatus(
        message.toLowerCase().includes('insufficient') || message.toLowerCase().includes('not enough')
          ? 'Insufficient funds. Choose cash or top up your wallet.'
          : message
      );
    } finally {
      setPassengerPaymentSubmitting(false);
    }
  };

  const handleQuickMessageSend = async (event) => {
    event.preventDefault();

    if (!acceptedRequest?.bookingId || !quickChatText.trim()) {
      return;
    }

    const nextMessage = {
      id: `quick-${Date.now()}`,
      sender: 'driver',
      text: quickChatText.trim()
    };
    setQuickChatMessages((currentMessages) => [...currentMessages, nextMessage]);
    setQuickChatText('');
    const playMessageSound = prepareMessageSound();
    playMessageSound();

    await api.post('/messages', {
      bookingId: acceptedRequest.bookingId,
      messageText: nextMessage.text
    }).catch(() => {});
  };

  const handleDestinationQueryChange = (value) => {
    setDestinationQuery(value);
    setSelectedDestination(null);
    setRoutePath([]);
    setRouteSummary(null);
    setRouteError('');
    setTripStatus('idle');
    setActiveTripId(null);
    setTripStartedAt(null);
    setDriverHeading(0);
    setAcceptedRequest(null);
    setBookingPhase('idle');
    setPassengerPingStatus('');
    setQuickChatOpen(false);
    setQuickChatMinimized(false);
    setQuickChatMessages([]);
    setQuickChatText('');
    setPassengerPickedUpAt(null);
    setPingCooldownUntil(0);
    setPickupRoutePath([]);
    setPickupRouteSummary(null);
    setPickupRouteStatus('idle');
    setPickupRouteError('');
    setPendingRequests([]);
  };

  const handleSuggestionSelect = (suggestion) => {
    setSelectedDestination(suggestion);
    setDestinationQuery(suggestion.label);
    setDestinationSuggestions([]);
    setSuggestionStatus('idle');
    setManualMarkerMode(false);
    setRoutePath([]);
    setRouteSummary(null);
    setRouteError('');
    setTripStatus('idle');
    setActiveTripId(null);
    setTripStartedAt(null);
    setDriverHeading(0);
    setAcceptedRequest(null);
    setBookingPhase('idle');
    setPassengerPingStatus('');
    setQuickChatOpen(false);
    setQuickChatMinimized(false);
    setQuickChatMessages([]);
    setQuickChatText('');
    setPassengerPickedUpAt(null);
    setPingCooldownUntil(0);
    setPickupRoutePath([]);
    setPickupRouteSummary(null);
    setPickupRouteStatus('idle');
    setPickupRouteError('');
    setPendingRequests([]);
  };

  const handleManualMarkerToggle = () => {
    setManualMarkerMode((current) => !current);
  };

  const handleDriverClearDestination = () => {
    setSelectedDestination(null);
    setDestinationQuery('');
    setDestinationSuggestions([]);
    setSuggestionStatus('idle');
    setManualMarkerMode(false);
    setRoutePath([]);
    setRouteSummary(null);
    setRouteError('');
    const playMapSound = prepareMapSound();
    playMapSound();
  };

  const handleMapClick = useCallback(
    (point) => {
      if (role === 'passenger' && passengerManualMarkerMode && !activePassengerBooking) {
        const markerDestination = {
          id: `passenger-manual-${Date.now()}`,
          name: 'Manual drop-off',
          address: `Lat ${point.lat.toFixed(5)}, Lng ${point.lng.toFixed(5)}`,
          label: `Manual marker (${point.lat.toFixed(5)}, ${point.lng.toFixed(5)})`,
          lat: point.lat,
          lng: point.lng
        };

        setSelectedPassengerDestination(markerDestination);
        setPassengerDestinationQuery(markerDestination.label);
        setPassengerDestinationSuggestions([]);
        setPassengerSuggestionStatus('idle');
        setPassengerManualMarkerMode(false);
        setPassengerDestinationConfirmed(false);
        setPassengerRequestStatus('Manual drop-off selected. Confirm it before requesting a booking.');
        setRoutePath([]);
        setPickupRoutePath([]);
        const playMapSound = prepareMapSound();
        playMapSound();
        return;
      }

      if (role !== 'driver' || !manualMarkerMode) {
        return;
      }

      const markerDestination = {
        id: `manual-${Date.now()}`,
        name: 'Manual destination',
        address: `Lat ${point.lat.toFixed(5)}, Lng ${point.lng.toFixed(5)}`,
        label: `Manual marker (${point.lat.toFixed(5)}, ${point.lng.toFixed(5)})`,
        lat: point.lat,
        lng: point.lng
      };

      setSelectedDestination(markerDestination);
      setDestinationQuery(markerDestination.label);
      setDestinationSuggestions([]);
      setSuggestionStatus('idle');
      setManualMarkerMode(false);
      setRoutePath([]);
      setRouteSummary(null);
      setRouteError('');
      setTripStatus('idle');
      setActiveTripId(null);
      setTripStartedAt(null);
      setDriverHeading(0);
      setAcceptedRequest(null);
      setBookingPhase('idle');
      setPassengerPingStatus('');
      setQuickChatOpen(false);
      setQuickChatMinimized(false);
      setQuickChatMessages([]);
      setQuickChatText('');
      setPassengerPickedUpAt(null);
      setPingCooldownUntil(0);
      setPickupRoutePath([]);
      setPickupRouteSummary(null);
      setPickupRouteStatus('idle');
      setPickupRouteError('');
      setPendingRequests([]);
      const playMapSound = prepareMapSound();
      playMapSound();
    },
    [activePassengerBooking, manualMarkerMode, passengerManualMarkerMode, role]
  );

  const handleArrival = useCallback(() => {
    const playDestinationReachedSound = prepareDestinationReachedSound();
    playDestinationReachedSound();

    if (activeTripId) {
      api.patch(`/trips/${activeTripId}/status`, { tripStatus: 'completed' }).catch(() => {});
    }

    setTripStatus('arrived');
    setRouteSummary(null);
    setRouteError('');
    setPickupRoutePath([]);
    setPickupRouteSummary(null);
    setPickupRouteStatus('idle');
    setPickupRouteError('');
    setAcceptedRequest(null);
    setBookingPhase('idle');
    setPassengerPingStatus('');
    setQuickChatOpen(false);
    setQuickChatMinimized(false);
    setQuickChatMessages([]);
    setQuickChatText('');

    window.setTimeout(() => {
      setTripStatus('idle');
      setRoutePath([]);
      setSelectedDestination(null);
      setDestinationQuery('');
      setManualMarkerMode(false);
      setDriverHeading(0);
      setActiveTripId(null);
      setTripStartedAt(null);
      setPendingRequests([]);
      setPassengerPingStatus('');
      setQuickChatOpen(false);
      setQuickChatMinimized(false);
      setQuickChatMessages([]);
      setQuickChatText('');
      setPassengerPickedUpAt(null);
      setPingCooldownUntil(0);
    }, 2200);
  }, [activeTripId]);

  useEffect(() => {
    if (
      role !== 'driver' ||
      tripStatus !== 'active' ||
      !selectedDestination ||
      acceptedRequest ||
      !mainDestinationLegReady ||
      !Number.isFinite(destinationDistanceMeters) ||
      destinationDistanceMeters > DESTINATION_ARRIVAL_METERS
    ) {
      return;
    }

    handleArrival();
  }, [
    acceptedRequest,
    destinationDistanceMeters,
    handleArrival,
    mainDestinationLegReady,
    role,
    selectedDestination,
    tripStatus
  ]);

  const handleRejectRequest = (requestId) => {
    const rejectedRequest = pendingRequests.find((request) => request.id === requestId);
    const playCancelSound = prepareCancelSound();
    playCancelSound();

    if (rejectedRequest?.bookingId) {
      api.patch(`/bookings/${rejectedRequest.bookingId}/status`, { bookingStatus: 'rejected' }).catch(() => {});
    }

    setPendingRequests((currentRequests) => currentRequests.filter((request) => request.id !== requestId));

    if (acceptedRequest?.id === requestId) {
      if (acceptedRequest.bookingId) {
        api.patch(`/bookings/${acceptedRequest.bookingId}/status`, { bookingStatus: 'cancelled' }).catch(() => {});
      }
      setAcceptedRequest(null);
      setBookingPhase('idle');
      setPassengerPingStatus('');
      setQuickChatOpen(false);
      setQuickChatMinimized(false);
      setQuickChatMessages([]);
      setQuickChatText('');
      setPassengerPickedUpAt(null);
      setPingCooldownUntil(0);
      setPickupRoutePath([]);
      setPickupRouteSummary(null);
      setPickupRouteStatus('idle');
      setPickupRouteError('');
    }
  };

  const handleCancelBooking = () => {
    const playCancelSound = prepareCancelSound();
    playCancelSound();

    if (acceptedRequest?.bookingId) {
      api.patch(`/bookings/${acceptedRequest.bookingId}/status`, { bookingStatus: 'cancelled' }).catch(() => {});
    }

    setAcceptedRequest(null);
    setPendingRequests([]);
    setBookingPhase('idle');
    setPassengerPingStatus('');
    setQuickChatOpen(false);
    setQuickChatMinimized(false);
    setQuickChatMessages([]);
    setQuickChatText('');
    setPassengerPickedUpAt(null);
    setPingCooldownUntil(0);
    setPickupRoutePath([]);
    setPickupRouteSummary(null);
    setPickupRouteStatus('idle');
    setPickupRouteError('');
  };

  const handlePickupPassenger = () => {
    if (!acceptedRequest || !canPickupPassenger) {
      return;
    }

    const playPickupSound = preparePickupSound();
    playPickupSound();

    if (acceptedRequest.bookingId) {
      api.patch(`/bookings/${acceptedRequest.bookingId}/status`, { bookingStatus: 'picked_up' }).catch(() => {});
    }

    setBookingPhase('riding');
    setPickupRoutePath([]);
    setPickupRouteSummary(null);
    setPickupRouteStatus('idle');
    setPickupRouteError('');
    setAcceptedRequest((currentRequest) =>
      currentRequest
        ? {
            ...currentRequest,
            status: 'picked_up'
          }
        : currentRequest
    );
    setPassengerPickedUpAt(Date.now());
    setPassengerPingStatus(`${acceptedRequest.passenger} is now on the ride.`);
    setQuickChatOpen(false);
    setQuickChatMinimized(false);
    setQuickChatMessages([]);
    setQuickChatText('');
    setPingCooldownUntil(0);
  };

  const handlePassengerDropoff = () => {
    if (!acceptedRequest || !canDropoffPassenger) {
      return;
    }

    const playDropoffSound = prepareDropoffSound();
    playDropoffSound();

    if (acceptedRequest.bookingId) {
      api.patch(`/bookings/${acceptedRequest.bookingId}/status`, { bookingStatus: 'payment_due' }).catch(() => {});
    }

    setBookingPhase('payment');
    setAcceptedRequest((currentRequest) =>
      currentRequest
        ? {
            ...currentRequest,
            status: 'payment_due'
          }
        : currentRequest
    );
    logPaymentCalculation({
      booking: acceptedRequest,
      surface: 'driver payment option',
      loggedKeys: loggedPaymentOptionsRef.current
    });
    setPassengerPingStatus(`Payment pending for booking #${acceptedRequest.bookingId}.`);
  };

  const handleConfirmPayment = async (paymentMethod = 'cash') => {
    if (!acceptedRequest?.bookingId) {
      return;
    }

    await api.patch(`/bookings/${acceptedRequest.bookingId}/payment`, {
      paymentStatus: 'paid',
      paymentMethod
    });

    const playPaymentSound = preparePaymentSound();
    playPaymentSound();
    setPickupRoutePath([]);
    setPickupRouteSummary(null);
    setPickupRouteStatus('idle');
    setPickupRouteError('');
    setAcceptedRequest(null);
    setBookingPhase('idle');
    setPassengerPingStatus(`Cash payment confirmed for booking #${acceptedRequest.bookingId}. Continue to your destination.`);
    setQuickChatOpen(false);
    setQuickChatMinimized(false);
    setQuickChatMessages([]);
    setQuickChatText('');
    setPassengerPickedUpAt(null);
    setPingCooldownUntil(0);
  };

  const handlePingPassenger = async () => {
    if (!acceptedRequest || tripStatus !== 'active' || bookingPhase !== 'pickup') {
      return;
    }

    if (pingCooldownSeconds > 0) {
      return;
    }

    const playPingSound = preparePingSound();
    playPingSound();
    setPingCooldownUntil(Date.now() + 60000);
    setQuickChatOpen(true);
    setQuickChatMinimized(false);
    setPassengerPingStatus(`Passenger ping sent to ${acceptedRequest.passenger}.`);

    const pingText = 'Driver ping: I am nearby.';
    const localMessage = {
      id: `ping-${Date.now()}`,
      sender: 'driver',
      text: pingText
    };
    setQuickChatMessages((currentMessages) => [...currentMessages, localMessage]);

    if (acceptedRequest.bookingId) {
      await api.post('/messages', {
        bookingId: acceptedRequest.bookingId,
        messageText: pingText
      }).catch(() => {});
    }
  };

  const createTripRecord = async (routeLabel) => {
    const tripSeats = Number(clampSeatValue(seats, maxDriverSeats));
    const payload = await api.post('/trips', {
      origin: `Current location (${location.lat.toFixed(5)}, ${location.lng.toFixed(5)})`,
      originLat: location.lat,
      originLng: location.lng,
      destination: selectedDestination.label,
      destinationLat: selectedDestination.lat,
      destinationLng: selectedDestination.lng,
      route: routeLabel,
      tripTime: toDatabaseDateTime(),
      availableSeats: tripSeats
    });

    setActiveTripId(payload.tripId);
    return payload.tripId;
  };

  const handleAcceptRequest = async (request) => {
    if (tripStatus !== 'active' || !activeTripId) {
      return;
    }

    if (Number(request.seats) > Number(seats)) {
      setPickupRouteError('This request needs more seats than this trip has available.');
      return;
    }

    const pickupPoint = getRequestPoint(location, request);
    const parsedDropoff = extractCoordinates(request.dropoff);
    const passengerDropoffPoint =
      hasPointCoordinates({ lat: request.dropoffLat, lng: request.dropoffLng })
        ? {
            lat: Number(request.dropoffLat),
            lng: Number(request.dropoffLng)
          }
        : parsedDropoff ?? selectedDestination;

    setPickupRouteStatus('routing');
    setPickupRouteSummary(null);
    setPickupRouteError('');

    try {
      const passengerTripKm = await estimateRouteDistanceKm(
        pickupPoint,
        passengerDropoffPoint,
        distanceBetweenMeters(pickupPoint, passengerDropoffPoint) / 1000
      );
      const paymentBreakdown = calculatePaymentBreakdown({
        passengerTripKm,
        seatsRequested: request.seats
      });
      const bookingPayload = request.bookingId
        ? await api.patch(`/bookings/${request.bookingId}/status`, {
            bookingStatus: 'accepted',
            paymentAmount: paymentBreakdown.total,
            passengerTripKm: paymentBreakdown.passengerTripKm,
            pickupDetourKm: paymentBreakdown.pickupDetourKm,
            paymentBaseAmount: paymentBreakdown.baseAmount.toFixed(2),
            paymentDetourAmount: paymentBreakdown.detourAmount.toFixed(2),
            paymentMethod: 'cash'
          })
        : await api.post('/bookings/driver-accepted', {
            tripId: activeTripId,
            requestId: request.id,
            passengerName: request.passenger,
            passengerEmail: request.passengerEmail,
            pickupLocation: request.pickup,
            pickupLat: pickupPoint.lat,
            pickupLng: pickupPoint.lng,
            dropoffLocation: request.dropoff,
            dropoffLat: passengerDropoffPoint?.lat ?? null,
            dropoffLng: passengerDropoffPoint?.lng ?? null,
            paymentAmount: paymentBreakdown.total,
            passengerTripKm: paymentBreakdown.passengerTripKm,
            pickupDetourKm: paymentBreakdown.pickupDetourKm,
            paymentBaseAmount: paymentBreakdown.baseAmount.toFixed(2),
            paymentDetourAmount: paymentBreakdown.detourAmount.toFixed(2),
            paymentMethod: 'cash',
            seatsRequested: request.seats
          });
      const nextRequest = {
        ...request,
        ...pickupPoint,
        bookingId: request.bookingId ?? bookingPayload.booking.booking_id,
        passengerId: request.passengerId ?? bookingPayload.booking.passenger_id,
        status: 'accepted',
        dropoffLat: request.dropoffLat ?? bookingPayload.booking?.dropoff_lat ?? passengerDropoffPoint?.lat ?? null,
        dropoffLng: request.dropoffLng ?? bookingPayload.booking?.dropoff_lng ?? passengerDropoffPoint?.lng ?? null,
        paymentAmount: Number(paymentBreakdown.total).toFixed(2),
        passengerTripKm: paymentBreakdown.passengerTripKm,
        pickupDetourKm: paymentBreakdown.pickupDetourKm,
        paymentBaseAmount: paymentBreakdown.baseAmount,
        paymentDetourAmount: paymentBreakdown.detourAmount
      };
      setAcceptedRequest(nextRequest);
      pendingRequests
        .filter((pendingRequest) => pendingRequest.bookingId && pendingRequest.bookingId !== nextRequest.bookingId)
        .forEach((pendingRequest) => {
          api.patch(`/bookings/${pendingRequest.bookingId}/status`, { bookingStatus: 'rejected' }).catch(() => {});
        });
      setPendingRequests([]);
      setBookingPhase('pickup');
      setPassengerPingStatus('');
      setQuickChatMessages([]);
      setQuickChatOpen(false);
      setQuickChatMinimized(false);
      const playRequestSound = prepareRequestSound();
      playRequestSound();

      try {
        const pickupRoute = await fetchDrivingRoute(location, pickupPoint);
        setPickupRoutePath(pickupRoute.path);
        setPickupRouteSummary(pickupRoute.summary);
        setPickupRouteStatus('ready');
      } catch {
        setPickupRoutePath(createStraightFallbackRoute(location, pickupPoint));
        setPickupRouteSummary(null);
        setPickupRouteStatus('ready');
        setPickupRouteError('Could not load pickup routing, so a direct pickup line is shown.');
      }
    } catch (acceptError) {
      setPickupRoutePath(createStraightFallbackRoute(location, pickupPoint));
      setPickupRouteSummary(null);
      setPickupRouteStatus('ready');
      setPickupRouteError(acceptError.message || 'Could not accept this booking request.');
    }
  };

  const handleActivateTrip = async (event) => {
    event?.preventDefault?.();

    if (tripStatus === 'arrived') {
      return;
    }

    if (tripStatus === 'active') {
      const playCancelSound = prepareCancelSound();
      playCancelSound();

      if (activeTripId) {
        await api.patch(`/trips/${activeTripId}/status`, { tripStatus: 'cancelled' }).catch(() => {});
      }
      if (acceptedRequest?.bookingId) {
        await api.patch(`/bookings/${acceptedRequest.bookingId}/status`, { bookingStatus: 'cancelled' }).catch(() => {});
      }
      setTripStatus('idle');
      setRoutePath([]);
      setRouteSummary(null);
      setRouteError('');
      setActiveTripId(null);
      setTripStartedAt(null);
      setDriverHeading(0);
      setAcceptedRequest(null);
      setBookingPhase('idle');
      setPassengerPingStatus('');
      setQuickChatOpen(false);
      setQuickChatMinimized(false);
      setQuickChatMessages([]);
      setQuickChatText('');
      setPassengerPickedUpAt(null);
      setPingCooldownUntil(0);
      setPickupRoutePath([]);
      setPickupRouteSummary(null);
      setPickupRouteStatus('idle');
      setPickupRouteError('');
      setPendingRequests([]);
      return;
    }

    if (!selectedDestination) {
      setRouteError('Select a destination or place a marker first.');
      return;
    }

    const playBeginSound = prepareTripBeginSound();
    setTripStatus('routing');
    setRouteError('');
    setRouteSummary(null);

    let nextTripId;

    try {
      nextTripId = await createTripRecord('Route pending');
    } catch {
      setTripStatus('idle');
      setRouteError('Could not save the trip in the database. Please check the API connection.');
      return;
    }

    try {
      const tripRoute = await fetchDrivingRoute(location, selectedDestination);
      const nextRoutePath = tripRoute.path;
      setDriverHeading(calculateBearing(location, nextRoutePath[1] ?? selectedDestination));
      setRoutePath(nextRoutePath);
      setRouteSummary(tripRoute.summary);
      setActiveTripId(nextTripId);
      setTripStartedAt(Date.now());
      setTripStatus('active');
      setPendingRequests([]);
      playBeginSound();
    } catch (routingError) {
      const fallbackRoute = createStraightFallbackRoute(location, selectedDestination);
      setDriverHeading(calculateBearing(location, selectedDestination));
      setRoutePath(fallbackRoute);
      setRouteSummary(null);
      setActiveTripId(nextTripId);
      setTripStartedAt(Date.now());
      setTripStatus('active');
      setRouteError('Could not load road routing, so a direct preview route is shown.');
      setPendingRequests([]);
      playBeginSound();
    }
  };

  return (
    <main className="map-workspace">
      <header className="map-toolbar">
        <div className="toolbar-welcome">
          <span>Welcome {welcomeName}</span>
          <small>{title}</small>
        </div>

        <div className="toolbar-center">
          <button
            type="button"
            className="map-home-button"
            onClick={() => navigate(role === 'driver' ? '/driver' : '/passenger')}
          >
            Map
          </button>
          <span className={`location-pill ${status}`}>
            {status === 'ready' ? 'Device location' : status === 'locating' ? 'Locating' : 'Default location'}
          </span>
        </div>

        <nav className="map-nav" aria-label="Map navigation">
          {toolbarLinks.map((link) => (
            <button type="button" key={link.path} onClick={() => navigate(link.path)}>
              {link.label}
            </button>
          ))}
          <button type="button" onClick={handleLogout}>
            Sign out
          </button>
        </nav>
      </header>

      <section className="map-stage">
        <GoogleMapView
          location={mapLocation}
          drivers={mapDrivers}
          selectedDriver={selectedDriver}
          onSelectDriver={role === 'passenger' ? handlePassengerDriverSelect : setSelectedDriver}
          destination={role === 'driver' ? selectedDestination : selectedPassengerDestination}
          passengerDropoffMarkers={passengerDropoffMarkers}
          routePath={routePath}
          pickupRoutePath={passengerOnBoard ? [] : pickupRoutePath}
          passengerRequests={passengerRequestMarkers}
          onAcceptPassengerRequest={handleAcceptRequest}
          onRejectPassengerRequest={handleRejectRequest}
          manualMarkerMode={(role === 'driver' && manualMarkerMode) || (role === 'passenger' && passengerManualMarkerMode)}
          onMapClick={handleMapClick}
          driverTripActive={role === 'driver' && tripStatus === 'active'}
          driverHeading={driverHeading}
          hideCurrentLocationMarker={passengerOnBoard}
          focusOnDriver={role === 'driver' && tripStatus === 'active'}
          recenterSignal={recenterSignal}
        />

        <div className="map-status-card">
          <div>
            <strong>{status === 'ready' ? 'Live location ready' : 'Interactive map ready'}</strong>
            <span>
              {error || `Lat ${mapLocation.lat.toFixed(4)}, Lng ${mapLocation.lng.toFixed(4)}`}
            </span>
          </div>
          <button type="button" className="ghost-button small-button" onClick={handleRelocate}>
            Relocate
          </button>
        </div>

        {role === 'driver' && acceptedRequest && quickChatOpen ? (
          <QuickMessageBox
            passengerName={acceptedRequest.passenger}
            bookingId={acceptedRequest.bookingId}
            messages={quickChatMessages}
            value={quickChatText}
            minimized={quickChatMinimized}
            onChange={setQuickChatText}
            onSend={handleQuickMessageSend}
            onToggle={() => {
              setDriverUnreadMessages(0);
              setQuickChatMinimized((current) => !current);
            }}
            onClose={() => setQuickChatMinimized(true)}
            onOpenMessages={() => {
              setDriverUnreadMessages(0);
              navigate('/messages');
            }}
            unreadCount={driverUnreadMessages}
          />
        ) : null}

        {role === 'passenger' && sentPassengerRequests.length > 0 ? (
          <PassengerRequestsDock
            requests={sentPassengerRequests}
            onCancelRequest={handleCancelPassengerRequest}
            onOpenMessages={() => {
              setPassengerUnreadMessages(0);
              navigate('/messages');
            }}
            unreadCount={passengerUnreadMessages}
          />
        ) : null}

        {role === 'driver' ? (
          <DriverPanel
            destinationQuery={destinationQuery}
            onDestinationQueryChange={handleDestinationQueryChange}
            destinationSuggestions={destinationSuggestions}
            suggestionStatus={suggestionStatus}
            selectedDestination={selectedDestination}
            manualMarkerMode={manualMarkerMode}
            onSuggestionSelect={handleSuggestionSelect}
            onManualMarkerToggle={handleManualMarkerToggle}
            onClearDestination={handleDriverClearDestination}
            seats={seats}
            onSeatsChange={handleDriverSeatsChange}
            maxSeats={maxDriverSeats}
            onActivateTrip={handleActivateTrip}
            onPingPassenger={handlePingPassenger}
            tripStatus={tripStatus}
            routeSummary={routeSummary}
            routeError={routeError}
            pendingRequests={pendingRequests}
            acceptedRequest={acceptedRequest}
            passengerPingStatus={passengerPingStatus}
            pickupRouteSummary={pickupRouteSummary}
            pickupRouteStatus={pickupRouteStatus}
            pickupRouteError={pickupRouteError}
            onAcceptRequest={handleAcceptRequest}
            onRejectRequest={handleRejectRequest}
            onCancelBooking={handleCancelBooking}
            onPickupPassenger={handlePickupPassenger}
            onPassengerDropoff={handlePassengerDropoff}
            onConfirmPayment={handleConfirmPayment}
            tripDetails={tripDetails}
            bookingPhase={bookingPhase}
            availableSeats={seats}
            canPickupPassenger={canPickupPassenger}
            canDropoffPassenger={canDropoffPassenger}
            pickupActionHint={pickupActionHint}
            dropoffActionHint={dropoffActionHint}
            rideElapsed={rideElapsed}
            pingCooldownSeconds={pingCooldownSeconds}
          />
        ) : (
          <PassengerPanel
            destinationQuery={passengerDestinationQuery}
            onDestinationQueryChange={handlePassengerDestinationQueryChange}
            destinationSuggestions={passengerDestinationSuggestions}
            suggestionStatus={passengerSuggestionStatus}
            selectedDestination={selectedPassengerDestination}
            onSuggestionSelect={handlePassengerSuggestionSelect}
            manualMarkerMode={passengerManualMarkerMode}
            onManualMarkerToggle={handlePassengerManualMarkerToggle}
            onClearDestination={handlePassengerClearDestination}
            destinationConfirmed={passengerDestinationConfirmed}
            onConfirmDestination={handlePassengerConfirmDestination}
            requestedSeats={requestedSeats}
            onRequestedSeatsChange={handlePassengerRequestedSeatsChange}
            drivers={passengerDrivers}
            selectedDriver={selectedDriver}
            onSelectDriver={handlePassengerDriverSelect}
            onRequestBooking={handlePassengerRequestBooking}
            hasPendingRequest={Boolean(selectedDriverPendingRequest)}
            activeBooking={activePassengerBooking}
            paymentMethod={passengerPaymentMethod}
            onPaymentMethodChange={setPassengerPaymentMethod}
            driverRating={passengerDriverRating}
            onDriverRatingChange={setPassengerDriverRating}
            onPayBooking={handlePassengerPayBooking}
            paymentSubmitting={passengerPaymentSubmitting}
            requestStatus={passengerRequestStatus}
          />
        )}
      </section>
    </main>
  );
};

export default MapWorkspace;
