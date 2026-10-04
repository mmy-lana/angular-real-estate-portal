export type UUID = string;
export type ISODateTimeString = string;

export type UserRole = 'super_admin' | 'tenant_admin' | 'agent' | 'client';

export type PropertyStatus =
  | 'draft'
  | 'active'
  | 'pending'
  | 'under_contract'
  | 'sold'
  | 'archived';

export type PropertyType =
  | 'architectural_estate'
  | 'minimalist_villa'
  | 'urban_penthouse'
  | 'historic_renovation'
  | 'coastal_residence';

export interface TenantThemeTokens {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  surfaceColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamilySerif: string;
  fontFamilySans: string;
  borderRadiusBase: string;
}

export interface TenantBranding {
  logoUrl: string;
  faviconUrl: string;
  agencyName: string;
  tagline: string;
  legalEntityName: string;
  contactEmail: string;
  contactPhone: string;
  licenseNumber: string;
  themeTokens: TenantThemeTokens;
}

export interface TenantFeatureFlags {
  enableMortgageCalculator: boolean;
  enableInteractiveFloorPlan: boolean;
  enableVirtualTours: boolean;
  enableAgentScheduling: boolean;
  enableValuationEstimator: boolean;
}

export interface Tenant {
  id: UUID;
  slug: string;
  customDomain: string | null;
  isActive: boolean;
  branding: TenantBranding;
  features: TenantFeatureFlags;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface AgentProfile {
  id: UUID;
  tenantId: UUID;
  email: string;
  fullName: string;
  role: UserRole;
  phone: string;
  bio: string;
  avatarUrl: string;
  licenseCode: string;
  socialLinks: {
    linkedin?: string;
    instagram?: string;
  };
  isActive: boolean;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface PropertyAddress {
  streetAddress: string;
  unit?: string;
  neighborhood: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string;
  coordinates: Coordinates;
}

export interface ArchitecturalSpecs {
  bedrooms: number;
  bathrooms: number;
  powderRooms: number;
  interiorSquareFeet: number;
  exteriorSquareFeet: number;
  lotSizeAcres: number;
  yearBuilt: number;
  architectName?: string;
  structuralMaterial: string[];
  ceilingHeightFeet: number;
  parkingSpaces: number;
  energyRating?: string;
}

export interface PropertyMedia {
  id: UUID;
  url: string;
  caption: string;
  order: number;
  isCover: boolean;
  type: 'interior' | 'exterior' | 'aerial' | 'floorplan' | 'detail';
}

export interface FloorPlanHotspot {
  id: UUID;
  xRatio: number;
  yRatio: number;
  title: string;
  description: string;
  associatedMediaId?: UUID;
}

export interface FloorPlanLevel {
  id: UUID;
  levelName: string;
  levelIndex: number;
  svgContent: string;
  width: number;
  height: number;
  hotspots: FloorPlanHotspot[];
}

export interface Property {
  id: UUID;
  tenantId: UUID;
  title: string;
  slug: string;
  tagline: string;
  description: string;
  price: number;
  currency: string;
  status: PropertyStatus;
  type: PropertyType;
  featured: boolean;
  address: PropertyAddress;
  specs: ArchitecturalSpecs;
  amenities: string[];
  media: PropertyMedia[];
  floorPlans: FloorPlanLevel[];
  listingAgentId: UUID;
  publishedAt: ISODateTimeString | null;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface MortgageCalculationInput {
  homePrice: number;
  downPaymentAmount: number;
  interestRatePercentage: number;
  loanTermYears: number;
  annualPropertyTaxRatePercentage: number;
  annualHomeInsuranceRatePercentage: number;
  monthlyHoaFee: number;
}

export interface MonthlyPaymentBreakdown {
  principalAndInterest: number;
  propertyTax: number;
  homeownersInsurance: number;
  hoaDues: number;
  totalMonthlyPayment: number;
}

export interface PropertyFilterCriteria {
  searchQuery?: string;
  propertyTypes: PropertyType[];
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  minBathrooms?: number;
  minSquareFeet?: number;
  neighborhood?: string;
  status?: PropertyStatus;
  sortBy: 'price_asc' | 'price_desc' | 'date_desc' | 'sqft_desc';
}

export interface TourBookingRequest {
  id: UUID;
  tenantId: UUID;
  propertyId: UUID;
  agentId: UUID;
  agentIsActive: boolean;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  scheduledDateTime: ISODateTimeString;
  tourType: 'in_person' | 'virtual_live';
  notes?: string;
  status: 'requested' | 'confirmed' | 'cancelled' | 'completed';
  createdAt: ISODateTimeString;
}
