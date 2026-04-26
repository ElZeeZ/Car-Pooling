const passengerItems = [
  'View active drivers on map',
  'Send booking request',
  'Track driver after confirmation',
  'Message driver',
  'Confirm arrival and payment',
  'Rate or report driver',
  'View trip history'
];

const PassengerDashboard = () => (
  <section className="page-section">
    <div className="page-heading">
      <p className="eyebrow">Passenger</p>
      <h2>Passenger home</h2>
    </div>

    <div className="feature-grid">
      {passengerItems.map((item) => (
        <article className="feature-card" key={item}>
          <h3>{item}</h3>
          <p>Planned flow from the passenger use case and activity diagrams.</p>
        </article>
      ))}
    </div>
  </section>
);

export default PassengerDashboard;
