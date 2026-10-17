import { useState } from 'react';
import '../styles.css';

export default function AddInventoryModal({ products, onClose, onAdd }) {
  const [formData, setFormData] = useState({
    itemSku: '',
    inventoryType: '',
    shelfCode: 'DEFAULT',
    remarks: '',
  });
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    
    setSubmitted(true);
    if (!formData.itemSku || !formData.inventoryType) {
      setMessage('Please select an Item SKU');
      return;
    }

    const product = products.find((item) => item.id === formData.itemSku);
    if (!product) {
      setMessage('Invalid Item SKU');
      return;
    }

    onAdd({
      sku: formData.itemSku,
      product: product.name,
      inventoryType: formData.inventoryType,
      shelfCode: formData.shelfCode,
      remarks: formData.remarks,
    });

    setMessage('Inventory added successfully!');
  }

  function handleReset() {
    setFormData({
      itemSku: '',
      inventoryType: '',
      shelfCode: 'DEFAULT',
      remarks: '',
    });
    setMessage('');
  }

  return (
    <div className="scan-backdrop">
      <section className="scan-modal" role="dialog" aria-modal="true" aria-label="Add inventory">
        <header>
          <h2>Add Inventory</h2>
          <button onClick={onClose}>×</button>
        </header>
        <form onSubmit={handleSubmit}>
          <div className="scan-fields">
            <label>
              * Item Sku
              <select name="itemSku" value={formData.itemSku} onChange={handleChange} className={submitted && !formData.itemSku ? 'invalid' : ''}>
                <option value="">Select Item Sku</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.id} - {product.name}
                  </option>
                ))}
              </select>
              {submitted && !formData.itemSku && <p className="error-text">Select an option</p>}
            </label>

            <label>
              * Inventory Type
              <select name="inventoryType" value={formData.inventoryType} onChange={handleChange} className={submitted && !formData.inventoryType ? 'invalid' : ''}>
                <option value="">Select Inventory Type</option>
                <option>Good Inventory</option>
                <option>Bad Inventory</option>
                <option>Virtual Inventory</option>
              </select>
            </label>

            <label>
              * Shelf Code
              <input
                name="shelfCode"
                value={formData.shelfCode}
                onChange={handleChange}
                required
              />
            </label>

            <label>
              Remarks
              <input
                name="remarks"
                placeholder="Enter Remarks"
                value={formData.remarks}
                onChange={handleChange}
              />
            </label>
          </div>

          {message && (
            <p className={message.includes('successfully') ? 'success-message' : 'scan-message'}>
              {message}
            </p>
          )}

          <footer>
            <button type="button" className="outline" onClick={handleReset}>
              Reset
            </button>
            <div>
              <button type="button" className="outline" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="primary">
                Add Inventory
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}
