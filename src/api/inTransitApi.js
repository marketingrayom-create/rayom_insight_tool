const API_BASE_URL = "/uniware-api/in-transit";

export const getShipments = async ({
  page = 1,
  limit = 20,
  search = "",
  dateField = "",
  fromDate = "",
  toDate = "",
} = {}) => {
  const params = new URLSearchParams();

  params.set("page", page);
  params.set("limit", limit);

  if (search.trim()) {
    params.set("search", search.trim());
  }

  if (dateField) {
    params.set("dateField", dateField);
  }

  if (fromDate) {
    params.set("fromDate", fromDate);
  }

  if (toDate) {
    params.set("toDate", toDate);
  }

  const response = await fetch(
    `${API_BASE_URL}?${params.toString()}`
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.message || "Failed to fetch shipments"
    );
  }

  return result;
};
export const createShipment = async (shipment) => {
  const response = await fetch(`${API_BASE_URL}/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(shipment),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to create shipment");
  }

  return data;
};

export const updateShipment = async (shipmentId, shipment) => {
  const response = await fetch(
    `${API_BASE_URL}/${encodeURIComponent(shipmentId)}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(shipment),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to update shipment");
  }

  return data;
};
export const deleteShipment = async (id) => {
  const response = await fetch(
    `${API_BASE_URL}/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to delete shipment");
  }

  return data;
};