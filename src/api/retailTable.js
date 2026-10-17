const identityColumns = [['asin', 'ASIN'], ['productTitle', 'Product Title'], ['brand', 'Brand']];
const identityAliases = new Set(['undefined', 'asin', 'ASIN', 'productTitle', 'productName', 'PRODUCT_TITLE', 'ITEM_NAME', 'title', 'brand', 'BRAND']);

export function inventoryColumns(rows) {
    return [...identityColumns, ...[...new Set(rows.flatMap(Object.keys))]
        .filter(key => !identityAliases.has(key))
        .map(key => [key, key.replaceAll('_', ' ').replace(/([a-z])([A-Z])/g, '$1 $2')])];
}

export function reportTotal(rows, columns) {
    return columns.map(([key], index) => index === 0 ? 'Loaded rows total:' :
        rows.some(row => typeof row[key] === 'number')
            ? rows.reduce((sum, row) => sum + (typeof row[key] === 'number' ? row[key] : 0), 0) : '');
}

export function reportMatrix(rows, columns) {
    return [columns.map(([, label]) => label),
        ...(rows.length ? [reportTotal(rows, columns)] : []),
        ...rows.map(row => columns.map(([key]) => row[key] ?? ''))];
}
