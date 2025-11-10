// --- KONFIGURASI PENTING ---
const API_BASE_URL = 'https://invtax-backend.stayvie.com/api'; // Ganti dengan URL backend Anda setelah deploy

// --- State Aplikasi ---
const appState = {
    invoices: [],
    currentSort: 'tanggalInvoice',
    currentOrder: 'desc',
    currentPage: 1,
    totalPages: 1,
    searchQuery: '',
    searchField: 'namaKlien',
    debounceTimer: null,
};

// --- Helper Functions ---
const formatRupiah = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);
const formatTanggal = (d) => new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
const formatDateForInput = (d) => {
    if (!d) return '';
    const date = new Date(d);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
};

const escapeHtml = (value = '') => {
    return String(value ?? '').replace(/[&<>"']/g, (char) => {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
        return map[char] || char;
    });
};

const buildItemRow = (item = null, isFirstRow = false, includeRemoveButton = false) => {
    const deskripsi = escapeHtml(item?.deskripsi ?? '');
    const kuantitas = item?.kuantitas ?? 1;
    const harga = item?.harga ?? 0;
    const totalValue = item?.total ?? (kuantitas * harga);
    const formattedTotal = formatRupiah(totalValue);
    return `
        <div class="item-row grid grid-cols-12 gap-3 items-end">
            <div class="col-span-5">
                ${isFirstRow ? '<label class="form-label">Deskripsi</label>' : ''}
                <input type="text" name="deskripsi" class="form-input item-deskripsi" value="${deskripsi}" required>
            </div>
            <div class="col-span-2">
                ${isFirstRow ? '<label class="form-label">Kuantitas</label>' : ''}
                <input type="number" name="kuantitas" value="${kuantitas}" class="form-input item-kuantitas" required>
            </div>
            <div class="col-span-2">
                ${isFirstRow ? '<label class="form-label">Harga Satuan</label>' : ''}
                <input type="number" name="harga" value="${harga}" class="form-input item-harga" required>
            </div>
            <div class="col-span-2">
                ${isFirstRow ? '<label class="form-label">Total</label>' : ''}
                <input type="text" name="total" class="form-input bg-gray-100" value="${formattedTotal}" readonly>
            </div>
            ${includeRemoveButton ? `
                <div class="col-span-1">
                    <button type="button" class="remove-item-btn text-red-500 hover:text-red-700 p-2">
                        <i data-feather="trash-2"></i>
                    </button>
                </div>
            ` : '<div class="col-span-1"></div>'}
        </div>
    `;
};

// --- Logika Modal & Notifikasi ---
function showModal(id, content) {
    hideModal();
    const container = document.getElementById('modal-container');
    container.innerHTML = `<div id="${id}" class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">${content}</div>`;
}

function hideModal() {
    document.getElementById('modal-container').innerHTML = '';
}

function showStatusModal(title, message, isSuccess) {
    const icon = isSuccess ? `<i data-feather="check-circle" class="w-16 h-16 text-brand-green mx-auto"></i>` : `<i data-feather="x-circle" class="w-16 h-16 text-red-500 mx-auto"></i>`;
    showModal('status-modal', `
        <div class="bg-white rounded-lg shadow-xl p-8 w-full max-w-md text-center">
            <div class="mb-4">${icon}</div>
            <h3 class="text-xl font-bold mb-2">${title}</h3>
            <p class="text-gray-600 mb-6">${message}</p>
            <button onclick="hideModal()" class="w-full bg-brand-dark text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-800 transition-colors">Tutup</button>
        </div>
    `);
    feather.replace();
}

