/*
  Dashboard Stok Barang - versi GitHub Pages
  Catatan: file ini tidak memakai server.js. Data dibaca langsung dari Google Sheets.
*/

const SHEET_SOURCES = {
  stock: {
    label: 'STOK BARANG MEI 2026',
    id: '1nvw94MDz3kPDfkFP8KBW68Ph0hesKQxy5D11ehAjdJU',
    sheet: 'STOK BARANG MEI 2026 (2026年5月商品库存)',
    gid: ''
  },
  return: {
    label: 'BARANG RETURN',
    id: '1h2V64STp49pXRgusQ2RADgkRBDP46zz91CWvUIDubKA',
    sheet: '',
    gid: ''
  },
  damaged: {
    label: 'BARANG RUSAK',
    id: '1MdMy2KcFOIde7DHP5VaQ5zxbLdbTlDEATN2D2stQWRU',
    sheet: '',
    gid: ''
  }
};

const TYPE_META = {
  raw: {
    title: 'Barang Mentah',
    description: 'Semua data dari Link 1 kecuali LAYAR/屏幕 dan BARANG JADI/成品.',
    tableHeaders: ['Kategori Produk', 'Nama Barang', 'Stok Akhir']
  },
  semi: {
    title: 'Barang Setengah Jadi',
    description: 'Hanya data LAYAR/屏幕 dari Link 1.',
    tableHeaders: ['Kategori Produk', 'Nama Barang', 'Stok Akhir']
  },
  full: {
    title: 'Barang Full Rakit',
    description: 'Hanya data BARANG JADI/成品 dari Link 1.',
    tableHeaders: ['Kategori Produk', 'Nama Barang', 'Stok Akhir']
  },
  return: {
    title: 'Barang Return',
    description: 'Data dari Link 2: kategori, nomor seri, kuantitas, dan keterangan barang.',
    tableHeaders: ['Kategori', 'Nomor Seri', 'Kuantitas', 'Keterangan Barang']
  },
  damaged: {
    title: 'Barang Rusak',
    description: 'Data dari Link 3: nama customer, model komputer, dan alasan kerusakan.',
    tableHeaders: ['Nama Customer', 'Model Komputer', 'Alasan Kerusakan']
  }
};

const FIELD_ALIASES = {
  stockCategory: ['KATEGORI PRODUK', 'Kategori Produk', '产品类别', 'Jenis Barang', '商品种类', 'Kategori', '类别', '种类'],
  stockName: ['NAMA BARANG', 'Nama Barang', '货物名称', 'Nama', 'Barang', '货物', '名称'],
  stockFinal: ['Stok Akhir', 'STOK AKHIR', '实际库存', 'Stok Akhir (实际库存)', 'Actual Stock', 'Final Stock', 'Stock Akhir', 'Sisa Stok', 'Sisa', '库存'],
  stockQtyFallback: ['Jumlah Barang', '商品数量', 'Jumlah', 'Quantity', 'Qty', '数量'],
  returnCategory: ['型号/kategori', '型号', 'kategori', 'model', '类别'],
  returnSerial: ['序列号/nomor seri', '序列号', 'nomor seri', 'serial', 'sn'],
  returnQty: ['数量/kuantitas', '数量', 'kuantitas', 'quantity', 'qty', 'jumlah'],
  returnStatus: ['状态/ keteragan barang', '状态/keterangan barang', '状态', 'keterangan barang', 'keteragan barang', 'status'],
  damagedCustomer: ['客户名称', 'customer', 'nama customer', 'pelanggan'],
  damagedModel: ['电脑型号', 'model komputer', 'computer model', '型号'],
  damagedReason: ['故障原因', 'alasan kerusakan', 'kerusakan', 'penyebab', 'reason']
};

let dashboardData = { raw: [], semi: [], full: [], return: [], damaged: [] };
let debugInfo = [];
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
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, '')
    .replace(/[()（）/\\_\-:：\[\]{}.,，。]/g, '');
}

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseStockNumber(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const onlyNumber = raw.replace(/[^0-9-]/g, '');
  const number = Number(onlyNumber);
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

  return rows
    .map(row => row.map(cell => cleanText(cell)))
    .filter(row => row.some(cell => cell !== ''));
}

