// Partner data for the globe.
//
// Copy and facts are drawn from commonfolkcoffee.com.au partner + product pages.
// Fields left as `null` are unknowns — the card simply hides them — so fill them
// in rather than inventing copy.
//
//   image        → URL of a farm/partner photo (falls back to an illustration)
//   since        → year the partnership started
//   latestCoffee → { name, notes: [], url } for the most recent release

const SITE = 'https://www.commonfolkcoffee.com.au';

export const home = {
  name: 'Commonfolk Roastery',
  place: 'Mornington, Victoria',
  lat: -38.2176,
  lng: 145.0378,
};

export const partners = [
  {
    id: 'bom-jesus',
    name: 'Flavia & Gabriel',
    farm: 'Fazenda Bom Jesus',
    region: 'São Paulo', // TODO: confirm exact farm location — pin is approximate
    country: 'Brazil',
    lat: -21.47,
    lng: -47.0,
    since: 2013,
    story:
      'Our longest-standing partnership. The Oliveira family are multi-generational farmers who provide the lion’s share of our Brazilian coffee — and Bom Jesus has been crowned the most sustainable coffee farm in São Paulo state.',
    image: null,
    url: `${SITE}/pages/partners/bom-jesus`,
    latestCoffee: {
      name: 'Bom Jesus',
      notes: ['Chocolate', 'Caramel', 'Honey', 'Vanilla bean'],
      url: `${SITE}/products/bom-jesus_23`,
    },
  },
  {
    id: 'zukuka-bora',
    name: 'Zukuka Bora',
    farm: 'Zukuka Bora Coffee Company',
    region: 'Mt Elgon',
    country: 'Uganda',
    lat: 1.2,
    lng: 34.45,
    since: 2014,
    story:
      'A social enterprise on the slopes of Mt Elgon that we helped get off the ground. From a 250kg first harvest to serious specialty volumes — paying growers above-market rates plus dry-season bonuses.',
    image: null,
    url: `${SITE}/pages/partners/zukuka-bora`,
    latestCoffee: {
      name: 'Elgon Natural',
      notes: ['Musk sticks', 'Raspberry yoghurt', 'Cacao nibs'],
      url: `${SITE}/products/elgon-natural_26`,
    },
  },
  {
    id: 'la-hammonia',
    name: 'Mausi & Eddy',
    farm: 'La Hammonia',
    region: 'Matagalpa',
    country: 'Nicaragua',
    lat: 12.93,
    lng: -85.92,
    since: 2017,
    story:
      'Eddy and Mausi Kühl run a farm that is self-sustaining in energy, food, water and fertiliser. Proof that great coffee and good farming go hand in hand.',
    image: null,
    url: `${SITE}/pages/partners/mausi-hayn`,
    latestCoffee: null,
  },
  {
    id: 'diamante',
    name: 'Diego & Derlin',
    farm: 'Diamanté',
    region: 'La Plata, Huila',
    country: 'Colombia',
    lat: 2.39,
    lng: -75.89,
    since: null,
    story:
      'Husband-and-wife duo Diego Campos and Derlin Roa moved home to Colombia in 2019 to start Diamanté, a boutique farm producing top-notch Huila coffee just down the road from Derlin’s folks.',
    image: null,
    url: `${SITE}/pages/partners/diego-campos-derlin-roa`,
    latestCoffee: {
      name: 'La Familia',
      notes: ['Jaffa cake', 'Caramel', 'Milk chocolate'],
      url: `${SITE}/products/la-familia_23f`,
    },
  },
  {
    id: 'finca-tamana',
    name: 'Elias & Bellani',
    farm: 'Finca Tamana',
    region: 'El Pital, Huila',
    country: 'Colombia',
    lat: 2.27,
    lng: -75.8,
    since: null,
    story:
      'Don Elias Roa and his wife Bellani bring over twenty years of know-how to their family farm — and the next generation, Brayan and Yurany, are now stepping up to look after the Refugio plot.',
    image: null,
    url: `${SITE}/pages/partners/finca-tamara`,
    latestCoffee: {
      name: 'Refugio',
      notes: ['Raspberry crumble', 'Lime', 'White chocolate'],
      url: `${SITE}/products/refugio_25f`,
    },
  },
  {
    id: 'los-milagros',
    name: 'Los Milagros',
    farm: 'Los Milagros',
    region: 'Motozintla, Chiapas',
    country: 'Mexico',
    lat: 15.37,
    lng: -92.25,
    since: 2023,
    story:
      'Hundreds of dedicated producers in the southern highlands of Mexico. After years of buying through our friends at Caravela, we made it official with a trip to meet the team on the ground in 2023.',
    image: null,
    url: `${SITE}/pages/partners/los-milagros`,
    latestCoffee: {
      name: 'Los Milagros',
      notes: ['Lemon curd', 'Mandarin', 'Dates'],
      url: `${SITE}/products/los-milagros_24`,
    },
  },
];
