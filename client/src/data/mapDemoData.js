export const nearbyDrivers = [
  {
    id: 1,
    name: 'Ali H.',
    rating: 4.8,
    seats: 3,
    vehicle: 'White Toyota Corolla',
    route: 'Hamra to Jounieh',
    eta: '4 min',
    offset: { lat: 0.004, lng: -0.005 },
    screen: { left: '24%', top: '33%' }
  },
  {
    id: 2,
    name: 'Reina N.',
    rating: 4.7,
    seats: 2,
    vehicle: 'Silver Kia Rio',
    route: 'LAU to Mar Mikhael',
    eta: '7 min',
    offset: { lat: -0.003, lng: 0.006 },
    screen: { left: '61%', top: '43%' }
  },
  {
    id: 3,
    name: 'Carl M.',
    rating: 4.9,
    seats: 1,
    vehicle: 'Black Honda Civic',
    route: 'Verdun to Byblos',
    eta: '10 min',
    offset: { lat: 0.007, lng: 0.004 },
    screen: { left: '47%', top: '23%' }
  }
];

export const incomingRequests = [
  {
    id: 101,
    passenger: 'Zein A.',
    passengerEmail: 'zein.request@carpool.local',
    pickup: 'LAU lower gate',
    dropoff: 'ABC Verdun',
    seats: 1,
    distance: '1.2 km',
    pickupOffset: { lat: 0.0028, lng: -0.0034 }
  },
  {
    id: 102,
    passenger: 'Maya R.',
    passengerEmail: 'maya.request@carpool.local',
    pickup: 'Hamra main street',
    dropoff: 'Gemmayze',
    seats: 2,
    distance: '2.0 km',
    pickupOffset: { lat: -0.0026, lng: 0.0042 }
  }
];
