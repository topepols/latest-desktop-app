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
  serverTimestamp,
  writeBatch, 
  increment 
} from "firebase/firestore";

// =============================
// STATE
// =============================
let inventory = [];
let reports = [];
let requests = []; 
let accountsData = []; 
let auditLogs = []; 
let currentEditId = null; 
let currentPassId = null;
let currentUser = null;
let currentRequestFilter = 'ALL';
let currentPage = 1;
const itemsPerPage = 10;

// =============================
// HELPERS
// =============================
const formatCurrency = (amount) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);

const toBase64 = file => new Promise((resolve, reject) => {
    if (file.size > 500 * 1024) {
        reject(new Error("Image too large. Please upload under 500KB."));
        return;
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

const getTimestampMs = (obj) => {
    if (!obj) return 0;
    if (obj.seconds) return obj.seconds * 1000;
    return new Date(obj).getTime();
};

// --- AUDIT LOGGER ---
const logAudit = async (action, details) => {
    try {
        await addDoc(collection(db, "audit_logs"), {
            actor: currentUser || "Unknown",
            action: action,
            details: details,
            timestamp: serverTimestamp()
        });
    } catch (e) { console.error("Audit Error:", e); }
};

// =============================
// FIRESTORE LISTENERS
// =============================
function initListeners() {
  onSnapshot(query(collection(db, "inventory"), orderBy("name")), (snap) => {
    inventory = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderInventory();
    renderDashboard(); 
  });

  onSnapshot(query(collection(db, "reports"), orderBy("timestamp", "desc")), (snap) => {
    reports = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderReports();
  });

  onSnapshot(query(collection(db, "requests"), orderBy("timestamp", "desc")), (snap) => {
    requests = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderRequests(); 
    updateRequestBadge(); 
    renderDashboard(); 
  });

  onSnapshot(query(collection(db, "accounts"), orderBy("name")), (snap) => {
    accountsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderAccounts();
  });

  onSnapshot(query(collection(db, "audit_logs"), orderBy("timestamp", "desc")), (snap) => {
    auditLogs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderAuditLogs();
  });
}

initListeners();

// =============================
// LOGIN & NAV
// =============================
const adminAccounts = { admin: 'admin123', manager: 'manager123' };

window.handleLogin = () => {
  const u = document.getElementById('loginUsername').value;
  const p = document.getElementById('loginPassword').value;
  
  if (adminAccounts[u] && adminAccounts[u] === p) {
    currentUser = u;
    document.getElementById('currentUserLabel').textContent = u;
    document.getElementById('appSidebar').style.display = 'block'; 
    switchView('dashboard');
    // setupNav(); // Logic moved below to run globally
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
    
    logAudit("LOGIN", `User ${u} logged in.`);
  } else {
    document.getElementById('loginError').textContent = 'Invalid credentials';
  }
};
document.getElementById('btnLogin').onclick = window.handleLogin;

// --- FIXED NAV LOGIC (Runs Immediately) ---
document.querySelectorAll('.nav-item').forEach(item => {
  item.onclick = () => {
    if(item.id === 'logoutBtn') { window.location.reload(); return; }
    const view = item.getAttribute('data-view');
    if (view) switchView(view);
  };
});

const toggleBtn = document.getElementById('btnToggleSidebar');
if(toggleBtn) {
    toggleBtn.onclick = () => {
      const sidebar = document.getElementById('appSidebar');
      const main = document.querySelector('.main');
      if(sidebar) sidebar.classList.toggle('active');
      if(main) main.classList.toggle('sidebar-active');
    };
}

function switchView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
  const target = document.getElementById(`view-${view}`);
  if(target) target.classList.add('active-view');
  
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  const activeItem = document.querySelector(`.nav-item[data-view="${view}"]`);
  if(activeItem) activeItem.classList.add('active');

  if(view === 'dashboard') renderDashboard();
  if(view === 'inventory') renderInventory();
  if(view === 'requests') renderRequests(); 
  if(view === 'reports') renderReports();
  if(view === 'accounts') renderAccounts();
  if(view === 'audit') renderAuditLogs();
}

// =============================
// ACCOUNTS MANAGEMENT
// =============================
function renderAccounts() {
    const tbody = document.querySelector('#accountsTable tbody');
    if(!tbody) return;
    tbody.innerHTML = '';

    accountsData.forEach(acc => {
        const tr = document.createElement('tr');
        
        let avatarHtml = `<div style="width:40px; height:40px; border-radius:50%; background:#bdc3c7; display:flex; align-items:center; justify-content:center; color:white; font-weight:bold;">${acc.name.charAt(0).toUpperCase()}</div>`;
        if(acc.imageUri) {
            avatarHtml = `<img src="${acc.imageUri}" class="avatar-circle" style="width:40px; height:40px; border-radius:50%; object-fit:cover;">`;
        }

        const roleColor = acc.role === 'owner' ? 'role-owner' : (acc.role === 'manager' ? 'role-manager' : 'role-employee');

        tr.innerHTML = `
            <td>${avatarHtml}</td>
            <td style="font-weight:bold;">${acc.name}</td>
            <td>@${acc.username}</td>
            <td>${acc.position || '-'}</td>
            <td><span class="role-badge ${roleColor}" style="padding:4px 8px; border-radius:4px; color:white; font-size:0.8em; background:${acc.role==='owner'?'#8e44ad':acc.role==='manager'?'#2980b9':'#27ae60'}">${acc.role.toUpperCase()}</span></td>
            <td>
                <div style="display:flex; gap:5px;">
                    <button class="btn" style="background:#f39c12; color:white; padding:5px 10px; font-size:0.8em;" 
                        onclick="window.openChangePassword('${acc.id}', '${acc.name}')">
                        🔑 Pass
                    </button>
                    <button class="btn" style="background:#e74c3c; color:white; padding:5px 10px; font-size:0.8em;" 
                        onclick="window.deleteAccount('${acc.id}', '${acc.name}')">
                        Delete
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.openChangePassword = (id, name) => {
    currentPassId = id;
    document.getElementById('passAccountName').textContent = name;
    document.getElementById('newPasswordInput').value = '';
    document.getElementById('changePassModal').style.display = 'flex';
};

document.getElementById('btnConfirmChangePass').onclick = async () => {
    const newPass = document.getElementById('newPasswordInput').value;
    if(!newPass || newPass.length < 4) { alert("Password too short."); return; }
    try {
        await updateDoc(doc(db, "accounts", currentPassId), { password: newPass });
        logAudit("CHANGE_PASS", `Updated password for user ID: ${currentPassId}`);
        alert("Password updated!");
        document.getElementById('changePassModal').style.display = 'none';
    } catch(e) { console.error(e); alert("Error updating password."); }
};

document.getElementById('btnOpenAddAccount').onclick = () => {
    document.getElementById('accName').value = '';
    document.getElementById('accUsername').value = '';
    document.getElementById('accPosition').value = '';
    document.getElementById('accPassword').value = '';
    document.getElementById('accRole').value = 'employee';
    document.getElementById('accImageInput').value = '';
    document.getElementById('accImagePreview').style.display = 'none';
    document.getElementById('accNoImage').style.display = 'block';
    document.getElementById('accountModal').style.display = 'flex';
};

document.getElementById('btnCancelAccount').onclick = () => { document.getElementById('accountModal').style.display = 'none'; };

document.getElementById('accImageInput').onchange = async (e) => {
    const file = e.target.files[0];
    if(file) {
        try {
            const base64 = await toBase64(file);
            const img = document.getElementById('accImagePreview');
            img.src = base64; img.style.display = 'block';
            document.getElementById('accNoImage').style.display = 'none';
        } catch(err) { alert(err.message); e.target.value = ''; }
    }
};

document.getElementById('btnSaveAccount').onclick = async () => {
    const name = document.getElementById('accName').value.trim();
    const username = document.getElementById('accUsername').value.trim();
    const position = document.getElementById('accPosition').value.trim();
    const password = document.getElementById('accPassword').value.trim();
    const role = document.getElementById('accRole').value;
    const fileInput = document.getElementById('accImageInput');

    if(!name || !username || !password) { alert("Fields required."); return; }
    if(accountsData.some(a => a.username === username)) { alert("Username taken."); return; }

    let imageUri = "";
    if(fileInput.files[0]) {
        try { imageUri = await toBase64(fileInput.files[0]); } catch(e) { alert("Image error."); return; }
    }

    try {
        await addDoc(collection(db, "accounts"), {
            name, username, position, password, role, imageUri, createdAt: serverTimestamp()
        });
        logAudit("CREATE_ACCOUNT", `Created ${role}: ${username}`);
        alert("Account Created!");
        document.getElementById('accountModal').style.display = 'none';
    } catch(e) { console.error(e); alert("Error creating account."); }
};

window.deleteAccount = async (id, name) => {
    if(confirm("Delete this account?")) {
        try { 
            await deleteDoc(doc(db, "accounts", id)); 
            logAudit("DELETE_ACCOUNT", `Deleted user: ${name}`);
        } catch(e) { alert("Error deleting."); }
    }
};

// =============================
// AUDIT LOGS
// =============================
function renderAuditLogs() {
    const tbody = document.querySelector('#auditTable tbody');
    if(!tbody) return;
    tbody.innerHTML = '';

    const searchTerm = document.getElementById('auditSearch') ? document.getElementById('auditSearch').value.toLowerCase() : '';
    const filtered = auditLogs.filter(log => 
        log.action.toLowerCase().includes(searchTerm) || 
        log.details.toLowerCase().includes(searchTerm) ||
        log.actor.toLowerCase().includes(searchTerm)
    );

    filtered.forEach(log => {
        const tr = document.createElement('tr');
        const timeStr = log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleString() : 'N/A';
        let actionColor = '#333';
        if(log.action.includes('DELETE')) actionColor = '#e74c3c';
        if(log.action.includes('CREATE')) actionColor = '#27ae60';
        
        tr.innerHTML = `
            <td style="font-size:0.9em; color:#7f8c8d;">${timeStr}</td>
            <td style="font-weight:bold;">${log.actor}</td>
            <td style="color:${actionColor}; font-weight:bold;">${log.action}</td>
            <td>${log.details}</td>
        `;
        tbody.appendChild(tr);
    });
}

if(document.getElementById('auditSearch')) {
    document.getElementById('auditSearch').addEventListener('input', renderAuditLogs);
}

if(document.getElementById('btnExportAudit')) {
    document.getElementById('btnExportAudit').onclick = () => {
        let csv = 'Time,Actor,Action,Details\n';
        auditLogs.forEach(x => {
            const time = x.timestamp ? new Date(x.timestamp.seconds * 1000).toLocaleString() : '';
            csv += `${time},${x.actor},${x.action},"${x.details.replace(/"/g, '""')}"\n`;
        });
        const blob = new Blob([csv], {type:'text/csv'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `AuditLog.csv`;
        a.click();
    };
}

// =============================
// INVENTORY LOGIC (FIXED)
// =============================
function openAddItem() {
  currentEditId = null;
  document.getElementById('modalTitle').textContent = 'Add Item';
  if(document.getElementById('btnDeleteItem')) document.getElementById('btnDeleteItem').style.display = 'none';
  
  ['mName', 'mCategory', 'mQuantity', 'mPricePCS', 'mPriceBOX', 'mPriceTUB', 'mDescription'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.value = '';
  });
  
  if(document.getElementById('mType')) document.getElementById('mType').value = 'CONSUMABLE';

  document.getElementById('mImageFile').value = '';
  const preview = document.getElementById('mImagePreview');
  preview.classList.remove('show');
  preview.src = '';
  document.getElementById('mUnit').value = 'pcs'; 
  document.getElementById('qrContainer').innerHTML = '';
  document.getElementById('modal').style.display = 'flex';
}

