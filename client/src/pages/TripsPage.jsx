import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/http.js';
import { useAuth } from '../context/AuthContext.jsx';

const formatDate = (value) => (value ? new Date(value).toLocaleString() : 'Not set');

const TripsPage = () => {
  const { user } = useAuth();
  const [trips, setTrips] = useState([]);
  const [status, setStatus] = useState('idle');

  const isAdmin = user?.role === 'admin';
  const endpoint = isAdmin ? '/admin/trips' : '/trips';

  const loadTrips = useCallback(
    async ({ showLoading = false } = {}) => {
      if (showLoading) {
        setStatus('loading');
      }

      try {
        const payload = await api.get(endpoint);
        setTrips(payload.trips ?? []);
        setStatus('ready');
      } catch {
        setStatus('offline');
      }
    },
    [endpoint]
  );

  useEffect(() => {
    loadTrips({ showLoading: true });
    const timer = window.setInterval(() => loadTrips(), 3000);

    return () => window.clearInterval(timer);
  }, [loadTrips]);

  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Trips</p>
          <h2>{isAdmin ? 'Trip history' : 'Trip management'}</h2>
        </div>
      </div>

      <div className="table-panel">
        <div className="table-row trip-row header">
          <span>Trip ID</span>
          <span>Origin</span>
          <span>Destination</span>
          <span>Route</span>
          <span>Trip time</span>
          <span>Status</span>
          <span>Seats</span>
          <span>Passengers</span>
        </div>

        {status === 'loading' ? <p className="empty-state">Loading trips...</p> : null}
        {status === 'offline' ? <p className="empty-state">Connect the API to load trips.</p> : null}

        {trips.map((trip) => (
          <div className="table-row trip-row" key={trip.trip_id}>
            <span>#{trip.trip_id}</span>
            <span>{trip.origin}</span>
            <span>{trip.destination}</span>
            <span>{trip.route ?? 'Not recorded'}</span>
            <span>{formatDate(trip.trip_time)}</span>
            <span>{trip.trip_status}</span>
            <span>{trip.available_seats}</span>
            <span>{trip.passengers || 'No passengers'}</span>
          </div>
        ))}

        {status === 'ready' && trips.length === 0 ? (
          <p className="empty-state">
            {isAdmin ? 'No trips have been recorded yet.' : 'No trips have been saved for this account yet.'}
          </p>
        ) : null}
      </div>
    </section>
  );
};

export default TripsPage;
