import React, { useEffect, useState } from "react";
import { getShipments, updateShipment } from "../api/inTransitApi";

const B2B_COLUMNS = [
    "Company",
    "Portal",
    "PO Number",
    "Location",
    "Invoice Number",
    "Invoice Date",
    "ASIN",
    "EAN",
    "SKU Code",
    "Product Name",
    "HSN Code",
    "Qty",
    "Unit Cost",
    "Total Cost",
    "IGST",
    "CGST",
    "SGST",
    "IGST Amount",
    "Total Amount",
];

const NUMBER_FIELDS = [
    "Qty",
    "Unit Cost",
    "Total Cost",
    "IGST",
    "CGST",
    "SGST",
    "IGST Amount",
    "Total Amount",
];

const createEmptyForm = () =>
    B2B_COLUMNS.reduce((acc, column) => {
        acc[column] = "";
        return acc;
    }, {});

export default function B2BShipment({
    shipments: parentShipments = [],
    onEdit,
    onDelete,
    onClose,
}) {
    const [shipments, setShipments] = useState(parentShipments);

    const [showAddModal, setShowAddModal] = useState(false);
    const [editingShipment, setEditingShipment] = useState(null);

    const [formData, setFormData] = useState(createEmptyForm());

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        loadB2BShipments();
    }, []);

    const loadB2BShipments = async () => {
        try {
            setLoading(true);
            setError("");

            const result = await getShipments({
                page: 1,
                limit: 100,
                search: "",
                dateField: "",
                fromDate: "",
                toDate: "",
            });

            console.log("B2B API DATA:", result);

            setShipments(result?.data || []);
        } catch (error) {
            console.error("Failed to load B2B shipments:", error);

            setError(
                error?.message || "Failed to load B2B shipment data"
            );
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateClick = (shipment) => {
        setError("");

        setEditingShipment(shipment);

        const filledData = B2B_COLUMNS.reduce((acc, column) => {
            let value = shipment?.[column] ?? "";
            if (column === "Invoice Date" && value) {
                const date = new Date(value);

                if (!Number.isNaN(date.getTime())) {
                    value = date.toISOString().split("T")[0];
                }
            }
            acc[column] = value;
            return acc;
        }, {});

        setFormData(filledData);
        setShowAddModal(true);
        onEdit?.(shipment);
    };
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData((current) => ({
            ...current,
            [name]: value,
        }));
    };

    const resetForm = () => {
        setEditingShipment(null);
        setFormData(createEmptyForm());
        setError("");
    };
    const closeModal = () => {
        if (saving) return;
        setShowAddModal(false);
        resetForm();
    };
    const formatDate = (value) => {
        if (!value) return "—";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }
        return date.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
        });
    };

    const getShipmentId = (shipment) => {
        return (
            shipment?.["Vendor Code/ Shipment Id"] ||
            shipment?.vendorCodeShipmentId ||
            shipment?.shipmentId ||
            shipment?._id
        );
    };
    const handleSaveShipment = async () => {
        if (!editingShipment) {
            setShowAddModal(false);
            resetForm();
            return;
        }
        try {
            setSaving(true);
            setError("");
            const shipmentId = getShipmentId(editingShipment);
            if (!shipmentId) {
                throw new Error(
                    "Vendor Code / Shipment Id not found"
                );
            }
            const apiFormData = new FormData();
            B2B_COLUMNS.forEach((column) => {
                const value = formData[column];
                apiFormData.append(
                    column,
                    value ?? ""
                );
            });

            const result = await updateShipment(
                shipmentId,
                apiFormData
            );

            if (!result?.success) {
                throw new Error(
                    result?.message ||
                    "Shipment update failed"
                );
            }

            const updatedShipment =
                result?.data || {
                    ...editingShipment,
                    ...formData,
                };

            setShipments((current) =>
                current.map((item) => {
                    const sameShipment =
                        item?._id === editingShipment?._id ||
                        getShipmentId(item) === shipmentId;

                    return sameShipment
                        ? {
                            ...item,
                            ...updatedShipment,
                        }
                        : item;
                })
            );

            setShowAddModal(false);
            resetForm();
        } catch (error) {
            console.error(
                "Failed to update B2B shipment:",
                error
            );

            setError(
                error?.message ||
                "Failed to update shipment"
            );
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (shipment) => {
        const shipmentId = shipment?._id;

        if (!shipmentId) {
            setError("Shipment ID not found");
            return;
        }

        onDelete?.(shipmentId);
    };
    const handleAddClick = () => {
        setError("");
        setEditingShipment(null);
        setFormData(createEmptyForm());
        setShowAddModal(true);
    };
    return (
        <div className="content">
            <section className="inventory-page-header">

                <div className="inventory-title">
                    B2B Shipment
                </div>

                <div className="inventory-header-actions">

                    <button
                        className="primary"
                        onClick={handleAddClick}
                    >
                        Add B2B Shipment
                    </button>

                </div>

            </section>
            {error && (
                <div
                    className="error-message"
                    style={{
                        marginBottom: "12px",
                        padding: "10px 14px",
                        borderRadius: "6px",
                    }}
                >
                    {error}
                </div>
            )}

            <section className="panel table-panel">
                <div className="table-scroll">
                    <table className="inventory-grid detailed-grid shipment-grid">
                        <thead>
                            <tr>
                                {B2B_COLUMNS.map((column) => (
                                    <th key={column}>
                                        {column}
                                    </th>
                                ))}

                                <th>
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td
                                        colSpan={
                                            B2B_COLUMNS.length + 1
                                        }
                                        style={{
                                            textAlign: "center",
                                            padding: "30px",
                                        }}
                                    >
                                        Loading shipment data...
                                    </td>
                                </tr>
                            ) : shipments.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={
                                            B2B_COLUMNS.length + 1
                                        }
                                        style={{
                                            textAlign: "center",
                                            padding: "30px",
                                            color: "#999",
                                        }}
                                    >
                                        No shipment data found
                                    </td>

                                </tr>
                            ) : (
                                shipments.map((shipment, index) => (
                                    <tr
                                        key={
                                            shipment?._id ||
                                            getShipmentId(
                                                shipment
                                            ) ||
                                            index
                                        }
                                    >
                                        {B2B_COLUMNS.map((column) => (
                                            <td
                                                key={
                                                    column
                                                }
                                            >
                                                {column === "Invoice Date" ? formatDate(shipment?.[column
                                                ]
                                                )
                                                    : shipment?.[
                                                    column
                                                    ] ?? "—"}

                                            </td>

                                        )
                                        )}

                                        <td>
                                            <div className="row-actions">
                                                <button
                                                    onClick={() =>
                                                        handleUpdateClick(
                                                            shipment
                                                        )
                                                    }
                                                    disabled={
                                                        saving
                                                    }
                                                >
                                                    Update
                                                </button>
                                                <button
                                                    className="delete"
                                                    onClick={() =>
                                                        handleDelete(
                                                            shipment
                                                        )
                                                    }
                                                    disabled={
                                                        saving
                                                    }
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )
                                )
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
            {showAddModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2>
                                {editingShipment
                                    ? "Update B2B Shipment"
                                    : "Add B2B Shipment"}
                            </h2>
                            <button
                                className="modal-close"
                                onClick={closeModal}
                                disabled={saving}
                            >
                                ×
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-grid">
                                {B2B_COLUMNS.map((column) => {
                                    const inputType = column ===  "Invoice Date" ? "date" : NUMBER_FIELDS.includes(column) ? "number" : "text";
                                    return (
                                        <div
                                            className="form-group"
                                            key={column}
                                        >
                                            <label> {column} </label>
                                            <input
                                                type={inputType}
                                                name={column}
                                                value={
                                                    formData[
                                                    column
                                                    ] ?? ""
                                                }
                                                onChange={handleInputChange}
                                                disabled={saving}
                                                step={ inputType ==="number"? "any": undefined }
                                            />

                                        </div>

                                    );
                                }
                                )}

                            </div>

                        </div>
                        <div className="modal-footer">
                            <button
                                onClick={closeModal}
                                disabled={saving}
                            >
                                Cancel
                            </button>

                            <button
                                className="primary"
                                onClick={handleSaveShipment}
                                disabled={saving}
                            >
                                {saving
                                    ? "Updating..."
                                    : editingShipment
                                        ? "Update Shipment"
                                        : "Save Shipment"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}