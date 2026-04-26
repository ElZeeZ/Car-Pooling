export const roleHome = {
  passenger: '/passenger',
  driver: '/driver',
  admin: '/admin'
};

export const getHomePathForRole = (role) => roleHome[role] ?? '/login';

export const navigationByRole = {
  passenger: [
    { label: 'Home', path: '/passenger' },
    { label: 'Trips', path: '/trips' },
    { label: 'Bookings', path: '/bookings' },
    { label: 'Messages', path: '/messages' },
    { label: 'Reports', path: '/reports' }
  ],
  driver: [
    { label: 'Home', path: '/driver' },
    { label: 'Trips', path: '/trips' },
    { label: 'Bookings', path: '/bookings' },
    { label: 'Messages', path: '/messages' },
    { label: 'Reports', path: '/reports' }
  ],
  admin: [
    { label: 'Dashboard', path: '/admin' },
    { label: 'Trips', path: '/trips' },
    { label: 'Bookings', path: '/bookings' },
    { label: 'Messages', path: '/messages' },
    { label: 'Reports', path: '/reports' }
  ]
};
