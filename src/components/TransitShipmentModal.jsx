import { useState } from 'react';

export const shipmentFields = ['Company', 'Portal', 'Vendor Code/ Shipment Id', 'PO Number', 'Transport Charge', 'Pickup Location', 'Location', 'State', 'PO Date', 'Status', 'Remark', 'Invoice Number', 'Invoice Date', 'Unit', 'Parcel', 'Invoice Value', 'Without Tax Amount', 'Tax Amount', 'Logistic Name', 'Vehicle Type', 'Vehicle Number', 'LRN Number', 'Dispatched Date', 'Pickup Date', 'Appointment Id', 'Appointment Date', 'Delivered Date', 'POD Link', 'Uploaded in Vendor Central', 'Bill Check Status'];
const dateFields = new Set(['PO Date', 'Invoice Date', 'Dispatched Date', 'Pickup Date', 'Appointment Date', 'Delivered Date']);
const dateTimeFields = new Set([
  'Appointment Date',
  'Delivered Date',
]);
const numberFields = new Set(['Unit', 'Parcel', 'Invoice Value', 'Without Tax Amount', 'Tax Amount', 'Appointment Id']);

export default function TransitShipmentModal({ shipment, onClose, onSave }) {
  const [values, setValues] = useState(shipment || { Status: 'In transit', 'Bill Check Status': 'Pending' });
  const [error, setError] = useState('');
  const [podFile, setPodFile] = useState(null);
  const update = (field, value) => setValues((current) => ({ ...current, [field]: value }));
  const selectPod = (event) => {
    const file = event.target.files?.[0];

    if (file) {
      setPodFile(file);
      update("POD Link", file.name);
    }
  };
  async function submit(event) {
    event.preventDefault();

    if (
      !values["Invoice Number"] ||
      !values["Logistic Name"]
    ) {
      setError(
        "Invoice Number and Logistic Name are required."
      );
      return;
    }

    try {
      setError("");
      await onSave(values, podFile);
      onClose();
    } catch (error) {
      console.error("Save error:", error);

      setError(
        error.message || "Failed to save shipment"
      );
    }
  }
  return <div className="shipment-backdrop">
    <section className="shipment-modal" role="dialog" aria-modal="true">
      <header><h2>{shipment ? 'Update In-transit Shipment' : 'Add In-transit Shipment'}</h2>
        <button onClick={onClose}>×</button>
      </header>
      <form onSubmit={submit}>
        <div className="shipment-fields">
          {shipmentFields.map((field) => <label key={field}>{['Invoice Number', 'Logistic Name'].includes(field) ? '* ' : ''}
            {field}{field === 'POD Link' ? <span className="pod-upload">
              <input type="file" accept=".pdf,image/*" onChange={selectPod} />
              <b>{values['POD Link'] || 'Upload POD file'}</b></span> : field === 'Status' ? <select value={values[field] || 'In transit'} onChange={(event) => update(field, event.target.value)}>
                <option>In transit</option><option>Delivered</option><option>Delayed</option><option>Cancelled</option></select> :
              <input
                type={
                  dateTimeFields.has(field)
                    ? 'datetime-local'
                    : dateFields.has(field)
                      ? 'date'
                      : numberFields.has(field)
                        ? 'number'
                        : 'text'
                }
                value={values[field] || ''}
                onChange={(event) => update(field, event.target.value)}
                placeholder={`Enter ${field}`}
              />}</label>)}</div>{error && <p className="shipment-error">{error}</p>}<footer><button type="button" className="outline" onClick={() => setValues(shipment || { Status: 'In transit', 'Bill Check Status': 'Pending' })}>Reset</button><div><button type="button" className="outline" onClick={onClose}>Cancel</button><button className="add-submit">{shipment ? 'Update shipment' : 'Add shipment'}</button></div></footer></form></section></div>;
}
