import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal
} from '@angular/core';
import { MortgageCalculationInput, MonthlyPaymentBreakdown } from '../../core/models';
import {
  buildMortgageInputFromPrice,
  computeMonthlyMortgage,
  validateMortgageInput
} from '../../core/utils/mortgage.util';
import { formatCurrency, formatCurrencyPrecise } from '../../core/utils/format.util';
import { InputComponent } from '../../shared/ui-primitives/input/input.component';
import { SelectComponent } from '../../shared/ui-primitives/select/select.component';

type SliderKey = 'downPaymentPercent' | 'interestRatePercentage' | 'loanTermYears';

interface DonutSegment {
  label: string;
  amount: number;
  ratio: number;
  color: string;
  dashArray: string;
  dashOffset: number;
}

const TERM_OPTIONS = [
  { value: '15', label: '15 years' },
  { value: '20', label: '20 years' },
  { value: '30', label: '30 years' }
];

const DONUT_RADIUS = 42;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

/**
 * Interactive payment envelope for a financed purchase.
 *
 * Every edit recomputes through the pure {@link computeMonthlyMortgage} domain
 * function and republishes the breakdown through `calculationUpdated`, so the
 * detail page can persist or forward the result without recomputing.
 */
@Component({
  selector: 'app-mortgage-calculator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InputComponent, SelectComponent],
  templateUrl: './mortgage-calculator.component.html',
  styles: `
    .mortgage-slider {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 44px;
      background: transparent;
      cursor: pointer;
      touch-action: pan-y;
    }

    .mortgage-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 24px;
      height: 24px;
      border-radius: 999px;
      background: var(--color-brand-surface);
      border: 1px solid var(--color-brand-line);
      box-shadow: inset 0 0 0 4px var(--color-brand-surface), inset 0 0 0 8px var(--color-brand-primary);
    }

    .mortgage-slider::-moz-range-thumb {
      width: 24px;
      height: 24px;
      border-radius: 999px;
      background: var(--color-brand-surface);
      border: 1px solid var(--color-brand-line);
      box-shadow: inset 0 0 0 4px var(--color-brand-surface), inset 0 0 0 8px var(--color-brand-primary);
    }

    .mortgage-slider:focus-visible {
      outline: 2px solid var(--color-brand-accent);
      outline-offset: 2px;
    }
  `
})
export class MortgageCalculatorComponent {
  public readonly initialPrice = input.required<number>();
  public readonly currency = input<string>('USD');

  public readonly calculationUpdated = output<MonthlyPaymentBreakdown>();

  // Seeded with a neutral zero profile: `initialPrice` is a required input and
  // is not readable during construction, so the effect below installs the real
  // financing profile once the listing price arrives.
  private readonly form = signal<MortgageCalculationInput>(buildMortgageInputFromPrice(0));

  protected readonly termOptions = TERM_OPTIONS;
  protected readonly donutRadius = DONUT_RADIUS;
  protected readonly donutCircumference = DONUT_CIRCUMFERENCE;

  protected readonly validationIssues = computed(() => validateMortgageInput(this.form()));

  protected readonly breakdown = computed<MonthlyPaymentBreakdown | null>(() => {
    const input = this.form();
    if (this.validationIssues().length > 0) {
      return null;
    }
    try {
      return computeMonthlyMortgage(input);
    } catch {
      return null;
    }
  });

  protected readonly loanAmount = computed(() => {
    const input = this.form();
    return Math.max(0, input.homePrice - input.downPaymentAmount);
  });

  protected readonly downPaymentPercent = computed(() => {
    const input = this.form();
    if (input.homePrice <= 0) {
      return 0;
    }
    return Math.round((input.downPaymentAmount / input.homePrice) * 100);
  });

