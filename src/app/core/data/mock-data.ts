import { Tenant, Property, AgentProfile } from '../models';
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
      legalEntityName: 'Atelier Living Real Estate LLC',
      logoUrl: '',
      faviconUrl: '',
      contactEmail: 'concierge@atelierliving.com',
      contactPhone: '+1 (415) 890-2100',
      licenseNumber: 'CA-DRE #02194831',
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
      legalEntityName: 'Monolith Realty Group Corp',
      logoUrl: '',
      faviconUrl: '',
      contactEmail: 'acquisitions@monolith.com',
      contactPhone: '+1 (212) 555-0199',
      licenseNumber: 'NY-REB #1094032',
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
    email: 'elena.rostova@atelierliving.com',
    fullName: 'Elena Rostova',
    role: 'agent',
    phone: '+1 (415) 890-2101',
    bio: 'Specialist in mid-century Japanese post-and-beam masterworks.',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
    licenseCode: 'CA-DRE #01994821',
    socialLinks: { linkedin: 'https://linkedin.com' },
    isActive: true,
    createdAt: '2026-01-10T08:30:00.000Z',
    updatedAt: '2026-01-10T08:30:00.000Z'
  },
  {
    id: 'ag-201-marcus',
    tenantId: 't-2002-monolith',
    email: 'marcus.vance@monolith.com',
    fullName: 'Marcus Vance',
    role: 'agent',
    phone: '+1 (212) 555-0205',
    bio: 'Authority on board-formed concrete and urban architectural penthouses.',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
    licenseCode: 'NY-REB #1088412',
    socialLinks: { linkedin: 'https://linkedin.com' },
    isActive: true,
    createdAt: '2026-01-15T11:00:00.000Z',
    updatedAt: '2026-01-15T11:00:00.000Z'
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

export const MOCK_PROPERTIES: Property[] = [
  {
    id: 'p-101-kura-house',
    tenantId: 't-1001-atelier',
    title: 'The Kura Residence',
    slug: 'the-kura-residence',
    tagline: 'Cedar, basalt, and light woven into an architectural sanctuary.',
    description: 'An expansive modernist sanctuary inspired by traditional Japanese storehouse aesthetics. Features charred cedar cladding, floor-to-ceiling glass corridors, and an interior moss courtyard.',
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
    amenities: [
      'Zen Courtyard',
      'Geothermal Radiant Heating',
      'Saltwater Soaking Pool',
      'Wine Vault',
      'Smart Acoustic Insulation'
    ],
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
      }
    ],
    listingAgentId: 'ag-101-elena',
    publishedAt: '2026-02-01T09:00:00.000Z',
    createdAt: '2026-01-20T12:00:00.000Z',
    updatedAt: '2026-02-01T09:00:00.000Z'
  },
  {
    id: 'p-201-monolith-one',
    tenantId: 't-2002-monolith',
    title: 'The Brutalist Vault Penthouse',
    slug: 'the-brutalist-vault-penthouse',
    tagline: 'Raw concrete geometry suspended above Manhattan.',
    description: 'A bespoke triplex penthouse crafted from monolithic cast concrete, hand-hammered steel, and acoustic bronze glazing overlooking the skyline.',
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
      ceilingHeightFeet: 14.0,
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
  }
];
