// Operator artwork is cropped from the existing catalog's info-sim-sheet.webp.
const OPERATORS = ['Vodafone', 'Orange', 'Lebara', 'Movistar'];
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function simPlan(product) {
 const name = String(product.name ?? '');
 const brand = OPERATORS.find(operator => new RegExp('\\b' + operator + '\\b', 'i').test(name));
 const data = name.match(/(\d+(?:[.,]\d+)?)\s*GB\b/i)?.[1]?.replace(',', '.') ?? null;
 return {brand: brand ?? 'SIM', data, logo: brand ? 'assets/sim-logo-' + brand.toLowerCase() + '.png' : null};
}

export function simMarkup(product, compact = false) {
 const plan = simPlan(product);
 const logo = plan.logo ? `<img src="${plan.logo}" alt="${escape(plan.brand)}" width="175" height="140" loading="lazy">` : `<span>${escape(plan.brand)}</span>`;
 return `<div class="sim-plan${compact ? ' sim-plan--compact' : ''}"><span class="sim-plan-logo">${logo}</span>${!compact && plan.data ? `<span class="sim-plan-data"><strong>${escape(plan.data)}</strong><span>GB</span></span>` : ''}</div>`;
}
