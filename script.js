// ==================== DATABASE SETUP ====================
let materials = [];
let selectedMaterial = null;
let scanBuffer = "";
let lastKeyTime = 0;
let html5QrcodeScanner = null;
let isScanning = false;
let activities = [];

// Initialize database
function initDatabase() {
    console.log('Initializing database...');
    
    // Load materials from localStorage
    let saved = localStorage.getItem('materials');
    if (saved) {
        try {
            materials = JSON.parse(saved);
            console.log('✅ Loaded', materials.length, 'materials from localStorage');
        } catch (e) {
            console.error('Error loading materials:', e);
            materials = [];
        }
    } else {
        materials = [];
        console.log('✅ Created new materials list');
    }
    
    // Load activities
    let savedActivities = localStorage.getItem('activities');
    if (savedActivities) {
        try {
            activities = JSON.parse(savedActivities);
        } catch (e) {
            activities = [];
        }
    } else {
        activities = [];
    }
    
    updateTable();
    updateStats();
    
    // Listen for changes from Firebase (other devices)
    if (typeof dbRef !== 'undefined') {
        dbRef.on('value', (snapshot) => {
            let remoteData = snapshot.val();
            if (remoteData && remoteData.length > 0) {
                // Only update if different from current
                if (JSON.stringify(remoteData) !== JSON.stringify(materials)) {
                    console.log('📡 Received updates from another device');
                    materials = remoteData;
                    localStorage.setItem('materials', JSON.stringify(materials));
                    updateTable();
                    updateStats();
                    
                    // If selected material exists, update it
                    if (selectedMaterial) {
                        let updated = materials.find(m => m.code === selectedMaterial.code);
                        if (updated) {
                            selectedMaterial = updated;
                            selectMaterial(updated.code);
                        }
                    }
                }
            }
        });
    }
}

// Save materials
function saveMaterials() {

    localStorage.setItem('materials', JSON.stringify(materials));
    
    if (typeof dbRef !== 'undefined' && navigator.onLine) {
        dbRef.set(materials).catch(err => {
            console.log('Firebase save failed - will retry later');
        });
    }
    
    updateStats();
    updateTable();
}

// Save activities
function saveActivities() {
    localStorage.setItem('activities', JSON.stringify(activities));
}

// ==================== CORE FUNCTIONS ====================

// Generate code from name
function generateCode(name, category) {
    let cat = category.substring(0, 2).toUpperCase();
    let words = name.split(' ');
    let codePart = '';
    
    if (words.length > 1) {
        codePart = words[0][0] + words[1].substring(0, 2);
    } else {
        codePart = name.substring(0, 3);
    }
    
    let numbers = name.match(/\d+/g);
    let numPart = numbers ? numbers[0] : '';
    
    let code = `${cat}-${codePart.toUpperCase()}${numPart}`;
    
    // Make sure code is unique
    let counter = 1;
    let originalCode = code;
    while (materials.some(m => m.code === code)) {
        code = `${originalCode}-${counter}`;
        counter++;
    }
    
    return code;
}

// Get stock status
function getStockStatus(stock) {
    if (stock <= 5) return 'Critical';
    if (stock <= 20) return 'Low';
    return 'OK';
}

// Update stats
function updateStats() {
    document.getElementById('totalItems').textContent = materials.length;
    document.getElementById('criticalCount').textContent = 
        materials.filter(m => m.stock <= 5).length;
    document.getElementById('lowCount').textContent = 
        materials.filter(m => m.stock > 5 && m.stock <= 20).length;
}

