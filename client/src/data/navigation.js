export const roleHome = {
  passenger: '/passenger',
  driver: '/driver',
  admin: '/admin'
};

export const getHomePathForRole = (role) => roleHome[role] ?? '/login';

export const navigationByRole = {
  passenger: [
    { label: 'Map', path: '/passenger' },
    { label: 'Trips', path: '/trips' },
    { label: 'Bookings', path: '/bookings' },
    { label: 'Messages', path: '/messages' },
    { label: 'Wallet', path: '/wallet' },
    { label: 'Reports', path: '/reports' }
  ],
  driver: [
    { label: 'Map', path: '/driver' },
    { label: 'Trips', path: '/trips' },
    { label: 'Bookings', path: '/bookings' },
    { label: 'Messages', path: '/messages' },
    { label: 'Wallet', path: '/wallet' },
    { label: 'Reports', path: '/reports' }
  ],
  admin: [
    { label: 'Dashboard', path: '/admin' },
    { label: 'Booking history', path: '/bookings' },
    { label: 'Message history', path: '/messages' },
    { label: 'Report history', path: '/reports' },
    { label: 'Transaction history', path: '/transactions' },
    { label: 'Trip history', path: '/trips' }
  ]
};
