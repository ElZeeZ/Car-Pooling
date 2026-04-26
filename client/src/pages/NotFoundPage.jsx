import { Link } from 'react-router-dom';

const NotFoundPage = () => (
  <main className="auth-page">
    <section className="auth-panel">
      <p className="eyebrow">404</p>
      <h1>Page not found</h1>
      <Link className="primary-button center-link" to="/dashboard">
        Return home
      </Link>
    </section>
  </main>
);

export default NotFoundPage;