// Update table
function updateTable() {
    let filter = document.getElementById('categoryFilter').value;
    let filtered = filter === 'ALL' ? materials : materials.filter(m => m.category === filter);
    
    if (filtered.length === 0) {
        document.getElementById('tableBody').innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px; color: #666;">
                    📭 No materials found<br>
                    <small>Click "ADD NEW MATERIAL" to get started</small>
                </td>
            </tr>
        `;
        return;
    }
    
    let html = '';
    filtered.forEach(m => {
        let status = getStockStatus(m.stock);
        let statusClass = status === 'Critical' ? 'status-critical' : 
                         status === 'Low' ? 'status-low' : 'status-ok';
        
        html += `
            <tr>
                <td><strong>${m.code}</strong></td>
                <td>${m.name}</td>
                <td>${m.category}</td>
                <td>${m.stock}</td>
                <td>${m.unit}</td>
                <td><span class="status-badge ${statusClass}">${status}</span></td>
                <td>
                    <div class="action-buttons">
                        <button onclick="selectMaterial('${m.code}')" class="action-btn edit-btn">View</button>
                        <button onclick="printSingleBarcode('${m.code}', '${m.name}')" class="action-btn print-btn">🖨️</button>
                        <button onclick="deleteMaterial('${m.code}')" class="action-btn delete-btn">✗</button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    document.getElementById('tableBody').innerHTML = html;
}

// Filter materials
function filterMaterials() {
    updateTable();
}

// Search material
function searchMaterial(barcode) {
    let searchTerm = barcode || document.getElementById('searchInput').value.trim().toUpperCase();
    
    if (!searchTerm) return;
    
    let material = materials.find(m => m.code.toUpperCase() === searchTerm);
    
    if (material) {
        selectMaterial(material.code);
    } else {
        material = materials.find(m => m.name.toUpperCase().includes(searchTerm));
        if (material) {
            selectMaterial(material.code);
        } else {
            if (confirm(`Material not found: ${searchTerm}\n\nAdd as new material?`)) {
                document.getElementById('newName').value = searchTerm;
                showAddForm();
            }
        }
    }
}

// Select material
function selectMaterial(code) {
    let material = materials.find(m => m.code === code);
    if (!material) return;
    
    selectedMaterial = material;
    
    let status = getStockStatus(material.stock);
    let statusClass = status === 'Critical' ? 'status-critical' : 
                      status === 'Low' ? 'status-low' : 'status-ok';
    
    let html = `
        <h2>Selected: ${material.name} (${material.code})</h2>
        <div class="material-details">
            <div class="detail-item">
                <div class="detail-label">Current Stock</div>
                <div class="detail-value ${statusClass}">${material.stock} ${material.unit}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Category</div>
                <div class="detail-value">${material.category}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Status</div>
                <div class="detail-value ${statusClass}">${status}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Last Updated</div>
                <div class="detail-value">${new Date().toLocaleDateString()}</div>
            </div>
        </div>
        <div class="material-actions">
            <button onclick="showReceiveForm('${material.code}')" class="btn-receive">📦 Expand</button>
            <button onclick="showIssueForm('${material.code}')" class="btn-issue">✏️ Modify</button>
            <button onclick="showCountForm('${material.code}')" class="btn-count">📊 Count</button>
            <button onclick="printSingleBarcode('${material.code}', '${material.name}')" class="btn-print">🖨️ Print Label</button>
            <button onclick="deleteMaterial('${material.code}')" class="btn-delete">🗑️ Delete</button>
        </div>
    `;
    
    document.getElementById('selectedMaterialContent').innerHTML = html;
    document.getElementById('selectedMaterial').classList.remove('hidden');
}

// ==================== FORM HANDLING ====================

function hideAllForms() {
    document.getElementById('addForm').classList.add('hidden');
    document.getElementById('receiveForm').classList.add('hidden');
    document.getElementById('issueForm').classList.add('hidden');
    document.getElementById('countForm').classList.add('hidden');
}

function showAddForm() {
    hideAllForms();
    document.getElementById('addForm').classList.remove('hidden');
    document.getElementById('newName').focus();
}

function showReceiveForm(materialCode) {
    hideAllForms();
    let material = materials.find(m => m.code === materialCode);
    if (!material) return;
    
    document.getElementById('receiveMaterialInfo').innerHTML = 
        `<strong>${material.name}</strong> (${material.code})<br>Current Stock: ${material.stock} ${material.unit}`;
    document.getElementById('receiveForm').dataset.code = material.code;
    document.getElementById('receiveForm').classList.remove('hidden');
    document.getElementById('receiveQty').focus();
}

function showIssueForm(materialCode) {
    hideAllForms();
    let material = materials.find(m => m.code === materialCode);
    if (!material) return;
    
    document.getElementById('issueMaterialInfo').innerHTML = 
        `<strong>${material.name}</strong> (${material.code})<br>Current Stock: ${material.stock} ${material.unit}`;
    document.getElementById('issueForm').dataset.code = material.code;
    document.getElementById('issueForm').classList.remove('hidden');
    document.getElementById('issueQty').focus();
}

function showCountForm(materialCode) {
    hideAllForms();
    let material = materials.find(m => m.code === materialCode);
    if (!material) return;
    
    document.getElementById('countMaterialInfo').innerHTML = 
        `<strong>${material.name}</strong> (${material.code})<br>System Stock: ${material.stock} ${material.unit}`;
    document.getElementById('countForm').dataset.code = material.code;
    document.getElementById('countForm').classList.remove('hidden');
    document.getElementById('countQty').focus();
}

// ==================== CRUD OPERATIONS ====================

// Add new material
function saveNewMaterial() {
    let name = document.getElementById('newName').value.trim();
    let category = document.getElementById('newCategory').value;
    let unit = document.getElementById('newUnit').value.trim() || 'pieces';
    let stock = parseInt(document.getElementById('newStock').value) || 0;
    
    if (!name) {
        alert('Material name is required');
        return;
    }
    
    // Generate unique code
    let code = generateCode(name, category);
    
    let newMaterial = {
        id: Date.now(),
        code: code,
        name: name,
        category: category,
        stock: stock,
        unit: unit
    };
    
    materials.push(newMaterial);
    saveMaterials();
    
    // Add activity
    activities.unshift({
        id: Date.now(),
        action: 'ADD',
        material_code: code,
        material_name: name,
        quantity: stock,
        timestamp: new Date().toLocaleString()
    });
    saveActivities();
    
    updateTable();
    hideAllForms();
    selectMaterial(code);
    
    alert(`✅ Material added!\nCode: ${code}`);
    
    // Clear form
    document.getElementById('newName').value = '';
    document.getElementById('newStock').value = '0';
}

// Receive stock 
function saveReceive() {
    let code = document.getElementById('receiveForm').dataset.code;
    let qty = parseInt(document.getElementById('receiveQty').value);
    
    if (!qty || qty < 1) {
        alert('Enter valid quantity');
        return;
    }
    
    let material = materials.find(m => m.code === code);
    if (!material) {
        alert('Material not found');
        return;
    }
    
    let oldStock = material.stock;
    material.stock += qty;
    
    saveMaterials();
    
    // Add activity 
    activities.unshift({
        id: Date.now(),
        action: 'RECEIVE',
        material_code: code,
        material_name: material.name,
        quantity: qty,
        old_stock: oldStock,
        new_stock: material.stock,
        note: 'Manual expand',
        timestamp: new Date().toLocaleString()
    });
    saveActivities();
    
    updateTable();
    selectMaterial(code);
    hideAllForms();
    
    document.getElementById('receiveQty').value = '';
    
    alert(`✅ Added ${qty} ${material.unit}\nNew stock: ${material.stock}`);
}

// Issue stock (Modify)
function saveIssue() {
    let code = document.getElementById('issueForm').dataset.code;
    let qty = parseInt(document.getElementById('issueQty').value);
    
    if (!qty || qty < 1) {
        alert('Enter valid quantity');
        return;
    }
    
    let material = materials.find(m => m.code === code);
    if (!material) {
        alert('Material not found');
        return;
    }
    
    if (material.stock < qty) {
        alert(`❌ Only ${material.stock} available!`);
        return;
    }
    
    let oldStock = material.stock;
    material.stock -= qty;
    
    saveMaterials();
    
    // Add activity (simplified)
    activities.unshift({
        id: Date.now(),
        action: 'ISSUE',
        material_code: code,
        material_name: material.name,
        quantity: qty,
        old_stock: oldStock,
        new_stock: material.stock,
        note: 'Manual modify',
        timestamp: new Date().toLocaleString()
    });
    saveActivities();
    
    updateTable();
    selectMaterial(code);
    hideAllForms();
    
    document.getElementById('issueQty').value = '';
    
    alert(`✅ Removed ${qty} ${material.unit}\nNew stock: ${material.stock}`);
}

// Stock count adjustment
function saveCount() {
    let code = document.getElementById('countForm').dataset.code;
    let actual = parseInt(document.getElementById('countQty').value);
    let reason = document.getElementById('countReason').value;
    
    if (isNaN(actual) || actual < 0) {
        alert('Enter valid quantity');
        return;
    }
    
    let material = materials.find(m => m.code === code);
    if (!material) {
        alert('Material not found');
        return;
    }
    
    let oldStock = material.stock;
    let difference = actual - oldStock;
    material.stock = actual;
    
    saveMaterials();
    
    // Add activity
    activities.unshift({
        id: Date.now(),
        action: 'COUNT',
        material_code: code,
        material_name: material.name,
        quantity: difference,
        old_stock: oldStock,
        new_stock: actual,
        note: reason,
        timestamp: new Date().toLocaleString()
    });
    saveActivities();
    
    updateTable();
    selectMaterial(code);
    hideAllForms();
    
    document.getElementById('countQty').value = '';
    
    alert(`✅ Stock updated\nOld: ${oldStock} → New: ${actual}`);
}

// Delete material
function deleteMaterial(code) {
    if (!confirm('⚠️ Delete this material? This cannot be undone.')) return;
    
    let material = materials.find(m => m.code === code);
    materials = materials.filter(m => m.code !== code);
    saveMaterials();
    
    // Add activity
    activities.unshift({
        id: Date.now(),
        action: 'DELETE',
        material_code: code,
        material_name: material ? material.name : code,
        timestamp: new Date().toLocaleString()
    });
    saveActivities();
    
    updateTable();
    
    if (selectedMaterial && selectedMaterial.code === code) {
        document.getElementById('selectedMaterial').classList.add('hidden');
        selectedMaterial = null;
    }
    
    alert(`✅ Deleted: ${material ? material.name : code}`);
}

// ==================== BARCODE FUNCTIONS ====================

function printSingleBarcode(code, name) {
    document.getElementById('barcodePreview').innerHTML = `
        <div style="text-align:center;">
            <img src="https://barcode.tec-it.com/barcode.ashx?data=${code}&code=Code128&dpi=96&imagetype=png" 
                 style="max-width:100%;" alt="Barcode">
            <h4>${code}</h4>
            <p>${name}</p>
        </div>
    `;
    document.getElementById('barcodeModal').classList.remove('hidden');
}

function printBarcode() {
    if (!selectedMaterial) {
        alert('Please select a material first');
        return;
    }
    printSingleBarcode(selectedMaterial.code, selectedMaterial.name);
}

function closeBarcodeModal() {
    document.getElementById('barcodeModal').classList.add('hidden');
}

function printBarcodeLabel() {
    window.print();
    setTimeout(() => {
        closeBarcodeModal();
    }, 1000);
}

// ==================== SCANNER DETECTION ====================

function setupScannerDetection() {
    document.addEventListener('keypress', function(e) {
        let currentTime = new Date().getTime();
        
        if (currentTime - lastKeyTime < 50) {
            scanBuffer += e.key;
        } else {
            scanBuffer = e.key;
        }
        
        lastKeyTime = currentTime;
        
        if (e.key === "Enter" && scanBuffer.length > 1) {
            let barcode = scanBuffer.trim();
            document.getElementById('searchInput').value = barcode;
            searchMaterial(barcode);
            scanBuffer = "";
        }
    });
}

// ==================== BUTTON HANDLERS ====================

function setupButtonHandlers() {
    document.querySelector('.btn-add').onclick = function(e) {
        e.preventDefault();
        showAddForm();
    };
    
    document.querySelector('.search-box button').onclick = function(e) {
        e.preventDefault();
        searchMaterial();
    };
    
    document.getElementById('searchInput').onkeypress = function(e) {
        if (e.key === 'Enter') {
            searchMaterial();
        }
    };
    
    document.getElementById('categoryFilter').onchange = function() {
        filterMaterials();
    };
}

// ==================== MOBILE CAMERA SCAN ====================

function toggleCamera() {
    let cameraBtn = document.getElementById('cameraBtn');
    let readerDiv = document.getElementById('reader');
    
    if (!isScanning) {
        // Check if library is loaded
        if (typeof Html5QrcodeScanner === 'undefined') {
            alert('Camera scanner library not loaded. Please refresh the page.');
            console.error('Html5QrcodeScanner is not defined');
            return;
        }
        
        readerDiv.style.display = 'block';
        cameraBtn.textContent = '⏹️ Stop Camera';
        cameraBtn.classList.add('active');
        
        try {
            // Force back camera only with specific constraints
            const config = {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                rememberLastUsedCamera: true,
                showTorchButtonIfSupported: true,
                // THIS FORCES BACK CAMERA
                videoConstraints: {
                    facingMode: { exact: "environment" }  // "environment" = back camera
                }
            };
            
            html5QrcodeScanner = new Html5QrcodeScanner(
                "reader", 
                config,
                false
            );
            
            html5QrcodeScanner.render(onScanSuccess, onScanError);
            isScanning = true;
            console.log('Camera scanner started (back camera only)');
        } catch (error) {
            console.error('Error starting camera:', error);
            
            // Fallback if "exact" fails (some phones handle it differently)
            try {
                console.log('Trying fallback camera settings...');
                const fallbackConfig = {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                    rememberLastUsedCamera: true,
                    showTorchButtonIfSupported: true,
                    videoConstraints: {
                        facingMode: "environment"  // Without "exact" - more compatible
                    }
                };
                
                html5QrcodeScanner = new Html5QrcodeScanner(
                    "reader", 
                    fallbackConfig,
                    false
                );
                
                html5QrcodeScanner.render(onScanSuccess, onScanError);
                isScanning = true;
                console.log('Camera scanner started with fallback');
            } catch (fallbackError) {
                console.error('Fallback also failed:', fallbackError);
                alert('Failed to start back camera. Please check permissions.');
                readerDiv.style.display = 'none';
                cameraBtn.textContent = '📷 Scan with Camera';
                cameraBtn.classList.remove('active');
            }
        }
    } else {
        if (html5QrcodeScanner) {
            try {
                html5QrcodeScanner.clear();
                html5QrcodeScanner = null;
            } catch (error) {
                console.error('Error stopping camera:', error);
            }
        }
        readerDiv.style.display = 'none';
        cameraBtn.textContent = '📷 Scan with Camera';
        cameraBtn.classList.remove('active');
        isScanning = false;
        console.log('Camera scanner stopped');
    }
}

function onScanError(errorMessage) {
    // Ignore most errors - they're usually just "no barcode found"
}

// ==================== CAMERA SCAN HANDLER ====================
function onScanSuccess(decodedText, decodedResult) {
    console.log('Scan success:', decodedText);
    
    // Stop camera
    if (isScanning) {
        toggleCamera();
    }
    
    // Put in search box
    document.getElementById('searchInput').value = decodedText;
    
    // Find the material
    let material = materials.find(m => m.code.toUpperCase() === decodedText.toUpperCase());
    
    if (material) {
        // Material found - automatically add 1 to stock
        let oldStock = material.stock;
        material.stock += 1;
        
        // 💾 SAVE IMMEDIATELY TO LOCALSTORAGE (works offline)
        localStorage.setItem('materials', JSON.stringify(materials));
        
        // Also save to Firebase if online (but don't wait for it)
        if (typeof dbRef !== 'undefined' && navigator.onLine) {
            dbRef.set(materials).catch(err => console.log('Offline - will sync later'));
        }
        
        // Add activity to memory
        activities.unshift({
            id: Date.now(),
            action: 'RECEIVE',
            material_code: material.code,
            material_name: material.name,
            quantity: 1,
            old_stock: oldStock,
            new_stock: material.stock,
            note: 'Scan receive',
            timestamp: new Date().toLocaleString()
        });
        
        // 💾 SAVE ACTIVITIES IMMEDIATELY
        localStorage.setItem('activities', JSON.stringify(activities));
        
        // Update UI
        updateTable();
        selectMaterial(material.code);
        
        // Show quick visual feedback
        showScanFeedback(material.name, material.stock);
        
        // Vibrate on mobile
        try {
            if (navigator.vibrate) navigator.vibrate(50);
        } catch (e) {}
        
    } else {
        // Material not found
        console.log('Material not found:', decodedText);
        showScanFeedback('Unknown barcode', null, 'error');
    }
}

function onScanError(errorMessage) {
    // Ignore most errors - they're usually just "no barcode found"
    // console.log('Scan error:', errorMessage);
}

// Quick visual feedback that disappears automatically
function showScanFeedback(message, newStock, type = 'success') {
    let toast = document.createElement('div');
    
    if (type === 'success') {
        toast.textContent = `✅ ${message} +1 (${newStock})`;
        toast.style.background = '#28a745';
    } else {
        toast.textContent = `❌ ${message}`;
        toast.style.background = '#dc3545';
    }
    
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        color: white;
        padding: 12px 24px;
        border-radius: 50px;
        font-weight: bold;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideUp 0.3s, fadeOut 0.5s 1.5s forwards;
    `;
    
    document.body.appendChild(toast);
    
    // Auto remove after 2 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 2000);
}

// ==================== CLOSE SELECTED MATERIAL ====================

function closeSelectedMaterial() {
    document.getElementById('selectedMaterial').classList.add('hidden');
    selectedMaterial = null;
    document.getElementById('searchInput').focus();
}

// ==================== KEYBOARD SHORTCUTS ====================

document.addEventListener('keydown', function(e) {
    if (e.key === 'F1') {
        e.preventDefault();
        showAddForm();
    }
    if (e.key === 'F2' && selectedMaterial) {
        e.preventDefault();
        showReceiveForm(selectedMaterial.code);
    }
    if (e.key === 'F3' && selectedMaterial) {
        e.preventDefault();
        showIssueForm(selectedMaterial.code);
    }
    if (e.key === 'Escape') {
        document.getElementById('searchInput').value = '';
        document.getElementById('searchInput').focus();
        if (selectedMaterial) {
            document.getElementById('selectedMaterial').classList.add('hidden');
            selectedMaterial = null;
        }
    }
});

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', function() {
    initDatabase();
    setupButtonHandlers();
    setupScannerDetection();
    document.getElementById('searchInput').focus();
});

// ==================== GLOBAL FUNCTIONS ====================

window.showAddForm = showAddForm;
window.showReceiveForm = showReceiveForm;
window.showIssueForm = showIssueForm;
window.showCountForm = showCountForm;
window.saveNewMaterial = saveNewMaterial;
window.saveReceive = saveReceive;
window.saveIssue = saveIssue;
window.saveCount = saveCount;
window.deleteMaterial = deleteMaterial;
window.selectMaterial = selectMaterial;
window.searchMaterial = searchMaterial;
window.filterMaterials = filterMaterials;
window.printBarcode = printBarcode;
window.printSingleBarcode = printSingleBarcode;
window.closeBarcodeModal = closeBarcodeModal;
window.printBarcodeLabel = printBarcodeLabel;
window.hideAllForms = hideAllForms;
window.toggleCamera = toggleCamera;
window.closeSelectedMaterial = closeSelectedMaterial;