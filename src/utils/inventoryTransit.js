// Resolve only reconciled inventory invoice lines; never spread a shipment total over products.
export function inventoryTransitForProduct(product, report) {
  const source = `Inventory backend${report?.vendorAccount ? ` (${report.vendorAccount.toUpperCase()})` : ''}: portal + ASIN/EAN matched Master/Merge records`;
  const unavailable = message => ({vcInTransit:null,vcTransitSource:`${source}. ${message}`,transitDate:report?.asOf||null});
  if (!report?.success || !Array.isArray(report.shipments)) return unavailable('Report unavailable.');
  if (report.shipments.some(row => row.quantityMatchesItems !== true)) return unavailable('Matching Merge product lines are missing or quantities do not match Master shipments.');
  const eans = new Set(product.uniwareEans || []);
  let units=0;
  for (const shipment of report.shipments) {
    for (const item of shipment.items || []) {
      const matches = item.asin ? item.asin === product.asin : (item.ean && eans.has(item.ean));
      if (!matches) continue;
      if (typeof item.units !== 'number' || !Number.isFinite(item.units)) return unavailable('Product quantity is unavailable.');
      units+=item.units;
    }
  }
  return {vcInTransit:units,vcTransitSource:source,transitDate:report.asOf};
}
