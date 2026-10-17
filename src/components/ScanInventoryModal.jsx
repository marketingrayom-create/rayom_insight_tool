import { useState } from 'react';

export default function ScanInventoryModal({ products, onClose, onScan }) {
  const [scanned, setScanned] = useState(0);
  const [message, setMessage] = useState('');

  function scanItem(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const sku = formData.get('sku').trim();
    const product = products.find((item) => item.id.toLowerCase() === sku.toLowerCase());
    if (!product) return setMessage('SKU not found. Enter a SKU from the inventory list.');
    onScan(product.id, formData.get('inventoryType'));
    setScanned((count) => count + 1);
    setMessage(`${product.name} scanned successfully.`);
    event.currentTarget.reset();
  }

  return <div className="scan-backdrop"><section className="scan-modal" role="dialog" aria-modal="true" aria-label="Scan inventory"><header><h2>Add Inventory</h2><button onClick={onClose}>×</button></header><form onSubmit={scanItem}><div className="scan-fields"><label>* Inventory Type<select name="inventoryType" defaultValue="Good Inventory"><option>Good Inventory</option><option>Bad Inventory</option></select></label><label>* Shelf Code<input name="shelf" defaultValue="DEFAULT" required /></label><label>* Item SKU<input name="sku" placeholder="Enter Item SKU" required autoFocus /></label><label>Remarks<input name="remarks" placeholder="Enter Remarks" /></label></div><p className="scan-count">No. of Items Successfully Scanned - {scanned}</p>{message && <p className="scan-message">{message}</p>}<footer><button type="button" className="outline" onClick={() => { setScanned(0); setMessage(''); }}>Reset</button><div><button type="button" className="outline" onClick={onClose}>Cancel</button><button className="primary">Scan item</button><button type="button" className="done-button" onClick={onClose}>Done</button></div></footer></form></section></div>;
}
