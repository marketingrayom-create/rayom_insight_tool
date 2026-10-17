const validQuantity = value => typeof value === 'number' && Number.isFinite(value);

export function totalInventory(row) {
  const quantities = ['fbmAvailable', 'fbaAvailable', 'vendorInventory', 'uniwareInventory']
    .map(key => row[key]).filter(validQuantity);
  return quantities.length ? quantities.reduce((sum, value) => sum + value, 0) : null;
}

export function refreshedInventoryRows(products, current, organization) {
  const previous = new Map((current.organization === organization ? current.rows : [])
    .map(row => [row.asin, row]));
  return products.map(product => {
    const saved = previous.get(product.asin);
    const row = {...product, uniwareInventory: saved?.uniwareInventory ?? null,
      uniwareEans: saved?.uniwareEans || [], uniwareVendorName:saved?.uniwareVendorName??null, uniwareVendorMessage:saved?.uniwareVendorMessage||''};
    return {...row, combinedInventory: totalInventory(row)};
  });
}

export function applyUniwareStock(current, stock, organization) {
  if (current.organization !== organization) return current;
  return {...current, rows: current.rows.map(row => {
    if (!Object.hasOwn(stock.inventory, row.asin)) return row;
    const item = stock.inventory[row.asin];
    const updated = {...row, uniwareInventory: item?.quantity ?? null,
      uniwareEans: item?.eans || [], uniwareVendorName:item?.vendorName??null, uniwareVendorMessage:item?.vendorMessage||''};
    return {...updated, combinedInventory: totalInventory(updated)};
  }), uniwareScope: `${stock.matchSource}. Available stock across all shelves: ${stock.facility}.`,
  uniwareMessage: ''};
}
