import { AgentProfile, Property, Tenant } from '../models';
import { validateAndSanitizeSvgIngest } from '../utils/floorplan-transform.util';

export const MOCK_TENANTS: Tenant[] = [
  {
    id: 't-1001-atelier',
    slug: 'atelier-living',
    customDomain: null,
    isActive: true,
    branding: {
      agencyName: 'Atelier Living',
      tagline: 'Pure Architectural Residences',
      legalEntityName: 'Atelier Living Real Estate LLC (Demo)',
      logoUrl: '',
      faviconUrl: '',
      contactEmail: 'concierge@atelier.example.com',
      contactPhone: '+1 (415) 555-0140',
      licenseNumber: 'CA-DRE #00000000 (Simulated)',
      themeTokens: {
        primaryColor: '#2C2B29',
        secondaryColor: '#6B6864',
        accentColor: '#B59E7D',
        surfaceColor: '#F5F3EF',
        backgroundColor: '#FAFAF7',
        textColor: '#1A1918',
        fontFamilySerif: '"Playfair Display", Georgia, serif',
        fontFamilySans: '"Plus Jakarta Sans", system-ui, sans-serif',
        borderRadiusBase: '2px'
      }
    },
    features: {
      enableMortgageCalculator: true,
      enableInteractiveFloorPlan: true,
      enableVirtualTours: true,
      enableAgentScheduling: true,
      enableValuationEstimator: false
    },
    createdAt: '2026-01-10T08:00:00.000Z',
    updatedAt: '2026-01-10T08:00:00.000Z'
  },
  {
    id: 't-2002-monolith',
    slug: 'monolith-properties',
    customDomain: null,
    isActive: true,
    branding: {
      agencyName: 'Monolith Real Estate',
      tagline: 'Brutalist & Minimalist Masterpieces',
      legalEntityName: 'Monolith Realty Group Corp (Demo)',
      logoUrl: '',
      faviconUrl: '',
      contactEmail: 'acquisitions@monolith.example.com',
      contactPhone: '+1 (212) 555-0199',
      licenseNumber: 'NY-REB #00000000 (Simulated)',
      themeTokens: {
        primaryColor: '#111213',
        secondaryColor: '#4A4D50',
        accentColor: '#9E8872',
        surfaceColor: '#EBEBEB',
        backgroundColor: '#F2F2F2',
        textColor: '#0A0A0B',
        fontFamilySerif: '"Cormorant Garamond", Garamond, serif',
        fontFamilySans: '"Inter", system-ui, sans-serif',
        borderRadiusBase: '0px'
      }
    },
    features: {
      enableMortgageCalculator: true,
      enableInteractiveFloorPlan: true,
      enableVirtualTours: false,
      enableAgentScheduling: true,
      enableValuationEstimator: true
    },
    createdAt: '2026-01-15T10:30:00.000Z',
    updatedAt: '2026-01-15T10:30:00.000Z'
  }
];

export const MOCK_AGENTS: AgentProfile[] = [
  {
    id: 'ag-101-elena',
    tenantId: 't-1001-atelier',
    email: 'elena.rostova@atelier.example.com',
    fullName: 'Elena Rostova',
    role: 'agent',
    phone: '+1 (415) 555-0141',
    bio: 'Specialist in mid-century Japanese post-and-beam masterworks. (Simulated Profile)',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
    licenseCode: 'CA-DRE #00000001 (Simulated)',
    socialLinks: { linkedin: 'https://www.example.com' },
    isActive: true,
    createdAt: '2026-01-10T08:30:00.000Z',
    updatedAt: '2026-01-10T08:30:00.000Z'
  },
  {
    id: 'ag-102-julian',
    tenantId: 't-1001-atelier',
    email: 'julian.marchetti@atelier.example.com',
    fullName: 'Julian Marchetti',
    role: 'agent',
    phone: '+1 (415) 555-0142',
    bio: 'Represents coastal residences and board-formed concrete estates across the Bay Area. (Simulated Profile)',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
    licenseCode: 'CA-DRE #00000002 (Simulated)',
    socialLinks: { linkedin: 'https://www.example.com', instagram: 'https://www.example.com' },
    isActive: true,
    createdAt: '2026-01-11T09:15:00.000Z',
    updatedAt: '2026-01-11T09:15:00.000Z'
  },
  {
    id: 'ag-201-marcus',
    tenantId: 't-2002-monolith',
    email: 'marcus.vance@monolith.example.com',
    fullName: 'Marcus Vance',
    role: 'agent',
    phone: '+1 (212) 555-0191',
    bio: 'Authority on board-formed concrete and urban architectural penthouses. (Simulated Profile)',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
    licenseCode: 'NY-REB #00000003 (Simulated)',
    socialLinks: { linkedin: 'https://www.example.com' },
    isActive: true,
    createdAt: '2026-01-15T11:00:00.000Z',
    updatedAt: '2026-01-15T11:00:00.000Z'
  },
  {
    id: 'ag-202-ingrid',
    tenantId: 't-2002-monolith',
    email: 'ingrid.sorensen@monolith.example.com',
    fullName: 'Ingrid Sørensen',
    role: 'agent',
    phone: '+1 (212) 555-0192',
    bio: 'Curates minimalist villas and adaptive-reuse landmarks across the Hudson Valley. (Simulated Profile)',
    avatarUrl: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&w=400&q=80',
    licenseCode: 'NY-REB #00000004 (Simulated)',
    socialLinks: { instagram: 'https://www.example.com' },
    isActive: true,
    createdAt: '2026-01-16T08:20:00.000Z',
    updatedAt: '2026-01-16T08:20:00.000Z'
  }
];

