interface SalaryDetails {
  salary_min: number | null;
  salary_max: number | null;
  currency: string | null;
  salary_period: string | null;
}

function formatAmount(amount: number, currency: string | null): string {
  const fractionDigits = Number.isInteger(amount) ? 0 : 2;
  if (!currency) return new Intl.NumberFormat("en-US", { maximumFractionDigits: fractionDigits }).format(amount);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(amount);
  } catch {
    return `${currency} ${new Intl.NumberFormat("en-US", { maximumFractionDigits: fractionDigits }).format(amount)}`;
  }
}

export function formatSalary(salary: SalaryDetails): string | null {
  const { salary_min: minimum, salary_max: maximum, currency, salary_period: period } = salary;
  if (minimum == null && maximum == null) return null;

  let range: string;
  if (minimum != null && maximum != null) {
    range = `${formatAmount(minimum, currency)} - ${formatAmount(maximum, currency)}`;
  } else if (minimum != null) {
    range = `From ${formatAmount(minimum, currency)}`;
  } else {
    range = `Up to ${formatAmount(maximum!, currency)}`;
  }
  return period ? `${range}/${period}` : range;
}