function buildSheetUrl(source) {
  const base = `https://docs.google.com/spreadsheets/d/${source.id}/gviz/tq?tqx=out:csv`;
  const target = source.gid
    ? `gid=${encodeURIComponent(source.gid)}`
    : source.sheet
      ? `sheet=${encodeURIComponent(source.sheet)}`
      : '';
  return `${base}${target ? '&' + target : ''}&cache=${Date.now()}`;
}

async function fetchCsvFromGoogle(sourceKey) {
  const source = SHEET_SOURCES[sourceKey];
  const url = buildSheetUrl(source);
  const response = await fetch(url, { cache: 'no-store' });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${source.label}: gagal mengambil data. Status ${response.status}.`);
  }

  const lowered = text.slice(0, 500).toLowerCase();
  if (lowered.includes('<html') || lowered.includes('<!doctype') || lowered.includes('request access')) {
    throw new Error(`${source.label}: Google Sheet belum bisa dibaca publik atau sheet/gid salah.`);
  }

  return { rows: parseCSV(text), url, label: source.label };
}

function countAliasMatches(row, aliases) {
  return row.reduce((count, cell) => {
    const nCell = normalize(cell);
    if (!nCell) return count;
    const matched = aliases.some(alias => {
      const nAlias = normalize(alias);
      return nCell.includes(nAlias) || nAlias.includes(nCell);
    });
    return count + (matched ? 1 : 0);
  }, 0);
}

function detectHeaderIndex(rows, importantAliases) {
  let bestIndex = 0;
  let bestScore = -1;
  const scanLimit = Math.min(rows.length, 30);

  for (let i = 0; i < scanLimit; i++) {
    const row = rows[i] || [];
    const score = importantAliases.reduce((sum, aliases) => sum + countAliasMatches(row, aliases), 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return { index: bestIndex, score: bestScore };
}

function tableFromRows(rows, aliasGroups, label) {
  const detected = detectHeaderIndex(rows, aliasGroups);
  const headers = rows[detected.index] || [];
  const body = rows.slice(detected.index + 1);

  debugInfo.push({
    source: label,
    headerRow: detected.index + 1,
    headerScore: detected.score,
    headers: headers.filter(Boolean).slice(0, 30)
  });

  return { headers, rows: body };
}

function findColumnIndex(headers, aliases, occurrence = 1) {
  let matchCount = 0;
  const normalizedAliases = aliases.map(normalize).filter(Boolean);

  for (let i = 0; i < headers.length; i++) {
    const header = normalize(headers[i]);
    if (!header) continue;
    const matched = normalizedAliases.some(alias => header.includes(alias) || alias.includes(header));
    if (matched) {
      matchCount++;
      if (matchCount === occurrence) return i;
    }
  }

  return -1;
}

function getCell(table, row, aliases, fallbackIndex = -1, occurrence = 1) {
  const index = findColumnIndex(table.headers, aliases, occurrence);
  if (index >= 0) return cleanText(row[index]);
  if (fallbackIndex >= 0) return cleanText(row[fallbackIndex]);
  return '';
}

function isLayar(category, name = '') {
  const value = normalize(`${category} ${name}`);
  return value.includes('layar') || value.includes('屏幕');
}

function isBarangJadi(category, name = '') {
  const value = normalize(`${category} ${name}`);
  return value.includes('barangjadi') || value.includes('fullrakit') || value.includes('成品');
}

function mapStockData(table) {
  const stockIndex = findColumnIndex(table.headers, FIELD_ALIASES.stockFinal);
  const qtyIndex = findColumnIndex(table.headers, FIELD_ALIASES.stockQtyFallback);

  return table.rows
    .map((row, rowIndex) => {
      const category = getCell(table, row, FIELD_ALIASES.stockCategory, 2);
      const name = getCell(table, row, FIELD_ALIASES.stockName, 1);
      let stockRaw = stockIndex >= 0 ? cleanText(row[stockIndex]) : '';

      if (!stockRaw && qtyIndex >= 0) stockRaw = cleanText(row[qtyIndex]);
      if (!stockRaw) stockRaw = cleanText(row[5]);

      const stock = parseStockNumber(stockRaw);

      return {
        category,
        name,
        stock,
        rowNumber: rowIndex + 1,
        searchable: `${category} ${name} ${stockRaw}`
      };
    })
    .filter(item => item.category || item.name || item.stock);
}

function mapReturnData(table) {
  return table.rows
    .map(row => {
      const category = getCell(table, row, FIELD_ALIASES.returnCategory, 1);
      const serial = getCell(table, row, FIELD_ALIASES.returnSerial, 2);
      const qtyRaw = getCell(table, row, FIELD_ALIASES.returnQty, 3);
      const status = getCell(table, row, FIELD_ALIASES.returnStatus, 4);
      const qty = parseStockNumber(qtyRaw) || (category || serial || status ? 1 : 0);

      return { category, serial, qty, status, searchable: `${category} ${serial} ${qtyRaw} ${status}` };
    })
    .filter(item => item.category || item.serial || item.status);
}

function mapDamagedData(table) {
  return table.rows
    .map(row => {
      const customer = getCell(table, row, FIELD_ALIASES.damagedCustomer, 1, 1);
      const model = getCell(table, row, FIELD_ALIASES.damagedModel, 2, 1);
      const reason = getCell(table, row, FIELD_ALIASES.damagedReason, 4, 1);

      return { customer, model, reason, searchable: `${customer} ${model} ${reason}` };
    })
    .filter(item => item.customer || item.model || item.reason);
}

function splitStockTypes(stockItems) {
  const semi = stockItems.filter(item => isLayar(item.category, item.name));
  const full = stockItems.filter(item => isBarangJadi(item.category, item.name));
  const raw = stockItems.filter(item => !isLayar(item.category, item.name) && !isBarangJadi(item.category, item.name));
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

  const sorted = [...grouped.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
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
  statusBox.innerHTML = message;
  statusBox.classList.toggle('hidden', !message);
  statusBox.style.background = isError ? '#fef2f2' : '#eff6ff';
  statusBox.style.borderColor = isError ? '#fecaca' : '#bfdbfe';
  statusBox.style.color = isError ? '#991b1b' : '#1e40af';
}

function renderDebugSummary() {
  const info = debugInfo.map(item => {
    const headers = item.headers.length ? item.headers.join(' | ') : 'Header belum terdeteksi';
    return `<li><b>${escapeHtml(item.source)}</b>: header baris ${item.headerRow}, skor ${item.headerScore}. Header: ${escapeHtml(headers)}</li>`;
  }).join('');
  return `<details style="margin-top:8px"><summary>Detail pembacaan data</summary><ul>${info}</ul></details>`;
}

async function loadDashboard() {
  showStatus('Sedang membaca data dari Google Spreadsheet...');
  refreshBtn.disabled = true;
  refreshBtn.textContent = 'Memuat...';
  debugInfo = [];

  try {
    const [stockCsv, returnCsv, damagedCsv] = await Promise.all([
      fetchCsvFromGoogle('stock'),
      fetchCsvFromGoogle('return'),
      fetchCsvFromGoogle('damaged')
    ]);

    const stockTable = tableFromRows(
      stockCsv.rows,
      [FIELD_ALIASES.stockCategory, FIELD_ALIASES.stockName, FIELD_ALIASES.stockFinal, FIELD_ALIASES.stockQtyFallback],
      stockCsv.label
    );
    const returnTable = tableFromRows(
      returnCsv.rows,
      [FIELD_ALIASES.returnCategory, FIELD_ALIASES.returnSerial, FIELD_ALIASES.returnQty, FIELD_ALIASES.returnStatus],
      returnCsv.label
    );
    const damagedTable = tableFromRows(
      damagedCsv.rows,
      [FIELD_ALIASES.damagedCustomer, FIELD_ALIASES.damagedModel, FIELD_ALIASES.damagedReason],
      damagedCsv.label
    );

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

    const warning = stockItems.length === 0
      ? `<br><b>Catatan:</b> data Link 1 masih kosong/kolom belum terdeteksi. Klik detail pembacaan data untuk melihat header yang terbaca.`
      : '';
    showStatus(`Data berhasil dimuat. Link 1 terbaca ${stockItems.length} baris stok.${warning}${renderDebugSummary()}`, stockItems.length === 0);
  } catch (error) {
    console.error(error);
    showStatus(`Gagal memuat data: ${escapeHtml(error.message)}${renderDebugSummary()}`, true);
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