const RAW_FLOORPLAN_ATELIER = `
<svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
  <rect x="50" y="50" width="700" height="500" fill="none" stroke="#2C2B29" stroke-width="2"/>
  <line x1="250" y1="50" x2="250" y2="550" stroke="#2C2B29" stroke-width="1.5"/>
  <line x1="550" y1="50" x2="550" y2="550" stroke="#2C2B29" stroke-width="1.5"/>
  <text x="100" y="300" font-family="sans-serif" font-size="14" fill="#6B6864">Primary Pavilion</text>
  <text x="350" y="300" font-family="sans-serif" font-size="14" fill="#6B6864">Central Courtyard</text>
  <text x="600" y="300" font-family="sans-serif" font-size="14" fill="#6B6864">Tea Gallery</text>
</svg>
`;

const RAW_FLOORPLAN_ATELIER_TERRACE = `
<svg viewBox="0 0 800 420" xmlns="http://www.w3.org/2000/svg">
  <rect x="40" y="40" width="720" height="340" fill="none" stroke="#2C2B29" stroke-width="2"/>
  <rect x="90" y="90" width="240" height="240" fill="none" stroke="#B59E7D" stroke-width="1.5"/>
  <rect x="380" y="90" width="330" height="240" fill="none" stroke="#B59E7D" stroke-width="1.5"/>
  <text x="150" y="215" font-family="sans-serif" font-size="13" fill="#6B6864">Plunge Basin</text>
  <text x="500" y="215" font-family="sans-serif" font-size="13" fill="#6B6864">Terrace Lounge</text>
</svg>
`;

const RAW_FLOORPLAN_MONOLITH = `
<svg viewBox="0 0 800 520" xmlns="http://www.w3.org/2000/svg">
  <rect x="40" y="40" width="720" height="440" fill="none" stroke="#111213" stroke-width="3"/>
  <rect x="120" y="110" width="250" height="300" fill="none" stroke="#4A4D50" stroke-width="1.5"/>
  <rect x="430" y="110" width="250" height="300" fill="none" stroke="#4A4D50" stroke-width="1.5"/>
  <text x="180" y="265" font-family="sans-serif" font-size="14" fill="#4A4D50">Salon</text>
  <text x="500" y="265" font-family="sans-serif" font-size="14" fill="#4A4D50">Service Core</text>
</svg>
`;

