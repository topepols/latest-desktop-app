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
let currentEditId = null; 
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
    renderDashboard(); 
    
    // If bulk modal is open, refresh it live
    if(document.getElementById('bulkModal').style.display === 'flex') {
      renderBulkTable();
    }
  });

  // Listen to Reports
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

window.handleLogin = () => {
  const u = document.getElementById('loginUsername').value;
  const p = document.getElementById('loginPassword').value;
  
  if (accounts[u] && accounts[u] === p) {
    currentUser = u;
    document.getElementById('currentUserLabel').textContent = u;
    
    // --- 1. SHOW SIDEBAR ON LOGIN ---
    document.getElementById('appSidebar').style.display = 'block'; // <--- ADDED THIS

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
      // --- LOGOUT LOGIC ---
      if(item.id === 'logoutBtn') {
        currentUser = null;
        document.getElementById('currentUserLabel').textContent = '-';
        
        // --- 2. HIDE SIDEBAR ON LOGOUT ---
        document.getElementById('appSidebar').style.display = 'none'; // <--- ADDED THIS
        
        switchView('login');
        return;
      }

      const view = item.getAttribute('data-view');
      if (view) switchView(view);
    };
  });

  document.getElementById('btnToggleSidebar').onclick = () => {
    // Note: Use 'appSidebar' ID if you changed the class logic, 
    // or keep querySelector('.sidebar') if you kept the class name "sidebar"
    document.getElementById('appSidebar').classList.toggle('active');
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
  
  // 🟢 THIS LINE HIDES THE DELETE BUTTON (Safety):
  document.getElementById('btnDeleteItem').style.display = 'none';

  ['mName', 'mCategory', 'mQuantity', 'mDate', 'mPricePCS', 'mPriceBOX', 'mPriceTUB'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('mUnit').value = 'pcs'; 
  document.getElementById('qrContainer').innerHTML = '';
  document.getElementById('modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modal').style.display = 'none';
}

// Make globally accessible
window.openAddItem = openAddItem;
window.closeModal = closeModal;

// =============================
// GENERATE QR CODE
// =============================
document.getElementById('btnGenerateQR').onclick = () => {
  const name = document.getElementById('mName').value;
  const date = document.getElementById('mDate').value;
  
  // 🟢 FIX: Get value from the new Dropdown, not the old Radio Buttons
  const unit = document.getElementById('mUnit').value; 
  
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
  
  // Generate the QR
  QRCode.toCanvas(canvas, JSON.stringify(itemData), { width: 200 }, (err) => { 
    if(err) console.error(err); 
  });
  
  qrContainer.appendChild(canvas);
};

// =============================
// SAVE ITEM (FIRESTORE)
// =============================
document.getElementById('btnSaveItem').onclick = async () => {
  const name = document.getElementById('mName').value;
  const category = document.getElementById('mCategory').value; 
  const quantity = parseInt(document.getElementById('mQuantity').value) || 0;
  const date = document.getElementById('mDate').value;
  const unit = document.getElementById('mUnit').value; // Get the selected unit
  
  // Get all prices
  const prices = {
    pcs: parseFloat(document.getElementById('mPricePCS').value) || 0,
    box: parseFloat(document.getElementById('mPriceBOX').value) || 0,
    tub: parseFloat(document.getElementById('mPriceTUB').value) || 0
  };

  // --- 1. BASIC FIELD CHECKS ---
  if (!name || !date) { 
    alert('Please fill in the Name and Date fields.'); 
    return; 
  }

  // --- 2. PRICE VALIDATION (NEW) ---
  // This checks the price specifically for the unit you selected.
  // Example: If you selected "BOX", the "Price BOX" cannot be 0.
  if (prices[unit] <= 0) {
    alert(`You selected Unit: "${unit.toUpperCase()}", but the price for ${unit.toUpperCase()} is 0. Please enter a valid price.`);
    return; // Stops the save process
  }

  // Optional: Safety check to ensure not ALL prices are zero (if you want to be extra strict)
  if (prices.pcs <= 0 && prices.box <= 0 && prices.tub <= 0) {
    alert('All prices are 0. Please add at least one price.');
    return;
  }

  // Prepare data to save
  const itemData = { name, category, quantity, date, unit, prices };

  try {
    if (currentEditId) {
      // Update existing item
      await updateDoc(doc(db, "inventory", currentEditId), itemData);
    } else {
      // Add new item
      await addDoc(collection(db, "inventory"), itemData);
      
      // Log this transaction
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
document.getElementById('sortInventory').addEventListener('change', renderInventory);
document.getElementById('sortReports').addEventListener('change', renderReports);
function renderInventory() {
  const tbody = document.querySelector('#inventoryTable tbody');
  tbody.innerHTML = '';
  
  const searchTerm = document.getElementById('inventorySearch').value.toLowerCase();
  const sortMode = document.getElementById('sortInventory').value; // Get dropdown value

  // 1. Filter first
  let filtered = inventory.filter(item => item.name.toLowerCase().includes(searchTerm));

  // 2. Then Sort
  filtered.sort((a, b) => {
    if (sortMode === 'alpha') {
      return a.name.localeCompare(b.name);
    } else if (sortMode === 'qtyLow') {
      return a.quantity - b.quantity;
    } else if (sortMode === 'qtyHigh') {
      return b.quantity - a.quantity;
    } else if (sortMode === 'dateNew') {
      return new Date(b.date) - new Date(a.date);
    } else if (sortMode === 'dateOld') {
      return new Date(a.date) - new Date(b.date);
    }
  });

  // 3. Render
  filtered.forEach((item) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.name}</td>
      <td>${item.category || '-'}</td>
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

window.editItem = (id) => {
  const item = inventory.find(x => x.id === id);
  if(!item) return;

  currentEditId = id;
  document.getElementById('modalTitle').textContent = 'Edit Item';

  // 🟢 THIS LINE MAKES THE DELETE BUTTON APPEAR:
  document.getElementById('btnDeleteItem').style.display = 'block';

  document.getElementById('mName').value = item.name;
  document.getElementById('mCategory').value = item.category || ''; // 🟢 ADD THIS LINE
  document.getElementById('mQuantity').value = item.quantity;
  document.getElementById('mDate').value = item.date;
  
  // ... rest of the code remains the same ...
  
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
      logTransaction(item, "SOLD", item.quantity);
      await deleteDoc(doc(db, "inventory", adjustId));
    }
  } else {
    const newQty = item.quantity - adjustAmount;
    await updateDoc(doc(db, "inventory", adjustId), { quantity: newQty });
    logTransaction(item, "SOLD", adjustAmount);
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
  const unitPrice = item.prices[item.unit] || 0;

  await addDoc(collection(db, "reports"), {
    name: item.name,
    type: type,
    quantity: qtyChange,
    date: today,
    unitPrice: unitPrice,
    prices: item.prices,
    timestamp: serverTimestamp()
  });
}

// =============================
// REPORTS RENDERING
// =============================
function renderReports() {
  const tbody = document.querySelector('#reportsTable tbody');
  tbody.innerHTML = '';
  
  const sortMode = document.getElementById('sortReports').value; // Get dropdown value

  // Create a copy of reports array to sort safely
  let sortedReports = [...reports];

  // Sort Logic
  sortedReports.sort((a, b) => {
    if (sortMode === 'dateNew') {
      // Sort by timestamp if available, otherwise by date string
      const dateA = a.timestamp ? a.timestamp.seconds : new Date(a.date).getTime();
      const dateB = b.timestamp ? b.timestamp.seconds : new Date(b.date).getTime();
      return dateB - dateA;
    } else if (sortMode === 'dateOld') {
      const dateA = a.timestamp ? a.timestamp.seconds : new Date(a.date).getTime();
      const dateB = b.timestamp ? b.timestamp.seconds : new Date(b.date).getTime();
      return dateA - dateB;
    } else if (sortMode === 'action') {
      return a.type.localeCompare(b.type);
    }
  });
  
  sortedReports.forEach(log => {
    const totalValue = (log.quantity || 0) * (log.unitPrice || 0);
    
    let color = '#333';
    if(log.type === 'RESTOCK') color = '#2ecc71';
    if(log.type === 'SOLD') color = '#e74c3c';
    if(log.type === 'NEW ITEM') color = '#3498db';
    if(log.type === 'DELETED') color = '#95a5a6';

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

// 1. Helper function to build the scrollable HTML chart
function renderScrollableChart() {
  const container = document.getElementById('scrollableChart');
  if (!container) return;

  container.innerHTML = ''; // Clear previous content

  if (!inventory || inventory.length === 0) {
    container.innerHTML = '<p class="muted" style="text-align:center; padding-top:20px;">No items in stock.</p>';
    return;
  }

  // A. Sort by Quantity (Highest first)
  const sortedItems = [...inventory].sort((a, b) => b.quantity - a.quantity);

  // B. Find the highest quantity to calculate percentages
  const maxQty = Math.max(...sortedItems.map(item => item.quantity)) || 100;

  // C. Generate HTML
  let html = '';
  sortedItems.forEach(item => {
    // Calculate width percentage
    const widthPercent = (item.quantity / maxQty) * 100;
    
    // Logic: Blue normally (#7cb5ec), Red if low stock (#e74c3c)
    const barColor = item.quantity < 5 ? '#e74c3c' : '#7cb5ec';

    html += `
      <div class="chart-row">
        <div class="row-label" title="${item.name}">${item.name}</div>
        <div class="bar-container">
          <div class="bar" style="width: ${widthPercent}%; background-color: ${barColor};"></div>
          <span class="bar-value">${item.quantity}</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// 2. Main Dashboard Render Function
function renderDashboard() {
  // Update Top Stats
  document.getElementById('totalItems').textContent = inventory.length;

  const totalValue = inventory.reduce((sum, item) => {
    const price = item.prices[item.unit] || 0;
    return sum + (item.quantity * price);
  }, 0);
  
  document.getElementById('totalExpenses').textContent = `₱${totalValue.toLocaleString(undefined, {minimumFractionDigits: 2})}`;

  // Update Low Stock Alerts (Left Card)
  const alertsList = document.getElementById('alertsList');
  alertsList.innerHTML = '';
  inventory.filter(x => x.quantity < 5).forEach(item => {
    const li = document.createElement('li');
    li.textContent = `${item.name} is low (${item.quantity} ${item.unit})`;
    li.style.color = '#e74c3c';
    alertsList.appendChild(li);
  });

  // Render the new Scrollable Chart (Right Card)
  renderScrollableChart();
}

// =============================
// BULK / RAPID ADJUSTMENT
// =============================
document.getElementById('btnOpenBulk').onclick = () => {
  document.querySelector('#bulkTable tbody').innerHTML = ''; 
  
  renderBulkTable();
  document.getElementById('bulkModal').style.display = 'flex';
};
document.getElementById('btnBulkClose').onclick = () => {
  document.getElementById('bulkModal').style.display = 'none';
};

function renderBulkTable() {
  const tbody = document.querySelector('#bulkTable tbody');
  
  // 1. CAPTURE CURRENT INPUT VALUES (The Fix)
  // Before we wipe the table, we look at every input and save what number the user typed.
  const currentValues = {};
  const existingInputs = tbody.querySelectorAll('input[type="number"]');
  existingInputs.forEach(input => {
    // Save the value using the Item ID as the key
    currentValues[input.id] = input.value;
  });

  // 2. Clear the table
  tbody.innerHTML = '';

  // 3. Re-build the table
  inventory.forEach((item) => {
    const tr = document.createElement('tr');
    
    // Generate the ID for this input
    const inputId = `bulk-qty-${item.id}`;
    
    // Check if we had a saved value for this item, otherwise default to 1
    // This ensures that if you typed "5", it stays "5" after the refresh.
    const valToRender = currentValues[inputId] || 1;

    tr.innerHTML = `
      <td style="font-weight:bold;">${item.name} <span style="font-size:0.8em; color:#666;">(${item.unit})</span></td>
      <td style="font-size:1.1em; text-align:center;">${item.quantity}</td>
      <td>
        <div style="display:flex; justify-content:center; gap:5px;">
           <button class="btn" onclick="window.adjustBulkInput('${item.id}', -1)" style="padding:2px 8px;">-</button>
           
           <input id="${inputId}" type="number" value="${valToRender}" min="1" style="width:50px; text-align:center;">
           
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

document.getElementById('btnDeleteItem').onclick = async () => {
  if (!currentEditId) return;

  if (confirm("Are you sure you want to permanently delete this item?")) {
    await deleteDoc(doc(db, "inventory", currentEditId));
    closeModal();
  }
};

