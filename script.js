const TYPE_META = {
  raw: {
    title: 'Barang Mentah',
    description: 'Semua data dari link 1 kecuali LAYAR/屏幕 dan BARANG JADI/成品.',
    unit: 'stok',
    tableHeaders: ['Kategori Produk', 'Nama Barang', 'Stok Akhir']
  },
  semi: {
    title: 'Barang Setengah Jadi',
    description: 'Hanya data LAYAR/屏幕 dari link 1.',
    unit: 'stok',
    tableHeaders: ['Kategori Produk', 'Nama Barang', 'Stok Akhir']
  },
  full: {
    title: 'Barang Full Rakit',
    description: 'Hanya data BARANG JADI/成品 dari link 1.',
    unit: 'stok',
    tableHeaders: ['Kategori Produk', 'Nama Barang', 'Stok Akhir']
  },
  return: {
    title: 'Barang Return',
    description: 'Data dari link 2: kategori, nomor seri, kuantitas, dan keterangan barang.',
    unit: 'qty',
    tableHeaders: ['Kategori', 'Nomor Seri', 'Kuantitas', 'Keterangan Barang']
  },
  damaged: {
    title: 'Barang Rusak',
    description: 'Data dari link 3: nama customer, model komputer, dan alasan kerusakan.',
    unit: 'kasus',
    tableHeaders: ['Nama Customer', 'Model Komputer', 'Alasan Kerusakan']
  }
};

let dashboardData = {
  raw: [],
  semi: [],
  full: [],
  return: [],
  damaged: []
};

let currentType = 'raw';

const summaryGrid = document.getElementById('summaryGrid');
const tableHead = document.getElementById('tableHead');
const tableBody = document.getElementById('tableBody');
const panelTitle = document.getElementById('panelTitle');
const panelDescription = document.getElementById('panelDescription');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const miniChart = document.getElementById('miniChart');
const chartTitle = document.getElementById('chartTitle');
const chartNote = document.getElementById('chartNote');
const statusBox = document.getElementById('statusBox');
const refreshBtn = document.getElementById('refreshBtn');
const lastUpdated = document.getElementById('lastUpdated');

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()（）/\\_-]/g, '');
}

function cleanText(value) {
  return String(value || '').trim();
}

function parseNumber(value) {
  const cleaned = String(value || '')
    .replace(/[^0-9,.-]/g, '')
    .replace(',', '.');
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function formatNumber(value) {
  return new Intl.NumberFormat('id-ID').format(value || 0);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function parseCSV(text) {
  const rows = [];
  let currentRow = [];
  let currentValue = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentValue += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentValue);
      currentValue = '';
    } else if ((char === '\n' || char === '\r') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = '';
    } else {
      currentValue += char;
    }
  }

  if (currentValue.length || currentRow.length) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  const cleanedRows = rows
    .map(row => row.map(cell => cleanText(cell)))
    .filter(row => row.some(cell => cell !== ''));

  const headers = cleanedRows[0] || [];
  const body = cleanedRows.slice(1);

  return { headers, rows: body };
}

function findColumnIndex(headers, candidates, occurrence = 1) {
  let matchCount = 0;
  const normalizedCandidates = candidates.map(normalize);

  for (let i = 0; i < headers.length; i++) {
    const header = normalize(headers[i]);
    const matched = normalizedCandidates.some(candidate => header.includes(candidate) || candidate.includes(header));
    if (matched) {
      matchCount++;
      if (matchCount === occurrence) return i;
    }
  }

  return -1;
}

function getCell(table, row, candidates, fallbackIndex = -1, occurrence = 1) {
  const index = findColumnIndex(table.headers, candidates, occurrence);
  if (index >= 0) return cleanText(row[index]);
  if (fallbackIndex >= 0) return cleanText(row[fallbackIndex]);
  return '';
}

function isLayar(category) {
  const value = normalize(category);
  return value.includes('layar') || value.includes('屏幕');
}

function isBarangJadi(category) {
  const value = normalize(category);
  return value.includes('barangjadi') || value.includes('fullrakit') || value.includes('成品');
}

async function fetchSheet(source) {
  const response = await fetch(`/api/sheet?source=${encodeURIComponent(source)}&t=${Date.now()}`);
  const text = await response.text();

  if (!response.ok) {
    let message = text;
    try {
      const json = JSON.parse(text);
      message = json.error || json.hint || text;
    } catch (_) {}
    throw new Error(message);
  }

  if (text.toLowerCase().includes('<html') || text.toLowerCase().includes('<!doctype')) {
    throw new Error('Data yang diterima masih berbentuk halaman HTML, bukan CSV. Cek akses Google Sheet atau nama sheet di server.js.');
  }

  return parseCSV(text);
}

