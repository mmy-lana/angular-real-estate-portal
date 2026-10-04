import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { AgentProfile, Property, TourBookingRequest } from '../../core/models';
import { TourBookingService, isValidEmail, isValidPhone } from '../../core/services/tour-booking.service';
import { formatTourDate, formatTimeSlot } from '../../core/utils/format.util';
import { ButtonComponent } from '../../shared/ui-primitives/button/button.component';
import { InputComponent } from '../../shared/ui-primitives/input/input.component';
import { SelectComponent } from '../../shared/ui-primitives/select/select.component';
import { SheetModalComponent } from '../../shared/ui-primitives/sheet-modal/sheet-modal.component';

type FieldName = 'clientName' | 'clientEmail' | 'clientPhone' | 'scheduledDateTime' | 'tourType';
type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

const TOUR_TYPE_OPTIONS = [
  { value: 'in_person', label: 'In-person viewing' },
  { value: 'virtual_live', label: 'Live virtual tour' }
];

/** Generates bookable slots for the next five days, hourly from 09:00 to 18:00. */
export function buildAvailableSlots(referenceDate: Date = new Date()): string[] {
  const slots: string[] = [];
  for (let dayOffset = 1; dayOffset <= 5; dayOffset += 1) {
    const day = new Date(referenceDate);
    day.setDate(day.getDate() + dayOffset);
    day.setHours(0, 0, 0, 0);
    for (let hour = 9; hour <= 18; hour += 1) {
      const slot = new Date(day);
      slot.setHours(hour, 0, 0, 0);
      slots.push(slot.toISOString());
    }
  }
  return slots;
}

/**
 * Lead capture and tour scheduling.
 *
 * Submission runs through `TourBookingService.createBooking`, which re-checks
 * that the assigned agent is still active and still belongs to the tenant
 * before anything is written to IndexedDB.
 */
@Component({
  selector: 'app-schedule-tour-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SheetModalComponent, InputComponent, SelectComponent, ButtonComponent],
  templateUrl: './schedule-tour-dialog.component.html'
})
export class ScheduleTourDialogComponent {
  public readonly property = input.required<Property>();
  public readonly agent = input.required<AgentProfile>();
  public readonly isOpen = input<boolean>(false);
  public readonly virtualToursEnabled = input<boolean>(true);

  public readonly closed = output<void>();
  public readonly bookingCompleted = output<TourBookingRequest>();

  private readonly bookingService = inject(TourBookingService);

  protected readonly tourTypeOptions = computed(() =>
    this.virtualToursEnabled()
      ? TOUR_TYPE_OPTIONS
      : TOUR_TYPE_OPTIONS.filter((option) => option.value === 'in_person')
  );

  protected readonly slots = signal<string[]>(buildAvailableSlots());
  protected readonly slotOptions = computed(() =>
    this.slots().map((slot) => ({
      value: slot,
      label: `${formatTourDate(slot)} · ${formatTimeSlot(slot)}`
    }))
  );

  protected readonly clientName = signal('');
  protected readonly clientEmail = signal('');
  protected readonly clientPhone = signal('');
  protected readonly notes = signal('');
  protected readonly tourType = signal<'in_person' | 'virtual_live'>('in_person');
  protected readonly scheduledDateTime = signal('');
  protected readonly submitState = signal<SubmitState>('idle');
  protected readonly submitError = signal<string | null>(null);
  protected readonly confirmedBooking = signal<TourBookingRequest | null>(null);
  protected readonly touched = signal(false);

  protected readonly errors = computed<Partial<Record<FieldName, string>>>(() => {
    const result: Partial<Record<FieldName, string>> = {};
    if (this.clientName().trim().length < 2) {
      result['clientName'] = 'Please provide the full name for the visit.';
    }
    if (!isValidEmail(this.clientEmail())) {
      result['clientEmail'] = 'Please provide a valid email address.';
    }
    if (!isValidPhone(this.clientPhone())) {
      result['clientPhone'] = 'Please provide a contact phone number.';
    }
    if (this.scheduledDateTime() === '') {
      result['scheduledDateTime'] = 'Choose an available tour slot.';
    }
    if (this.tourType() !== 'in_person' && this.tourType() !== 'virtual_live') {
      result['tourType'] = 'Select a tour format.';
    }
    return result;
  });

  protected readonly isValid = computed(() => Object.keys(this.errors()).length === 0);
  protected readonly formatTourDate = formatTourDate;
  protected readonly formatTimeSlot = formatTimeSlot;
  protected readonly agentIsActive = computed(() => this.agent().isActive);
  protected readonly agentTenantMatches = computed(() => this.agent().tenantId === this.property().tenantId);

  protected errorFor(field: FieldName): string | null {
    return this.touched() ? (this.errors()[field] ?? null) : null;
  }

  protected onNameChange(value: string): void {
    this.clientName.set(value);
  }

  protected onEmailChange(value: string): void {
    this.clientEmail.set(value);
  }

  protected onPhoneChange(value: string): void {
    this.clientPhone.set(value);
  }

  protected onNotesChange(value: string): void {
    this.notes.set(value);
  }

  protected onSlotChange(value: string): void {
    this.scheduledDateTime.set(value);
  }

  protected onTourTypeChange(value: string): void {
    this.tourType.set(value === 'virtual_live' ? 'virtual_live' : 'in_person');
  }

  protected async submit(): Promise<void> {
    this.touched.set(true);
    if (!this.isValid() || this.submitState() === 'submitting') {
      return;
    }

    this.submitState.set('submitting');
    this.submitError.set(null);

    const notes = this.notes().trim();
    const result = await this.bookingService.createBooking({
      tenantId: this.property().tenantId,
      propertyId: this.property().id,
      agentId: this.agent().id,
      clientName: this.clientName().trim(),
      clientEmail: this.clientEmail().trim(),
      clientPhone: this.clientPhone().trim(),
      scheduledDateTime: this.scheduledDateTime(),
      tourType: this.tourType(),
      status: 'requested',
      ...(notes === '' ? {} : { notes })
    });

    if (result.ok) {
      this.confirmedBooking.set(result.booking);
      this.submitState.set('success');
      this.bookingCompleted.emit(result.booking);
      return;
    }

    this.submitError.set(result.reason);
    this.submitState.set('error');
  }

  protected dismiss(): void {
    this.reset();
    this.closed.emit();
  }

  protected reset(): void {
    this.clientName.set('');
    this.clientEmail.set('');
    this.clientPhone.set('');
    this.notes.set('');
    this.tourType.set('in_person');
    this.scheduledDateTime.set('');
    this.submitState.set('idle');
    this.submitError.set(null);
    this.confirmedBooking.set(null);
    this.touched.set(false);
  }
}