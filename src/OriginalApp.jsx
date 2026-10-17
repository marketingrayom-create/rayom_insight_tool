import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import InventoryPage from "./pages/InventoryPage";
import SalesPage from "./pages/SalesPage";
import ProductPerformancePage from "./pages/ProductPerformancePage";
import AdvertisingPage from "./pages/AdvertisingPage";
import ScanInventoryModal from "./components/ScanInventoryModal";
import AddInventoryModal from "./components/AddInventoryModal";
import TransitShipmentModal from "./components/TransitShipmentModal";
import { setupDebugTools } from "./utils/debugTools";
import {
  deleteShipment,
  getShipments,
  // createShipment,
  // updateShipment,
  // deleteShipment as deleteShipmentApi,
} from "./api/inTransitApi";

import { frontendToBackend, backendToFrontend } from "./api/inTransitMapper";
import B2BShipment from "./components/B2BShipment";
import ManagePos from "./components/ManagePos";
import PODetailsPage from "./components/PODetailsPage";
import RetailsPurchase from "./components/RetailsPurchase";
const IN_TRANSIT_API = "/uniware-api/in-transit";
setupDebugTools();

const initialProducts = [
  {
    id: "SKU-1042",
    name: "Nova Wireless Headphones",
    category: "Electronics",
    price: 89,
    inHouse: 42,
    inTransit: 20,
    reserved: 9,
    reorder: 25,
  },
  {
    id: "SKU-2318",
    name: "Atlas Travel Backpack",
    category: "Accessories",
    price: 64,
    inHouse: 18,
    inTransit: 60,
    reserved: 6,
    reorder: 20,
  },
  {
    id: "SKU-5061",
    name: "Luma Desk Lamp",
    category: "Home office",
    price: 46,
    inHouse: 8,
    inTransit: 0,
    reserved: 3,
    reorder: 15,
  },
  {
    id: "SKU-7740",
    name: "Arc Insulated Bottle",
    category: "Lifestyle",
    price: 32,
    inHouse: 76,
    inTransit: 0,
    reserved: 12,
    reorder: 30,
  },
  {
    id: "SKU-8805",
    name: "Miro Keyboard",
    category: "Electronics",
    price: 119,
    inHouse: 23,
    inTransit: 15,
    reserved: 7,
    reorder: 18,
  },
];

const initialOrders = [
  {
    id: "SO-1904",
    customer: "Northstar Studio",
    date: "01 Sep 2026",
    total: 356,
    status: "Confirmed",
    items: 4,
  },
  {
    id: "SO-1903",
    customer: "Luna & Co.",
    date: "01 Sep 2026",
    total: 128,
    status: "Processing",
    items: 2,
  },
  {
    id: "SO-1902",
    customer: "Oakwell Goods",
    date: "31 Aug 2026",
    total: 640,
    status: "Shipped",
    items: 7,
  },
  {
    id: "SO-1901",
    customer: "Morning Ritual",
    date: "31 Aug 2026",
    total: 207,
    status: "Delivered",
    items: 3,
  },
];

const initialPos = [
  {
    id: "PO-0849",
    supplier: "Horizon Supply Co.",
    eta: "05 Sep 2026",
    value: 4280,
    status: "In transit",
    items: 20,
    productId: "SKU-1042",
  },
  {
    id: "PO-0848",
    supplier: "Aster Manufacturing",
    eta: "08 Sep 2026",
    value: 6480,
    status: "In transit",
    items: 60,
    productId: "SKU-2318",
  },
  {
    id: "PO-0847",
    supplier: "Northline Imports",
    eta: "Received 29 Aug",
    value: 2190,
    status: "Received",
    items: 42,
    productId: "SKU-7740",
  },
];

const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
const getStorage = (key, fallback) =>
  JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));