function confirmDelete(id, name) {
    const content = `
        <div class="bg-white rounded-lg shadow-xl p-8 w-full max-w-md text-center">
            <div class="mb-4"><i data-feather="alert-triangle" class="w-16 h-16 text-yellow-500 mx-auto"></i></div>
            <h3 class="text-xl font-bold mb-2">Konfirmasi Hapus</h3>
            <p class="text-gray-600 mb-6">Apakah Anda yakin ingin menghapus invoice untuk <strong>${name}</strong>?</p>
            <div class="flex justify-center gap-4">
                <button onclick="hideModal()" class="w-full bg-gray-200 text-gray-800 font-semibold py-2 px-4 rounded-lg hover:bg-gray-300">Batal</button>
                <button id="confirm-delete-btn" class="w-full bg-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700">Ya, Hapus</button>
            </div>
        </div>
    `;
    showModal('confirm-modal', content);
    feather.replace();
    document.getElementById('confirm-delete-btn').onclick = () => deleteInvoice(id);
}

async function deleteInvoice(id) {
    try {
        const response = await fetch(`${API_BASE_URL}/invoices/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Gagal menghapus invoice.');
        hideModal();
        showStatusModal('Sukses', 'Invoice berhasil dihapus.', true);
        fetchInvoices();
    } catch (error) {
        hideModal();
        showStatusModal('Gagal', error.message, false);
    }
}


// --- ROUTER & NAVIGATION ---
const routes = {
    '/': renderInvoiceTable,
    '/new': () => renderForm(),
};

function router() {
    const path = window.location.hash.replace('#', '') || '/';
    const normalizedPath = path.startsWith('/edit/') ? '/new' : path;
    renderSidebar(normalizedPath);
    if (path.startsWith('/edit/')) {
        const invoiceId = path.split('/')[2];
        renderForm('edit', invoiceId);
        return;
    }
    (routes[path] || routes['/'])();
}

// --- RENDERING FUNCTIONS ---
function renderSidebar(activePath) {
    const sidebar = document.getElementById('sidebar');
    const links = [
        { path: '/', icon: 'list', label: 'Data Invoice' },
        { path: '/new', icon: 'plus-circle', label: 'Buat Invoice Baru' },
    ];
    sidebar.innerHTML = `
        <div class="flex items-center gap-3 mb-12">
            <img src="${API_BASE_URL.replace('/api', '')}/Logo.png" alt="Tax Plus Logo" class="h-10">
            <h1 class="text-lg font-bold text-brand-dark">Tax Plus</h1>
        </div>
        <nav class="flex flex-col gap-3">
            ${links.map(link => `
                <a href="#${link.path}" class="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activePath === link.path ? 'bg-gray-200 text-brand-dark font-semibold' : 'text-gray-500 hover:bg-gray-100'}">
                    <i data-feather="${link.icon}"></i>
                    <span>${link.label}</span>
                </a>
            `).join('')}
        </nav>
    `;
    feather.replace();
}

function renderContent(title, subtitle, content) {
    document.getElementById('main-content').innerHTML = `
        <header class="mb-8">
            <h2 class="text-3xl font-bold text-gray-900">${title}</h2>
            <p class="text-gray-500 mt-1">${subtitle}</p>
        </header>
        ${content}
    `;
    feather.replace();
}

// --- PAGE: INVOICE TABLE ---
function renderInvoiceTable() {
    const content = `
        <div class="bg-white p-4 rounded-lg shadow-md mb-6">
            <input type="text" id="search-input" placeholder="Cari berdasarkan nama klien..." class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-brand-dark focus:border-brand-dark block w-full md:w-80 p-2.5">
        </div>
        <div class="bg-white rounded-lg shadow-md overflow-x-auto">
            <table class="w-full text-sm text-left text-gray-500">
                <thead class="text-xs text-gray-700 uppercase bg-gray-50">
                    <tr>
                        <th class="p-4">No. Invoice</th>
                        <th class="p-4">Nama Klien</th>
                        <th class="p-4">Tanggal Invoice</th>
                        <th class="p-4">Total Tagihan</th>
                        <th class="p-4">Aksi</th>
                    </tr>
                </thead>
                <tbody id="invoice-table-body"></tbody>
            </table>
        </div>
        <div id="pagination-controls" class="flex justify-between items-center mt-6"></div>
    `;
    renderContent('Data Invoice', 'Kelola semua data invoice Anda.', content);
    document.getElementById('search-input').addEventListener('input', (e) => {
        clearTimeout(appState.debounceTimer);
        appState.debounceTimer = setTimeout(() => {
            appState.searchQuery = e.target.value;
            appState.currentPage = 1;
            fetchInvoices();
        }, 400);
    });
    fetchInvoices();
}

async function fetchInvoices() {
    const tableBody = document.getElementById('invoice-table-body');
    tableBody.innerHTML = `<tr><td colspan="5" class="text-center p-10"><div class="loader mx-auto"></div></td></tr>`;
    const { currentPage, searchQuery } = appState;
    try {
        const res = await fetch(`${API_BASE_URL}/invoices?page=${currentPage}&search=${searchQuery}`);
        const { data, ...pagination } = await res.json();
        appState.invoices = data;
        appState.totalPages = pagination.totalPages;
        
        tableBody.innerHTML = data.length ? data.map(inv => `
            <tr class="bg-white border-b hover:bg-gray-50">
                <td class="p-4 font-semibold text-gray-900">${inv.nomorInvoice}</td>
                <td class="p-4">${inv.namaKlien}</td>
                <td class="p-4">${formatTanggal(inv.tanggalInvoice)}</td>
                <td class="p-4 font-semibold">${formatRupiah(inv.items.reduce((sum, i) => sum + i.total, 0))}</td>
                <td class="p-4">
                    <div class="flex items-center gap-2">
                        <button onclick="showInvoiceModal('${inv._id}')" class="text-gray-400 hover:text-brand-green" title="Print Invoice"><i data-feather="printer" class="w-5 h-5"></i></button>
                        <button onclick="confirmDelete('${inv._id}', '${inv.namaKlien}')" class="text-gray-400 hover:text-red-600" title="Hapus Invoice"><i data-feather="trash-2" class="w-5 h-5"></i></button>
                    </div>
                </td>
            </tr>
        `).join('') : `<tr><td colspan="5" class="text-center py-10 text-gray-500">Tidak ada data.</td></tr>`;
        feather.replace();
    } catch (error) {
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-red-500">Gagal memuat data.</td></tr>`;
    }
}

// --- PAGE: ENTRY FORM ---
function renderForm() {
    const content = `
        <div class="bg-white p-6 rounded-lg shadow-md max-w-4xl mx-auto">
            <form id="invoice-form" class="space-y-6">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label for="namaKlien" class="form-label">Nama Klien</label>
                        <input type="text" id="namaKlien" name="namaKlien" class="form-input" required>
                    </div>
                     <div>
                        <label for="noTelepon" class="form-label">No. Telepon</label>
                        <input type="tel" id="noTelepon" name="noTelepon" class="form-input" required>
                    </div>
                    <div>
                        <label for="tanggalInvoice" class="form-label">Tanggal Invoice</label>
                        <input type="date" id="tanggalInvoice" name="tanggalInvoice" class="form-input" required>
                    </div>
                </div>
                <div id="item-list" class="space-y-4 pt-4 border-t">
                    <!-- Item pertama -->
                    <div class="item-row grid grid-cols-12 gap-3 items-end">
                        <div class="col-span-5"><label class="form-label">Deskripsi</label><input type="text" name="deskripsi" class="form-input item-deskripsi" required></div>
                        <div class="col-span-2"><label class="form-label">Kuantitas</label><input type="number" name="kuantitas" value="1" class="form-input item-kuantitas" required></div>
                        <div class="col-span-2"><label class="form-label">Harga Satuan</label><input type="number" name="harga" class="form-input item-harga" required></div>
                        <div class="col-span-2"><label class="form-label">Total</label><input type="text" name="total" class="form-input bg-gray-100" readonly></div>
                        <div class="col-span-1"></div>
                    </div>
                </div>
                <button type="button" id="add-item-btn" class="text-sm font-semibold text-brand-green hover:text-green-700 flex items-center gap-2"><i data-feather="plus"></i> Tambah Item</button>
                <div class="flex justify-end pt-6 border-t">
                    <button type="submit" class="bg-brand-dark text-white font-bold py-2 px-6 rounded-lg hover:bg-gray-800 transition-colors">Simpan Invoice</button>
                </div>
            </form>
        </div>
    `;
    renderContent('Buat Invoice Baru', 'Isi detail di bawah untuk membuat invoice.', content);
    document.getElementById('tanggalInvoice').value = formatDateForInput(new Date());
    attachFormEventListeners();
}

function attachFormEventListeners() {
    const form = document.getElementById('invoice-form');
    const itemList = document.getElementById('item-list');

    const updateItemTotal = (row) => {
        const qty = parseFloat(row.querySelector('.item-kuantitas').value) || 0;
        const price = parseFloat(row.querySelector('.item-harga').value) || 0;
        row.querySelector('input[name="total"]').value = formatRupiah(qty * price);
    };

    itemList.addEventListener('input', (e) => {
        if (e.target.classList.contains('item-kuantitas') || e.target.classList.contains('item-harga')) {
            updateItemTotal(e.target.closest('.item-row'));
        }
    });

    document.getElementById('add-item-btn').addEventListener('click', () => {
        const newItemRow = `
            <div class="item-row grid grid-cols-12 gap-3 items-end">
                <div class="col-span-5"><input type="text" name="deskripsi" class="form-input item-deskripsi" required></div>
                <div class="col-span-2"><input type="number" name="kuantitas" value="1" class="form-input item-kuantitas" required></div>
                <div class="col-span-2"><input type="number" name="harga" class="form-input item-harga" required></div>
                <div class="col-span-2"><input type="text" name="total" class="form-input bg-gray-100" readonly></div>
                <div class="col-span-1"><button type="button" class="remove-item-btn text-red-500 hover:text-red-700 p-2"><i data-feather="trash-2"></i></button></div>
            </div>`;
        itemList.insertAdjacentHTML('beforeend', newItemRow);
        feather.replace();
    });

    itemList.addEventListener('click', (e) => {
        if (e.target.closest('.remove-item-btn')) {
            e.target.closest('.item-row').remove();
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const items = Array.from(document.querySelectorAll('.item-row')).map(row => ({
            deskripsi: row.querySelector('.item-deskripsi').value,
            kuantitas: parseFloat(row.querySelector('.item-kuantitas').value),
            harga: parseFloat(row.querySelector('.item-harga').value),
            total: parseFloat(row.querySelector('.item-kuantitas').value) * parseFloat(row.querySelector('.item-harga').value)
        }));

        const data = {
            namaKlien: document.getElementById('namaKlien').value,
            noTelepon: document.getElementById('noTelepon').value,
            tanggalInvoice: document.getElementById('tanggalInvoice').value,
            items: items
        };

        try {
            const res = await fetch(`${API_BASE_URL}/invoices`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!res.ok) throw new Error('Gagal menyimpan invoice.');
            showStatusModal('Sukses', 'Invoice baru berhasil disimpan!', true);
            setTimeout(() => { hideModal(); window.location.hash = '/'; }, 1500);
        } catch (error) {
            showStatusModal('Gagal', error.message, false);
        }
    });
}

// --- INVOICE MODAL ---
async function showInvoiceModal(id) {
    showModal('invoice-modal', `<div class="bg-white rounded-lg p-8 w-full max-w-4xl"><div class="loader mx-auto"></div></div>`);
    try {
        const res = await fetch(`${API_BASE_URL}/invoices/${id}`);
        const data = await res.json();
        const total = data.items.reduce((sum, i) => sum + i.total, 0);
        const logoUrl = `${API_BASE_URL.replace('/api', '')}/Logo.png`;
        
        const content = `
            <div class="bg-white rounded-lg shadow-xl w-full max-w-4xl">
                <div id="invoice-content" class="p-10">
                    <header class="flex justify-between items-start mb-10">
                        <div class="flex items-center gap-5">
                            <img src="${logoUrl}" alt="Tax Plus Logo" class="h-20">
                            <div>
                                <h1 class="text-2xl font-bold text-brand-dark">Tax Plus Indonesia</h1>
                                <p class="text-sm text-gray-500">Jl. Dinoyo 131-133 Surabaya, 60265</p>
                                <p class="text-sm text-gray-500">@taxplus.id | taxplus.idn@gmail.com | +62822-2340-2300</p>
                            </div>
                        </div>
                        <div class="text-right">
                            <h2 class="text-4xl font-bold text-gray-400 tracking-wider">INVOICE</h2>
                            <p class="font-semibold text-gray-700">${data.nomorInvoice}</p>
                        </div>
                    </header>
                    <div class="flex justify-between mb-10">
                        <div>
                            <p class="text-sm text-gray-500">Ditagihkan kepada:</p>
                            <p class="text-lg font-bold text-gray-800">${data.namaKlien}</p>
                            <p class="text-sm text-gray-600">${data.noTelepon || ''}</p>
                        </div>
                        <div class="text-right">
                            <p class="text-sm text-gray-500">Tanggal:</p>
                            <p class="font-semibold text-gray-800">${formatTanggal(data.tanggalInvoice)}</p>
                        </div>
                    </div>
                    <table class="w-full mb-10">
                        <thead class="border-b-2 border-gray-300">
                            <tr>
                                <th class="text-left py-2 text-sm uppercase text-gray-500">Deskripsi</th>
                                <th class="text-right py-2 text-sm uppercase text-gray-500">Kuantitas</th>
                                <th class="text-right py-2 text-sm uppercase text-gray-500">Harga Satuan</th>
                                <th class="text-right py-2 text-sm uppercase text-gray-500">Jumlah</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.items.map(item => `
                                <tr class="border-b border-gray-100">
                                    <td class="py-3">${item.deskripsi}</td>
                                    <td class="text-right py-3">${item.kuantitas}</td>
                                    <td class="text-right py-3">${formatRupiah(item.harga)}</td>
                                    <td class="text-right py-3 font-semibold">${formatRupiah(item.total)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colspan="3" class="text-right py-4 font-bold text-lg">TOTAL</td>
                                <td class="text-right py-4 font-bold text-lg text-brand-dark">${formatRupiah(total)}</td>
                            </tr>
                        </tfoot>
                    </table>

                    <div class="mt-10 pt-6 border-t border-gray-200">
                        <h3 class="text-sm font-semibold text-gray-600 mb-2">Tujuan Pembayaran:</h3>
                        <div class="text-sm text-gray-800 leading-relaxed">
                            <p><span class="font-semibold w-24 inline-block">Bank</span>: BCA</p>
                            <p><span class="font-semibold w-24 inline-block">No. Rekening</span>: 4649989980</p>
                            <p><span class="font-semibold w-24 inline-block">Atas Nama</span>: Octavianus Stevie Lianto</p>
                        </div>
                    </div>

                    <footer class="text-center text-sm text-gray-500 mt-10">
                        <p>Terima kasih atas kepercayaan Anda.</p>
                    </footer>
                </div>
                <div class="p-4 bg-gray-50 flex justify-end gap-3 no-print">
                    <button onclick="hideModal()" class="bg-gray-200 text-gray-800 font-semibold py-2 px-4 rounded-lg hover:bg-gray-300">Tutup</button>
                    <button onclick="window.print()" class="bg-brand-green text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 flex items-center gap-2"><i data-feather="printer"></i> Print</button>
                </div>
            </div>
        `;
        showModal('invoice-modal', content);
        feather.replace();
    } catch (error) {
        showStatusModal('Gagal', 'Gagal memuat detail invoice.', false);
    }
}

// --- Inisialisasi Aplikasi ---
document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('hashchange', router);
    router();
});
