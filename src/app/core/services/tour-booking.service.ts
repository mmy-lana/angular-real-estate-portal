import { Injectable, inject } from '@angular/core';
import { AgentProfile, Property, TourBookingRequest } from '../models';
import {
  AGENT_STORE,
  BOOKING_STORE,
  IndexedDbStorageService,
  PROPERTY_STORE,
  isAgentProfile
} from './indexed-db-storage.service';

export type TourBookingDraft = Omit<TourBookingRequest, 'id' | 'createdAt' | 'agentIsActive'>;

export type TourBookingResult =
  | { ok: true; booking: TourBookingRequest }
  | { ok: false; reason: string };

/**
 * Generates a booking identifier from a cryptographically secure source.
 *
 * `crypto.randomUUID` is preferred; older or non-secure contexts fall back to
 * `crypto.getRandomValues`. `Math.random` is deliberately never used: booking
 * references are shown to clients and must not be guessable.
 */
export function createBookingId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  throw new Error('A cryptographically secure random source is required to issue booking references.');
}

/**
 * Tour inquiry persistence.
 *
 * Security contract enforced on every write:
 * - The assigned listing agent must exist, belong to the same tenant as the
 *   booking, and still be active.
 * - The property being toured must exist inside that same tenant.
 * - `agentIsActive` is denormalized as `true` only after both checks pass.
 */
@Injectable({ providedIn: 'root' })
export class TourBookingService {
  private readonly storage = inject(IndexedDbStorageService);

  /** Validates and persists a tour inquiry, or returns a typed failure reason. */
  public async createBooking(draft: TourBookingDraft): Promise<TourBookingResult> {
    const validationIssue = validateTourBookingDraft(draft);
    if (validationIssue) {
      return { ok: false, reason: validationIssue };
    }

    await this.storage.seedIfEmpty();

    const storedAgent = await this.storage.getById<AgentProfile>(AGENT_STORE, draft.agentId);
    const agent = isAgentProfile(storedAgent) ? storedAgent : null;

    if (!agent) {
      return { ok: false, reason: 'The assigned agent could not be found for this residence.' };
    }
    if (!agent.isActive) {
      return { ok: false, reason: 'This agent is no longer accepting tour requests.' };
    }
    if (agent.tenantId !== draft.tenantId) {
      return { ok: false, reason: 'Security violation: assigned agent does not belong to the target tenant.' };
    }

    const property = await this.storage.getById<Property>(PROPERTY_STORE, draft.propertyId);
    if (!property || property.tenantId !== draft.tenantId) {
      return { ok: false, reason: 'Security violation: residence does not belong to the target tenant.' };
    }

    const booking: TourBookingRequest = {
      ...draft,
      id: createBookingId(),
      agentIsActive: true,
      createdAt: new Date().toISOString()
    };

    await this.storage.put(BOOKING_STORE, booking);
    return { ok: true, booking };
  }

  /** All inquiries held by a tenant, newest first. */
  public async listBookingsForTenant(tenantId: string): Promise<TourBookingRequest[]> {
    const stored = await this.storage.getAllByIndex<TourBookingRequest>(BOOKING_STORE, 'tenantId', tenantId);
    return stored
      .filter((booking) => booking.tenantId === tenantId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /** All inquiries attached to one residence, newest first. */
  public async listBookingsForProperty(propertyId: string): Promise<TourBookingRequest[]> {
    const stored = await this.storage.getAllByIndex<TourBookingRequest>(BOOKING_STORE, 'propertyId', propertyId);
    return stored.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Cancels an inquiry.
   *
   * Knowing a booking id is not sufficient: the caller must also present the
   * client email captured when the request was created, and the booking must
   * belong to the calling tenant. Without the email check any client could
   * cancel an arbitrary inquiry by enumerating identifiers.
   */
  public async cancelBooking(
    tenantId: string,
    bookingId: string,
    clientEmail: string
  ): Promise<TourBookingResult> {
    const normalizedEmail = (clientEmail ?? '').trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      return { ok: false, reason: 'A valid client email is required to verify cancellation.' };
    }

    const stored = await this.storage.getById<TourBookingRequest>(BOOKING_STORE, bookingId);
    if (!stored) {
      return { ok: false, reason: 'Tour request not found.' };
    }
    if (stored.tenantId !== tenantId) {
      return { ok: false, reason: 'Security violation: booking does not belong to the target tenant.' };
    }
    if (stored.clientEmail.trim().toLowerCase() !== normalizedEmail) {
      return { ok: false, reason: 'Authorization failed: email does not match booking record.' };
    }

    const cancelled: TourBookingRequest = { ...stored, status: 'cancelled' };
    await this.storage.put(BOOKING_STORE, cancelled);
    return { ok: true, booking: cancelled };
  }
}

/** Field-level validation for the lead capture form; returns the first issue. */
export function validateTourBookingDraft(draft: TourBookingDraft): string | null {
  if (draft.clientName.trim().length < 2) {
    return 'Please provide the full name for the visit.';
  }
  if (!isValidEmail(draft.clientEmail)) {
    return 'Please provide a valid email address.';
  }
  if (!isValidPhone(draft.clientPhone)) {
    return 'Please provide a contact phone number.';
  }
  const scheduled = new Date(draft.scheduledDateTime);
  if (Number.isNaN(scheduled.getTime())) {
    return 'Please choose a valid tour date and time.';
  }
  if (scheduled.getTime() < Date.now() - 60_000) {
    return 'Please choose a tour slot in the future.';
  }
  if (draft.tourType !== 'in_person' && draft.tourType !== 'virtual_live') {
    return 'Please select a tour format.';
  }
  return null;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const PHONE_PATTERN = /^[+()\-.\s\d]{7,20}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return PHONE_PATTERN.test(value.trim()) && digits.length >= 7 && digits.length <= 15;
}