function App() {
  const [products, setProducts] = useState(() =>
    getStorage("stockflow-products", initialProducts),
  );
  const [shipments, setShipments] = useState([]);
  const [b2bShipments, setB2BShipments] = useState([]);

  const [shipmentsLoading, setShipmentsLoading] = useState(true);
  const [shipmentsError, setShipmentsError] = useState("");
  const [editingShipment, setEditingShipment] = useState(null);
  const [orders, setOrders] = useState(() =>
    getStorage("stockflow-orders", initialOrders),
  );
  const [purchaseOrders, setPurchaseOrders] = useState(() =>
    getStorage("stockflow-pos", initialPos),
  );
  const [amazonPoData, setAmazonPoData] = useState(null);
  const [amazonPoLoading, setAmazonPoLoading] = useState(false);
  const [amazonOpenRequest, setAmazonOpenRequest] = useState(0);
  const [amazonPoError, setAmazonPoError] = useState("");
  const [page, setPage] = useState(() => getStorage("stockflow-active-page", "Overview"));

  const [inventoryExpanded, setInventoryExpanded] = useState(false);
  const [inventorySection, setInventorySection] = useState("inHouse");


  const [search, setSearch] = useState("");

  const [limit, setLimit] = useState(20);

  const [dateField, setDateField] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [shipmentPage, setShipmentPage] = useState(1);
  const [inTransitTab, setInTransitTab] = useState("b2bShipment");

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  });
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState("");
  const handleDeleteB2BShipment = (shipmentId) => {
    setB2BShipments((current) =>
      current.filter((item) => item._id !== shipmentId)
    );
  };

  useEffect(
    () => localStorage.setItem("stockflow-products", JSON.stringify(products)),
    [products],
  );
  useEffect(
    () => localStorage.setItem("stockflow-orders", JSON.stringify(orders)),
    [orders],
  );
  useEffect(
    () => localStorage.setItem("stockflow-pos", JSON.stringify(purchaseOrders)),
    [purchaseOrders],
  );
  useEffect(
    () =>
      localStorage.setItem("stockflow-shipments", JSON.stringify(shipments)),
    [shipments],
  );

  const totalInHouse = products.reduce(
    (sum, product) => sum + product.inHouse,
    0,
  );
  const totalTransit = products.reduce(
    (sum, product) => sum + product.inTransit,
    0,
  );
  const lowStock = products.filter(
    (product) => product.inHouse <= product.reorder,
  );
  const availableValue = products.reduce(
    (sum, product) => sum + product.inHouse * product.price,
    0,
  );
  const filteredProducts = useMemo(
    () =>
      products.filter((product) =>
        `${product.name} ${product.id} ${product.category}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [products, search],
  );

  useEffect(() => {
    if (page !== "Inventory") return;
    if (inventorySection !== "inTransit") return;
    if (inTransitTab !== "mergeInvoice") {
      setShipments([]);
      return;
    }

    loadShipments();
  }, [
    page,
    inventorySection,
    inTransitTab,
    shipmentPage,
    limit,
    search,
    dateField,
    fromDate,
    toDate,
  ]);

  useEffect(() => {
    if (page !== "Inventory") return;
    if (inventorySection !== "inTransit") return;

    if (inTransitTab !== "b2bShipment") {
      setB2BShipments([]);
      return;
    }

    loadShipments();
  }, [
    page,
    inventorySection,
    inTransitTab,
    search,
  ]);

  const loadShipments = async () => {
    try {
      setShipmentsLoading(true);
      setShipmentsError("");

      const result = await getShipments({
        page: shipmentPage,
        limit,
        search,
        dateField,
        fromDate,
        toDate,
      });

      setShipments(result.data || []);

      setPagination(
        result.pagination || {
          page: shipmentPage,
          limit,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        }
      );
    } catch (error) {
      console.error("Failed to load shipments:", error);

      setShipmentsError(
        error.message || "Failed to load shipments"
      );
    } finally {
      setShipmentsLoading(false);
    }
  };

  function flash(message) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2800);
  }

  function addProduct(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const product = {
      id: data.get("sku") || `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
      name: data.get("name"),
      category: data.get("category"),
      price: Number(data.get("price")),
      inHouse: Number(data.get("inHouse")),
      inTransit: Number(data.get("inTransit")),
      reserved: 0,
      reorder: Number(data.get("reorder")),
    };
    setProducts((current) => [product, ...current]);
    setModal(null);
    flash(`${product.name} was added to inventory.`);
  }



  function createPo(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const productId = data.get("product");
    const quantity = Number(data.get("quantity"));
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    setProducts((current) =>
      current.map((item) =>
        item.id === productId
          ? { ...item, inTransit: item.inTransit + quantity }
          : item,
      ),
    );
    setPurchaseOrders((current) => [
      {
        id: `PO-${850 + current.length}`,
        supplier: data.get("supplier"),
        eta: data.get("eta"),
        value: product.price * quantity * 0.6,
        status: "In transit",
        items: quantity,
        productId,
      },
      ...current,
    ]);
    setModal(null);
    flash("Purchase order created and units marked in transit.");
  }

  function receivePo(po) {
    setPurchaseOrders((current) =>
      current.map((item) =>
        item.id === po.id
          ? { ...item, status: "Received", eta: "Received today" }
          : item,
      ),
    );
    setProducts((current) =>
      current.map((item) =>
        item.id === po.productId
          ? {
            ...item,
            inTransit: Math.max(0, item.inTransit - po.items),
            inHouse: item.inHouse + po.items,
          }
          : item,
      ),
    );
    flash(`${po.id} received. Inventory moved in-house.`);
  }

  function scanInventory(productId, inventoryType) {
    setProducts((current) =>
      current.map((product) =>
        product.id === productId
          ? {
            ...product,
            inHouse: product.inHouse + 1,
            inventoryType:
              inventoryType === "Good Inventory" ? "Good" : "Bad",
          }
          : product,
      ),
    );
  }

  function addInventory(inventoryData) {
    setProducts((current) =>
      current.map((product) =>
        product.id === inventoryData.sku
          ? {
            ...product,
            inHouse: product.inHouse + 1,
            inventoryType: inventoryData.inventoryType,
          }
          : product,
      ),
    );
    flash(
      `${inventoryData.product} added to ${inventoryData.shelfCode}${inventoryData.remarks ? " - " + inventoryData.remarks : ""}.`,
    );
  }

  const openShipment = (shipment = null) => {
    if (shipment) {
      // EDIT
      setEditingShipment({
        shipment,
      });
    } else {
      // ADD
      setEditingShipment(null);
    }

    setModal("shipment");
  };

  const saveShipment = async (shipment, podFile) => {
    try {
      const formData = new FormData();
      Object.entries(shipment).forEach(([key, value]) => {
        if (key !== "POD Link") {
          formData.append(key, value ?? "");
        }
      });
      if (podFile) {
        formData.append("pod", podFile);
      }
      if (!editingShipment) {
        const response = await fetch(`${IN_TRANSIT_API}/create`, {
          method: "POST",
          body: formData,
        });
        loadShipments()
        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.message || "Failed to create shipment");
        }

        // Add API response to listing
        setShipments((current) => [result.data, ...current]);

        setNotice("Shipment added successfully.");

        return result;
      }
      const shipmentId = shipment["Vendor Code/ Shipment Id"];

      if (!shipmentId) {
        throw new Error("Vendor Code / Shipment Id is required.");
      }

      const response = await fetch(
        `${IN_TRANSIT_API}/${encodeURIComponent(shipmentId)}`,
        {
          method: "PUT",
          body: formData,
        },
      );

      const result = await response.json();

      console.log("Update response:", result);

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to update shipment");
      }

      // Update existing listing
      setShipments((current) =>
        current.map((item) =>
          item["Vendor Code/ Shipment Id"] === shipmentId ? result.data : item,
        ),
      );

      setNotice("Shipment updated successfully.");

      return result;
    } catch (error) {
      console.error("Save shipment error:", error);
      throw error;
    }
  };

  const handleDeleteShipment = async (shipmentId) => {

    if (!shipmentId) {
      alert("Shipment ID missing");
      return;
    }

    try {
      await deleteShipment(shipmentId);

      setShipments((current) =>
        current.filter((shipment) => shipment._id !== shipmentId),
      );
    } catch (error) {
      console.error("Delete error:", error);
      alert(error.message);
    }
  };

  const [ordersExpanded, setOrdersExpanded] = useState(() => getStorage("stockflow-active-page", "Overview") === "Orders");
  const [ordersTab, setOrdersTab] = useState(() => getStorage("stockflow-orders-tab", "managePos"));

  useEffect(() => {
    localStorage.setItem("stockflow-active-page", JSON.stringify(page));
    localStorage.setItem("stockflow-orders-tab", JSON.stringify(ordersTab));
  }, [page, ordersTab]);


  return (

    <div className="app-shell">

      {/* ================= SIDEBAR ================= */}
      <aside className="sidebar">

        <div className="brand">
          <span className="brand-mark">S</span>
          <span>stockflow</span>
        </div>

        <div className="workspace">
          <span className="workspace-icon">S</span>

          <div>
            <strong>Solace Goods</strong>
            <small>Operations workspace</small>
          </div>

          <span>⌄</span>
        </div>

        <nav>

          {/* ================= OVERVIEW ================= */}
          <button
            onClick={() => setPage("Overview")}
            className={page === "Overview" ? "active" : ""}
          >
            <span>▦</span>
            Overview
          </button>


          {/* ================= INVENTORY ================= */}
          <button
            className={`inventory-nav ${page === "Inventory" ? "active" : ""
              }`}
            onClick={() => {
              setPage("Inventory");
              setInventoryExpanded((expanded) => !expanded);
            }}
          >
            <span>▣</span>
            Inventory
            <b>{inventoryExpanded ? "⌃" : "⌄"}</b>
          </button>


          {inventoryExpanded && (
            <div className="inventory-subnav">

              {/* IN-HOUSE */}
              <button
                onClick={() => {
                  setInventorySection("inHouse");
                  setPage("Inventory");
                }}
                className={
                  page === "Inventory" &&
                    inventorySection === "inHouse"
                    ? "active"
                    : ""
                }
              >
                In-house inventory
              </button>


              {/* IN-TRANSIT */}
              <button
                onClick={() => {
                  setInventorySection("inTransit");
                  setInTransitTab("b2bShipment");
                  setPage("Inventory");
                }}
                className={
                  page === "Inventory" &&
                    inventorySection === "inTransit"
                    ? "active"
                    : ""
                }
              >
                In-transit inventory
              </button>


              {/* IN-TRANSIT SUB TABS */}
              {page === "Inventory" &&
                inventorySection === "inTransit" && (
                  <div className="inventory-sub-subnav">

                    <button
                      onClick={() => {
                        setInTransitTab("b2bShipment");
                        setPage("Inventory");
                      }}
                      className={
                        inTransitTab === "b2bShipment"
                          ? "active"
                          : ""
                      }
                    >
                      B2B Shipment
                    </button>


                    <button
                      onClick={() => {
                        setInTransitTab("mergeInvoice");
                        setPage("Inventory");
                      }}
                      className={
                        inTransitTab === "mergeInvoice"
                          ? "active"
                          : ""
                      }
                    >
                      Merge Invoice
                    </button>

                  </div>
                )}
            </div>
          )}





          {/* ================= ORDERS ================= */}
          <button
            className={`inventory-nav ${page === "Orders" ? "active" : ""
              }`}
            onClick={() => {
              setPage("Orders");
              setOrdersExpanded(true);
              setOrdersTab("managePos");
              setAmazonOpenRequest(value => value + 1);
            }}
          >
            <span>▣</span>
            Orders
            <b>{ordersExpanded ? "⌃" : "⌄"}</b>
          </button>


          {/* ================= ORDERS SUB TABS ================= */}
          {ordersExpanded && (
            <div className="inventory-subnav">

              {/* MANAGE POS */}
              <button
                onClick={() => {
                  setOrdersTab("managePos");
              setAmazonOpenRequest(value => value + 1);
                  setPage("Orders");
                }}
                className={
                  page === "Orders" &&
                    ordersTab === "managePos"
                    ? "active"
                    : ""
                }
              >
                Manage POS
              </button>


              {/* RETAILS PURCHASE */}
              <button
                onClick={() => {
                  setOrdersTab("retailsPurchase");
                  setPage("Orders");
                }}
                className={
                  page === "Orders" &&
                    ordersTab === "retailsPurchase"
                    ? "active"
                    : ""
                }
              >
                Retails Purchase
              </button>

            </div>
          )}

          <button className={page === "Product performance" ? "active" : ""} onClick={() => setPage("Product performance")}>Product performance</button>
          <button className={page === "Advertising" ? "active" : ""} onClick={() => setPage("Advertising")}>Advertising</button>
        </nav>


        {/* ================= SIDEBAR BOTTOM ================= */}
        <div className="side-bottom">

          <button>
            <span>◉</span>
            Reports
          </button>

          <button>
            <span>⚙</span>
            Settings
          </button>

          <div className="help">
            <span>?</span>

            <div>
              <strong>Need help?</strong>
              <small>Visit help center</small>
            </div>
          </div>

        </div>

      </aside>


      {/* ================= MAIN CONTENT ================= */}
      <main>

        {/* HEADER */}
        <header>

          <div>

            <p className="eyebrow">
              {page === "Overview"
                ? "Monday, September 1"
                : "Operations"}
            </p>

            <h1>{page}</h1>

          </div>


          <div className="header-actions">

            <button className="icon-button">
              ⌕
            </button>

            <button className="icon-button">
              ♢
              <i />
            </button>

            <div className="avatar">
              RK
            </div>

          </div>

        </header>


        {/* NOTICE */}
        {notice && (
          <div className="notice">
            ✓ {notice}
          </div>
        )}


        {/* ================= OVERVIEW ================= */}
        {page === "Overview" && (
          <Overview
            products={products}
            orders={orders}
            purchaseOrders={purchaseOrders}
            totalInHouse={totalInHouse}
            totalTransit={totalTransit}
            lowStock={lowStock}
            availableValue={availableValue}
            setPage={setPage}
            setModal={setModal}
          />
        )}


        {/* ================= INVENTORY ================= */}
        {page === "Inventory" && (
          <InventoryPage
            key={inventorySection}
            products={filteredProducts}

            shipments={shipments}
            b2bShipments={b2bShipments}

            search={search}
            setSearch={setSearch}
            setModal={setModal}

            defaultTab={inventorySection}

            onOpenShipment={openShipment}
            onDeleteShipment={handleDeleteShipment}
            onDeleteB2BShipment={handleDeleteB2BShipment}

            useApi={true}

            inTransitTab={inTransitTab}
            setInTransitTab={setInTransitTab}

            pagination={pagination}

            dateField={dateField}
            setDateField={setDateField}

            limit={limit}

            fromDate={fromDate}
            setFromDate={setFromDate}

            setToDate={setToDate}
            toDate={toDate}

            onPageChange={setShipmentPage}

            onLimitChange={(newLimit) => {
              setLimit(newLimit);
              setShipmentPage(1);
            }}
          />
        )}


        {/* ================= SALES ORDERS ================= */}
        {page === "Product performance" && <ProductPerformancePage />}
        {page === "Advertising" && <AdvertisingPage />}
        {page === "Sales orders" && (
          <SalesPage
            orders={orders}
            setModal={setModal}
          />
        )}


        {/* ================= ORDERS ========================= */}

        {/* MANAGE POS */}
        {page === "Orders" &&
          ordersTab === "managePos" && (
            <ManagePos
              openRequest={amazonOpenRequest}
              poData={amazonPoData}
              loading={amazonPoLoading}
              error={amazonPoError}
            />
          )}


        {/* RETAILS PURCHASE */}
        {page === "Orders" &&
          ordersTab === "retailsPurchase" && (
            <RetailsPurchase />
          )}

      </main>


      {/* ================= PRODUCT MODAL ================= */}
      {modal === "product" && (
        <Modal
          title="Add inventory item"
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={addProduct}
            className="form-grid"
          >

            <label>
              Product name

              <input
                required
                name="name"
                placeholder="e.g. Atlas Travel Backpack"
              />
            </label>


            <label>
              SKU

              <input
                name="sku"
                placeholder="Generated automatically"
              />
            </label>


            <label>
              Category

              <input
                required
                name="category"
                placeholder="e.g. Accessories"
              />
            </label>


            <label>
              Unit price

              <input
                required
                name="price"
                type="number"
                min="0"
                placeholder="0"
              />
            </label>


            <label>
              In-house units

              <input
                required
                name="inHouse"
                type="number"
                min="0"
                defaultValue="0"
              />
            </label>


            <label>
              In-transit units

              <input
                required
                name="inTransit"
                type="number"
                min="0"
                defaultValue="0"
              />
            </label>


            <label>
              Reorder point

              <input
                required
                name="reorder"
                type="number"
                min="0"
                defaultValue="10"
              />
            </label>


            <button className="primary submit">
              Add item
            </button>

          </form>
        </Modal>
      )}


      {/* ================= SALE MODAL ================= */}
      {modal === "sale" && (
        <Modal
          title="Create sales order"
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={createSale}
            className="form-grid"
          >

            <label>
              Customer

              <input
                required
                name="customer"
                placeholder="Customer name"
              />
            </label>


            <label>
              Product

              <select
                required
                name="product"
              >
                {products.map((p) => (
                  <option
                    key={p.id}
                    value={p.id}
                  >
                    {p.name} — {p.inHouse} available
                  </option>
                ))}
              </select>
            </label>


            <label>
              Quantity

              <input
                required
                name="quantity"
                type="number"
                min="1"
                defaultValue="1"
              />
            </label>


            <button className="primary submit">
              Create order
            </button>

          </form>
        </Modal>
      )}




      {/* ================= SCAN MODAL ================= */}
      {modal === "scan" && (
        <ScanInventoryModal
          products={products}
          onClose={() => setModal(null)}
          onScan={scanInventory}
        />
      )}


      {/* ================= ADD INVENTORY MODAL ================= */}
      {modal === "addInventory" && (
        <AddInventoryModal
          products={products}
          onClose={() => setModal(null)}
          onAdd={addInventory}
        />
      )}


      {/* ================= SHIPMENT MODAL ================= */}
      {modal === "shipment" && (
        <TransitShipmentModal
          key={editingShipment?.index ?? "new"}
          shipment={editingShipment?.shipment}
          onClose={() => {
            setEditingShipment(null);
            setModal(null);
          }}
          onSave={saveShipment}
        />
      )}

    </div>
  );

}