export const MOCK_PROPERTIES: Property[] = [
  {
    id: 'p-101-kura-house',
    tenantId: 't-1001-atelier',
    title: 'The Kura Residence',
    slug: 'the-kura-residence',
    tagline: 'Cedar, basalt, and light woven into an architectural sanctuary.',
    description:
      'An expansive modernist sanctuary inspired by traditional Japanese storehouse aesthetics. Features charred cedar cladding, floor-to-ceiling glass corridors, and an interior moss courtyard.',
    price: 6850000,
    currency: 'USD',
    status: 'active',
    type: 'architectural_estate',
    featured: true,
    address: {
      streetAddress: '1420 Skyline Ridge Road',
      neighborhood: 'Oakland Hills',
      city: 'Oakland',
      stateProvince: 'CA',
      postalCode: '94611',
      country: 'USA',
      coordinates: { latitude: 37.8421, longitude: -122.2045 }
    },
    specs: {
      bedrooms: 4,
      bathrooms: 4,
      powderRooms: 1,
      interiorSquareFeet: 5200,
      exteriorSquareFeet: 1800,
      lotSizeAcres: 1.4,
      yearBuilt: 2024,
      architectName: 'Shinohara Associates',
      structuralMaterial: ['Charred Cedar', 'Board-Formed Concrete', 'Basalt'],
      ceilingHeightFeet: 12.5,
      parkingSpaces: 3,
      energyRating: 'LEED Platinum'
    },
    amenities: ['Zen Courtyard', 'Geothermal Radiant Heating', 'Saltwater Soaking Pool', 'Wine Vault', 'Smart Acoustic Insulation'],
    media: [
      {
        id: 'm-101-1',
        url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=80',
        caption: 'Exterior facade at twilight',
        order: 1,
        isCover: true,
        type: 'exterior'
      },
      {
        id: 'm-101-2',
        url: 'https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=1600&q=80',
        caption: 'Main living gallery facing west',
        order: 2,
        isCover: false,
        type: 'interior'
      }
    ],
    floorPlans: [
      {
        id: 'fp-101-level-1',
        levelName: 'Main Residence Level',
        levelIndex: 1,
        svgContent: validateAndSanitizeSvgIngest(RAW_FLOORPLAN_ATELIER),
        width: 800,
        height: 600,
        hotspots: [
          {
            id: 'hs-101-1',
            xRatio: 0.31,
            yRatio: 0.5,
            title: 'Central Atrium',
            description: 'Double-height volume framing morning sunlight.',
            associatedMediaId: 'm-101-2'
          }
        ]
      },
      {
        id: 'fp-101-level-2',
        levelName: 'Upper Terrace',
        levelIndex: 2,
        svgContent: validateAndSanitizeSvgIngest(RAW_FLOORPLAN_ATELIER_TERRACE),
        width: 800,
        height: 420,
        hotspots: [
          {
            id: 'hs-101-2',
            xRatio: 0.62,
            yRatio: 0.45,
            title: 'Terrace Lounge',
            description: 'Covered outdoor room facing the western ridgeline.'
          },
          {
            id: 'hs-101-3',
            xRatio: 1.18,
            yRatio: -0.25,
            title: 'Clamped Overshoot',
            description: 'Hotspot ratios outside [0,1] are clamped before rendering.'
          }
        ]
      },
      {
        id: 'fp-101-level-3',
        levelName: 'Subterranean Cellar',
        levelIndex: 3,
        svgContent: validateAndSanitizeSvgIngest(RAW_FLOORPLAN_ATELIER_TERRACE),
        width: 800,
        height: 420,
        hotspots: [
          {
            id: 'hs-101-4',
            xRatio: 0.25,
            yRatio: 0.55,
            title: 'Wine Vault',
            description: 'Climate-stabilised barrel room beneath the courtyard.'
          }
        ]
      }
    ],
    listingAgentId: 'ag-101-elena',
    publishedAt: '2026-02-01T09:00:00.000Z',
    createdAt: '2026-01-20T12:00:00.000Z',
    updatedAt: '2026-02-01T09:00:00.000Z'
  },
  {
    id: 'p-102-hakone-pavilion',
    tenantId: 't-1001-atelier',
    title: 'Hakone Pavilion',
    slug: 'hakone-pavilion',
    tagline: 'A glass pavilion suspended between redwood canopy and still water.',
    description:
      'Three structural bays of steel and glass open completely to a reflecting pool. The main pavilion dissolves into a single 40-foot glass wall that retracts into the hillside.',
    price: 4250000,
    currency: 'USD',
    status: 'active',
    type: 'minimalist_villa',
    featured: false,
    address: {
      streetAddress: '88 Cedar Hollow Lane',
      neighborhood: 'Kentwood',
      city: 'Kentwood',
      stateProvince: 'CA',
      postalCode: '94952',
      country: 'USA',
      coordinates: { latitude: 37.8805, longitude: -122.4687 }
    },
    specs: {
      bedrooms: 3,
      bathrooms: 3,
      powderRooms: 1,
      interiorSquareFeet: 3400,
      exteriorSquareFeet: 1400,
      lotSizeAcres: 2.6,
      yearBuilt: 2023,
      architectName: 'Watanabe Studio',
      structuralMaterial: ['Weathering Steel', 'Low-Iron Glass', 'Douglas Fir'],
      ceilingHeightFeet: 11,
      parkingSpaces: 2,
      energyRating: 'LEED Gold'
    },
    amenities: ['Retracting Glass Wall', 'Reflecting Pool', 'Redwood Sauna', 'Sculpture Garden'],
    media: [
      {
        id: 'm-102-1',
        url: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1600&q=80',
        caption: 'Pavilion reflected in the still pool',
        order: 1,
        isCover: true,
        type: 'exterior'
      },
      {
        id: 'm-102-2',
        url: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1600&q=80',
        caption: 'Interior reading platform',
        order: 2,
        isCover: false,
        type: 'interior'
      }
    ],
    floorPlans: [
      {
        id: 'fp-102-level-1',
        levelName: 'Pavilion Level',
        levelIndex: 1,
        svgContent: validateAndSanitizeSvgIngest(RAW_FLOORPLAN_ATELIER),
        width: 800,
        height: 600,
        hotspots: [
          {
            id: 'hs-102-1',
            xRatio: 0.5,
            yRatio: 0.22,
            title: 'Retracting Glass Wall',
            description: 'Sliding plane disappears into the structural bay.',
            associatedMediaId: 'm-102-2'
          }
        ]
      }
    ],
    listingAgentId: 'ag-101-elena',
    publishedAt: '2026-02-04T11:00:00.000Z',
    createdAt: '2026-01-26T09:30:00.000Z',
    updatedAt: '2026-02-04T11:00:00.000Z'
  },
  {
    id: 'p-103-seacliff-modern',
    tenantId: 't-1001-atelier',
    title: 'Seacliff Modern',
    slug: 'seacliff-modern',
    tagline: 'Low-slung concrete terraces stepping toward the Pacific.',
    description:
      'A horizontal composition of board-formed concrete terraces, conceived as a private cliff garden. Sea fog rolls through the courtyard on winter mornings.',
    price: 8900000,
    currency: 'USD',
    status: 'under_contract',
    type: 'coastal_residence',
    featured: false,
    address: {
      streetAddress: '27 Cliffside Terrace',
      neighborhood: 'Seacliff',
      city: 'Pacifica',
      stateProvince: 'CA',
      postalCode: '94044',
      country: 'USA',
      coordinates: { latitude: 37.6248, longitude: -122.4936 }
    },
    specs: {
      bedrooms: 5,
      bathrooms: 5,
      powderRooms: 2,
      interiorSquareFeet: 6100,
      exteriorSquareFeet: 2600,
      lotSizeAcres: 0.8,
      yearBuilt: 2022,
      architectName: 'Okafor Lindqvist',
      structuralMaterial: ['Board-Formed Concrete', 'White Oak', 'Travertine'],
      ceilingHeightFeet: 10.5,
      parkingSpaces: 4,
      energyRating: 'LEED Silver'
    },
    amenities: ['Ocean Terrace', 'Cold Plunge', 'Private Lift', 'Architectural Library', 'Solar Array'],
    media: [
      {
        id: 'm-103-1',
        url: 'https://images.unsplash.com/photo-1512915922686-57c11dde9b6b?auto=format&fit=crop&w=1600&q=80',
        caption: 'Cliff terraces at low tide',
        order: 1,
        isCover: true,
        type: 'exterior'
      }
    ],
    floorPlans: [],
    listingAgentId: 'ag-102-julian',
    publishedAt: '2026-01-18T08:00:00.000Z',
    createdAt: '2026-01-05T10:45:00.000Z',
    updatedAt: '2026-02-12T16:20:00.000Z'
  },
  {
    id: 'p-104-larkspur-restoration',
    tenantId: 't-1001-atelier',
    title: 'Larkspur Foundry Restoration',
    slug: 'larkspur-foundry-restoration',
    tagline: 'A 1908 ironworks hall reborn as a single-family residence.',
    description:
      'Careful subtraction: riveted steel trusses, new zinc cladding, and a single inserted timber volume that holds the domestic programme. The original crane rail remains overhead.',
    price: 5150000,
    currency: 'USD',
    status: 'draft',
    type: 'historic_renovation',
    featured: false,
    address: {
      streetAddress: '940 Larkspur Street',
      neighborhood: 'West Oakland',
      city: 'Oakland',
      stateProvince: 'CA',
      postalCode: '94607',
      country: 'USA',
      coordinates: { latitude: 37.8081, longitude: -122.2986 }
    },
    specs: {
      bedrooms: 3,
      bathrooms: 3,
      powderRooms: 1,
      interiorSquareFeet: 4600,
      exteriorSquareFeet: 900,
      lotSizeAcres: 0.3,
      yearBuilt: 2026,
      architectName: 'Ferrand Reyes',
      structuralMaterial: ['Riveted Steel', 'Blackened Timber', 'Zinc'],
      ceilingHeightFeet: 22,
      parkingSpaces: 2
    },
    amenities: ['Crane Rail Preservation', 'Black-Box Cinema', 'Masonry Workshop'],
    media: [
      {
        id: 'm-104-1',
        url: 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=1600&q=80',
        caption: 'Inserted timber volume within the original hall',
        order: 1,
        isCover: true,
        type: 'interior'
      }
    ],
    floorPlans: [],
    listingAgentId: 'ag-102-julian',
    publishedAt: null,
    createdAt: '2026-02-18T13:10:00.000Z',
    updatedAt: '2026-02-18T13:10:00.000Z'
  },
  {
    id: 'p-201-monolith-one',
    tenantId: 't-2002-monolith',
    title: 'The Brutalist Vault Penthouse',
    slug: 'the-brutalist-vault-penthouse',
    tagline: 'Raw concrete geometry suspended above Manhattan.',
    description:
      'A bespoke triplex penthouse crafted from monolithic cast concrete, hand-hammered steel, and acoustic bronze glazing overlooking the skyline.',
    price: 14500000,
    currency: 'USD',
    status: 'active',
    type: 'urban_penthouse',
    featured: true,
    address: {
      streetAddress: '540 West 24th Street',
      unit: 'Penthouse A',
      neighborhood: 'West Chelsea',
      city: 'New York',
      stateProvince: 'NY',
      postalCode: '10011',
      country: 'USA',
      coordinates: { latitude: 40.7495, longitude: -74.0048 }
    },
    specs: {
      bedrooms: 3,
      bathrooms: 4,
      powderRooms: 1,
      interiorSquareFeet: 6400,
      exteriorSquareFeet: 2100,
      lotSizeAcres: 0,
      yearBuilt: 2025,
      architectName: 'Studio Grauwacke',
      structuralMaterial: ['Cast Concrete', 'Raw Bronze', 'Smoked Oak'],
      ceilingHeightFeet: 14,
      parkingSpaces: 2,
      energyRating: 'Energy Star Certified'
    },
    amenities: [
      'Private Elevator Vestibule',
      'Panoramic Rooftop Terrace',
      'Bronze Reflecting Pool',
      'Art Storage Vault',
      '24-Hour Attended Lobby'
    ],
    media: [
      {
        id: 'm-201-1',
        url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1600&q=80',
        caption: 'Cantilevered salon and terrace',
        order: 1,
        isCover: true,
        type: 'exterior'
      }
    ],
    floorPlans: [],
    listingAgentId: 'ag-201-marcus',
    publishedAt: '2026-02-10T14:00:00.000Z',
    createdAt: '2026-02-05T10:00:00.000Z',
    updatedAt: '2026-02-10T14:00:00.000Z'
  },
  {
    id: 'p-202-hudson-cantilever',
    tenantId: 't-2002-monolith',
    title: 'Hudson Cantilever House',
    slug: 'hudson-cantilever-house',
    tagline: 'Two board-formed volumes projecting over the water.',
    description:
      'A weekend residence built from two cantilevered concrete trays over the Hudson shoreline. Every principal room reads the water; the cores hold the weight.',
    price: 12750000,
    currency: 'USD',
    status: 'active',
    type: 'minimalist_villa',
    featured: false,
    address: {
      streetAddress: '17 Breakwater Ridge',
      neighborhood: 'Tarrytown',
      city: 'Tarrytown',
      stateProvince: 'NY',
      postalCode: '10591',
      country: 'USA',
      coordinates: { latitude: 41.0762, longitude: -73.8587 }
    },
    specs: {
      bedrooms: 4,
      bathrooms: 4,
      powderRooms: 1,
      interiorSquareFeet: 5800,
      exteriorSquareFeet: 1900,
      lotSizeAcres: 1.9,
      yearBuilt: 2024,
      architectName: 'Atelier Braque',
      structuralMaterial: ['Board-Formed Concrete', 'Bronze Anodized Aluminium', 'Ash'],
      ceilingHeightFeet: 11.5,
      parkingSpaces: 3,
      energyRating: 'LEED Gold'
    },
    amenities: ['Shoreline Access', 'Indoor Lap Pool', 'Screening Room', 'Two Kitchens'],
    media: [
      {
        id: 'm-202-1',
        url: 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1600&q=80',
        caption: 'Northern elevation over the shoreline',
        order: 1,
        isCover: true,
        type: 'exterior'
      },
      {
        id: 'm-202-2',
        url: 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1600&q=80',
        caption: 'Double-height living tray',
        order: 2,
        isCover: false,
        type: 'interior'
      }
    ],
    floorPlans: [
      {
        id: 'fp-202-level-1',
        levelName: 'Principal Tray',
        levelIndex: 1,
        svgContent: validateAndSanitizeSvgIngest(RAW_FLOORPLAN_MONOLITH),
        width: 800,
        height: 520,
        hotspots: [
          {
            id: 'hs-202-1',
            xRatio: 0.3,
            yRatio: 0.52,
            title: 'Living Tray',
            description: 'Cantilevered salon aligned to the river axis.',
            associatedMediaId: 'm-202-2'
          }
        ]
      }
    ],
    listingAgentId: 'ag-202-ingrid',
    publishedAt: '2026-02-06T15:30:00.000Z',
    createdAt: '2026-01-28T12:00:00.000Z',
    updatedAt: '2026-02-06T15:30:00.000Z'
  },
  {
    id: 'p-203-mercer-exchange',
    tenantId: 't-2002-monolith',
    title: 'Mercer Exchange Loft',
    slug: 'mercer-exchange-loft',
    tagline: 'Cast iron bones, gallery-white volume, and a city of windows.',
    description:
      'A former printing exchange converted into a single 5,200 square foot gallery loft, keeping the original cast-iron columns fully exposed and the partitions entirely freestanding.',
    price: 3950000,
    currency: 'USD',
    status: 'pending',
    type: 'historic_renovation',
    featured: false,
    address: {
      streetAddress: '214 Mercer Street',
      unit: 'Floor 6',
      neighborhood: 'SoHo',
      city: 'New York',
      stateProvince: 'NY',
      postalCode: '10012',
      country: 'USA',
      coordinates: { latitude: 40.7241, longitude: -74.0002 }
    },
    specs: {
      bedrooms: 2,
      bathrooms: 2,
      powderRooms: 1,
      interiorSquareFeet: 5200,
      exteriorSquareFeet: 0,
      lotSizeAcres: 0,
      yearBuilt: 1898,
      architectName: 'Ferrostudio',
      structuralMaterial: ['Cast Iron', 'Polished Concrete', 'Powder-Coated Steel'],
      ceilingHeightFeet: 13.5,
      parkingSpaces: 0
    },
    amenities: ['Freestanding Partition System', 'Freight Elevator', 'Climate-Controlled Storage'],
    media: [
      {
        id: 'm-203-1',
        url: 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1600&q=80',
        caption: 'Gallery volume along the north wall',
        order: 1,
        isCover: true,
        type: 'interior'
      }
    ],
    floorPlans: [],
    listingAgentId: 'ag-201-marcus',
    publishedAt: '2026-01-30T09:00:00.000Z',
    createdAt: '2026-01-12T14:20:00.000Z',
    updatedAt: '2026-02-15T10:05:00.000Z'
  }
];

/** Tenant-scoped convenience map used by the seeder and the tenant switcher. */
export const SEED_TENANT_IDS: Record<string, string> = Object.fromEntries(
  MOCK_TENANTS.map((tenant) => [tenant.slug, tenant.id])
);