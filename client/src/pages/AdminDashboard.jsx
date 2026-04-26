const adminItems = [
  'Create driver or passenger account',
  'Modify or delete accounts',
  'Suspend or reactivate accounts',
  'Verify driver credentials',
  'Monitor ongoing and completed trips',
  'View payments and transactions',
  'Manage reports and violations'
];

const AdminDashboard = () => (
  <section className="page-section">
    <div className="page-heading">
      <p className="eyebrow">Administrator</p>
      <h2>Admin dashboard</h2>
    </div>

    <div className="feature-grid">
      {adminItems.map((item) => (
        <article className="feature-card" key={item}>
          <h3>{item}</h3>
          <p>Planned flow from the administrator use case diagram.</p>
        </article>
      ))}
    </div>
  </section>
);

export default AdminDashboard;