function closeModal() { document.getElementById('modal').style.display = 'none'; }
window.openAddItem = openAddItem;
window.closeModal = closeModal;

window.viewItem = (id) => {
    const item = inventory.find(x => x.id === id);
    if(!item) return;
    document.getElementById('viewItemTitle').textContent = item.name;
    document.getElementById('viewItemDesc').textContent = item.description || "No description provided.";
    const img = document.getElementById('viewItemImage');
    const noImg = document.getElementById('viewItemNoImage');
    if (item.imageUrl) {
        img.src = item.imageUrl; img.style.display = 'block'; noImg.style.display = 'none';
    } else {
        img.style.display = 'none'; noImg.style.display = 'block';
    }
    document.getElementById('viewItemModal').style.display = 'flex';
};

window.editItem = (id) => {
  const item = inventory.find(x => x.id === id);
  if(!item) return;
  currentEditId = id;
  document.getElementById('modalTitle').textContent = 'Edit Item';
  document.getElementById('btnDeleteItem').style.display = 'block';

  document.getElementById('mName').value = item.name;
  document.getElementById('mCategory').value = item.category || '';
  if(document.getElementById('mType')) document.getElementById('mType').value = item.type || 'CONSUMABLE';
  
  document.getElementById('mQuantity').value = item.quantity;
  document.getElementById('mDescription').value = item.description || '';
  
  const preview = document.getElementById('mImagePreview');
  if(item.imageUrl) { preview.src = item.imageUrl; preview.classList.add('show'); } 
  else { preview.classList.remove('show'); preview.src = ''; }
  
  document.getElementById('mUnit').value = item.unit; 
  document.getElementById('mPricePCS').value = item.prices.pcs;
  document.getElementById('mPriceBOX').value = item.prices.box;
  document.getElementById('mPriceTUB').value = item.prices.tub;
  
  document.getElementById('modal').style.display = 'flex';
};

