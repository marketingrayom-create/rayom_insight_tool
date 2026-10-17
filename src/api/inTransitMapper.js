export const frontendToBackend = (data) => ({
  company: data["Company"] || "",
  portal: data["Portal"] || "",
  vendorCodeShipmentId:
    data["Vendor Code/ Shipment Id"] || "",
  poNumber: data["PO Number"] || "",
  pickupLocation: data["Pickup Location"] || "",
  location: data["Location"] || "",
  transportCharge:
    data["Transport Charge"] === ""
      ? 0
      : Number(data["Transport Charge"] || 0),

  state: data["State"] || "",

  poDate: data["PO Date"] || null,

  status: data["Status"] || "In transit",

  remark: data["Remark"] || "",

  invoiceNumber: data["Invoice Number"] || "",

  invoiceDate: data["Invoice Date"] || null,

  unit:
    data["Unit"] === "" ? 0 : Number(data["Unit"] || 0),

  parcel:
    data["Parcel"] === "" ? 0 : Number(data["Parcel"] || 0),

  invoiceValue:
    data["Invoice Value"] === ""
      ? 0
      : Number(data["Invoice Value"] || 0),

  withoutTaxAmount:
    data["Without Tax Amount"] === ""
      ? 0
      : Number(data["Without Tax Amount"] || 0),

  taxAmount:
    data["Tax Amount"] === ""
      ? 0
      : Number(data["Tax Amount"] || 0),

  logisticName: data["Logistic Name"] || "",

  vehicleType: data["Vehicle Type"] || "",

  vehicleNumber: data["Vehicle Number"] || "",

  lrnNumber: data["LRN Number"] || "",

  pickupDate: data["Pickup Date"] || null,

  appointmentId:
    data["Appointment Id"] === ""
      ? 0
      : Number(data["Appointment Id"] || 0),

  appointmentDate:
    data["Appointment Date"] || null,

  deliveredDate:
    data["Delivered Date"] || null,

  podLink: data["POD Link"] || "",

  uploadedInVendorCentral:
    data["Uploaded in Vendor Central"] || "",

  billCheckStatus:
    data["Bill Check Status"] || "Pending",
});


export const backendToFrontend = (data) => ({
  Company: data.company || "",

  Portal: data.portal || "",

  "Vendor Code/ Shipment Id":
    data.vendorCodeShipmentId || "",

  "PO Number":
    data.poNumber || "",

  "Pickup Location":
    data.pickupLocation || "",

  Location:
    data.location || "",

  "Transport Charge":
    data.transportCharge ?? 0,

  State:
    data.state || "",

  "PO Date":
    formatDate(data.poDate),

  Status:
    data.status || "In transit",

  Remark:
    data.remark || "",

  "Invoice Number":
    data.invoiceNumber || "",

  "Invoice Date":
    formatDate(data.invoiceDate),

  Unit:
    data.unit ?? 0,

  Parcel:
    data.parcel ?? 0,

  "Invoice Value":
    data.invoiceValue ?? 0,

  "Without Tax Amount":
    data.withoutTaxAmount ?? 0,

  "Tax Amount":
    data.taxAmount ?? 0,

  "Logistic Name":
    data.logisticName || "",

  "Vehicle Type":
    data.vehicleType || "",

  "Vehicle Number":
    data.vehicleNumber || "",

  "LRN Number":
    data.lrnNumber || "",

  "Dispatched Date":
    formatDate(data.dispatchedDate),

  "Pickup Date":
    formatDate(data.pickupDate),

  "Appointment Id":
    data.appointmentId ?? 0,

  "Appointment Date":
    formatDate(data.appointmentDate),

  "Delivered Date":
    formatDate(data.deliveredDate),

  "POD Link":
    data.podLink || "",

  "Uploaded in Vendor Central":
    data.uploadedInVendorCentral || "",

  "Bill Check Status":
    data.billCheckStatus || "Pending",

  _id: data._id,
});

const formatDate = (date) => {
  if (!date) return "";

  const d = new Date(date);

  if (Number.isNaN(d.getTime())) {
    return "";
  }

  return d.toISOString().split("T")[0];
};