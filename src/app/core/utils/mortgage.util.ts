import { MortgageCalculationInput, MonthlyPaymentBreakdown } from '../models';

/** Industry-standard baseline used when a tenant has no bespoke financing profile. */
export const MORTGAGE_DEFAULTS = {
  downPaymentPercent: 20,
  interestRatePercentage: 6.5,
  loanTermYears: 30,
  annualPropertyTaxRatePercentage: 1.1,
  annualHomeInsuranceRatePercentage: 0.45,
  monthlyHoaFee: 0
} as const;

export type MortgageValidationIssue = {
  field: keyof MortgageCalculationInput;
  message: string;
};

function roundCurrency(value: number): number {
  return Number(value.toFixed(2));
}

/**
 * Computes the full monthly payment envelope for a financed purchase.
 *
 * Domain safety rules:
 * - Home price and loan term must be strictly positive (throws `RangeError`).
 * - Down payment is floored at zero and can never exceed the home price.
 * - Negative interest, tax, insurance and HOA inputs are clamped to zero.
 * - A zero-interest loan degrades to straight-line principal repayment
 *   instead of dividing by `(1 + r)^n - 1 === 0`.
 */
export function computeMonthlyMortgage(input: MortgageCalculationInput): MonthlyPaymentBreakdown {
  if (input.loanTermYears <= 0 || input.homePrice <= 0) {
    throw new RangeError('Loan term years and home price must be strictly positive numbers');
  }

  const principal = Math.max(0, input.homePrice - Math.max(0, input.downPaymentAmount));
  const monthlyRate = Math.max(0, input.interestRatePercentage / 100) / 12;
  const numberOfPayments = input.loanTermYears * 12;

  let monthlyPrincipalAndInterest = 0;
  if (monthlyRate > 0 && numberOfPayments > 0) {
    const compoundFactor = Math.pow(1 + monthlyRate, numberOfPayments);
    monthlyPrincipalAndInterest = (principal * (monthlyRate * compoundFactor)) / (compoundFactor - 1);
  } else if (numberOfPayments > 0) {
    monthlyPrincipalAndInterest = principal / numberOfPayments;
  }

  const propertyTaxRate = Math.max(0, input.annualPropertyTaxRatePercentage);
  const insuranceRate = Math.max(0, input.annualHomeInsuranceRatePercentage);
  const hoaFee = Math.max(0, input.monthlyHoaFee);

  const monthlyPropertyTax = (input.homePrice * (propertyTaxRate / 100)) / 12;
  const monthlyInsurance = (input.homePrice * (insuranceRate / 100)) / 12;
  const total = monthlyPrincipalAndInterest + monthlyPropertyTax + monthlyInsurance + hoaFee;

  return {
    principalAndInterest: roundCurrency(monthlyPrincipalAndInterest),
    propertyTax: roundCurrency(monthlyPropertyTax),
    homeownersInsurance: roundCurrency(monthlyInsurance),
    hoaDues: roundCurrency(hoaFee),
    totalMonthlyPayment: roundCurrency(total)
  };
}

/**
 * Builds a ready-to-use financing profile from a listing price, optionally
 * overridden by tenant-specific assumptions. Down payment is rounded to the
 * nearest whole dollar so the displayed percentage matches the amount paid.
 */
export function buildMortgageInputFromPrice(
  homePrice: number,
  overrides: Partial<MortgageCalculationInput> = {}
): MortgageCalculationInput {
  const safePrice = Math.max(0, Math.round(homePrice));
  const requestedDownPayment =
    overrides.downPaymentAmount !== undefined
      ? Math.min(Math.max(0, overrides.downPaymentAmount), safePrice)
      : Math.round((safePrice * MORTGAGE_DEFAULTS.downPaymentPercent) / 100);

  const base: MortgageCalculationInput = {
    homePrice: safePrice,
    downPaymentAmount: requestedDownPayment,
    interestRatePercentage: MORTGAGE_DEFAULTS.interestRatePercentage,
    loanTermYears: MORTGAGE_DEFAULTS.loanTermYears,
    annualPropertyTaxRatePercentage: MORTGAGE_DEFAULTS.annualPropertyTaxRatePercentage,
    annualHomeInsuranceRatePercentage: MORTGAGE_DEFAULTS.annualHomeInsuranceRatePercentage,
    monthlyHoaFee: MORTGAGE_DEFAULTS.monthlyHoaFee
  };

  return { ...base, ...overrides, homePrice: safePrice, downPaymentAmount: requestedDownPayment };
}