document.getElementById('btnSaveItem').onclick = async () => {
  const name = document.getElementById('mName').value;
  const type = document.getElementById('mType') ? document.getElementById('mType').value : 'CONSUMABLE';
  const category = document.getElementById('mCategory').value; 
  const quantity = parseInt(document.getElementById('mQuantity').value) || 0;
  
  const unit = document.getElementById('mUnit').value; 
  const description = document.getElementById('mDescription').value;
  const imageFile = document.getElementById('mImageFile').files[0];
  const prices = {
    pcs: parseFloat(document.getElementById('mPricePCS').value) || 0,
    box: parseFloat(document.getElementById('mPriceBOX').value) || 0,
    tub: parseFloat(document.getElementById('mPriceTUB').value) || 0
  };

  if (!name) { alert('Name is required.'); return; }

  let imageUrl = null;
  if (imageFile) { try { imageUrl = await toBase64(imageFile); } catch(e) { alert(e.message); return; } }

  const itemData = { 
      name, 
      type: type, 
      category, quantity, unit, prices, description, 
      date: new Date().toISOString().split('T')[0] // AUTO DATE
  };
  
  if (imageUrl) itemData.imageUrl = imageUrl;
  else if (currentEditId) {
      const existing = inventory.find(i => i.id === currentEditId);
      if(existing && existing.imageUrl) itemData.imageUrl = existing.imageUrl;
  }

  try {
    if (currentEditId) {
        await updateDoc(doc(db, "inventory", currentEditId), itemData);
        logAudit("UPDATE ITEM", `Updated item: ${name} (${type})`);
    } else { 
        await addDoc(collection(db, "inventory"), itemData); 
        await addDoc(collection(db, "reports"), {
            name: itemData.name, type: "NEW ITEM", quantity: itemData.quantity,
            date: new Date().toISOString().split('T')[0], unitPrice: 0, prices: itemData.prices,
            timestamp: serverTimestamp()
        });
        logAudit("CREATE ITEM", `Created item: ${name} (${type})`);
    }
    closeModal();
  } catch (e) { console.error(e); alert("Error saving item: " + e.message); }
};

