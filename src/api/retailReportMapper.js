const scalar = value => value && typeof value === 'object' ? scalar(value.rawValue ?? value.value ?? value.amount ?? value.displayValue ?? value.name ?? null) : value;
export function normalizeReport(data) {
    const report = data?.reportData ?? data?.report ?? data?.data ?? data;
    const records = Array.isArray(report) ? report : report?.rows ?? report?.records ?? report?.data ?? report?.reportRows;
    if (!Array.isArray(records)) throw new Error('Amazon returned an unrecognized report format. A sample JSON response is needed to map its columns.');
    return records.map(row => {
        const flat = {};
        if (Array.isArray(row)) {
            if (!Array.isArray(report.columns) || report.columns.length !== row.length) throw new Error('Report columns do not match the returned cells.');
            row.forEach((cell, index) => {
                const column = report.columns[index];
                const key = typeof column === 'string' ? column : column.id;
                if (!key) throw new Error('Report column is missing its metric ID.');
                const raw = cell?.rawValue ?? scalar(cell);
                const numeric = raw !== null && raw !== '' && Number.isFinite(Number(raw));
                flat[key] = !['ASIN','ITEM_NAME','BRAND'].includes(key) && cell?.decoration !== 'none' && numeric
                    ? (cell?.decoration === 'percent' ? cell.value : Number(raw)) : raw;
            });
        } else {
        for (const [key, value] of Object.entries(row)) {
            if (Array.isArray(value)) value.forEach(cell => { if (cell && typeof cell === 'object') flat[cell.id ?? cell.metricId ?? cell.dimensionId ?? cell.key] = scalar(cell); });
            else if (value && typeof value === 'object' && !('rawValue' in value) && !('value' in value) && !('amount' in value)) Object.entries(value).forEach(([k, v]) => { flat[k] = scalar(v); });
            else flat[key] = scalar(value);
        }
        }
        flat.asin = flat.asin ?? flat.ASIN;
        flat.productTitle = flat.productTitle ?? flat.productName ?? flat.PRODUCT_TITLE ?? flat.ITEM_NAME ?? flat.title;
        flat.brand = flat.brand ?? flat.BRAND;
        return flat;
    });
}
