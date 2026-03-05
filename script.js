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
            
            // 🧹 AUTO-CLEAN: Remove any null entries and fix missing fields
            let originalCount = materials.length;
            
            // Filter out nulls and non-objects
            materials = materials.filter(m => m !== null && typeof m === 'object');
            
            // Fix each material to ensure all fields exist
            materials = materials.map(m => {
                // Skip if material is invalid
                if (!m) return null;
                
                // Ensure all fields exist with defaults
                return {
                    id: m.id || Date.now() + Math.floor(Math.random() * 1000),
                    code: m.code || Math.floor(100000 + Math.random() * 900000).toString(),
                    name: m.name || 'Unknown Material',
                    category: m.category || 'Steel',
                    stock: typeof m.stock === 'number' ? m.stock : 0,
                    unit: m.unit || 'pieces'
                };
            }).filter(m => m !== null); // Remove any nulls from mapping
            
            if (originalCount !== materials.length) {
                console.log(`🧹 Auto-cleaned: removed ${originalCount - materials.length} invalid entries`);
                saveMaterials(); // Save cleaned data back
            } else {
                console.log('✅ Loaded', materials.length, 'materials from localStorage');
            }
            
        } catch (e) {
            console.error('Error loading materials, resetting data:', e);
            materials = [];
            localStorage.setItem('materials', JSON.stringify([])); // Reset corrupted data
        }
    } else {
        materials = [];
        console.log('✅ Created new materials list');
    }
    
    // Load activities (clean them too)
    let savedActivities = localStorage.getItem('activities');
    if (savedActivities) {
        try {
            activities = JSON.parse(savedActivities);
            // Remove null activities
            let actCount = activities.length;
            activities = activities.filter(a => a !== null);
            if (actCount !== activities.length) {
                localStorage.setItem('activities', JSON.stringify(activities));
            }
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
                // Clean remote data too
                let cleanData = remoteData
                    .filter(m => m !== null && typeof m === 'object')
                    .map(m => ({
                        id: m.id || Date.now() + Math.floor(Math.random() * 1000),
                        code: m.code || Math.floor(100000 + Math.random() * 900000).toString(),
                        name: m.name || 'Unknown Material',
                        category: m.category || 'Steel',
                        stock: typeof m.stock === 'number' ? m.stock : 0,
                        unit: m.unit || 'pieces'
                    }));
                
                // Only update if different from current
                if (JSON.stringify(cleanData) !== JSON.stringify(materials)) {
                    console.log('📡 Received updates from another device');
                    materials = cleanData;
                    localStorage.setItem('materials', JSON.stringify(materials));
                    updateTable();
                    updateStats();
                    updateCategoryFilter();
                    
                    // If selected material exists, update it
                    if (selectedMaterial) {
                        let updated = materials.find(m => m && m.code === selectedMaterial.code);
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
    updateCategoryFilter();
}

// Save activities
function saveActivities() {
    localStorage.setItem('activities', JSON.stringify(activities));
}

// ==================== CORE FUNCTIONS ====================
function generateRandomId() {
    // Generate random 6-digit number
    let randomId = Math.floor(100000 + Math.random() * 900000); // 100000-999999
    return randomId.toString();
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
    let filtered = filter === 'ALL' ? materials : materials.filter(m => m && m.category === filter);
    
    if (!filtered || filtered.length === 0) {
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
        // Skip if material is null
        if (!m) return;
        
        // Ensure all fields exist
        let code = m.code || 'NO-CODE';
        let name = m.name || 'Unknown';
        let category = m.category || 'Steel';
        let stock = typeof m.stock === 'number' ? m.stock : 0;
        let unit = m.unit || 'pieces';
        
        let status = getStockStatus(stock);
        let statusClass = status === 'Critical' ? 'status-critical' : 
                         status === 'Low' ? 'status-low' : 'status-ok';
        
        html += `
            <tr>
                <td><strong>${code}</strong></td>
                <td>${name}</td>
                <td>${category}</td>
                <td>${stock}</td>
                <td>${unit}</td>
                <td><span class="status-badge ${statusClass}">${status}</span></td>
                <td>
                    <div class="action-buttons">
                        <button onclick="selectMaterial('${code}')" class="action-btn edit-btn">View</button>
                        <button onclick="printSingleBarcode('${code}', '${name}')" class="action-btn print-btn">🖨️</button>
                        <button onclick="deleteMaterial('${code}')" class="action-btn delete-btn">✗</button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    document.getElementById('tableBody').innerHTML = html;
}

// ==================== DUPLICATE DETECTION ====================
function checkDuplicateName(name, currentCode = null) {
    if (!name || name.trim() === '') return false;
    
    name = name.trim().toLowerCase();

    let duplicate = materials.find(m => {
        if (!m || !m.name) return false;
    
        if (currentCode && m.code === currentCode) return false;
        
        return m.name.toLowerCase() === name;
    });
    
    return duplicate || null;
}
function isIdUnique(id) {
    return !materials.some(m => m && m.code === id);
}

// Update category filter dropdown with all categories
function updateCategoryFilter() {
    let filterSelect = document.getElementById('categoryFilter');
    
    // Get unique categories (case-insensitive, with proper caps)
    let categoryMap = new Map();
    
    materials.forEach(m => {
        if (m && m.category) {
            let lowerCat = m.category.toLowerCase();
            // Store the properly capitalized version
            categoryMap.set(lowerCat, m.category);
        }
    });
    
    // Convert to array and sort
    let allCategories = ['ALL', ...Array.from(categoryMap.values()).sort()];
    
    // Save current selection
    let currentValue = filterSelect.value;
    
    // Clear and rebuild options
    filterSelect.innerHTML = '';
    allCategories.forEach(cat => {
        let option = document.createElement('option');
        option.value = cat === 'ALL' ? 'ALL' : cat;
        option.textContent = cat === 'ALL' ? 'All Categories' : cat;
        if (currentValue === cat || (cat === 'ALL' && currentValue === 'ALL')) {
            option.selected = true;
        }
        filterSelect.appendChild(option);
    });
}

// Filter materials
function filterMaterials() {
    updateTable();
}

// ==================== ENHANCED SEARCH FUNCTIONS ====================

// Global search variables
let searchTimeout = null;
let lastSearchTerm = '';

// Setup enhanced search
function setupEnhancedSearch() {
    let searchInput = document.getElementById('searchInput');
    
    // Remove any existing listeners
    searchInput.removeEventListener('input', handleSearchInput);
    searchInput.removeEventListener('keypress', handleSearchKeypress);
    
    // Add new listeners
    searchInput.addEventListener('input', handleSearchInput);
    searchInput.addEventListener('keypress', handleSearchKeypress);
    
    console.log('🔍 Enhanced search initialized');
}

// Handle real-time search as user types
function handleSearchInput(e) {
    let searchTerm = e.target.value.trim();
    
    // Clear previous timeout
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }
    
    // If search is empty, show all materials
    if (searchTerm === '') {
        updateTable();
        hideSearchResults();
        return;
    }
    
    // Set timeout to search after user stops typing (300ms)
    searchTimeout = setTimeout(() => {
        performSmartSearch(searchTerm);
    }, 300);
}

// Handle Enter key press
function handleSearchKeypress(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        let searchTerm = e.target.value.trim();
        
        if (searchTerm) {
            // Clear any pending timeout
            if (searchTimeout) {
                clearTimeout(searchTimeout);
            }
            let results = performSmartSearch(searchTerm, true);
             if (results && results.length > 0) {
                selectMaterial(results[0].code);
            }
        }
    }
}

// Perform smart search (fuzzy, case-insensitive)
function performSmartSearch(searchTerm, prioritizeExact = false) {
    if (!searchTerm || searchTerm.length < 1) {
        updateTable();
        return [];
    }
    
    searchTerm = searchTerm.toLowerCase();
    console.log('Searching for:', searchTerm);
    
    // Score each material based on relevance
    let results = materials.map(material => {
        let score = 0;
        let nameLower = (material.name || '').toLowerCase();
        let codeLower = (material.code || '').toLowerCase();
        let categoryLower = (material.category || '').toLowerCase();
        
        // Exact matches (highest score)
        if (codeLower === searchTerm) score += 100;
        else if (nameLower === searchTerm) score += 90;
        
        // Starts with search term
        if (codeLower.startsWith(searchTerm)) score += 50;
        if (nameLower.startsWith(searchTerm)) score += 45;
        
        // Contains search term
        if (codeLower.includes(searchTerm)) score += 30;
        if (nameLower.includes(searchTerm)) score += 25;
        if (categoryLower.includes(searchTerm)) score += 10;
        
        // Word boundary matches (e.g., "16mm" matches "16mm Round Bar")
        let words = nameLower.split(' ');
        words.forEach(word => {
            if (word.startsWith(searchTerm)) score += 20;
            if (word.includes(searchTerm)) score += 5;
        });
        
        // Partial matches for short search terms (1-2 letters)
        if (searchTerm.length === 1) {
            if (codeLower.includes(searchTerm)) score += 2;
            if (nameLower.includes(searchTerm)) score += 1;
        }
        
        return {
            material: material,
            score: score
        };
    });
    
    // Filter out zero scores and sort by score (highest first)
    let filteredResults = results
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(r => r.material);
    
    // If we have results, show them
    if (filteredResults.length > 0) {
        showSearchResults(filteredResults, searchTerm);
    } else {
        // No results found
        showNoResults(searchTerm);
    }
        return filteredResults;
}

// Show search results in table
function showSearchResults(results, searchTerm) {
    let tableBody = document.getElementById('tableBody');
    
    if (results.length === 0) {
        showNoResults(searchTerm);
        return;
    }
    
    let html = '';
    results.forEach(m => {
        if (!m) return;
        
        let code = m.code || 'NO-CODE';
        let name = m.name || 'Unknown';
        let category = m.category || 'Steel';
        let stock = typeof m.stock === 'number' ? m.stock : 0;
        let unit = m.unit || 'pieces';
        
        // Highlight matching text (optional)
        let highlightedName = highlightMatch(name, searchTerm);
        let highlightedCode = highlightMatch(code, searchTerm);
        
        let status = getStockStatus(stock);
        let statusClass = status === 'Critical' ? 'status-critical' : 
                         status === 'Low' ? 'status-low' : 'status-ok';
        
        html += `
            <tr>
                <td><strong>${highlightedCode}</strong></td>
                <td>${highlightedName}</td>
                <td>${category}</td>
                <td>${stock}</td>
                <td>${unit}</td>
                <td><span class="status-badge ${statusClass}">${status}</span></td>
                <td>
                    <div class="action-buttons">
                        <button onclick="selectMaterial('${code}')" class="action-btn edit-btn">View</button>
                        <button onclick="printSingleBarcode('${code}', '${name}')" class="action-btn print-btn">🖨️</button>
                        <button onclick="deleteMaterial('${code}')" class="action-btn delete-btn">✗</button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    // Add search result summary
    let resultSummary = `
        <div style="margin: 10px 0; padding: 8px; background: #e3f2fd; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
            <span>🔍 Found <strong>${results.length}</strong> result${results.length > 1 ? 's' : ''} for "${searchTerm}"</span>
            <button onclick="clearSearch()" style="background: none; border: none; color: #2196f3; cursor: pointer; font-size: 14px;">✕ Clear search</button>
        </div>
    `;
    
    tableBody.innerHTML = resultSummary + html;
}

// Highlight matching text
function highlightMatch(text, searchTerm) {
    if (!text || !searchTerm) return text;
    
    let lowerText = text.toLowerCase();
    let lowerSearch = searchTerm.toLowerCase();
    let index = lowerText.indexOf(lowerSearch);
    
    if (index === -1) return text;
    
    let before = text.substring(0, index);
    let match = text.substring(index, index + searchTerm.length);
    let after = text.substring(index + searchTerm.length);
    
    return `${before}<span style="background-color: #fff3cd; font-weight: bold;">${match}</span>${after}`;
}

// Show no results message
function showNoResults(searchTerm) {
    let tableBody = document.getElementById('tableBody');
    tableBody.innerHTML = `
        <tr>
            <td colspan="7" style="text-align: center; padding: 40px; color: #666;">
                <div style="font-size: 48px; margin-bottom: 20px;">🔍</div>
                <strong>No materials found for "${searchTerm}"</strong><br>
                <small>Try a different search term or</small><br>
                <button onclick="showAddForm()" class="btn-add" style="margin-top: 15px;">➕ Add New Material</button>
                <button onclick="clearSearch()" style="margin-left: 10px; padding: 8px 16px;">Clear Search</button>
            </td>
        </tr>
    `;
}

// Show search suggestions as user types
function showSearchSuggestions(searchTerm) {
    if (searchTerm.length < 2) return;
    
    // Get top 5 matches
    let suggestions = materials
        .map(m => ({
            material: m,
            relevance: getRelevanceScore(m, searchTerm)
        }))
        .filter(s => s.relevance > 0)
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, 5)
        .map(s => s.material);
    
    if (suggestions.length === 0) return;
    
    // Create or update suggestions dropdown
    let existingDropdown = document.getElementById('searchSuggestions');
    if (existingDropdown) existingDropdown.remove();
    
    let dropdown = document.createElement('div');
    dropdown.id = 'searchSuggestions';
    dropdown.style.cssText = `
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: white;
        border: 1px solid #ddd;
        border-radius: 0 0 8px 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        z-index: 1000;
        max-height: 300px;
        overflow-y: auto;
    `;
    
    suggestions.forEach(m => {
        let item = document.createElement('div');
        item.style.cssText = `
            padding: 10px 15px;
            cursor: pointer;
            border-bottom: 1px solid #eee;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        item.onmouseover = () => item.style.background = '#f5f5f5';
        item.onmouseout = () => item.style.background = 'white';
        item.onclick = () => {
            document.getElementById('searchInput').value = m.code;
            selectMaterial(m.code);
            dropdown.remove();
        };
        
        item.innerHTML = `
            <div>
                <strong>${m.code}</strong><br>
                <small>${m.name}</small>
            </div>
            <span class="status-badge ${getStockStatus(m.stock) === 'Critical' ? 'status-critical' : 
                                      getStockStatus(m.stock) === 'Low' ? 'status-low' : 'status-ok'}">
                ${m.stock} ${m.unit}
            </span>
        `;
        
        dropdown.appendChild(item);
    });
    
    // Position the dropdown under search box
    let searchBox = document.querySelector('.search-box');
    searchBox.style.position = 'relative';
    searchBox.appendChild(dropdown);
}

// Calculate relevance score for suggestions
function getRelevanceScore(material, searchTerm) {
    let score = 0;
    let searchLower = searchTerm.toLowerCase();
    let nameLower = (material.name || '').toLowerCase();
    let codeLower = (material.code || '').toLowerCase();
    
    if (codeLower === searchLower) score += 100;
    else if (nameLower === searchLower) score += 90;
    else if (codeLower.startsWith(searchLower)) score += 50;
    else if (nameLower.startsWith(searchLower)) score += 40;
    else if (codeLower.includes(searchLower)) score += 20;
    else if (nameLower.includes(searchLower)) score += 10;
    
    return score;
}

// Clear search and show all materials
function clearSearch() {
    document.getElementById('searchInput').value = '';
    updateTable();
    hideSearchResults();
}

// Hide any search-specific UI
function hideSearchResults() {
    // Table will show all materials via updateTable()
}

// Legacy search function (keeping for compatibility)
function searchMaterial(barcode) {
    let searchTerm = barcode || document.getElementById('searchInput').value.trim();
    if (!searchTerm || searchTerm === '') return;
    performSmartSearch(searchTerm, true);
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
                <div class="detail-label">Unit</div>
                <div class="detail-value">${material.unit}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Last Updated</div>
                <div class="detail-value">${new Date().toLocaleDateString()}</div>
            </div>
        </div>
        
        <!-- Stock Actions -->
        <div style="margin: 15px 0; padding: 10px; background: #f8f9fa; border-radius: 8px;">
            <h3 style="margin-bottom: 10px; color: #495057;">📦 Stock Actions</h3>
            <div class="material-actions">
                <button onclick="showReceiveForm('${material.code}')" class="btn-receive">📦 Expand</button>
                <button onclick="showIssueForm('${material.code}')" class="btn-issue">✏️ Modify Stock</button>
                <button onclick="showCountForm('${material.code}')" class="btn-count">📊 Count</button>
            </div>
        </div>
        
        <!-- Edit Details -->
        <div style="margin: 15px 0; padding: 10px; background: #f8f9fa; border-radius: 8px;">
            <h3 style="margin-bottom: 10px; color: #495057;">✏️ Edit Details</h3>
            <div class="material-actions">
                <button onclick="showEditCategoryForm('${material.code}')" class="btn-edit" style="background: #fd7e14; color: white;">📁 Change Category</button>
                <button onclick="showEditUnitForm('${material.code}')" class="btn-edit" style="background: #20c997; color: white;">📏 Change Unit</button>
                <button onclick="printSingleBarcode('${material.code}', '${material.name}')" class="btn-print">🖨️ Print Label</button>
                <button onclick="deleteMaterial('${material.code}')" class="btn-delete">🗑️ Delete</button>
            </div>
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
    let editCategoryForm = document.getElementById('editCategoryForm');
    if (editCategoryForm) editCategoryForm.remove();
    
    let editUnitForm = document.getElementById('editUnitForm');
    if (editUnitForm) editUnitForm.remove();
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

// ==================== EDIT CATEGORY & UNIT FUNCTIONS ====================

function showEditCategoryForm(materialCode) {
    hideAllForms();
    let material = materials.find(m => m.code === materialCode);
    if (!material) {
        alert('Material not found');
        return;
    }
    
    console.log('Editing category for:', material);
    
    // Get ALL unique categories (case-insensitive, with proper capitalization)
    let categoryMap = new Map(); // Use Map to store proper case version
    
    // First, collect all categories from materials
    materials.forEach(m => {
        if (m && m.category) {
            let lowerCat = m.category.toLowerCase();
            // Store the properly capitalized version (first letter caps)
            let properCat = m.category.charAt(0).toUpperCase() + m.category.slice(1).toLowerCase();
            categoryMap.set(lowerCat, properCat);
        }
    });
    
    // Convert map to array and sort
    let allCategories = Array.from(categoryMap.values()).sort();
    
    console.log('All unique categories:', allCategories);
    
    // Build dropdown options
    let options = '';
    allCategories.forEach(cat => {
        let selected = (cat.toLowerCase() === material.category.toLowerCase()) ? 'selected' : '';
        options += `<option value="${cat}" ${selected}>${cat}</option>`;
    });
    
    // Add option for new category
    options += `<option value="__new__">➕ Add New Category...</option>`;
    
    let formHtml = `
        <div id="editCategoryForm" class="form-card">
            <h3>📁 Change Category</h3>
            <p><strong>${material.name}</strong> (${material.code})</p>
            <p>Current Category: <strong>${material.category}</strong></p>
            
            <select id="editCategorySelect" onchange="toggleEditCustomCategory()">
                ${options}
            </select>
            
            <input type="text" id="editCustomCategory" placeholder="Enter new category name" style="display: none; margin-top: 10px;">
            
            <div class="form-actions" style="margin-top: 20px;">
                <button onclick="saveCategoryUpdate('${material.code}')" class="btn-save">Update Category</button>
                <button onclick="hideAllForms()" class="btn-cancel">Cancel</button>
            </div>
        </div>
    `;
    
    // Remove any existing edit form first
    let existingForm = document.getElementById('editCategoryForm');
    if (existingForm) existingForm.remove();
    
    // Insert new form
    let tempDiv = document.createElement('div');
    tempDiv.innerHTML = formHtml;
    document.getElementById('actionForms').appendChild(tempDiv);
}

function toggleEditCustomCategory() {
    let select = document.getElementById('editCategorySelect');
    let customInput = document.getElementById('editCustomCategory');
    
    if (select.value === '__new__') {
        customInput.style.display = 'block';
        customInput.focus();
    } else {
        customInput.style.display = 'none';
        customInput.value = '';
    }
}

function saveCategoryUpdate(code) {
    let material = materials.find(m => m.code === code);
    if (!material) return;
    
    let select = document.getElementById('editCategorySelect');
    let customInput = document.getElementById('editCustomCategory');
    let newCategory;
    
    if (select.value === '__new__') {
        newCategory = customInput.value.trim();
        if (!newCategory) {
            alert('Please enter a category name');
            return;
        }
        // Capitalize first letter for new category
        newCategory = newCategory.charAt(0).toUpperCase() + newCategory.slice(1).toLowerCase();
    } else {
        newCategory = select.value; // Already properly capitalized from dropdown
    }
    
    // Check if actually changed (case-insensitive)
    if (newCategory.toLowerCase() === material.category.toLowerCase()) {
        alert('Category unchanged');
        hideAllForms();
        selectMaterial(code);
        return;
    }
    
    let oldCategory = material.category;
    material.category = newCategory;
    
    saveMaterials();
    
    // Add activity
    activities.unshift({
        id: Date.now(),
        action: 'EDIT_CATEGORY',
        material_code: code,
        material_name: material.name,
        old_value: oldCategory,
        new_value: newCategory,
        timestamp: new Date().toLocaleString()
    });
    saveActivities();
    
    updateTable();
    hideAllForms();
    selectMaterial(code);
    
    alert(`✅ Category updated: ${oldCategory} → ${newCategory}`);
}

// ==================== EDIT UNIT FUNCTIONS ====================

function showEditUnitForm(materialCode) {
    hideAllForms();
    let material = materials.find(m => m.code === materialCode);
    if (!material) return;
    
    // Common units for suggestions
    let commonUnits = ['pieces', 'pairs', 'kg', 'meters', 'boxes', 'cans', 'liters', 'sheets'];
    
    let formHtml = `
        <div id="editUnitForm" class="form-card">
            <h3>📏 Change Unit</h3>
            <p><strong>${material.name}</strong> (${material.code})</p>
            <p>Current Unit: <strong>${material.unit}</strong></p>
            
            <select id="editUnitSelect" onchange="toggleEditCustomUnit()">
                <option value="">-- Select Unit --</option>
                ${commonUnits.map(unit => 
                    `<option value="${unit}" ${material.unit === unit ? 'selected' : ''}>${unit}</option>`
                ).join('')}
                <option value="__custom__">➕ Add Custom Unit...</option>
            </select>
            
            <input type="text" id="editCustomUnit" placeholder="Enter custom unit" style="display: none; margin-top: 10px;">
            
            <div class="form-actions" style="margin-top: 20px;">
                <button onclick="saveUnitUpdate('${material.code}')" class="btn-save">Update Unit</button>
                <button onclick="hideAllForms()" class="btn-cancel">Cancel</button>
            </div>
        </div>
    `;
    
    let tempDiv = document.createElement('div');
    tempDiv.innerHTML = formHtml;
    document.getElementById('actionForms').appendChild(tempDiv);
}

function toggleEditCustomUnit() {
    let select = document.getElementById('editUnitSelect');
    let customInput = document.getElementById('editCustomUnit');
    
    if (select.value === '__custom__') {
        customInput.style.display = 'block';
        customInput.focus();
    } else {
        customInput.style.display = 'none';
        customInput.value = '';
    }
}

function saveUnitUpdate(code) {
    let material = materials.find(m => m.code === code);
    if (!material) return;
    
    let select = document.getElementById('editUnitSelect');
    let customInput = document.getElementById('editCustomUnit');
    let newUnit;
    
    if (select.value === '__custom__') {
        newUnit = customInput.value.trim();
        if (!newUnit) {
            alert('Please enter a unit');
            return;
        }
    } else if (select.value) {
        newUnit = select.value;
    } else {
        alert('Please select or enter a unit');
        return;
    }
    
    if (newUnit === material.unit) {
        alert('Unit unchanged');
        hideAllForms();
        selectMaterial(code);
        return;
    }
    
    let oldUnit = material.unit;
    material.unit = newUnit;
    
    saveMaterials();
    
    // Add activity
    activities.unshift({
        id: Date.now(),
        action: 'EDIT_UNIT',
        material_code: code,
        material_name: material.name,
        old_value: oldUnit,
        new_value: newUnit,
        timestamp: new Date().toLocaleString()
    });
    saveActivities();
    
    updateTable();
    hideAllForms();
    selectMaterial(code);
    
    alert(`✅ Unit updated: ${oldUnit} → ${newUnit}`);
}

// ==================== CUSTOM CATEGORY HANDLER ====================
function toggleCustomCategory() {
    let select = document.getElementById('newCategory');
    let customInput = document.getElementById('customCategory');
    
    if (select.value === 'custom') {
        customInput.style.display = 'block';
        customInput.focus();
    } else {
        customInput.style.display = 'none';
        customInput.value = '';
    }
}

function getSelectedCategory() {
    let select = document.getElementById('newCategory');
    let customInput = document.getElementById('customCategory');
    let category;
    
    if (select.value === 'custom') {
        category = customInput.value.trim() || 'Misc';
    } else {
        category = select.value;
    }
    
    // Standardize: first letter caps, rest lowercase
    return category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
}

// ==================== CRUD OPERATIONS ====================

function saveNewMaterial() {
    let name = document.getElementById('newName').value.trim();
    let category = getSelectedCategory();
    let unit = document.getElementById('newUnit').value.trim() || 'pieces';
    let stock = parseInt(document.getElementById('newStock').value) || 0;
    
    if (!name) {
        alert('Material name is required');
        return;
    }
    
    // Check for duplicates
    let duplicate = checkDuplicateName(name);
    if (duplicate) {
        let confirmMsg = `⚠️ "${name}" is very similar to existing material:\n\n` +
                        `Existing: ${duplicate.name} (ID: ${duplicate.code})\n` +
                        `Stock: ${duplicate.stock} ${duplicate.unit}\n\n` +
                        `Do you still want to add as new material?`;
        
        if (!confirm(confirmMsg)) {
            if (confirm('View existing material instead?')) {
                selectMaterial(duplicate.code);
                hideAllForms();
            }
            return;
        }
    }
    
    // Generate random 6-digit ID
    let id = generateRandomId();
    
    // Make sure ID is unique
    while (materials.some(m => m && m.code === id)) {
        id = generateRandomId();
    }
    
    let newMaterial = {
        id: Date.now(),
        code: id,
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
        material_code: id,
        material_name: name,
        quantity: stock,
        timestamp: new Date().toLocaleString()
    });
    saveActivities();
    
    updateTable();
    hideAllForms();
    selectMaterial(id);
    
    alert(`✅ Material added!\nID: ${id}`);
    
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
    let reason = 'Physical count adjustment'; 
    
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
            e.preventDefault();
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



// Run this once to clean up existing categories
function cleanupCategories() {
    console.log('🧹 Cleaning up category case inconsistencies...');
    let changed = false;
    
    materials = materials.map(m => {
        if (m && m.category) {
            // Standardize to first letter caps, rest lowercase
            let properCat = m.category.charAt(0).toUpperCase() + m.category.slice(1).toLowerCase();
            if (m.category !== properCat) {
                console.log(`  Fixing: "${m.category}" → "${properCat}"`);
                m.category = properCat;
                changed = true;
            }
        }
        return m;
    });
    
    if (changed) {
        saveMaterials();
        console.log('✅ Categories cleaned up!');
        updateTable();
        updateCategoryFilter();
    } else {
        console.log('✅ No category cleanup needed');
    }
}

// Run it after initialization
document.addEventListener('DOMContentLoaded', function() {
    initDatabase();
    setupButtonHandlers();
    setupScannerDetection();
    setupEnhancedSearch();
    document.getElementById('searchInput').focus();
    
    // Run cleanup after a short delay
    setTimeout(cleanupCategories, 1000);
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

// ==================== REPAIR EXISTING DATA ====================
function repairData() {
    console.log('🔧 Repairing data...');
    let repaired = false;
    
    materials = materials.map(m => {
        let needsFix = false;
        let fixed = { ...m };
        
        // Add missing fields with defaults
        if (!fixed.code) {
            fixed.code = Math.floor(100000 + Math.random() * 900000).toString();
            }
        if (!fixed.name) fixed.name = 'Unknown', needsFix = true;
        if (!fixed.category) fixed.category = 'Steel', needsFix = true;
        if (fixed.stock === undefined || fixed.stock === null) fixed.stock = 0, needsFix = true;
        if (!fixed.unit) fixed.unit = 'pieces', needsFix = true;
        
        if (needsFix) repaired = true;
        return fixed;
    });
    
    if (repaired) {
        saveMaterials();
        console.log('✅ Data repaired');
        updateTable();
        updateStats();
    }
}

// Add repair to initialization
const originalInit = initDatabase;
initDatabase = function() {
    originalInit();
    setTimeout(repairData, 500); // Repair after loading
};