document.getElementById('sortInventory').addEventListener('change', renderInventory);
function renderInventory() {
  const tbody = document.querySelector('#inventoryTable tbody');
  tbody.innerHTML = '';
  const searchTerm = document.getElementById('inventorySearch').value.toLowerCase();
  const sortMode = document.getElementById('sortInventory').value;
  
  let filtered = inventory.filter(item => item.name.toLowerCase().includes(searchTerm));
  
  filtered.sort((a, b) => {
    if (sortMode === 'type') return (b.type || '').localeCompare(a.type || '');
    if (sortMode === 'alpha') return a.name.localeCompare(b.name);
    if (sortMode === 'qtyLow') return a.quantity - b.quantity;
    if (sortMode === 'qtyHigh') return b.quantity - a.quantity;
    if (sortMode === 'dateNew') return new Date(b.date) - new Date(a.date);
    return 0;
  });

  filtered.forEach((item) => {
    const tr = document.createElement('tr');
    
    let typeBadge = `<span style="background:#95a5a6; color:white; padding:2px 6px; border-radius:4px; font-size:0.8em; font-weight:bold;">?</span>`;
    if (item.type === 'EQUIPMENT') typeBadge = `<span style="background:#e67e22; color:white; padding:2px 6px; border-radius:4px; font-size:0.8em; font-weight:bold;">🔧 EQUIP</span>`;
    if (item.type === 'CONSUMABLE') typeBadge = `<span style="background:#3498db; color:white; padding:2px 6px; border-radius:4px; font-size:0.8em; font-weight:bold;">🔩 CONSUM</span>`;

    const unitKey = (item.unit || 'pcs').toLowerCase(); 
    const unitPrice = item.prices ? (item.prices[unitKey] || 0) : 0;

    tr.innerHTML = `
      <td>${typeBadge}</td>
      <td style="font-weight:bold; color:#2c3e50;">${item.name}</td>
      <td>${item.category || '-'}</td>
      <td style="font-size:1.1em;">${item.quantity} <small style="color:#7f8c8d;">${item.unit}</small></td>
      <td><small style="font-weight:bold; color:#27ae60;">${item.unit.toUpperCase()}: ${formatCurrency(unitPrice)}</small></td>
      <td>
        <div style="display: flex; gap: 5px;">
            <button class="btn" style="background:#34495e; color:white; padding: 5px 10px;" onclick="window.viewItem('${item.id}')">👁️</button>
            <button class="btn" onclick="window.editItem('${item.id}')">Edit</button>
            <button class="btn" style="background:#2ecc71; color:white;" onclick="window.openAdjust('${item.id}')">Adj</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}
document.getElementById('inventorySearch').addEventListener('input', renderInventory);

// Adjust Modal
let adjustId = null; let adjustAmount = 1;
window.openAdjust = (id) => {
  const item = inventory.find(x => x.id === id); if(!item) return;
  adjustId = id; adjustAmount = 1;
  document.getElementById('adjustName').textContent = item.name;
  document.getElementById('adjustCurrentStock').textContent = item.quantity;
  document.getElementById('adjustInput').value = adjustAmount;
  document.getElementById('adjustModal').style.display = 'flex';
};
document.getElementById('btnAdjPlus').onclick = () => { adjustAmount++; document.getElementById('adjustInput').value = adjustAmount; };
document.getElementById('btnAdjMinus').onclick = () => { if (adjustAmount > 1) adjustAmount--; document.getElementById('adjustInput').value = adjustAmount; };

document.getElementById('btnActionAdd').onclick = async () => {
  if (!adjustId) return;
  const item = inventory.find(x => x.id === adjustId);
  await updateDoc(doc(db, "inventory", adjustId), { quantity: increment(adjustAmount) });
  await addDoc(collection(db, "reports"), {
    name: item.name, type: "RESTOCK", quantity: adjustAmount,
    date: new Date().toISOString().split('T')[0], unitPrice: item.prices[item.unit] || 0, prices: item.prices,
    timestamp: serverTimestamp()
  });
  logAudit("RESTOCK", `Added ${adjustAmount} to ${item.name}`);
  document.getElementById('adjustModal').style.display = 'none';
};
document.getElementById('btnActionRemove').onclick = async () => {
  if (!adjustId) return;
  const item = inventory.find(x => x.id === adjustId);
  await updateDoc(doc(db, "inventory", adjustId), { quantity: increment(-adjustAmount) });
  await addDoc(collection(db, "reports"), {
    name: item.name, type: "SOLD", quantity: adjustAmount,
    date: new Date().toISOString().split('T')[0], unitPrice: item.prices[item.unit] || 0, prices: item.prices,
    timestamp: serverTimestamp()
  });
  logAudit("REMOVE", `Removed ${adjustAmount} from ${item.name}`);
  document.getElementById('adjustModal').style.display = 'none';
};
document.getElementById('btnAdjustCancel').onclick = () => { document.getElementById('adjustModal').style.display = 'none'; };

// Bulk Action
document.getElementById('btnOpenBulk').onclick = () => {
  document.querySelector('#bulkTable tbody').innerHTML = ''; 
  renderBulkTable(); document.getElementById('bulkModal').style.display = 'flex';
};
document.getElementById('btnBulkClose').onclick = () => { document.getElementById('bulkModal').style.display = 'none'; };

function renderBulkTable() {
  const tbody = document.querySelector('#bulkTable tbody');
  const existingInputs = tbody.querySelectorAll('input[type="number"]');
  const currentValues = {}; existingInputs.forEach(input => currentValues[input.id] = input.value);
  
  tbody.innerHTML = '';
  inventory.forEach((item) => {
    const tr = document.createElement('tr');
    const inputId = `bulk-qty-${item.id}`;
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
  let val = parseInt(input.value) || 0; val += change; if(val < 1) val = 1; input.value = val;
};
window.processBulkAction = async (id, action) => {
  const item = inventory.find(x => x.id === id); const input = document.getElementById(`bulk-qty-${id}`);
  const amount = parseInt(input.value) || 0; if (amount <= 0) return;
  const ref = doc(db, "inventory", id);
  
  if (action === 'add') { 
      await updateDoc(ref, { quantity: increment(amount) }); 
      await addDoc(collection(db, "reports"), {
        name: item.name, type: "RESTOCK", quantity: amount,
        date: new Date().toISOString().split('T')[0], unitPrice: item.prices[item.unit] || 0, prices: item.prices,
        timestamp: serverTimestamp()
      });
      logAudit("BULK_RESTOCK", `Added ${amount} to ${item.name}`);
  } else { 
      await updateDoc(ref, { quantity: increment(-amount) }); 
      await addDoc(collection(db, "reports"), {
        name: item.name, type: "SOLD", quantity: amount,
        date: new Date().toISOString().split('T')[0], unitPrice: item.prices[item.unit] || 0, prices: item.prices,
        timestamp: serverTimestamp()
      });
      logAudit("BULK_REMOVE", `Removed ${amount} from ${item.name}`);
  }
};

document.getElementById('btnAddItem').onclick = openAddItem;
document.getElementById('modalCancel').onclick = closeModal;

if(document.getElementById('sortReports')) {
    document.getElementById('sortReports').addEventListener('change', renderReports);
}

function renderReports() {
  const tbody = document.querySelector('#reportsTable tbody');
  if(!tbody) return;
  tbody.innerHTML = '';
  
  let sortedReports = [...reports];
  const sortMode = document.getElementById('sortReports') ? document.getElementById('sortReports').value : 'dateNew';

  sortedReports.sort((a, b) => {
    const timeA = getTimestampMs(a.timestamp || a.date);
    const timeB = getTimestampMs(b.timestamp || b.date);
    return sortMode === 'dateNew' ? timeB - timeA : timeA - timeB;
  });
  
  sortedReports.forEach(log => {
    const totalValue = (log.quantity || 0) * (log.unitPrice || 0);
    let color = '#333';
    if(log.type === 'RESTOCK') color = '#2ecc71';
    if(log.type === 'SOLD') color = '#e74c3c';
    if(log.type === 'NEW ITEM') color = '#3498db';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${log.name}</td>
      <td style="color:${color}; font-weight:bold;">${log.type}</td>
      <td>${log.quantity}</td>
      <td>${log.date}</td>
      <td>${formatCurrency(totalValue)}</td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById('btnPrint').onclick = () => { window.print(); };

document.getElementById('btnExportCsv').onclick = () => {
  let csv = 'Product Name,Action,Quantity,Date,Value\n';
  reports.forEach(x => {
    const val = (x.quantity || 0) * (x.unitPrice || 0);
    const cleanName = `"${x.name.replace(/"/g, '""')}"`;
    csv += `${cleanName},${x.type},${x.quantity},${x.date},${val.toFixed(2)}\n`;
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
    try {
      const item = inventory.find(i => i.id === currentEditId);
      await deleteDoc(doc(db, "inventory", currentEditId));
      logAudit("DELETE_ITEM", `Deleted item: ${item ? item.name : currentEditId}`);
      closeModal();
    } catch (e) {
      console.error("Error deleting document: ", e);
      alert("Error deleting item.");
    }
  }
};

