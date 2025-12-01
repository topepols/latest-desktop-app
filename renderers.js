import { db } from './firebase.js';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  doc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  serverTimestamp 
} from "firebase/firestore";

// =============================
// STATE
// =============================
let inventory = [];
let reports = [];
let currentEditId = null; // Changed from index to ID
let currentUser = null;

// =============================
// FIRESTORE LISTENERS
// =============================
function initListeners() {
  // Listen to Inventory
  const qInventory = query(collection(db, "inventory"), orderBy("name"));
  onSnapshot(qInventory, (snapshot) => {
    inventory = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    renderInventory();
    renderDashboard(); // Update dashboard whenever inventory changes
    
    // If bulk modal is open, refresh it live
    if(document.getElementById('bulkModal').style.display === 'flex') {
      renderBulkTable();
    }
  });

  // Listen to Reports (History)
  // We order by 'timestamp' desc so newest is first
  const qReports = query(collection(db, "reports"), orderBy("timestamp", "desc"));
  onSnapshot(qReports, (snapshot) => {
    reports = snapshot.docs.map(doc => doc.data());
    renderReports();
  });
}

// Start listeners immediately
initListeners();

// =============================
// LOGIN SYSTEM
// =============================
const accounts = { admin: 'admin123', manager: 'manager123' };

// Expose to window because module scope is private
window.handleLogin = () => {
  const u = document.getElementById('loginUsername').value;
  const p = document.getElementById('loginPassword').value;
  if (accounts[u] && accounts[u] === p) {
    currentUser = u;
    document.getElementById('currentUserLabel').textContent = u;
    switchView('dashboard');
    setupNav();
    renderDashboard();
  } else {
    document.getElementById('loginError').textContent = 'Invalid credentials';
  }
};
document.getElementById('btnLogin').onclick = window.handleLogin;

// =============================
// NAVIGATION
// =============================
function setupNav() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.onclick = () => {
      if(item.id === 'logoutBtn') {
        currentUser = null;
        document.getElementById('currentUserLabel').textContent = '-';
        switchView('login');
        return;
      }
      const view = item.getAttribute('data-view');
      if (view) switchView(view);
    };
  });

  document.getElementById('btnToggleSidebar').onclick = () => {
    document.querySelector('.sidebar').classList.toggle('active');
    document.querySelector('.main').classList.toggle('sidebar-active');
  };
}

// =============================
// VIEW SWITCHING
// =============================
function switchView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
  document.getElementById(`view-${view}`).classList.add('active-view');

  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  const activeItem = document.querySelector(`.nav-item[data-view="${view}"]`);
  if(activeItem) activeItem.classList.add('active');

  if(view === 'dashboard') renderDashboard();
  if(view === 'inventory') renderInventory();
  if(view === 'reports') renderReports();
}

