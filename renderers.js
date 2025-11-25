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
// SAVE ITEM
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
    // Edit item
    inventory[currentEditIndex] = item;
    reports[currentEditIndex] = item;
    currentEditIndex = null;
  } else {
    // New item
    inventory.push(item);
    reports.push(item);
  }

  closeModal();
  renderInventory();
  renderReports();
  renderDashboard();
};

// =============================
// INVENTORY RENDERING
// =============================
function renderInventory() {
  const tbody = document.querySelector('#inventoryTable tbody');
  tbody.innerHTML = '';
  inventory.forEach((item,i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.name}</td>
      <td>${item.quantity}</td>
      <td>${item.date}</td>
      <td>PCS: ₱${item.prices.pcs}<br>BOX: ₱${item.prices.box}<br>TUB: ₱${item.prices.tub}</td>
      <td>
        <button class="btn" onclick="editItem(${i})">Edit</button>
        <button class="btn" onclick="getItem(${i})">GET</button>
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

window.getItem = (i) => {
  if(confirm('Mark this item as GET?')) {
    inventory.splice(i,1);
    renderInventory();
    renderDashboard();
    // Do NOT remove from reports, only inventory changes
  }
};

// =============================
// REPORTS RENDERING
// =============================
function renderReports() {
  const tbody = document.querySelector('#reportsTable tbody');
  tbody.innerHTML = '';
  reports.forEach(item => {
    const minPrice = Math.min(item.prices.pcs,item.prices.box,item.prices.tub);
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${item.name}</td>
      <td>${item.quantity}</td>
      <td>${item.date}</td>
      <td>PCS: ₱${item.prices.pcs}, BOX: ₱${item.prices.box}, TUB: ₱${item.prices.tub}</td>
      <td>₱${minPrice.toFixed(2)}</td>
    `;
    tbody.appendChild(row);
  });
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
  stockChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: inventory.map(x => x.name),
      datasets: [{
        label: 'Total Price per Item',
        data: inventory.map(x => x.prices.pcs + x.prices.box + x.prices.tub),
        backgroundColor: 'rgba(75, 192, 192, 0.5)'
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
      scales: { y: { beginAtZero: true } }
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