// =============================
// NEW: MISSING RENDER FUNCTION ADDED
// =============================
function renderFlatRequestList(tbody, items) {
    items.forEach(req => {
        const tr = document.createElement('tr');
        let color = '#f39c12';
        if(req.status === 'APPROVED') color = '#27ae60';
        if(req.status === 'DECLINED') color = '#c0392b';
        if(req.status === 'RETURNED') color = '#3498db'; // Added RETURNED Color
        
        const dateStr = req.timestamp ? new Date(req.timestamp.seconds * 1000).toLocaleDateString() : 'Syncing...';

        tr.innerHTML = `
          <td><strong>${req.itemName}</strong> <br><small style="color:#777;">${req.type || ''}</small></td>
          <td>${req.requestorName}</td>
          <td>${req.quantity} ${req.unit}</td>
          <td>${dateStr}</td>
          <td><span style="color:${color}; font-weight:bold;">${req.status}</span></td>
          <td>-</td>
        `;
        tbody.appendChild(tr);
    });
}

// =============================
// DASHBOARD (UPDATED)
// =============================
function renderDashboard() {
  document.getElementById('totalItems').textContent = inventory.length;
  const pendingCount = requests.filter(r => r.status === 'PENDING').length;
  document.getElementById('totalPending').textContent = pendingCount;
  document.getElementById('totalPending').style.color = pendingCount > 0 ? '#e74c3c' : '#2c3e50';

  const alertsList = document.getElementById('alertsList');
  alertsList.innerHTML = '';

  const lowStockItems = inventory.filter(item => {
      // --- NEW CHANGE: Ignore EQUIPMENT ---
      if (item.type === 'EQUIPMENT') return false; 

      // Existing Logic for Consumables
      const qty = item.quantity;
      const unit = item.unit ? item.unit.toLowerCase() : '';
      
      if (unit === 'tub' && qty <= 10) return true;
      if (unit === 'pcs' && qty <= 10) return true;
      if (unit === 'box' && qty <= 5) return true;
      
      return false; 
  });

  if (lowStockItems.length === 0) {
      alertsList.innerHTML = '<li style="color:#27ae60; border:none;">Everything looks good! No low stock.</li>';
  } else {
      lowStockItems.forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${item.name}</strong> is low <span style="background:#fee2e2; color:#b91c1c; padding:2px 6px; border-radius:4px;">${item.quantity} ${item.unit}</span>`;
        li.style.borderLeft = '4px solid #e74c3c';
        alertsList.appendChild(li);
      });
  }
  renderScrollableChart();
}

function renderScrollableChart() {
  const container = document.getElementById('scrollableChart');
  if (!container) return;
  container.innerHTML = '';
  if (!inventory || inventory.length === 0) {
    container.innerHTML = '<p class="muted" style="text-align:center; padding-top:20px;">No items in stock.</p>';
    return;
  }
  const sortedItems = [...inventory].sort((a, b) => b.quantity - a.quantity);
  const maxQty = Math.max(...sortedItems.map(item => item.quantity)) || 100;

  let html = '';
  sortedItems.forEach(item => {
    const widthPercent = (item.quantity / maxQty) * 100;
    const u = item.unit ? item.unit.toLowerCase() : '';
    let isLow = false;
    if (u === 'tub' && item.quantity <= 10) isLow = true;
    else if (u === 'pcs' && item.quantity <= 10) isLow = true;
    else if (u === 'box' && item.quantity <= 5) isLow = true;
    const barColor = isLow ? '#e74c3c' : '#7cb5ec';

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

// =============================
// REQUESTS MANAGEMENT
// =============================
window.setRequestFilter = (filter) => {
  currentRequestFilter = filter;
  currentPage = 1; 
  renderRequests();
};

window.changePage = (pageNum) => {
  currentPage = pageNum;
  renderRequests();
};

function updateRequestBadge() {
  const pendingCount = requests.filter(r => r.status === 'PENDING').length;
  const badge = document.getElementById('reqBadge');
  if(badge) {
    badge.textContent = pendingCount;
    if(pendingCount > 0) badge.classList.add('show');
    else badge.classList.remove('show');
  }
}

function renderRequests() {
  const tbody = document.querySelector('#requestsTable tbody');
  const paginationContainer = document.getElementById('pagination');
  if(!tbody) return;
  tbody.innerHTML = '';
  if(paginationContainer) paginationContainer.innerHTML = ''; 
  
  if (currentRequestFilter !== 'PENDING') {
    const filtered = requests.filter(req => {
        if (currentRequestFilter === 'ALL') return true;
        return req.status === currentRequestFilter;
    });

    if(filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">No records found.</td></tr>';
        return;
    }

    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const paginatedItems = filtered.slice(start, end);
    const totalPages = Math.ceil(filtered.length / itemsPerPage);

    renderFlatRequestList(tbody, paginatedItems);
    if(paginationContainer) renderPagination(totalPages);
    return;
  }

  const pendingRequests = requests.filter(r => r.status === 'PENDING');
  
  if(pendingRequests.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">No pending requests.</td></tr>';
    return;
  }

  const grouped = {};
  pendingRequests.forEach(req => {
    const user = req.requestorUsername || 'Unknown';
    if(!grouped[user]) {
        grouped[user] = {
            name: req.requestorName,
            username: req.requestorUsername,
            items: []
        };
    }
    grouped[user].items.push(req);
  });

  const allGroups = Object.values(grouped);
  const start = (currentPage - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const paginatedGroups = allGroups.slice(start, end);
  const totalPages = Math.ceil(allGroups.length / itemsPerPage);

  renderGroupedRequests(tbody, paginatedGroups);
  if(paginationContainer) renderPagination(totalPages);
}

function renderPagination(totalPages) {
    const container = document.getElementById('pagination');
    if(!container || totalPages <= 1) return;

    if(currentPage > 1) {
        container.innerHTML += `<button class="page-btn" onclick="window.changePage(${currentPage - 1})">«</button>`;
    }
    for(let i = 1; i <= totalPages; i++) {
        const activeClass = i === currentPage ? 'active' : '';
        container.innerHTML += `<button class="page-btn ${activeClass}" onclick="window.changePage(${i})">${i}</button>`;
    }
    if(currentPage < totalPages) {
        container.innerHTML += `<button class="page-btn" onclick="window.changePage(${currentPage + 1})">»</button>`;
    }
}

function renderGroupedRequests(tbody, groups) {
  groups.forEach(group => {
    const headerRow = document.createElement('tr');
    headerRow.style.background = '#f0f9ff';
    headerRow.style.borderTop = '2px solid #cbd5e1';
    
    headerRow.innerHTML = `
        <td colspan="4" style="padding: 15px;">
            <div style="font-size:1.1em;">
                <strong>👤 ${group.name}</strong> <span style="color:#64748b; font-size:0.9em;">(@${group.username})</span>
                <span style="background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:10px; font-size:0.8em; margin-left:10px;">
                    ${group.items.length} Items Requested
                </span>
            </div>
        </td>
        <td colspan="2" style="text-align:right; padding: 15px;">
            <button class="btn" style="background:#27ae60; color:white; font-weight:bold; margin-right:10px;" 
                onclick="window.processGroupAction('${group.username}', 'APPROVE')">
                ✔ Approve All
            </button>
            <button class="btn" style="background:#c0392b; color:white; font-weight:bold;" 
                onclick="window.processGroupAction('${group.username}', 'DECLINE')">
                ✖ Decline All
            </button>
        </td>
    `;
    tbody.appendChild(headerRow);

    group.items.forEach(req => {
        const tr = document.createElement('tr');
        const dateStr = req.timestamp ? new Date(req.timestamp.seconds * 1000).toLocaleString() : 'Just now';
        
        const stockItem = inventory.find(i => i.id === req.itemId);
        let stockWarning = '';
        if(stockItem && stockItem.quantity < req.quantity) {
            stockWarning = `<span style="color:red; font-weight:bold; font-size:0.8em;">⚠️ Low Stock (Only ${stockItem.quantity})</span>`;
        } else if (!stockItem) {
            stockWarning = `<span style="color:red; font-weight:bold; font-size:0.8em;">⚠️ Item Deleted</span>`;
        }

        tr.innerHTML = `
            <td style="padding-left: 40px; border-left: 4px solid #cbd5e1;">${req.itemName} <br>${stockWarning}</td>
            <td>—</td>
            <td style="font-weight:bold;">${req.quantity} ${req.unit}</td>
            <td><small>${dateStr}</small></td>
            <td><span style="color:#f39c12; font-weight:bold;">PENDING</span></td>
            <td>
                <button class="btn" style="font-size:0.8em; padding:2px 5px; background:#95a5a6; color:white;" 
                   onclick="window.processRequest('${req.id}', 'DECLINE')">X</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
  });
}