// =============================
// MODAL & ADD/EDIT
// =============================
function openAddItem() {
  currentEditId = null;
  document.getElementById('modalTitle').textContent = 'Add Item';
  ['mName','mQuantity','mDate','mPricePCS','mPriceBOX','mPriceTUB'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('qrContainer').innerHTML = '';
  document.getElementById('modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modal').style.display = 'none';
}

// Make globally accessible for HTML onclicks
window.openAddItem = openAddItem;
window.closeModal = closeModal;

// =============================
// GENERATE QR CODE
// =============================
document.getElementById('btnGenerateQR').onclick = () => {
  const name = document.getElementById('mName').value;
  const date = document.getElementById('mDate').value;
  const unit = document.querySelector('input[name="unit"]:checked').value;
  
  if (!name || !date) { alert('Fill fields first'); return; }

  const itemData = {
    name, date, unit,
    prices: {
      pcs: parseFloat(document.getElementById('mPricePCS').value) || 0,
      box: parseFloat(document.getElementById('mPriceBOX').value) || 0,
      tub: parseFloat(document.getElementById('mPriceTUB').value) || 0
    }
  };

  const qrContainer = document.getElementById('qrContainer');
  qrContainer.innerHTML = '';
  const canvas = document.createElement('canvas');
  QRCode.toCanvas(canvas, JSON.stringify(itemData), { width: 200 }, (err) => { if(err) console.error(err); });
  qrContainer.appendChild(canvas);
};

// =============================
// SAVE ITEM (FIRESTORE)
// =============================
document.getElementById('btnSaveItem').onclick = async () => {
  const name = document.getElementById('mName').value;
  const quantity = parseInt(document.getElementById('mQuantity').value) || 0;
  const date = document.getElementById('mDate').value;
  const unit = document.querySelector('input[name="unit"]:checked').value;
  
  const prices = {
    pcs: parseFloat(document.getElementById('mPricePCS').value) || 0,
    box: parseFloat(document.getElementById('mPriceBOX').value) || 0,
    tub: parseFloat(document.getElementById('mPriceTUB').value) || 0
  };

  if (!name || !date) { alert('Fill required fields'); return; }

  const itemData = { name, quantity, date, unit, prices };

  try {
    if (currentEditId) {
      // Update existing
      await updateDoc(doc(db, "inventory", currentEditId), itemData);
    } else {
      // Create new
      await addDoc(collection(db, "inventory"), itemData);
      logTransaction(itemData, "NEW ITEM", quantity);
    }
    closeModal();
  } catch (e) {
    console.error("Error adding document: ", e);
    alert("Error saving to database. Check console.");
  }
};

// =============================
// INVENTORY RENDERING
// =============================
function renderInventory() {
  const tbody = document.querySelector('#inventoryTable tbody');
  tbody.innerHTML = '';
  
  // Local search filtering
  const searchTerm = document.getElementById('inventorySearch').value.toLowerCase();
  
  const filtered = inventory.filter(item => item.name.toLowerCase().includes(searchTerm));

  filtered.forEach((item) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.name}</td>
      <td>${item.quantity}</td>
      <td>${item.date}</td>
      <td>
        <small>PCS: ₱${item.prices.pcs}</small><br>
        <small>BOX: ₱${item.prices.box}</small><br>
        <small>TUB: ₱${item.prices.tub}</small>
      </td>
      <td>
        <button class="btn" onclick="window.editItem('${item.id}')">Edit</button>
        <button class="btn" style="background:#2ecc71; color:white;" onclick="window.openAdjust('${item.id}')">Adjust</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById('inventorySearch').addEventListener('input', renderInventory);

// Edit function (Global)
window.editItem = (id) => {
  const item = inventory.find(x => x.id === id);
  if(!item) return;

  currentEditId = id;
  document.getElementById('modalTitle').textContent = 'Edit Item';
  document.getElementById('mName').value = item.name;
  document.getElementById('mQuantity').value = item.quantity;
  document.getElementById('mDate').value = item.date;
  
  const unitRadio = document.querySelector(`input[name="unit"][value="${item.unit}"]`);
  if(unitRadio) unitRadio.checked = true;

  document.getElementById('mPricePCS').value = item.prices.pcs;
  document.getElementById('mPriceBOX').value = item.prices.box;
  document.getElementById('mPriceTUB').value = item.prices.tub;
  
  document.getElementById('modal').style.display = 'flex';
};

// =============================
// ADJUST STOCK LOGIC
// =============================
let adjustId = null;
let adjustAmount = 1;

window.openAdjust = (id) => {
  const item = inventory.find(x => x.id === id);
  if(!item) return;
  
  adjustId = id;
  adjustAmount = 1;
  document.getElementById('adjustName').textContent = item.name;
  document.getElementById('adjustCurrentStock').textContent = item.quantity;
  document.getElementById('adjustInput').value = adjustAmount;
  document.getElementById('adjustModal').style.display = 'flex';
};

document.getElementById('btnAdjPlus').onclick = () => {
  adjustAmount++;
  document.getElementById('adjustInput').value = adjustAmount;
};
document.getElementById('btnAdjMinus').onclick = () => {
  if (adjustAmount > 1) {
    adjustAmount--;
    document.getElementById('adjustInput').value = adjustAmount;
  }
};

document.getElementById('btnActionAdd').onclick = async () => {
  if (!adjustId) return;
  const item = inventory.find(x => x.id === adjustId);
  const newQty = item.quantity + adjustAmount;
  
  await updateDoc(doc(db, "inventory", adjustId), { quantity: newQty });
  logTransaction(item, "RESTOCK", adjustAmount);
  
  document.getElementById('adjustModal').style.display = 'none';
};

document.getElementById('btnActionRemove').onclick = async () => {
  if (!adjustId) return;
  const item = inventory.find(x => x.id === adjustId);
  
  if (adjustAmount >= item.quantity) {
    if(confirm(`This will remove "${item.name}" completely. Proceed?`)) {
      logTransaction(item, "GET/SOLD", item.quantity);
      await deleteDoc(doc(db, "inventory", adjustId));
    }
  } else {
    const newQty = item.quantity - adjustAmount;
    await updateDoc(doc(db, "inventory", adjustId), { quantity: newQty });
    logTransaction(item, "GET/SOLD", adjustAmount);
  }
  
  document.getElementById('adjustModal').style.display = 'none';
};

document.getElementById('btnAdjustCancel').onclick = () => {
  document.getElementById('adjustModal').style.display = 'none';
};

// =============================
// LOGGING
// =============================
async function logTransaction(item, type, qtyChange) {
  const today = new Date().toISOString().split('T')[0];
  const unitPrice = item.prices[item.unit] || 0; // Use specific unit price

  await addDoc(collection(db, "reports"), {
    name: item.name,
    type: type,
    quantity: qtyChange,
    date: today,
    unitPrice: unitPrice,
    prices: item.prices,
    timestamp: serverTimestamp() // Allows sorting by time
  });
}

// =============================
// REPORTS RENDERING
// =============================
function renderReports() {
  const tbody = document.querySelector('#reportsTable tbody');
  tbody.innerHTML = '';
  
  reports.forEach(log => {
    
    const totalValue = (log.quantity || 0) * (log.unitPrice || 0);
    
    let color = '#333';
    if(log.type === 'RESTOCK') color = '#2ecc71';
    if(log.type === 'GET/SOLD') color = '#e74c3c';
    if(log.type === 'NEW ITEM') color = '#3498db';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${log.name}</td>
      <td style="color:${color}; font-weight:bold;">${log.type}</td>
      <td>${log.quantity}</td>
      <td>${log.date}</td>
      <td>₱${totalValue.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// =============================
// DASHBOARD
// =============================
let stockChart = null;

function renderDashboard() {
  document.getElementById('totalItems').textContent = inventory.length;

  const totalValue = inventory.reduce((sum, item) => {
    const price = item.prices[item.unit] || 0;
    return sum + (item.quantity * price);
  }, 0);
  
  document.getElementById('totalExpenses').textContent = `₱${totalValue.toLocaleString(undefined, {minimumFractionDigits: 2})}`;

  const alertsList = document.getElementById('alertsList');
  alertsList.innerHTML = '';
  inventory.filter(x => x.quantity < 5).forEach(item => {
    const li = document.createElement('li');
    li.textContent = `${item.name} is low (${item.quantity} ${item.unit})`;
    alertsList.appendChild(li);
  });

  const ctx = document.getElementById('stockChart').getContext('2d');
  if(stockChart) stockChart.destroy();

  const backgroundColors = inventory.map(item => {
    if (item.quantity < 5) return '#e74c3c';
    if (item.unit === 'pcs') return '#3498db';
    if (item.unit === 'box') return '#f1c40f';
    return '#2ecc71';
  });

  stockChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: inventory.map(x => `${x.name} (${x.unit})`),
      datasets: [{
        label: 'Quantity',
        data: inventory.map(x => x.quantity),
        backgroundColor: backgroundColors,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

// =============================
// BULK / RAPID ADJUSTMENT
// =============================
document.getElementById('btnOpenBulk').onclick = () => {
  renderBulkTable();
  document.getElementById('bulkModal').style.display = 'flex';
};
document.getElementById('btnBulkClose').onclick = () => {
  document.getElementById('bulkModal').style.display = 'none';
};

function renderBulkTable() {
  const tbody = document.querySelector('#bulkTable tbody');
  tbody.innerHTML = '';

  inventory.forEach((item) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:bold;">${item.name} <span style="font-size:0.8em; color:#666;">(${item.unit})</span></td>
      <td style="font-size:1.1em; text-align:center;">${item.quantity}</td>
      <td>
        <div style="display:flex; justify-content:center; gap:5px;">
           <button class="btn" onclick="window.adjustBulkInput('${item.id}', -1)" style="padding:2px 8px;">-</button>
           <input id="bulk-qty-${item.id}" type="number" value="1" min="1" style="width:50px; text-align:center;">
           <button class="btn" onclick="window.adjustBulkInput('${item.id}', 1)" style="padding:2px 8px;">+</button>
        </div>
      </td>
      <td>
        <div style="display:flex; gap:5px; justify-content:center;">
          <button class="btn" style="background:#2ecc71; color:white; padding:5px 10px;" onclick="window.processBulkAction('${item.id}', 'add')">Add</button>
          <button class="btn" style="background:#e74c3c; color:white; padding:5px 10px;" onclick="window.processBulkAction('${item.id}', 'remove')">Sold</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.adjustBulkInput = (id, change) => {
  const input = document.getElementById(`bulk-qty-${id}`);
  let val = parseInt(input.value) || 0;
  val += change;
  if(val < 1) val = 1;
  input.value = val;
};

window.processBulkAction = async (id, action) => {
  const item = inventory.find(x => x.id === id);
  if(!item) return;

  const input = document.getElementById(`bulk-qty-${id}`);
  const amount = parseInt(input.value) || 0;
  if (amount <= 0) return;

  let newQty = item.quantity;

  if (action === 'add') {
    newQty += amount;
    await updateDoc(doc(db, "inventory", id), { quantity: newQty });
    logTransaction(item, "RESTOCK", amount);
  } else {
    if (amount > item.quantity) { alert("Not enough stock!"); return; }
    newQty -= amount;
    await updateDoc(doc(db, "inventory", id), { quantity: newQty });
    logTransaction(item, "SOLD", amount);
  }
  input.value = 1;
};

// =============================
// EVENT LISTENERS FOR MODALS
// =============================
document.getElementById('btnAddItem').onclick = openAddItem;
document.getElementById('modalCancel').onclick = closeModal;

// Print & Export
document.getElementById('btnPrint').onclick = () => {
  const tableHTML = document.getElementById('reportsTable').outerHTML;
  const win = window.open('', '', 'width=800,height=600');
  win.document.write(`<html><head><style>table{width:100%;border-collapse:collapse;} th,td{border:1px solid #222;padding:8px;} th{background:#eee;}</style></head><body><h2>Reports</h2>${tableHTML}</body></html>`);
  win.document.close();
  win.print();
};

document.getElementById('btnExportCsv').onclick = () => {
  let csv = 'Product Name,Action,Quantity,Date,Value\n';
  reports.forEach(x => {
    const val = (x.quantity || 0) * (x.unitPrice || 0);
    csv += `${x.name},${x.type},${x.quantity},${x.date},${val.toFixed(2)}\n`;
  });
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `reports_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
};