/** Validates a financing profile without throwing, for reactive form surfaces. */
export function validateMortgageInput(input: MortgageCalculationInput): MortgageValidationIssue[] {
  const issues: MortgageValidationIssue[] = [];

  if (!Number.isFinite(input.homePrice) || input.homePrice <= 0) {
    issues.push({ field: 'homePrice', message: 'Home price must be a positive amount.' });
  }
  if (!Number.isFinite(input.downPaymentAmount) || input.downPaymentAmount < 0) {
    issues.push({ field: 'downPaymentAmount', message: 'Down payment cannot be negative.' });
  }
  if (Number.isFinite(input.homePrice) && input.downPaymentAmount > input.homePrice) {
    issues.push({ field: 'downPaymentAmount', message: 'Down payment cannot exceed the home price.' });
  }
  if (!Number.isFinite(input.interestRatePercentage) || input.interestRatePercentage < 0) {
    issues.push({ field: 'interestRatePercentage', message: 'Interest rate cannot be negative.' });
  }
  if (!Number.isFinite(input.loanTermYears) || input.loanTermYears <= 0) {
    issues.push({ field: 'loanTermYears', message: 'Loan term must be at least one year.' });
  }
  if (!Number.isFinite(input.annualPropertyTaxRatePercentage) || input.annualPropertyTaxRatePercentage < 0) {
    issues.push({ field: 'annualPropertyTaxRatePercentage', message: 'Tax rate cannot be negative.' });
  }
  if (!Number.isFinite(input.annualHomeInsuranceRatePercentage) || input.annualHomeInsuranceRatePercentage < 0) {
    issues.push({
      field: 'annualHomeInsuranceRatePercentage',
      message: 'Insurance rate cannot be negative.'
    });
  }
  if (!Number.isFinite(input.monthlyHoaFee) || input.monthlyHoaFee < 0) {
    issues.push({ field: 'monthlyHoaFee', message: 'HOA dues cannot be negative.' });
  }

  return issues;
}

/**
 * Year-by-year amortization summary used by the payment envelope visualizer.
 * The final recorded year is forced to zero so the schedule always settles.
 */
export function buildAmortizationSummary(
  input: MortgageCalculationInput,
  breakdown: MonthlyPaymentBreakdown
): { year: number; remainingBalance: number }[] {
  const principal = Math.max(0, input.homePrice - Math.max(0, input.downPaymentAmount));
  if (principal === 0) {
    return [];
  }

  const monthlyRate = Math.max(0, input.interestRatePercentage / 100) / 12;
  const payment = breakdown.principalAndInterest;
  const totalMonths = Math.max(1, Math.floor(input.loanTermYears * 12));
  const schedule: { year: number; remainingBalance: number }[] = [];

  let balance = principal;
  let month = 0;

  while (balance > 0.005 && month < totalMonths) {
    const interest = balance * monthlyRate;
    const principalPortion = payment <= 0 ? 0 : Math.min(balance, Math.max(0, payment - interest));
    balance = Math.max(0, balance - principalPortion);
    month += 1;
    if (month % 12 === 0) {
      schedule.push({ year: month / 12, remainingBalance: roundCurrency(balance) });
    }
  }

  if (schedule.length > 0) {
    schedule[schedule.length - 1] = {
      year: schedule[schedule.length - 1].year,
      remainingBalance: 0
    };
  }

  return schedule;
}