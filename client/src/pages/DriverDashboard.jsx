const driverItems = [
  'Create verified account',
  'Set destination and activate trip',
  'Respond to booking requests',
  'View passenger locations',
  'Message passenger',
  'Confirm pickup and drop-off',
  'View earnings and history',
  'Rate passenger'
];

const DriverDashboard = () => (
  <section className="page-section">
    <div className="page-heading">
      <p className="eyebrow">Driver</p>
      <h2>Driver home</h2>
    </div>

    <div className="feature-grid">
      {driverItems.map((item) => (
        <article className="feature-card" key={item}>
          <h3>{item}</h3>
          <p>Planned flow from the driver use case and activity diagrams.</p>
        </article>
      ))}
    </div>
  </section>
);

export default DriverDashboard;