  protected readonly segments = computed<DonutSegment[]>(() => {
    const breakdown = this.breakdown();
    if (!breakdown || breakdown.totalMonthlyPayment <= 0) {
      return [];
    }
    const parts: { label: string; amount: number; color: string }[] = [
      { label: 'Principal & interest', amount: breakdown.principalAndInterest, color: 'var(--color-brand-primary)' },
      { label: 'Property tax', amount: breakdown.propertyTax, color: 'var(--color-brand-secondary)' },
      { label: 'Home insurance', amount: breakdown.homeownersInsurance, color: 'var(--color-brand-accent)' },
      { label: 'HOA dues', amount: breakdown.hoaDues, color: 'var(--color-brand-line)' }
    ];

    let consumed = 0;
    return parts
      .filter((part) => part.amount > 0)
      .map((part) => {
        const ratio = part.amount / breakdown.totalMonthlyPayment;
        const dashArray = `${ratio * DONUT_CIRCUMFERENCE} ${DONUT_CIRCUMFERENCE}`;
        const dashOffset = -consumed * DONUT_CIRCUMFERENCE;
        consumed += ratio;
        return { label: part.label, amount: part.amount, ratio, color: part.color, dashArray, dashOffset };
      });
  });

  constructor() {
    effect(() => {
      const price = Math.max(0, this.initialPrice());
      const current = this.form();
      if (price > 0 && current.homePrice !== price) {
        const previousPercent = current.homePrice > 0
          ? (current.downPaymentAmount / current.homePrice) * 100
          : 20;
        const downPaymentAmount = Math.round((price * Math.min(100, Math.max(0, previousPercent))) / 100);
        this.form.set(buildMortgageInputFromPrice(price, { downPaymentAmount }));
      }
    });

    effect(() => {
      const breakdown = this.breakdown();
      if (breakdown) {
        this.calculationUpdated.emit(breakdown);
      }
    });
  }

  protected onDownPaymentPercentInput(rawValue: string): void {
    const percent = Number(rawValue);
    if (!Number.isFinite(percent)) {
      return;
    }
    const clamped = Math.min(100, Math.max(0, percent));
    this.patch({ downPaymentAmount: Math.round((this.form().homePrice * clamped) / 100) });
  }

  protected onRateInput(rawValue: string): void {
    const rate = Number(rawValue);
    if (Number.isFinite(rate)) {
      this.patch({ interestRatePercentage: Math.min(30, Math.max(0, rate)) });
    }
  }

  protected onTermChange(rawValue: string): void {
    const years = Number(rawValue);
    if (Number.isFinite(years) && years > 0) {
      this.patch({ loanTermYears: years });
    }
  }

  protected onTaxInput(rawValue: string): void {
    const rate = Number(rawValue);
    if (Number.isFinite(rate)) {
      this.patch({ annualPropertyTaxRatePercentage: Math.min(10, Math.max(0, rate)) });
    }
  }

  protected onInsuranceInput(rawValue: string): void {
    const rate = Number(rawValue);
    if (Number.isFinite(rate)) {
      this.patch({ annualHomeInsuranceRatePercentage: Math.min(10, Math.max(0, rate)) });
    }
  }

  protected onHoaInput(rawValue: string): void {
    const fee = Number(rawValue);
    if (Number.isFinite(fee)) {
      this.patch({ monthlyHoaFee: Math.min(100000, Math.max(0, fee)) });
    }
  }

  protected issueFor(field: keyof MortgageCalculationInput): string | null {
    return this.validationIssues().find((issue) => issue.field === field)?.message ?? null;
  }

  protected formatAmount(value: number): string {
    return formatCurrencyPrecise(value, this.currency());
  }

  protected formatWhole(value: number): string {
    return formatCurrency(value, this.currency());
  }

  protected sliderFill(key: SliderKey): string {
    const input = this.form();
    const ranges: Record<SliderKey, { min: number; max: number; current: number }> = {
      downPaymentPercent: { min: 0, max: 60, current: Math.min(60, this.downPaymentPercent()) },
      interestRatePercentage: { min: 0, max: 12, current: Math.min(12, input.interestRatePercentage) },
      loanTermYears: { min: 5, max: 30, current: input.loanTermYears }
    };
    const range = ranges[key];
    const span = range.max - range.min;
    const ratio = span <= 0 ? 0 : ((range.current - range.min) / span) * 100;
    return `linear-gradient(to right, var(--color-brand-primary) ${ratio}%, var(--color-brand-line) ${ratio}%)`;
  }

  private patch(changes: Partial<MortgageCalculationInput>): void {
    this.form.update((current) => ({ ...current, ...changes }));
  }
}