function mapStockData(table) {
  return table.rows
    .map(row => {
      const category = getCell(table, row, ['KATEGORI PRODUK', 'Kategori Produk', '产品类别', 'Jenis Barang', '商品种类', 'Kategori'], 2);
      const name = getCell(table, row, ['NAMA BARANG', 'Nama Barang', '货物名称', 'Nama'], 1);
      const stockRaw = getCell(table, row, ['Stok Akhir', 'STOK AKHIR', '实际库存', 'Stok Akhir (实际库存)', 'Actual Stock', 'Final Stock', 'Jumlah Barang', '商品数量', 'Jumlah', 'Quantity'], 5);
      const stock = parseNumber(stockRaw);

      return {
        category,
        name,
        stock,
        searchable: `${category} ${name} ${stockRaw}`
      };
    })
    .filter(item => item.category || item.name || item.stock);
}

function mapReturnData(table) {
  return table.rows
    .map(row => {
      const category = getCell(table, row, ['型号/kategori', '型号', 'kategori'], 1);
      const serial = getCell(table, row, ['序列号/nomor seri', '序列号', 'nomor seri', 'serial'], 2);
      const qtyRaw = getCell(table, row, ['数量/kuantitas', '数量', 'kuantitas', 'quantity'], 3);
      const status = getCell(table, row, ['状态/ keteragan barang', '状态', 'keterangan barang', 'keteragan barang'], 4);
      const qty = parseNumber(qtyRaw || '1');

      return {
        category,
        serial,
        qty,
        status,
        searchable: `${category} ${serial} ${qtyRaw} ${status}`
      };
    })
    .filter(item => item.category || item.serial || item.status);
}

function mapDamagedData(table) {
  return table.rows
    .map(row => {
      // Pada link 3 ada kolom 客户名称 dan 电脑型号 yang berulang.
      // Yang dipakai adalah kemunculan pertama sesuai permintaan.
      const customer = getCell(table, row, ['客户名称', 'customer', 'nama customer'], 1, 1);
      const model = getCell(table, row, ['电脑型号', 'model komputer', 'computer model'], 2, 1);
      const reason = getCell(table, row, ['故障原因', 'alasan kerusakan', 'kerusakan'], 4, 1);

      return {
        customer,
        model,
        reason,
        searchable: `${customer} ${model} ${reason}`
      };
    })
    .filter(item => item.customer || item.model || item.reason);
}

function splitStockTypes(stockItems) {
  const semi = stockItems.filter(item => isLayar(item.category));
  const full = stockItems.filter(item => isBarangJadi(item.category));
  const raw = stockItems.filter(item => !isLayar(item.category) && !isBarangJadi(item.category));

  return { raw, semi, full };
}

function getTotal(type, rows = dashboardData[type]) {
  if (type === 'damaged') return rows.length;
  if (type === 'return') return rows.reduce((sum, item) => sum + (item.qty || 0), 0);
  return rows.reduce((sum, item) => sum + (item.stock || 0), 0);
}

function renderSummary() {
  const cards = [
    { type: 'raw', label: 'Barang Mentah', hint: 'Total stok mentah' },
    { type: 'semi', label: 'Setengah Jadi', hint: 'Total stok layar' },
    { type: 'full', label: 'Full Rakit', hint: 'Total stok barang jadi' },
    { type: 'return', label: 'Barang Return', hint: 'Total kuantitas return' },
    { type: 'damaged', label: 'Barang Rusak', hint: 'Total data kerusakan' }
  ];

  summaryGrid.innerHTML = cards.map(card => `
    <article class="summary-card">
      <p class="label">${card.label}</p>
      <p class="value">${formatNumber(getTotal(card.type))}</p>
      <p class="hint">${card.hint}</p>
    </article>
  `).join('');
}

function getCategoryValue(type, item) {
  if (type === 'damaged') return item.reason || 'Tanpa alasan';
  return item.category || 'Tanpa kategori';
}

function getFilteredRows() {
  const keyword = normalize(searchInput.value);
  const selectedCategory = categoryFilter.value;

  return dashboardData[currentType].filter(item => {
    const matchKeyword = !keyword || normalize(item.searchable).includes(keyword);
    const category = getCategoryValue(currentType, item);
    const matchCategory = selectedCategory === 'all' || category === selectedCategory;
    return matchKeyword && matchCategory;
  });
}