// Batch Processing
window.processGroupAction = async (username, action) => {
    const pending = requests.filter(r => r.requestorUsername === username && r.status === 'PENDING');
    if (pending.length === 0) return;
    if (!confirm(`Are you sure you want to ${action} all ${pending.length} items for ${username}?`)) return;

    const batch = writeBatch(db);
    let hasOps = false;
    const reportPromises = [];

    for (const req of pending) {
        const reqRef = doc(db, "requests", req.id);

        if (action === 'DECLINE') {
            batch.update(reqRef, { status: "DECLINED" });
            hasOps = true;
        } 
        else if (action === 'APPROVE') {
            const item = inventory.find(i => i.id === req.itemId);
            if (item && item.quantity >= req.quantity) {
                const itemRef = doc(db, "inventory", req.itemId);
                batch.update(itemRef, { quantity: increment(-req.quantity) });
                batch.update(reqRef, { status: "APPROVED" });
                
                const reportData = {
                    name: req.itemName, type: "SOLD", quantity: req.quantity,
                    date: new Date().toISOString().split('T')[0],
                    unitPrice: item.prices?.[req.unit] || 0,
                    timestamp: serverTimestamp()
                };
                reportPromises.push(addDoc(collection(db, "reports"), reportData));
                hasOps = true;
            }
        }
    }

    if (!hasOps) {
        alert("No valid operations.");
        return;
    }

    try {
        await batch.commit();
        if(action === 'APPROVE') await Promise.all(reportPromises);
        logAudit("BATCH " + action, `Processed batch ${action} for ${username}`);
        alert(`Batch ${action} complete.`);
    } catch (e) {
        console.error("Batch Error", e);
        alert("Transaction failed.");
    }
};

