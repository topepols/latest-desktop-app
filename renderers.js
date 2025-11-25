// =============================
// STATE
// =============================
let inventory = [];
let reports = [];
let currentEditIndex = null;
let currentUser = null;

// =============================
// LOGIN SYSTEM
// =============================
const accounts = { admin: 'admin123', manager: 'manager123' };

document.getElementById('btnLogin').onclick = () => {
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
// MODAL
// =============================
function openAddItem() {
  currentEditIndex = null;
  document.getElementById('modalTitle').textContent = 'Add Item';
  ['mName','mQuantity','mDate','mPricePCS','mPriceBOX','mPriceTUB'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('qrContainer').innerHTML = '';
  document.getElementById('modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modal').style.display = 'none';
}

// =============================
// GENERATE QR CODE
// =============================
document.getElementById('btnGenerateQR').onclick = () => {
  const name = document.getElementById('mName').value;
  const date = document.getElementById('mDate').value;
  const unit = document.querySelector('input[name="unit"]:checked').value;
  const pcs = document.getElementById('mPricePCS').value || 0;
  const box = document.getElementById('mPriceBOX').value || 0;
  const tub = document.getElementById('mPriceTUB').value || 0;

  if (!name || !date) {
    alert('Fill all required fields before generating QR');
    return;
  }

  const item = {
    name,
    date,
    unit,
    prices: { pcs: parseFloat(pcs), box: parseFloat(box), tub: parseFloat(tub) }
  };

  const qrText = JSON.stringify(item, null, 2);
  const qrContainer = document.getElementById('qrContainer');
  qrContainer.innerHTML = '';
  
  // Generate QR on canvas
  const canvas = document.createElement('canvas');
  QRCode.toCanvas(canvas, qrText, { width: 200 }, function (err) {
    if(err) console.error(err);
  });
  qrContainer.appendChild(canvas);

  // Add download button
  const downloadBtn = document.createElement('button');
  downloadBtn.textContent = 'Download QR';
  downloadBtn.className = 'btn';
  downloadBtn.style.marginTop = '10px';
  downloadBtn.onclick = () => {
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `${name}_QR.png`;
    link.click();
  };
  qrContainer.appendChild(downloadBtn);
};

// =============================
// SAVE ITEM (Modified)
// =============================
document.getElementById('btnSaveItem').onclick = () => {
  const name = document.getElementById('mName').value;
  const quantity = parseInt(document.getElementById('mQuantity').value) || 1;
  const date = document.getElementById('mDate').value;
  const unit = document.querySelector('input[name="unit"]:checked').value;
  const pcs = parseFloat(document.getElementById('mPricePCS').value) || 0;
  const box = parseFloat(document.getElementById('mPriceBOX').value) || 0;
  const tub = parseFloat(document.getElementById('mPriceTUB').value) || 0;

  if (!name || !date) { alert('Fill all required fields'); return; }

  const item = { name, quantity, date, unit, prices: { pcs, box, tub } };

  if(currentEditIndex !== null) {
    // EDIT MODE: We just update the inventory details
    // We do NOT usually log an "Edit" as a transaction, 
    // but we update the inventory object.
    inventory[currentEditIndex] = item;
    currentEditIndex = null;
  } else {
    // NEW ITEM MODE
    inventory.push(item);
    
    // LOG IT TO REPORTS
    logTransaction(item, "NEW ITEM", quantity);
  }

  closeModal();
  renderInventory();
  renderReports();
  renderDashboard();
};

// =============================
// INVENTORY RENDERING
// =============================
// =============================
// INVENTORY RENDERING
// =============================
// UPDATED renderInventory (Cleaner)
// UPDATED renderInventory (Cleaner)
function renderInventory() {
  const tbody = document.querySelector('#inventoryTable tbody');
  tbody.innerHTML = '';
  inventory.forEach((item, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.name}</td>
      <td>${item.quantity}</td>
      <td>${item.date}</td>
      <td>PCS: ₱${item.prices.pcs}<br>BOX: ₱${item.prices.box}<br>TUB: ₱${item.prices.tub}</td>
      <td>
        <button class="btn" onclick="window.prepareEdit('${item.id}')">Edit</button>
        </td>
    `;
    tbody.appendChild(tr);
  });
}




// =============================
// EDIT / GET ITEMS
// =============================
window.editItem = (i) => {
  const item = inventory[i];
  currentEditIndex = i;
  document.getElementById('modalTitle').textContent = 'Edit Item';
  document.getElementById('mName').value = item.name;
  document.getElementById('mQuantity').value = item.quantity;
  document.getElementById('mDate').value = item.date;
  document.querySelector(`input[name="unit"][value="${item.unit}"]`).checked = true;
  document.getElementById('mPricePCS').value = item.prices.pcs;
  document.getElementById('mPriceBOX').value = item.prices.box;
  document.getElementById('mPriceTUB').value = item.prices.tub;
  document.getElementById('modal').style.display = 'flex';
};

// =============================
// ADJUST STOCK LOGIC (Updated)
// =============================
let adjustIndex = null;
let adjustAmount = 1;

window.openAdjust = (i) => {
  const item = inventory[i];
  adjustIndex = i;
  adjustAmount = 1;
  document.getElementById('adjustName').textContent = item.name;
  document.getElementById('adjustCurrentStock').textContent = item.quantity;
  document.getElementById('adjustInput').value = adjustAmount;
  document.getElementById('adjustModal').style.display = 'flex';
};

// ... (Keep your +/- button logic the same) ...
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

// ACTION: RESTOCK (Add)
document.getElementById('btnActionAdd').onclick = () => {
  if (adjustIndex === null) return;
  
  const item = inventory[adjustIndex];
  
  // 1. Update Inventory
  item.quantity += adjustAmount;

  // 2. Log to Reports
  logTransaction(item, "RESTOCK", adjustAmount);

  finalizeAdjustment();
};

// ACTION: GET (Remove)
document.getElementById('btnActionRemove').onclick = () => {
  if (adjustIndex === null) return;

  const item = inventory[adjustIndex];
  const currentQty = item.quantity;

  if (adjustAmount >= currentQty) {
    const confirmDelete = confirm(`This will remove "${item.name}" completely. Proceed?`);
    if(confirmDelete) {
      // Log the final removal before deleting
      logTransaction(item, "GET/SOLD", currentQty); 
      
      inventory.splice(adjustIndex, 1);
    } else {
      return; 
    }
  } else {
    // Decrease Inventory
    item.quantity -= adjustAmount;
    
    // Log to Reports
    logTransaction(item, "SOLD", adjustAmount);
  }

  finalizeAdjustment();
};

function finalizeAdjustment() {
  renderInventory();
  renderReports(); // Make sure this is called!
  renderDashboard();
  document.getElementById('adjustModal').style.display = 'none';
}

// 5. HELPER: SAVE AND CLOSE
function finalizeAdjustment() {
  renderInventory(); // Refresh Table
  renderDashboard(); // Refresh Charts/Alerts
  
  document.getElementById('adjustModal').style.display = 'none';
}

// Cancel Button
document.getElementById('btnAdjustCancel').onclick = () => {
  document.getElementById('adjustModal').style.display = 'none';
};

// =============================
// REPORTS RENDERING (Updated for History)
// =============================
function renderReports() {
  const tbody = document.querySelector('#reportsTable tbody');
  
  // Update Header to include "Type" if you haven't already in HTML
  // (Ideally, add <th>Action</th> to your HTML <thead>)
  
  tbody.innerHTML = '';
  
  // We reverse() the array so the newest actions appear at the top
  reports.slice().reverse().forEach(log => {
    const totalValue = log.quantity * log.unitPrice; // Calculate value of this specific transaction

    const row = document.createElement('tr');
    
    // Color code the action type
    let color = '#333';
    if(log.type === 'RESTOCK') color = '#2ecc71'; // Green
    if(log.type === 'GET/SOLD') color = '#e74c3c'; // Red
    if(log.type === 'NEW ITEM') color = '#3498db'; // Blue

    row.innerHTML = `
      <td>${log.name}</td>
      <td style="color:${color}; font-weight:bold;">${log.type}</td>
      <td>${log.quantity}</td>
      <td>${log.date}</td>
      <td>₱${totalValue.toFixed(2)}</td>
    `;
    tbody.appendChild(row);
  });
}

// =============================
// HELPER: LOG TRANSACTIONS
// =============================
function logTransaction(item, type, qtyChange) {
 
  const today = new Date().toISOString().split('T')[0];

  
  const unitPrice = item.prices.pcs; 

  const logEntry = {
    name: item.name,
    type: type,          // "NEW ITEM", "RESTOCK", or "GET/SOLD"
    quantity: qtyChange, // How many were moved
    date: today,
    unitPrice: unitPrice,
    prices: item.prices  // Keep full price ref just in case
  };

  reports.push(logEntry);
}

// =============================
// DASHBOARD (FIXED)
// =============================
let stockChart = null;
function renderDashboard() {
  document.getElementById('totalItems').textContent = inventory.length;

  // Total expenses = sum of all unit prices of saved items
  const totalExpenses = inventory.reduce((sum, item) => {
    return sum + item.prices.pcs + item.prices.box + item.prices.tub;
  }, 0);
  document.getElementById('totalExpenses').textContent = `₱${totalExpenses.toFixed(2)}`;

  // Low stock alerts
  const alertsList = document.getElementById('alertsList');
  alertsList.innerHTML = '';
  inventory.filter(x => x.quantity < 5).forEach(item => {
    const li = document.createElement('li');
    li.textContent = `${item.name} is low on stock`;
    alertsList.appendChild(li);
  });

  // Overview chart based on total price of saved items
  const ctx = document.getElementById('stockChart').getContext('2d');
  if(stockChart) stockChart.destroy();

  // 1. GENERATE COLORS BASED ON YOUR RULES
  const backgroundColors = inventory.map(item => {
    // RULE 1: Priority is Low Stock (< 5)
    if (item.quantity < 5) {
      return '#e74c3c'; // RED (Danger)
    }

    // RULE 2: Unit Colors
    switch (item.unit) {
      case 'pcs': return '#3498db'; // BLUE
      case 'box': return '#f1c40f'; // YELLOW
      case 'tub': return '#2ecc71'; // GREEN
      default:    return '#95a5a6'; // Grey (Fallback)
    }
  });

  // 2. CREATE CHART
  stockChart = new Chart(ctx, {
    type: 'bar',
    data: {
      // Add Unit to label so you know what it is (e.g., "Soap (box)")
      labels: inventory.map(x => `${x.name} (${x.unit})`), 
      datasets: [{
        label: 'Quantity',
        data: inventory.map(x => x.quantity),
        backgroundColor: backgroundColors, // <--- APPLY THE COLOR LOGIC HERE
        borderRadius: 4,
        maxBarThickness: 50
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { 
        legend: { display: false }, // Hide legend because colors vary per bar
        tooltip: {
          callbacks: {
            label: function(context) {
              return `Stock: ${context.raw}`;
            }
          }
        }
      },
      scales: { 
        y: { 
          beginAtZero: true,
          ticks: { stepSize: 1 } 
        } 
      }
    }
  });
}

// =============================
// PRINT & CSV
// =============================
document.getElementById('btnPrint').onclick = () => {
  const tableHTML = document.getElementById('reportsTable').outerHTML;
  const win = window.open('', '', 'width=800,height=600');
  win.document.write(`<html><head><style>table{width:100%;border-collapse:collapse;} th,td{border:1px solid #222;padding:8px;} th{background:#eee;}</style></head><body><h2>Reports</h2>${tableHTML}</body></html>`);
  win.document.close();
  win.print();
};

document.getElementById('btnExportCsv').onclick = () => {
  let csv = 'Product Name,Quantity,Date,Total Price\n';
  reports.forEach(x => {
    const totalPrice = x.prices.pcs + x.prices.box + x.prices.tub;
    csv += `${x.name},${x.quantity},${x.date},${totalPrice}\n`;
  });
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'reports.csv';
  a.click();
};

// =============================
// EVENT LISTENERS
// =============================
document.getElementById('btnAddItem').onclick = openAddItem;
document.getElementById('modalCancel').onclick = closeModal;

// =============================
// INITIAL SETUP
// =============================
setupNav();
// =============================
// BULK / RAPID ADJUSTMENT LOGIC
// =============================

// 1. Open the Modal
document.getElementById('btnOpenBulk').onclick = () => {
  renderBulkTable();
  document.getElementById('bulkModal').style.display = 'flex';
};

// 2. Close the Modal & Refresh Main Views
document.getElementById('btnBulkClose').onclick = () => {
  document.getElementById('bulkModal').style.display = 'none';
  renderInventory(); // Refresh main table to show changes
  renderDashboard(); // Update charts/totals
};

// 3. Render the Bulk Table
function renderBulkTable() {
  const tbody = document.querySelector('#bulkTable tbody');
  tbody.innerHTML = '';

  inventory.forEach((item, index) => {
    const tr = document.createElement('tr');
    
    // We create unique IDs for inputs based on the index (e.g., bulk-qty-0)
    tr.innerHTML = `
      <td style="font-weight:bold;">${item.name} <span style="font-size:0.8em; color:#666;">(${item.unit})</span></td>
      <td id="bulk-stock-${index}" style="font-size:1.1em; text-align:center;">${item.quantity}</td>
      <td>
        <div style="display:flex; justify-content:center; gap:5px;">
           <button class="btn" onclick="adjustBulkInput(${index}, -1)" style="padding:2px 8px;">-</button>
           <input id="bulk-qty-${index}" type="number" value="1" min="1" style="width:50px; text-align:center;">
           <button class="btn" onclick="adjustBulkInput(${index}, 1)" style="padding:2px 8px;">+</button>
        </div>
      </td>
      <td>
        <div style="display:flex; gap:5px; justify-content:center;">
          <button class="btn" style="background:#2ecc71; color:fff; padding:5px 10px;" onclick="processBulkAction(${index}, 'add')">Add</button>
          <button class="btn" style="background:#e74c3c; color:fff; padding:5px 10px;" onclick="processBulkAction(${index}, 'remove')">Sold</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 4. Helper: +/- Buttons inside the table
window.adjustBulkInput = (index, change) => {
  const input = document.getElementById(`bulk-qty-${index}`);
  let val = parseInt(input.value) || 0;
  val += change;
  if(val < 1) val = 1; // Prevent negative inputs
  input.value = val;
};

// 5. Process the Action (Add/Sold)
window.processBulkAction = (index, action) => {
  const item = inventory[index];
  const input = document.getElementById(`bulk-qty-${index}`);
  const amount = parseInt(input.value) || 0;

  if (amount <= 0) return;

  if (action === 'add') {
    // RESTOCK LOGIC
    item.quantity += amount;
    logTransaction(item, "RESTOCK", amount);
  } 
  else if (action === 'remove') {
    // SOLD LOGIC
    if (item.quantity < amount) {
      alert(`Not enough stock! You only have ${item.quantity}.`);
      return;
    }
    item.quantity -= amount;
    logTransaction(item, "SOLD", amount);
  }

  // Visual Feedback: Flash the row or update the number immediately
  document.getElementById(`bulk-stock-${index}`).textContent = item.quantity;
  
  // Optional: Reset input back to 1 after action
  input.value = 1; 
};