function renderCategoryFilter() {
  const categories = [...new Set(dashboardData[currentType].map(item => getCategoryValue(currentType, item)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));

  categoryFilter.innerHTML = '<option value="all">Semua kategori</option>' + categories.map(category => `
    <option value="${escapeHtml(category)}">${escapeHtml(category)}</option>
  `).join('');
}

function renderTable(rows) {
  const headers = TYPE_META[currentType].tableHeaders;
  tableHead.innerHTML = `<tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join('')}</tr>`;

  if (!rows.length) {
    tableBody.innerHTML = `<tr><td colspan="${headers.length}" class="empty-state">Data tidak ditemukan.</td></tr>`;
    return;
  }

  tableBody.innerHTML = rows.map(item => {
    if (currentType === 'return') {
      return `
        <tr>
          <td><span class="badge">${escapeHtml(item.category || '-')}</span></td>
          <td>${escapeHtml(item.serial || '-')}</td>
          <td>${escapeHtml(formatNumber(item.qty || 0))}</td>
          <td>${escapeHtml(item.status || '-')}</td>
        </tr>
      `;
    }

    if (currentType === 'damaged') {
      return `
        <tr>
          <td>${escapeHtml(item.customer || '-')}</td>
          <td><span class="badge">${escapeHtml(item.model || '-')}</span></td>
          <td>${escapeHtml(item.reason || '-')}</td>
        </tr>
      `;
    }

    return `
      <tr>
        <td><span class="badge">${escapeHtml(item.category || '-')}</span></td>
        <td>${escapeHtml(item.name || '-')}</td>
        <td>${escapeHtml(formatNumber(item.stock || 0))}</td>
      </tr>
    `;
  }).join('');
}

function renderMiniChart(rows) {
  const grouped = new Map();

  rows.forEach(item => {
    const category = getCategoryValue(currentType, item);
    const value = currentType === 'damaged' ? 1 : currentType === 'return' ? item.qty : item.stock;
    grouped.set(category, (grouped.get(category) || 0) + (value || 0));
  });

  const sorted = [...grouped.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const max = Math.max(...sorted.map(([, value]) => value), 1);
  chartTitle.textContent = currentType === 'damaged' ? 'Ringkasan alasan kerusakan' : 'Ringkasan kategori';
  chartNote.textContent = currentType === 'damaged'
    ? 'Menampilkan jumlah kasus per alasan kerusakan.'
    : 'Menampilkan total stok/kuantitas per kategori.';

  if (!sorted.length) {
    miniChart.innerHTML = '<p class="empty-state">Belum ada data untuk diringkas.</p>';
    return;
  }

  miniChart.innerHTML = sorted.map(([label, value]) => {
    const width = Math.max((value / max) * 100, 3);
    return `
      <div class="chart-row">
        <div class="chart-label" title="${escapeHtml(label)}">${escapeHtml(label)}</div>
        <div class="chart-track"><div class="chart-fill" style="width:${width}%"></div></div>
        <div class="chart-value">${formatNumber(value)}</div>
      </div>
    `;
  }).join('');
}

function renderCurrentView(resetFilter = false) {
  const meta = TYPE_META[currentType];
  panelTitle.textContent = meta.title;
  panelDescription.textContent = meta.description;

  if (resetFilter) {
    searchInput.value = '';
    renderCategoryFilter();
    categoryFilter.value = 'all';
  }

  const rows = getFilteredRows();
  renderTable(rows);
  renderMiniChart(rows);
}

function showStatus(message, isError = false) {
  statusBox.textContent = message;
  statusBox.classList.toggle('hidden', !message);
  statusBox.style.background = isError ? '#fef2f2' : '#eff6ff';
  statusBox.style.borderColor = isError ? '#fecaca' : '#bfdbfe';
  statusBox.style.color = isError ? '#991b1b' : '#1e40af';
}

async function loadDashboard() {
  showStatus('Sedang membaca data dari Google Spreadsheet...');
  refreshBtn.disabled = true;
  refreshBtn.textContent = 'Memuat...';

  try {
    const [stockTable, returnTable, damagedTable] = await Promise.all([
      fetchSheet('stock'),
      fetchSheet('return'),
      fetchSheet('damaged')
    ]);

    const stockItems = mapStockData(stockTable);
    const stockTypes = splitStockTypes(stockItems);

    dashboardData = {
      raw: stockTypes.raw,
      semi: stockTypes.semi,
      full: stockTypes.full,
      return: mapReturnData(returnTable),
      damaged: mapDamagedData(damagedTable)
    };

    renderSummary();
    renderCategoryFilter();
    renderCurrentView(false);

    const now = new Date();
    lastUpdated.textContent = `Terakhir dimuat: ${now.toLocaleString('id-ID')}`;
    showStatus('');
  } catch (error) {
    console.error(error);
    showStatus(`Gagal memuat data: ${error.message}`, true);
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = 'Refresh Data';
  }
}

document.querySelectorAll('.tab').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    button.classList.add('active');
    currentType = button.dataset.type;
    renderCurrentView(true);
  });
});

searchInput.addEventListener('input', () => renderCurrentView(false));
categoryFilter.addEventListener('change', () => renderCurrentView(false));
refreshBtn.addEventListener('click', loadDashboard);

loadDashboard();