window.processRequest = async (reqId, action, showAlert = true) => {
  const req = requests.find(r => r.id === reqId);
  if (!req) return;

  try {
      if (action === 'DECLINE') {
        await updateDoc(doc(db, "requests", reqId), { status: "DECLINED" });
        logAudit("DECLINE_REQ", `Declined request for ${req.itemName}`);
      } 
      else if (action === 'APPROVE') {
        const item = inventory.find(i => i.id === req.itemId);
        if (!item || item.quantity < req.quantity) {
            if(showAlert) alert(`Cannot approve ${req.itemName}: Not enough stock.`);
            return;
        }
        
        const batch = writeBatch(db);
        const itemRef = doc(db, "inventory", item.id);
        const reqRef = doc(db, "requests", reqId);

        batch.update(itemRef, { quantity: increment(-req.quantity) });
        batch.update(reqRef, { status: "APPROVED" });
        await batch.commit();

        await addDoc(collection(db, "reports"), {
          name: req.itemName, type: "SOLD", quantity: req.quantity,
          date: new Date().toISOString().split('T')[0],
          unitPrice: item.prices?.[req.unit] || 0,
          timestamp: serverTimestamp()
        });
        logAudit("APPROVE_REQ", `Approved request for ${req.itemName} by ${req.requestorName}`);
      }
  } catch (e) {
      console.error(e);
      if(showAlert) alert("Error processing request.");
  }
};

