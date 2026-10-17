import { useEffect, useRef, useState } from 'react';

export default function OrderDateFilter({ value = '', onApply }) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef(null);
  const applyRef = useRef(onApply);
  const valueRef = useRef(value);
  const timerRef = useRef(null);
  const wasOpen = useRef(false);
  const changeTimer = useRef(null);
  applyRef.current = onApply;
  valueRef.current = value;
  useEffect(() => setDraft(value), [value]);
  const pickerOpen = input => {
    try { return input.matches(':open'); } catch { return false; }
  };
  const commit = input => {
    if (input.validity.valid && input.value !== valueRef.current) {
      valueRef.current = input.value;
      applyRef.current(input.value);
    }
  };
  const stopWatching = () => {
    clearInterval(timerRef.current);
    timerRef.current = null;
    wasOpen.current = false;
  };
  const watchPicker = () => {
    if (timerRef.current !== null) return;
    timerRef.current = setInterval(() => {
      const input = inputRef.current;
      if (!input) { stopWatching(); return; }
      if (pickerOpen(input)) wasOpen.current = true;
      else if (wasOpen.current) {
        // Selecting a day closes the native picker without blurring the input.
        commit(input);
        stopWatching();
      }
    }, 80);
  };
  useEffect(() => () => {
    clearInterval(timerRef.current);
    clearTimeout(changeTimer.current);
  }, []);
  return <label className="field">
    <input ref={inputRef} type="date" aria-label="Order created date" value={draft}
      onFocus={watchPicker}
      onPointerDown={watchPicker}
      onChange={event => {
        const input = event.currentTarget;
        setDraft(input.value);
        if (pickerOpen(input)) wasOpen.current = true;
        watchPicker();
        clearTimeout(changeTimer.current);
        changeTimer.current = setTimeout(() => {
          if (!pickerOpen(input)) commit(input);
        }, 0);
      }}
      onBlur={event => { if (!pickerOpen(event.currentTarget)) commit(event.currentTarget); stopWatching(); }}
      onKeyDown={event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit(event.currentTarget);
          event.currentTarget.blur();
        }
      }} />
  </label>;
}

export function orderDateKey(value) {
  if (!value || value === '-') return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