function Overview({
  products,
  orders,
  purchaseOrders,
  totalInHouse,
  totalTransit,
  lowStock,
  availableValue,
  setPage,
  setModal,
}) {
  return (
    <div className="content">
      <section className="hero">
        <div>
          <p>INVENTORY PULSE</p>
          <h2>
            Everything is moving
            <br />
            in the right direction.
          </h2>
          <span>
            Track stock, sales, and incoming orders from one clear view.
          </span>
        </div>
        <button className="hero-button" onClick={() => setModal("product")}>
          + Add inventory
        </button>
      </section>
      <section className="metrics">
        <Metric
          label="In-house inventory"
          value={totalInHouse.toLocaleString()}
          note="Units ready to sell"
          icon="▣"
        />
        <Metric
          label="In transit"
          value={totalTransit.toLocaleString()}
          note={`${purchaseOrders.filter((p) => p.status === "In transit").length} purchase orders on the way`}
          icon="⇢"
        />
        <Metric
          label="Low stock items"
          value={lowStock.length}
          note="Needs attention soon"
          icon="!"
          alert
        />
        <Metric
          label="Inventory value"
          value={formatCurrency(availableValue)}
          note={`Across ${products.length} active products`}
          icon="$"
        />
      </section>
      <section className="dashboard-grid">
        <div className="panel low-stock">
          <div className="panel-head">
            <div>
              <h3>Low stock</h3>
              <p>Products at or below their reorder point</p>
            </div>
            <button onClick={() => setPage("Inventory")}>View all →</button>
          </div>
          <div className="product-list">
            {lowStock.map((product) => (
              <div className="list-row" key={product.id}>
                <div className="product-badge">{product.name.slice(0, 1)}</div>
                <div className="row-name">
                  <strong>{product.name}</strong>
                  <small>
                    {product.id} · {product.category}
                  </small>
                </div>
                <div className="stock-count">
                  <b>{product.inHouse}</b>
                  <small>in stock</small>
                </div>
                <button className="outline" onClick={() => setModal("po")}>
                  Restock
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="panel sales-card">
          <div className="panel-head">
            <div>
              <h3>Sales this week</h3>
              <p>Order volume across the last 7 days</p>
            </div>
            <button onClick={() => setPage("Sales orders")}>Details →</button>
          </div>
          <div className="sales-total">
            {formatCurrency(1331)} <span>↗ 12.4%</span>
          </div>
          <div className="chart">
            {[38, 56, 44, 72, 52, 90, 68].map((height, index) => (
              <div key={index}>
                <i style={{ height: `${height}%` }}></i>
                <small>
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index]}
                </small>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="panel recent">
        <div className="panel-head">
          <div>
            <h3>Recent sales orders</h3>
            <p>Latest activity in your sales pipeline</p>
          </div>
          <button onClick={() => setPage("Sales orders")}>View orders →</button>
        </div>
        <OrderTable orders={orders.slice(0, 4)} />
      </section>
    </div>
  );
}

function Metric({ label, value, note, icon, alert }) {
  return (
    <article className="metric">
      <div className={`metric-icon ${alert ? "alert" : ""}`}>{icon}</div>
      <p>{label}</p>
      <h2>{value}</h2>
      <small className={alert ? "warning" : ""}>
        {alert ? "● " : ""}
        {note}
      </small>
    </article>
  );
}

function PurchaseOrders({ orders, setModal, receivePo }) {
  return (
    <div className="content">
      <div className="page-actions">
        <p className="lead">
          Incoming quantities stay separate until received.
        </p>
        <button className="primary" onClick={() => setModal("po")}>
          + New purchase order
        </button>
      </div>
      <section className="panel table-panel">
        <div className="panel-head">
          <div>
            <h3>Purchase orders</h3>
            <p>Track supplier deliveries and transit stock</p>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>PO number</th>
              <th>Supplier</th>
              <th>Expected arrival</th>
              <th>Units</th>
              <th>Value</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>
                  <strong>{order.id}</strong>
                </td>
                <td>{order.supplier}</td>
                <td>{order.eta}</td>
                <td>{order.items}</td>
                <td>{formatCurrency(order.value)}</td>
                <td>
                  <span
                    className={`status ${order.status === "Received" ? "good" : "transit"}`}
                  >
                    {order.status}
                  </span>
                </td>
                <td>
                  {order.status === "In transit" && (
                    <button
                      className="outline small"
                      onClick={() => receivePo(order)}
                    >
                      Receive
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
function OrderTable({ orders }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Order</th>
          <th>Customer</th>
          <th>Date</th>
          <th>Items</th>
          <th>Total</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((order) => (
          <tr key={order.id}>
            <td>
              <strong>{order.id}</strong>
            </td>
            <td>{order.customer}</td>
            <td>{order.date}</td>
            <td>{order.items}</td>
            <td>{formatCurrency(order.total)}</td>
            <td>
              <span
                className={`status ${order.status === "Shipped" ? "good" : order.status === "Processing" ? "transit" : "neutral"}`}
              >
                {order.status}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {new URLSearchParams(window.location.search).has("poId") ? <PODetailsPage /> : <App />}
  </StrictMode>,
);
