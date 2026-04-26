import { useEffect, useState } from 'react';
import { api } from '../api/http.js';

const TripsPage = () => {
  const [trips, setTrips] = useState([]);
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    let mounted = true;
    setStatus('loading');

    api
      .get('/trips')
      .then((payload) => {
        if (mounted) {
          setTrips(payload.trips ?? []);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (mounted) {
          setStatus('offline');
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="page-section">
      <div className="page-heading">
        <p className="eyebrow">Trips</p>
        <h2>Trip management</h2>
      </div>

      <div className="toolbar">
        <button type="button" className="primary-button">
          New trip
        </button>
        <button type="button" className="ghost-button">
          Map view
        </button>
      </div>

      <div className="table-panel">
        <div className="table-row header">
          <span>Route</span>
          <span>Driver</span>
          <span>Status</span>
          <span>Seats</span>
        </div>

        {status === 'loading' ? <p className="empty-state">Loading trips...</p> : null}
        {status === 'offline' ? <p className="empty-state">Connect the API to load trips.</p> : null}

        {trips.map((trip) => (
          <div className="table-row" key={trip.trip_id}>
            <span>{trip.origin} to {trip.destination}</span>
            <span>{trip.driver_name}</span>
            <span>{trip.trip_status}</span>
            <span>{trip.available_seats}</span>
          </div>
        ))}
      </div>
    </section>
  );
};

export default TripsPage;
