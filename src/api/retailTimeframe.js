const iso = date => date.toISOString().slice(0, 10);
export const timeframes = ['Custom', 'Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly', 'To date', 'Trailing'];
export function buildTimeSelection(timeframe, day, endDay, lookback = 'week') {
    const start = new Date(`${day}T00:00:00Z`);
    if (!day || Number.isNaN(start.getTime())) throw new Error('Choose a valid date.');
    const end = new Date(start);
    const period = timeframe.toLowerCase().replace(' ', '-');
    if (period === 'weekly') {
        start.setUTCDate(start.getUTCDate() - start.getUTCDay());
        end.setTime(start.getTime()); end.setUTCDate(end.getUTCDate() + 6);
    } else if (period === 'monthly') {
        start.setUTCDate(1); end.setUTCMonth(end.getUTCMonth() + 1, 0);
    } else if (period === 'quarterly') {
        start.setUTCMonth(Math.floor(start.getUTCMonth() / 3) * 3, 1);
        end.setUTCFullYear(start.getUTCFullYear(), start.getUTCMonth() + 3, 0);
    } else if (period === 'yearly') {
        start.setUTCMonth(0, 1); end.setUTCMonth(11, 31);
    } else if (period === 'to-date') {
        if (lookback === 'week') start.setUTCDate(start.getUTCDate()-start.getUTCDay());
        else if (lookback === 'month') start.setUTCDate(1);
        else if (lookback === 'quarter') start.setUTCMonth(Math.floor(start.getUTCMonth()/3)*3,1);
        else start.setUTCMonth(0,1);
    } else if (period === 'trailing') {
        if (lookback === '12-months') {
            end.setUTCDate(0);
            start.setUTCFullYear(end.getUTCFullYear(), end.getUTCMonth()-11, 1);
        } else {
            const weeks = lookback === '13-weeks' ? 13 : 4;
            end.setUTCDate(end.getUTCDate()-end.getUTCDay()-1);
            start.setTime(end.getTime()); start.setUTCDate(start.getUTCDate()-weeks*7+1);
        }
    } else if (period === 'custom') {
        end.setTime(new Date(`${endDay}T00:00:00Z`).getTime());
        if (Number.isNaN(end.getTime()) || end < start) throw new Error('End date must be on or after the start date.');
    }
    const available = new Date(); available.setUTCHours(0,0,0,0); available.setUTCDate(available.getUTCDate()-2);
    if (end > available) throw new Error('This period is not complete or available yet. Choose an earlier date; daily reports allow a two-day reporting delay.');
    return { timeframe: period, ...(['to-date','trailing'].includes(period) ? {lookback} : {}), startDate: iso(start), endDate: iso(end) };
}

export function completedPeriodDate(timeframe, day) {
    const candidate = new Date(`${day}T00:00:00Z`);
    if (Number.isNaN(candidate.getTime())) return day;
    for (let i=0; i<370; i++) {
        const value = iso(candidate);
        try { buildTimeSelection(timeframe, value, value); return value; }
        catch { candidate.setUTCDate(candidate.getUTCDate()-1); }
    }
    return day;
}

export const lookbackOptions = {
    'To date': [['week','Week to date'],['month','Month to date'],['quarter','Quarter to date'],['year','Year to date']],
    Trailing: [['4-weeks','Trailing 4 weeks'],['13-weeks','Trailing 13 weeks'],['12-months','Trailing 12 months']]
};
export function periodOptions(timeframe, anchor) {
    if (!['Weekly','Monthly','Quarterly','Yearly'].includes(timeframe)) return [];
    const options = [];
    let candidate = completedPeriodDate(timeframe, anchor);
    const short = value => new Date(value+'T00:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});
    const count = {Weekly:52,Monthly:24,Quarterly:12,Yearly:5}[timeframe];
    for (let i=0; i<count; i++) {
        const range = buildTimeSelection(timeframe,candidate);
        options.push({value:range.startDate,label:`${range.startDate.slice(0,4)} | ${short(range.startDate)} – ${short(range.endDate)}`});
        const previous = new Date(range.startDate+'T00:00:00Z'); previous.setUTCDate(previous.getUTCDate()-1); candidate=iso(previous);
    }
    return options;
}