// =============================
// PDF GENERATION (UNCHANGED)
// =============================
document.getElementById('btnReqPdf').onclick = () => {
    const dateInput = document.getElementById('reqReportDate').value;
    if (!dateInput) { alert("Please select a date first."); return; }
    if (!window.jspdf) { alert("Error: jsPDF library not found."); return; }

    const filtered = requests.filter(r => {
        if (!r.timestamp) return false;
        const dateObj = new Date(r.timestamp.seconds * 1000);
        return dateObj.toLocaleDateString('en-CA') === dateInput;
    });

    if (filtered.length === 0) { alert(`No requests found for ${dateInput}.`); return; }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        doc.setFontSize(18);
        doc.text(`Borrow Requests Report`, 14, 22);
        doc.setFontSize(11);
        doc.text(`Date: ${dateInput}`, 14, 30);
        doc.text(`Total Items: ${filtered.length}`, 14, 36);

        const tableColumn = ["Item Name", "Qty", "Unit", "Requested By", "Time", "Status"];
        const tableRows = [];

        filtered.forEach(req => {
            const timeStr = new Date(req.timestamp.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            tableRows.push([
                req.itemName,
                req.quantity,
                req.unit,
                req.requestorName,
                timeStr,
                req.status
            ]);
        });

        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 40,
            theme: 'grid',
            styles: { fontSize: 10 },
            headStyles: { fillColor: [15, 23, 42] } 
        });

        doc.save(`Requests_${dateInput}.pdf`);
        logAudit("EXPORT_PDF", `Exported requests report for ${dateInput}`);
    } catch (error) {
        console.error("PDF Error:", error);
        alert("An error occurred generating the PDF.");
    }
};